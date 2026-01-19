/**
 * 장기 기억 도구 (S3 Vectors)
 * 에러 해결 경험을 벡터로 저장하고 검색
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3VectorsClient,
  PutVectorsCommand,
  QueryVectorsCommand,
  GetVectorsCommand,
  DeleteVectorsCommand,
} from '@aws-sdk/client-s3vectors';
import { MemoryResult } from '../types.js';

// S3 Vectors 설정
const VECTOR_BUCKET = process.env.S3_VECTORS_BUCKET || 'eecar-vectors-index-12234628';
const MEMORY_INDEX = process.env.S3_VECTORS_MEMORY_INDEX || 'jadong-memories';

// Bedrock for embeddings
const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
const EMBED_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBED_DIMENSION = 1024;

// S3 Vectors 클라이언트
const s3VectorsClient = new S3VectorsClient({ region: 'ap-northeast-2' });

interface RecallMemoryInput {
  query: string;
  topK?: number;
  functionName?: string;
}

interface SaveMemoryInput {
  errorType: string;
  functionName: string;
  resolution: string;
  codeChanges?: string[];
  resolvedBy?: string;
}

/**
 * 과거 해결 사례 검색 (S3 Vectors QueryVectors API)
 */
export async function recallMemory(input: RecallMemoryInput): Promise<MemoryResult[]> {
  const { query, topK = 5, functionName } = input;

  console.log('Recalling memory:', { query, topK, functionName });

  try {
    // 1. 쿼리 임베딩 생성
    const queryVector = await generateEmbedding(query);

    // 2. S3 Vectors에서 유사 벡터 검색
    const response = await s3VectorsClient.send(
      new QueryVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: MEMORY_INDEX,
        queryVector: {
          float32: queryVector,
        },
        topK: topK,
        returnMetadata: true,
      })
    );

    // 3. 결과 변환
    const results: MemoryResult[] = (response.vectors || []).map((v) => {
      const metadata = v.metadata as Record<string, string> | undefined;
      return {
        memory: {
          key: v.key || '',
          errorType: metadata?.errorType || '',
          functionName: metadata?.functionName || '',
          resolution: metadata?.resolution || '',
          resolvedBy: metadata?.resolvedBy,
          successCount: Number(metadata?.successCount) || 1,
          createdAt: Number(metadata?.createdAt) || Date.now(),
          lastUsed: metadata?.lastUsed ? Number(metadata.lastUsed) : undefined,
        },
        score: v.distance ? 1 - v.distance : 0, // cosine distance to similarity
      };
    });

    return results;
  } catch (error) {
    console.error('Error recalling memory:', error);
    return [];
  }
}

/**
 * 해결 사례 저장 (S3 Vectors PutVectors API)
 */
export async function saveMemory(input: SaveMemoryInput): Promise<boolean> {
  const { errorType, functionName, resolution, codeChanges, resolvedBy } = input;

  console.log('Saving memory:', { errorType, functionName, resolution });

  try {
    // 1. 메모리 텍스트 생성 (임베딩용)
    const memoryText = `
      에러 타입: ${errorType}
      함수: ${functionName}
      해결 방법: ${resolution}
      ${codeChanges ? `코드 변경: ${codeChanges.join(', ')}` : ''}
    `.trim();

    // 2. 임베딩 생성
    const vector = await generateEmbedding(memoryText);

    // 3. 메모리 키 생성
    const memoryKey = `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 4. S3 Vectors에 저장
    await s3VectorsClient.send(
      new PutVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: MEMORY_INDEX,
        vectors: [
          {
            key: memoryKey,
            data: {
              float32: vector,
            },
            metadata: {
              errorType,
              functionName,
              resolution,
              resolvedBy: resolvedBy || 'unknown',
              codeChanges: codeChanges?.join(',') || '',
              successCount: '1',
              createdAt: String(Date.now()),
            },
          },
        ],
      })
    );

    console.log('Memory saved:', memoryKey);
    return true;
  } catch (error) {
    console.error('Error saving memory:', error);
    return false;
  }
}

/**
 * 기억 성공 횟수 증가
 */
export async function incrementMemorySuccess(memoryKey: string): Promise<boolean> {
  try {
    // 1. 기존 벡터 조회
    const getResponse = await s3VectorsClient.send(
      new GetVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: MEMORY_INDEX,
        keys: [memoryKey],
        returnData: true,
        returnMetadata: true,
      })
    );

    const existingVector = getResponse.vectors?.[0];
    if (!existingVector) {
      return false;
    }

    // 2. 성공 횟수 증가
    const metadata = existingVector.metadata as Record<string, string> | undefined;
    const currentCount = Number(metadata?.successCount) || 1;
    const updatedMetadata: Record<string, string> = {
      ...(metadata || {}),
      successCount: String(currentCount + 1),
      lastUsed: String(Date.now()),
    };

    // 3. 업데이트된 벡터 저장 (동일 키로 덮어쓰기)
    await s3VectorsClient.send(
      new PutVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: MEMORY_INDEX,
        vectors: [
          {
            key: memoryKey,
            data: existingVector.data,
            metadata: updatedMetadata,
          },
        ],
      })
    );

    return true;
  } catch (error) {
    console.error('Error incrementing memory success:', error);
    return false;
  }
}

/**
 * 기억 삭제
 */
export async function deleteMemory(memoryKey: string): Promise<boolean> {
  try {
    await s3VectorsClient.send(
      new DeleteVectorsCommand({
        vectorBucketName: VECTOR_BUCKET,
        indexName: MEMORY_INDEX,
        keys: [memoryKey],
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting memory:', error);
    return false;
  }
}

/**
 * Titan Embed v2로 임베딩 생성
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: EMBED_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text.slice(0, 8192), // 토큰 제한
          dimensions: EMBED_DIMENSION,
          normalize: true,
        }),
      })
    );

    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

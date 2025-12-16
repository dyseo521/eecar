#!/usr/bin/env node

/**
 * Regenerate existing part vectors with Titan Embed Text v2 (1024 dimensions)
 *
 * This script:
 * 1. Finds all parts with 1536-dimension vectors
 * 2. Regenerates embeddings using Titan v2 (1024 dimensions)
 * 3. Updates S3 vector files
 * 4. Updates DynamoDB VECTOR items
 */

import { DynamoDBClient, ScanCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const TABLE_NAME = process.env.PARTS_TABLE_NAME || 'eecar-parts-table';
const VECTORS_BUCKET = process.env.VECTORS_BUCKET_NAME || 'eecar-vectors-425454508084';
const REGION = 'ap-northeast-2';

const dynamoClient = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });
const bedrockClient = new BedrockRuntimeClient({ region: REGION });

// Titan Embed Text v2 모델 (1024차원)
const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';

/**
 * Generate embedding using Titan v2
 */
async function generateEmbedding(text) {
  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    body: JSON.stringify({
      inputText: text
    })
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embedding;
}

/**
 * Get vector dimension from S3
 */
async function getVectorDimension(s3Key) {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: s3Key
    }));

    const bodyString = await response.Body.transformToString();
    const vector = JSON.parse(bodyString);
    return Array.isArray(vector) ? vector.length : 0;
  } catch (error) {
    console.error(`  ⚠️ Failed to get vector dimension for ${s3Key}:`, error.message);
    return 0;
  }
}

/**
 * Prepare text for embedding
 */
function preparePartText(part) {
  let text = `${part.name || ''} ${part.category || ''} ${part.manufacturer || ''} ${part.model || ''}`;

  if (part.description) {
    text += ` ${part.description}`;
  }

  return text.trim();
}

/**
 * Update vector in S3
 */
async function uploadToS3(partId, embedding) {
  const key = `parts/${partId}.json`;
  await s3Client.send(new PutObjectCommand({
    Bucket: VECTORS_BUCKET,
    Key: key,
    Body: JSON.stringify(embedding),
    ContentType: 'application/json'
  }));
  return key;
}

/**
 * Update VECTOR item in DynamoDB
 */
async function updateVectorItem(partId, s3Key) {
  const item = {
    PK: `PART#${partId}`,
    SK: 'VECTOR',
    s3Key,
    vectorDimension: 1024,
    embeddingModel: EMBEDDING_MODEL_ID,
    updatedAt: new Date().toISOString()
  };

  await dynamoClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }));
}

/**
 * Main function
 */
async function main() {
  console.log('======================================================================');
  console.log('기존 벡터 재생성 스크립트 (Titan v2, 1024차원)');
  console.log('======================================================================\n');
  console.log(`타겟 테이블: ${TABLE_NAME}`);
  console.log(`벡터 버킷: ${VECTORS_BUCKET}`);
  console.log(`임베딩 모델: ${EMBEDDING_MODEL_ID}\n`);

  // Step 1: Scan DynamoDB for all VECTOR items
  console.log('Step 1: DynamoDB에서 모든 VECTOR 아이템 스캔 중...\n');

  const scanResponse = await dynamoClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'SK = :sk',
    ExpressionAttributeValues: marshall({
      ':sk': 'VECTOR'
    })
  }));

  const vectorItems = (scanResponse.Items || []).map(item => unmarshall(item));
  console.log(`총 ${vectorItems.length}개 벡터 아이템 발견\n`);

  // Step 2: Check vector dimensions
  console.log('Step 2: 벡터 차원 확인 중...\n');

  const itemsToRegenerate = [];

  for (const item of vectorItems) {
    const partId = item.PK.split('#')[1];
    const s3Key = item.s3Key;

    if (!s3Key) {
      console.log(`  ⚠️ ${partId}: s3Key가 없음, 건너뜀`);
      continue;
    }

    const dimension = await getVectorDimension(s3Key);

    if (dimension === 1536) {
      console.log(`  🔄 ${partId}: 1536차원 → 재생성 필요`);
      itemsToRegenerate.push({ partId, s3Key });
    } else if (dimension === 1024) {
      console.log(`  ✓ ${partId}: 1024차원 → 이미 올바름`);
    } else {
      console.log(`  ⚠️ ${partId}: ${dimension}차원 → 알 수 없는 차원`);
    }
  }

  console.log(`\n재생성 필요: ${itemsToRegenerate.length}개\n`);

  if (itemsToRegenerate.length === 0) {
    console.log('재생성할 벡터가 없습니다. 종료합니다.');
    return;
  }

  // Step 3: Regenerate vectors
  console.log('Step 3: 벡터 재생성 시작...\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < itemsToRegenerate.length; i++) {
    const { partId } = itemsToRegenerate[i];

    try {
      console.log(`[${i + 1}/${itemsToRegenerate.length}] ${partId} 처리 중...`);

      // Get part metadata
      const metadataResponse = await dynamoClient.send(new GetItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({
          PK: `PART#${partId}`,
          SK: 'METADATA'
        })
      }));

      if (!metadataResponse.Item) {
        console.log(`  ❌ METADATA를 찾을 수 없음\n`);
        failCount++;
        continue;
      }

      const metadata = unmarshall(metadataResponse.Item);

      // Generate new embedding
      const text = preparePartText(metadata);
      console.log(`  → 텍스트: "${text.substring(0, 50)}..."`);

      const embedding = await generateEmbedding(text);
      console.log(`  ✓ 임베딩 생성 완료 (${embedding.length}차원)`);

      // Upload to S3
      const s3Key = await uploadToS3(partId, embedding);
      console.log(`  ✓ S3 업로드: ${s3Key}`);

      // Update DynamoDB VECTOR item
      await updateVectorItem(partId, s3Key);
      console.log(`  ✓ DynamoDB 업데이트 완료\n`);

      successCount++;

      // Rate limiting: 작은 delay 추가
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`  ❌ ${partId} 실패:`, error.message, '\n');
      failCount++;
    }
  }

  // Summary
  console.log('\n======================================================================');
  console.log('재생성 완료');
  console.log('======================================================================\n');
  console.log(`✅ 성공: ${successCount}개`);
  console.log(`❌ 실패: ${failCount}개\n`);

  if (successCount > 0) {
    console.log('🎉 벡터 재생성이 완료되었습니다!');
    console.log('이제 AI 검색이 정상 작동할 것입니다.\n');
  }
}

// Run
main().catch(error => {
  console.error('치명적 오류:', error);
  process.exit(1);
});

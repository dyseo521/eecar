#!/usr/bin/env node

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI 인자 파싱
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipEmbeddings = args.includes('--skip-embeddings');

// AWS 클라이언트 설정 (ap-northeast-2 서울 리전)
const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-2' });
const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
const s3Client = new S3Client({ region: 'ap-northeast-2' });

const TABLE_NAME = process.env.PARTS_TABLE_NAME || 'eecar-parts-table';
const VECTORS_BUCKET = process.env.VECTORS_BUCKET_NAME || 'eecar-vectors-bucket';

console.log('='.repeat(70));
console.log('EECAR 부품 DynamoDB 임포트 스크립트');
console.log('='.repeat(70));
console.log('');
console.log(`타겟 테이블: ${TABLE_NAME}`);
console.log(`벡터 버킷: ${VECTORS_BUCKET}`);
console.log(`Dry-run 모드: ${isDryRun ? 'ON' : 'OFF'}`);
console.log(`임베딩 생성: ${skipEmbeddings ? 'SKIP' : 'ON'}`);
console.log('');

async function importParts() {
  // JSON 파일 읽기
  const jsonPath = path.join(__dirname, '../../data/parts-to-import.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ JSON 파일을 찾을 수 없습니다:', jsonPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const results = { success: [], failed: [] };

  console.log(`총 ${data.parts.length}개 부품 임포트 시작...\n`);

  for (let i = 0; i < data.parts.length; i++) {
    const part = data.parts[i];
    const progress = `[${i + 1}/${data.parts.length}]`;

    console.log(`${progress} Processing ${part.partId}...`);

    try {
      // 1. METADATA 아이템
      if (!isDryRun) {
        await putMetadata(part);
      }
      console.log(`  ✓ METADATA saved`);

      // 2. SPEC 아이템 (specifications 있을 경우)
      if (part.specifications) {
        if (!isDryRun) {
          await putSpec(part.partId, part.specifications);
        }
        console.log(`  ✓ SPEC saved`);
      }

      // 3. 임베딩 생성 + S3 업로드 + VECTOR 아이템
      if (!skipEmbeddings) {
        const embedding = await generateEmbedding(part);
        console.log(`  ✓ Embedding generated (${embedding.length} dimensions)`);

        if (!isDryRun) {
          await uploadToS3(part.partId, embedding);
          console.log(`  ✓ Vector uploaded to S3: parts/${part.partId}.json`);

          await putVector(part.partId);
          console.log(`  ✓ VECTOR saved`);
        } else {
          console.log(`  - Vector upload skipped (dry-run)`);
          console.log(`  - VECTOR save skipped (dry-run)`);
        }
      } else {
        console.log(`  - Embedding skipped`);
      }

      // 4. batteryHealth 데이터 (배터리인 경우)
      if (part.batteryHealth && !isDryRun) {
        await putBatteryHealth(part.partId, part.batteryHealth);
        console.log(`  ✓ BATTERY_HEALTH saved`);
      }

      results.success.push(part.partId);
      console.log(`✅ ${part.partId} 완료\n`);
    } catch (error) {
      console.error(`❌ ${part.partId} 실패:`, error.message);
      console.error(error.stack);
      results.failed.push({ partId: part.partId, error: error.message });
      console.log('');
    }

    // 속도 제한 방지 (Bedrock API)
    if (!skipEmbeddings && i < data.parts.length - 1) {
      await sleep(500); // 0.5초 대기
    }
  }

  // 결과 출력
  console.log('='.repeat(70));
  console.log('임포트 완료');
  console.log('='.repeat(70));
  console.log('');
  console.log(`✅ 성공: ${results.success.length}개`);
  console.log(`❌ 실패: ${results.failed.length}개`);

  if (results.failed.length > 0) {
    console.log('\n실패한 부품:');
    results.failed.forEach(({ partId, error }) => {
      console.log(`  - ${partId}: ${error}`);
    });
  }

  console.log('');
  if (results.failed.length === 0) {
    console.log('🎉 모든 부품이 성공적으로 임포트되었습니다!');
  } else {
    console.log('⚠️  일부 부품 임포트에 실패했습니다');
  }
}

async function putMetadata(part) {
  const timestamp = new Date().toISOString();
  const item = {
    PK: `PART#${part.partId}`,
    SK: 'METADATA',
    GSI1PK: `CATEGORY#${part.category}`,
    GSI1SK: `CREATED_AT#${timestamp}`,
    partId: part.partId,
    name: part.name,
    category: part.category,
    manufacturer: part.manufacturer,
    model: part.model || '',
    year: part.year || 2015,
    condition: part.condition || 'used',
    price: part.price,
    quantity: part.quantity || 1,
    sellerId: part.sellerId || 'pdf-import',
    description: part.description || '',
    images: part.images || [],
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await dynamoClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }));
}

async function putSpec(partId, specifications) {
  const item = {
    PK: `PART#${partId}`,
    SK: 'SPEC',
    ...specifications
  };

  await dynamoClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }));
}

async function putBatteryHealth(partId, batteryHealth) {
  const item = {
    PK: `PART#${partId}`,
    SK: 'BATTERY_HEALTH',
    ...batteryHealth,
    createdAt: new Date().toISOString()
  };

  await dynamoClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }));
}

async function putVector(partId) {
  const timestamp = new Date().toISOString();
  const item = {
    PK: `PART#${partId}`,
    SK: 'VECTOR',
    s3Key: `parts/${partId}.json`,
    embeddingModel: 'amazon.titan-embed-text-v2:0',
    dimension: 1024,
    createdAt: timestamp
  };

  await dynamoClient.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item)
  }));
}

async function generateEmbedding(part) {
  const text = preparePartText(part);

  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v2:0',
    body: JSON.stringify({ inputText: text })
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embedding; // 1024차원 벡터
}

function preparePartText(part) {
  let text = `${part.name} ${part.category} ${part.manufacturer} ${part.model || ''}`;

  if (part.description) {
    text += ` ${part.description}`;
  }

  // 배터리인 경우 SOH 정보 추가
  if (part.batteryHealth) {
    text += ` SOH ${part.batteryHealth.soh}% ${part.batteryHealth.cathodeType || ''}`;
    if (part.batteryHealth.recommendedUse) {
      text += ` ${part.batteryHealth.recommendedUse}`;
    }
  }

  // specifications에서 주요 정보 추가
  if (part.specifications) {
    const spec = part.specifications;
    if (spec.materialComposition) {
      text += ` ${spec.materialComposition.primary || ''}`;
      if (spec.materialComposition.alloyNumber) {
        text += ` ${spec.materialComposition.alloyNumber}`;
      }
    }
  }

  return text;
}

async function uploadToS3(partId, embedding) {
  const key = `parts/${partId}.json`;
  const body = JSON.stringify(embedding);

  await s3Client.send(new PutObjectCommand({
    Bucket: VECTORS_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'application/json'
  }));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 실행
importParts().catch(error => {
  console.error('\n❌ 치명적 오류:', error);
  process.exit(1);
});

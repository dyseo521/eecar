#!/usr/bin/env node

/**
 * Check dimensions of all vectors in S3
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const VECTORS_BUCKET = process.env.VECTORS_BUCKET_NAME || 'eecar-vectors-425454508084';
const REGION = 'ap-northeast-2';

const s3Client = new S3Client({ region: REGION });

async function getVectorDimension(key) {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: key
    }));

    const bodyString = await response.Body.transformToString();
    const vector = JSON.parse(bodyString);
    return Array.isArray(vector) ? vector.length : 0;
  } catch (error) {
    return -1;
  }
}

async function main() {
  console.log('S3 벡터 파일 차원 확인 중...\n');

  // List all vector files
  const response = await s3Client.send(new ListObjectsV2Command({
    Bucket: VECTORS_BUCKET,
    Prefix: 'parts/'
  }));

  const vectorFiles = (response.Contents || [])
    .filter(obj => obj.Key.endsWith('.json'))
    .map(obj => obj.Key);

  console.log(`총 ${vectorFiles.length}개 벡터 파일 발견\n`);

  const dimensionMap = {};

  for (const key of vectorFiles) {
    const dimension = await getVectorDimension(key);
    if (!dimensionMap[dimension]) {
      dimensionMap[dimension] = [];
    }
    dimensionMap[dimension].push(key);
  }

  console.log('=== 차원별 벡터 파일 분포 ===\n');

  for (const [dimension, files] of Object.entries(dimensionMap).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${dimension}차원: ${files.length}개`);
    if (files.length <= 5) {
      files.forEach(f => console.log(`  - ${f}`));
    } else {
      console.log(`  샘플: ${files.slice(0, 3).join(', ')}, ...`);
    }
    console.log();
  }

  const wrong = dimensionMap['1536'] || [];
  if (wrong.length > 0) {
    console.log(`⚠️  1536차원 벡터가 ${wrong.length}개 남아있습니다!`);
    console.log('이 파일들을 재생성해야 합니다.\n');
  } else {
    console.log('✅ 모든 벡터가 1024차원입니다!');
  }
}

main().catch(console.error);

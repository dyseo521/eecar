/**
 * 기존 부품의 검색 문서 재색인 (기술 도전 C-21, DECISION_LOG A-21).
 *
 *   cd backend
 *   PARTS_TABLE_NAME=eecar-parts-table VECTORS_BUCKET_NAME=eecar-vectors-<account> \
 *   S3_VECTORS_BUCKET=eecar-vectors-index-12234628 npx tsx scripts/reindex-search-documents.ts [--apply]
 *
 * 1. 전체 부품을 SPEC·BATTERY_HEALTH·USAGE까지 합쳐 읽는다.
 * 2. buildSearchText로 searchText를 만들어 METADATA에 저장한다. 검색 시점 BM25는 METADATA만 읽으므로,
 *    이 단계 전에는 SPEC에 있는 사양이 BM25에 보이지 않았다.
 * 3. buildEmbeddingText로 임베딩을 다시 만들어 S3 JSON 벡터와 S3 Vectors 색인을 갱신한다.
 *
 * --apply 없이 실행하면 아무것도 쓰지 않고 현황만 출력한다 (dry run).
 * 비용: 부품당 Titan v2 임베딩 1회 (2026-11 기준 186개 ≈ $0.002).
 */
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = 4;

for (const name of ['PARTS_TABLE_NAME', 'VECTORS_BUCKET_NAME']) {
  if (!process.env[name]) {
    console.error(`missing env ${name}`);
    process.exit(1);
  }
}
const S3_VECTORS_BUCKET = process.env.S3_VECTORS_BUCKET || '';
const S3_VECTORS_INDEX = process.env.S3_VECTORS_INDEX || 'parts-vectors';
const REGION = process.env.AWS_REGION || 'ap-northeast-2';

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

async function listS3VectorKeys(): Promise<Set<string>> {
  const { S3VectorsClient, ListVectorsCommand } = await import('@aws-sdk/client-s3vectors');
  const client = new S3VectorsClient({ region: REGION });
  const keys = new Set<string>();
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListVectorsCommand({
      vectorBucketName: S3_VECTORS_BUCKET,
      indexName: S3_VECTORS_INDEX,
      nextToken,
    }));
    for (const v of page.vectors ?? []) if (v.key) keys.add(v.key);
    nextToken = page.nextToken;
  } while (nextToken);
  return keys;
}

async function main(): Promise<void> {
  const { loadPartsWithDetails } = await import('../src/utils/parts.js');
  const { queryByPK, updateItem } = await import('../src/utils/dynamodb.js');
  const { generateEmbedding } = await import('../src/utils/bedrock.js');
  const { uploadVector } = await import('../src/utils/s3.js');
  const {
    buildEmbeddingText,
    buildSearchText,
    SEARCH_DOCUMENT_VERSION,
  } = await import('../src/utils/search-document.js');

  const parts = await loadPartsWithDetails({ details: ['SPEC', 'BATTERY_HEALTH'] });
  const s3Keys = S3_VECTORS_BUCKET ? await listS3VectorKeys() : new Set<string>();
  const missingFromS3Vectors = parts.filter(p => !s3Keys.has(p.partId)).map(p => p.partId);
  const orphanVectors = [...s3Keys].filter(k => !parts.some(p => p.partId === k));

  const { S3VectorsClient, PutVectorsCommand } = await import('@aws-sdk/client-s3vectors');
  const s3v = new S3VectorsClient({ region: REGION });

  const stats = { parts: parts.length, stale: 0, withSpec: 0, withBattery: 0, withUseCases: 0, written: 0 };
  // 데이터 품질: 검색으로는 고칠 수 없는 모순 (값 자체는 바꾸지 않고 보고만 한다)
  const quality = { batteryWithoutHealth: 0, newConditionLowSoh: 0 };
  let sample = '';

  await mapWithConcurrency(parts, CONCURRENCY, async part => {
    const pk = `PART#${part.partId}`;
    const usage = await queryByPK(pk, 'USAGE#');
    const record = { ...part, useCases: usage.length > 0 ? usage : undefined };
    const searchText = buildSearchText(record);

    if (part.specifications) stats.withSpec++;
    if (part.batteryHealth) stats.withBattery++;
    if (part.category === 'battery' && !part.batteryHealth) quality.batteryWithoutHealth++;
    const soh = Number((part.batteryHealth as { soh?: number } | undefined)?.soh);
    if (soh < 80 && ['new', 'like-new', 'excellent'].includes(String(part.condition))) quality.newConditionLowSoh++;
    if (usage.length > 0) stats.withUseCases++;
    if (part.searchText !== searchText || part.searchDocVersion !== SEARCH_DOCUMENT_VERSION) stats.stale++;
    if (!sample && part.batteryHealth && part.specifications) sample = `${part.partId}\n${searchText}`;

    if (!APPLY) return;
    const embedding = await generateEmbedding(buildEmbeddingText(record));
    await uploadVector(`parts/${part.partId}.json`, embedding);
    if (S3_VECTORS_BUCKET) {
      await s3v.send(new PutVectorsCommand({
        vectorBucketName: S3_VECTORS_BUCKET,
        indexName: S3_VECTORS_INDEX,
        vectors: [{
          key: part.partId,
          data: { float32: embedding },
          // part-registration과 같은 메타데이터 (category는 검색 필터에 쓰인다)
          metadata: {
            name: String(part.name ?? ''),
            category: String(part.category ?? ''),
            manufacturer: String(part.manufacturer ?? ''),
            price: String(part.price ?? ''),
            condition: String(part.condition ?? 'used'),
          },
        }],
      }));
    }
    await updateItem(pk, 'METADATA', { searchText, searchDocVersion: SEARCH_DOCUMENT_VERSION });
    await updateItem(pk, 'VECTOR', {
      embeddingModel: 'amazon.titan-embed-text-v2:0',
      searchDocVersion: SEARCH_DOCUMENT_VERSION,
      reindexedAt: new Date().toISOString(),
    });
    stats.written++;
  });

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    ...stats,
    s3VectorsCount: s3Keys.size,
    missingFromS3Vectors: missingFromS3Vectors.length,
    orphanVectors: orphanVectors.length,
    quality,
  }, null, 2));
  if (missingFromS3Vectors.length) console.log('missing from S3 Vectors (sample):', missingFromS3Vectors.slice(0, 5));
  if (orphanVectors.length) console.log('vectors without METADATA (sample):', orphanVectors.slice(0, 5));
  console.log(`\n--- sample search document\n${sample}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

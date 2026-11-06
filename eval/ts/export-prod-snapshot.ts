/**
 * 운영 데이터 스냅숏 생성 (AWS 자격 증명 필요, DECISION_LOG A-33).
 *
 *   PARTS_TABLE_NAME=eecar-parts-table npx tsx eval/ts/export-prod-snapshot.ts --out eval/datasets/prod-snapshot
 *
 * - 부품 원본 레코드: METADATA + SPEC + BATTERY_HEALTH + USAGE (재색인과 같은 입력)
 * - 문서 벡터: 현재 코드의 buildEmbeddingText로 Titan 임베딩을 다시 만든다. 운영 벡터를 그대로 받으면
 *   사전·문서 정의를 바꾼 뒤 재색인 전까지 코드와 어긋나기 때문이다. 텍스트 해시를 함께 저장해,
 *   코드가 바뀌면 prod-regression이 "스냅숏을 다시 만들라"며 실패한다.
 * - eval/prod/regression.json 질의의 임베딩
 * 운영 데이터는 전부 더미라 저장소에 커밋한다. 비용: 부품 186개 + 질의 약 20개 ≈ $0.002
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { embeddingTextSha256 } from './prod-snapshot-lib.js';

const KEEP = ['name', 'category', 'manufacturer', 'vehicleBrand', 'model', 'year', 'condition', 'price', 'quantity',
  'description', 'batteryHealth', 'specifications'];

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const out = arg('out', 'eval/datasets/prod-snapshot');
  const { loadPartsWithDetails } = await import('../../backend/src/utils/parts.js');
  const { queryByPK } = await import('../../backend/src/utils/dynamodb.js');
  const { generateEmbedding } = await import('../../backend/src/utils/bedrock.js');
  const { buildEmbeddingText } = await import('../../backend/src/utils/search-document.js');

  const loaded = await loadPartsWithDetails({ details: ['SPEC', 'BATTERY_HEALTH'] });
  const records = [];
  for (const part of loaded) {
    const usage = await queryByPK(`PART#${part.partId}`, 'USAGE#');
    const useCases = usage.map(u => ({ industry: u.industry, application: u.application })).filter(u => u.industry || u.application);
    records.push({
      partId: part.partId,
      ...Object.fromEntries(KEEP.filter(k => k in part).map(k => [k, (part as Record<string, unknown>)[k]])),
      ...(useCases.length ? { useCases } : {}),
    });
  }
  records.sort((a, b) => (a.partId < b.partId ? -1 : 1));

  const round = (v: number[]) => v.map(x => Math.round(x * 1e6) / 1e6);
  const docs: Record<string, number[]> = {};
  for (const r of records) docs[r.partId] = round(await generateEmbedding(buildEmbeddingText(r)));

  const spec = JSON.parse(readFileSync('eval/prod/regression.json', 'utf-8'));
  const texts = [...new Set(spec.checks.flatMap((c: { query: string; overlapWith?: string }) => [c.query, c.overlapWith].filter(Boolean)))] as string[];
  const queries: Record<string, number[]> = {};
  for (const t of texts) queries[t] = round(await generateEmbedding(t));

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'parts.jsonl'), records.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf-8');
  writeFileSync(join(out, 'vectors.json.gz'), gzipSync(Buffer.from(JSON.stringify({
    model: 'amazon.titan-embed-text-v2:0',
    embeddingTextSha256: embeddingTextSha256(records),
    docs,
    queries,
  })), { level: 9 }));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(),
    source: 'eecar-parts-table (운영, 전부 더미 데이터)',
    parts: records.length,
    queries: texts.length,
  }, null, 2) + '\n', 'utf-8');
  console.log(`wrote ${records.length} parts and ${texts.length} query embeddings to ${out}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

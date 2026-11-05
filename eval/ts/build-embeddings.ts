/**
 * 평가용 Titan 임베딩 캐시 생성 (AWS 자격 증명과 Bedrock 접근 권한 필요).
 *
 *   npx tsx eval/ts/build-embeddings.ts --dataset eval/datasets/v1
 *
 * 프로덕션과 같은 함수를 쓴다.
 * - 문서: preparePartText(part) → generateEmbedding  (part-registration과 동일)
 * - 질의: generateEmbedding(query.text)             (쿼리 확장 없는 경우)
 * Titan 임베딩은 같은 입력에 같은 결과를 주므로 캐시를 다시 만들어도 평가가 재현된다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { generateEmbedding, preparePartText } from '../../backend/src/utils/bedrock.js';

const CACHE_FILE = 'embeddings/titan-embed-text-v2.json';
const CONCURRENCY = 4;

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function round(vector: number[]): number[] {
  return vector.map(x => Math.round(x * 1e6) / 1e6);
}

async function main(): Promise<void> {
  const index = process.argv.indexOf('--dataset');
  const dataset = index >= 0 ? process.argv[index + 1] : 'eval/datasets/v1';

  const parts = readJsonl<{ part: { partId: string } }>(join(dataset, 'corpus.jsonl')).map(r => r.part);
  const queries = readJsonl<{ id: string; text: string }>(join(dataset, 'queries.jsonl'));

  const docVectors = await mapWithConcurrency(parts, CONCURRENCY, p => generateEmbedding(preparePartText(p)));
  const queryVectors = await mapWithConcurrency(queries, CONCURRENCY, q => generateEmbedding(q.text));

  const cache = {
    model: 'amazon.titan-embed-text-v2:0',
    createdAt: new Date().toISOString(),
    docs: Object.fromEntries(parts.map((p, i) => [p.partId, round(docVectors[i])])),
    queries: Object.fromEntries(queries.map((q, i) => [q.id, round(queryVectors[i])])),
  };

  const out = join(dataset, CACHE_FILE);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(cache), 'utf-8');
  console.log(`wrote ${parts.length} document and ${queries.length} query embeddings to ${out}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

/**
 * CI 게이트용 임베딩 묶음 생성 (DECISION_LOG A-29). AWS 없이 CI에서 운영 순위 로직(prod-hybrid)을 검사하기 위해
 * 질의 벡터와 현재 문서 벡터(buildEmbeddingText)만 gzip으로 묶어 커밋한다.
 *
 *   npx tsx eval/ts/export-gate-embeddings.ts --dataset eval/datasets/v2
 *
 * 입력: embeddings/titan-embed-text-v2.json(질의), embeddings/titan-embed-text-v2.doc-v2-notrade.json(문서)
 * 출력: gate-embeddings.json.gz. 문서 텍스트 해시(docTextSha256)를 함께 저장해, 문서 정의가 바뀌면
 *       search-cli가 "임베딩을 다시 만들라"며 실패한다.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { buildEmbeddingText } from '../../backend/src/utils/search-document.js';

export const GATE_EMBEDDINGS_FILE = 'gate-embeddings.json.gz';

export function docTextSha256(parts: Array<Record<string, unknown>>): string {
  const hash = createHash('sha256');
  for (const p of parts) hash.update(`${p.partId}\n${buildEmbeddingText(p)}\n`);
  return hash.digest('hex');
}

function main(): void {
  const i = process.argv.indexOf('--dataset');
  const dataset = i >= 0 ? process.argv[i + 1] : 'eval/datasets/v2';
  const parts = readFileSync(join(dataset, 'corpus.jsonl'), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l).part);
  const base = JSON.parse(readFileSync(join(dataset, 'embeddings/titan-embed-text-v2.json'), 'utf-8'));
  const docs = JSON.parse(readFileSync(join(dataset, 'embeddings/titan-embed-text-v2.doc-v2-notrade.json'), 'utf-8')).docs;
  const bundle = {
    model: base.model,
    docText: 'buildEmbeddingText',
    docTextSha256: docTextSha256(parts),
    docs,
    queries: base.queries,
  };
  const out = join(dataset, GATE_EMBEDDINGS_FILE);
  // mtime을 0으로 두어 같은 입력이면 같은 바이트가 나오게 한다
  writeFileSync(out, gzipSync(Buffer.from(JSON.stringify(bundle)), { level: 9 }));
  console.log(`wrote ${out} (${Object.keys(docs).length} docs, ${Object.keys(base.queries).length} queries)`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('export-gate-embeddings.ts')) main();

/**
 * 운영 데이터 회귀 검사 (AWS 불필요, DECISION_LOG A-33).
 *
 *   npx tsx eval/ts/prod-regression.ts [--snapshot eval/datasets/prod-snapshot]
 *
 * 운영 부품 스냅숏과 운영 벡터로 프로덕션 순위 로직(search-ranking.ts)을 그대로 실행하고,
 * eval/prod/regression.json의 기대 조건을 확인한다. 하나라도 틀리면 종료 코드 1.
 * 합성 평가 코퍼스에 잘 나타나지 않는 운영의 실패 유형(붙여 쓴 표기, 사전에 없던 차종)을 잡기 위한 것이다.
 * 검색 문서·속성은 스냅숏 원본 레코드로 현재 코드가 다시 만든다(운영 재색인 결과와 같은 상태).
 * 기대 조건의 차종·용량·SOH도 그 속성으로 판단하므로, 품질 추정이 아니라 회귀 감지다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { findTopKSimilar } from '../../backend/src/utils/bedrock.js';
import { CANDIDATES_PER_RETRIEVER } from '../../backend/src/utils/search.js';
import { buildSearchIndex } from '../../backend/src/utils/search-index.js';
import { bm25Candidates, rankCandidates } from '../../backend/src/utils/search-ranking.js';
import { embeddingTextSha256, toIndexedItem } from './prod-snapshot-lib.js';

interface Expect {
  category?: string[];
  vehicle?: string;
  kwhMin?: number;
  sohMin?: number;
  priceMax?: number;
  yearMin?: number;
}

interface Check {
  id: string;
  query: string;
  why: string;
  top: number;
  all?: Expect;
  overlapWith?: string;
  minOverlap?: number;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function satisfies(part: any, attrs: any, e: Expect): string[] {
  const fails: string[] = [];
  if (e.category && !e.category.includes(part.category)) fails.push(`category=${part.category}`);
  if (e.vehicle && !(attrs.vehicles ?? []).includes(e.vehicle)) fails.push(`vehicles=${(attrs.vehicles ?? []).join('/') || '-'}`);
  if (e.kwhMin !== undefined && !(attrs.kwh >= e.kwhMin)) fails.push(`kwh=${attrs.kwh ?? '-'}`);
  if (e.sohMin !== undefined && !(attrs.soh >= e.sohMin)) fails.push(`soh=${attrs.soh ?? '-'}`);
  if (e.priceMax !== undefined && !(part.price <= e.priceMax)) fails.push(`price=${part.price}`);
  if (e.yearMin !== undefined && !(part.year >= e.yearMin)) fails.push(`year=${part.year}`);
  return fails;
}

function main(): void {
  const dir = arg('snapshot', 'eval/datasets/prod-snapshot');
  const parts = readFileSync(join(dir, 'parts.jsonl'), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const vectors = JSON.parse(gunzipSync(readFileSync(join(dir, 'vectors.json.gz'))).toString('utf-8'));
  const spec = JSON.parse(readFileSync('eval/prod/regression.json', 'utf-8')) as { checks: Check[] };

  if (vectors.embeddingTextSha256 !== embeddingTextSha256(parts)) {
    console.error(`${dir}/vectors.json.gz was built from a different document definition.
` +
      'rebuild with AWS credentials: npx tsx eval/ts/export-prod-snapshot.ts');
    process.exit(1);
  }
  // 검색 Lambda와 같은 색인 (searchText·searchAttributes는 현재 코드로 생성)
  const index = buildSearchIndex(parts.map(toIndexedItem));
  const docVectors = parts.filter(p => vectors.docs[p.partId]).map(p => ({ id: p.partId, vector: vectors.docs[p.partId] }));
  const byId = new Map(parts.map(p => [p.partId, p]));

  const search = (query: string) => {
    const vectorMatches = findTopKSimilar(vectors.queries[query], docVectors, CANDIDATES_PER_RETRIEVER);
    return rankCandidates(query, vectorMatches, bm25Candidates(index.bm25, query), id => index.attributes.get(id));
  };

  let failed = 0;
  for (const c of spec.checks) {
    const top = search(c.query).slice(0, c.top);
    let problems: string[] = [];
    if (c.all) {
      // 스냅숏에 조건을 만족하는 부품이 top개 미만이면 검사 자체가 성립하지 않는다
      const possible = parts.filter(p => satisfies(p, index.attributes.get(p.partId) ?? {}, c.all!).length === 0).length;
      if (possible < c.top) problems.push(`unsatisfiable: only ${possible} parts meet the expectation`);
      top.forEach((hit, rank) => {
        const fails = satisfies(byId.get(hit.id), index.attributes.get(hit.id) ?? {}, c.all!);
        if (fails.length) problems.push(`#${rank + 1} ${byId.get(hit.id).name} (${fails.join(', ')})`);
      });
    }
    if (c.overlapWith) {
      const other = new Set(search(c.overlapWith).slice(0, c.top).map(h => h.id));
      const overlap = top.filter(h => other.has(h.id)).length;
      if (overlap < (c.minOverlap ?? c.top)) problems.push(`overlap with "${c.overlapWith}" = ${overlap}/${c.top}`);
    }
    if (problems.length) failed++;
    console.log(`${problems.length ? 'FAIL' : 'pass'} ${c.id} ${c.query}${problems.length ? `\n     ${problems.join('\n     ')}` : ''}`);
  }
  console.log(`\n${spec.checks.length - failed}/${spec.checks.length} checks passed`);
  if (failed > 0) process.exit(1);
}

main();

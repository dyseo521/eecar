/**
 * 자동이 평가 결과 두 개를 시나리오 단위로 짝지어 비교한다 (E-30, E-31).
 *
 *   npx tsx eval/ts/agent-compare.ts <A.json> <B.json> [--exclude config,iam,limit]
 *
 * - 차이 = B의 시나리오별 통과율 − A의 시나리오별 통과율. 두 보고서에 모두 있는 시나리오만 쓴다.
 * - 95% 구간은 시나리오를 복원 추출하는 부트스트랩 10,000회다. 시드를 고정해 결과가 매번 같다.
 * - --exclude: 해당 category를 뺀 부분집합도 함께 보고한다 (보조 기준).
 */
import { readFileSync } from 'fs';

interface ScenarioRow { id: string; passRate: number; category?: string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** mulberry32: 작고 결정적인 의사 난수 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pairedBootstrap(diffs: number[], iterations = 10_000, seed = 0): { mean: number; lo: number; hi: number } {
  const n = diffs.length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const next = rng(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += diffs[Math.floor(next() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return { mean, lo: means[Math.floor(iterations * 0.025)], hi: means[Math.floor(iterations * 0.975) - 1] };
}

function summarize(label: string, rows: Array<{ id: string; a: number; b: number }>): void {
  if (rows.length === 0) return;
  const diffs = rows.map(r => r.b - r.a);
  const { mean, lo, hi } = pairedBootstrap(diffs);
  const wins = diffs.filter(d => d > 0).length;
  const losses = diffs.filter(d => d < 0).length;
  const f = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(3);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  console.log(`${label}: n=${rows.length}  A ${avg(rows.map(r => r.a)).toFixed(3)} → B ${avg(rows.map(r => r.b)).toFixed(3)}  Δ ${f(mean)} [${f(lo)}, ${f(hi)}]  승 ${wins} 패 ${losses} 무 ${rows.length - wins - losses}`);
}

function main(): void {
  const [fileA, fileB] = process.argv.slice(2).filter(a => a.endsWith('.json'));
  if (!fileA || !fileB) throw new Error('usage: agent-compare.ts <A.json> <B.json> [--exclude cat1,cat2]');
  const load = (f: string) => new Map((JSON.parse(readFileSync(f, 'utf-8')).byScenario as ScenarioRow[]).map(s => [s.id, s]));
  const a = load(fileA);
  const b = load(fileB);
  const rows = [...a.keys()].filter(id => b.has(id)).map(id => ({ id, a: a.get(id)!.passRate, b: b.get(id)!.passRate, category: b.get(id)!.category ?? a.get(id)!.category }));
  summarize('전체', rows);
  const exclude = arg('exclude')?.split(',');
  if (exclude) summarize(`${exclude.join('·')} 제외`, rows.filter(r => !exclude.includes(r.category ?? '')));
  const categories = [...new Set(rows.map(r => r.category).filter(Boolean))] as string[];
  for (const c of categories.sort()) summarize(`  ${c}`, rows.filter(r => r.category === c));
  console.log('\n시나리오별 (A → B)');
  for (const r of rows) if (r.a !== r.b) console.log(`  ${r.id}${r.category ? ` [${r.category}]` : ''}: ${r.a.toFixed(2)} → ${r.b.toFixed(2)}`);
}

main();

/**
 * 기억 검색 하한(MEMORY_MIN_SIMILARITY)과 중복 판정 기준(MEMORY_DUPLICATE_SIMILARITY)을 정하기 위한 측정 (A-53).
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/memory-threshold.ts [--scenarios eval/agent/scenarios_v3.json]
 *
 * 시나리오 v3 60개(이미 두 번 쓴 평가셋, E-44의 새 시나리오와 겹치지 않음)에서 정답이 root_cause인 시나리오마다
 * 정답 원인으로 기억 한 건을 만들고, 다른 시나리오의 질문으로 검색했을 때의 유사도를 잰다.
 * 운영 검색과 같은 비대칭(질문 문장 대 기억 색인 문장)으로 잰다. 기억끼리 비교하면 유사도가 높게 나와 하한이 틀어진다.
 *
 * - same: 다른 시나리오지만 구성요소와 장애 유형이 같은 쌍 (돌려주고 싶은 기억)
 * - sameComp: 구성요소는 같고 장애 유형이 다른 쌍 (미끼에 가까운 기억)
 * - other: 구성요소가 다른 쌍 (돌려주지 않아야 할 기억)
 * - self: 같은 시나리오 (같은 표현으로 재발한 경우, 상한 참고)
 * Titan 임베딩 약 180회 (1만 토큰 미만).
 */
import { readFileSync } from 'fs';
import { cachedEmbed } from './memory-eval.js';
import { cosine, functionOf, memoryIndexText, memoryQueryText, MemoryRecord } from '../../backend/src/functions/slack-agent/tools/memory-core.js';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const file = arg('scenarios') ?? 'eval/agent/scenarios_v3.json';
const raw = JSON.parse(readFileSync(file, 'utf-8'));
const scenarios: any[] = (raw.scenarios ?? raw).filter((s: any) => s.truth?.verdict === 'root_cause');

const records: MemoryRecord[] = scenarios.map(s => ({
  key: s.id, kind: 'case', outcome: 'confirmed', verdict: 'root_cause', question: s.message, summary: String(s.truth.cause).slice(0, 300), cause: s.truth.cause,
  component: s.truth.component, functionName: functionOf(s.truth.component), faultType: s.truth.faultType, evidence: [], createdAt: '', lastSeenAt: '', count: 1,
}));

const pct = (xs: number[], p: number) => { const a = [...xs].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))] : NaN; };
const fmt = (xs: number[]) => xs.length ? `n=${String(xs.length).padStart(4)} 최소 ${pct(xs, 0).toFixed(3)} p10 ${pct(xs, 0.1).toFixed(3)} 중앙 ${pct(xs, 0.5).toFixed(3)} p90 ${pct(xs, 0.9).toFixed(3)} 최대 ${pct(xs, 1).toFixed(3)}` : 'n=0';

async function main() {
  const idx = await Promise.all(records.map(r => cachedEmbed(memoryIndexText(r))));
  for (const withFn of [true, false]) {
    const q = await Promise.all(scenarios.map((s, i) => cachedEmbed(memoryQueryText(s.message, withFn ? records[i].functionName : undefined))));
    const groups: Record<string, number[]> = { self: [], same: [], sameComp: [], other: [] };
    // 질문마다 가장 비슷한 '다른 원인' 기억의 유사도: 하한이 이보다 낮으면 그 질문에 엉뚱한 기억이 하나 이상 걸린다
    const bestWrong: number[] = [];
    for (let i = 0; i < records.length; i++) {
      let worst = -1;
      for (let j = 0; j < records.length; j++) {
        const sim = cosine(q[i], idx[j]);
        const sameComp = records[i].component === records[j].component;
        const sameFault = records[i].faultType === records[j].faultType;
        const g = i === j ? 'self' : sameComp && sameFault ? 'same' : sameComp ? 'sameComp' : 'other';
        groups[g].push(sim);
        if (g === 'other' || g === 'sameComp') worst = Math.max(worst, sim);
      }
      bestWrong.push(worst);
    }
    console.log(`\n## 질문에 함수 이름 ${withFn ? '포함' : '없음'} (root_cause 시나리오 ${records.length}개)`);
    for (const [g, xs] of Object.entries(groups)) console.log(`  ${g.padEnd(8)} ${fmt(xs)}`);
    console.log(`  질문별 가장 비슷한 다른 원인 기억 ${fmt(bestWrong)}`);
    console.log('  하한별로 남는 비율 (self / same / sameComp / other / 엉뚱한 기억이 하나라도 걸리는 질문)');
    for (let t = 0.3; t <= 0.701; t += 0.05) {
      const keep = (xs: number[]) => xs.length ? `${(xs.filter(x => x >= t).length / xs.length * 100).toFixed(0).padStart(3)}%` : '  -';
      console.log(`    ${t.toFixed(2)}  ${keep(groups.self)} ${keep(groups.same)} ${keep(groups.sameComp)} ${keep(groups.other)}  ${keep(bestWrong)}`);
    }
  }
  // 중복 판정: 기억끼리 비교. 같은 구성요소, 같은 장애 유형이어도 다른 사건이면 합치지 않아야 한다
  const dupSame: number[] = [], dupOther: number[] = [];
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    const sim = cosine(idx[i], idx[j]);
    (records[i].component === records[j].component && records[i].faultType === records[j].faultType ? dupSame : dupOther).push(sim);
  }
  console.log('\n## 기억끼리 (중복 판정 기준)');
  console.log(`  같은 구성요소, 같은 장애 유형의 다른 사건 ${fmt(dupSame)}`);
  console.log(`  그 밖의 쌍                         ${fmt(dupOther)}`);
}

main().catch(e => { console.error(e); process.exit(1); });

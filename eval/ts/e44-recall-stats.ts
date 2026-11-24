/**
 * E-44 기억 검색 적중: 기억 있음 조건에서 에이전트가 보낸 recall_memory 입력과 analyze_error 입력을
 * 같은 검색 경로(시나리오 기억 + 운영 순위 로직)로 다시 실행해, 그 시나리오의 기억이 돌아왔는지 센다.
 * 실행 기록의 도구 결과는 500자에서 잘려 이 방법으로 센다. Titan 임베딩은 캐시를 쓴다.
 *
 *   EVAL_ALLOW_TITAN=1 node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/e44-recall-stats.ts <agent-eval-e44-on.json>
 */
import { readFileSync } from 'fs';
import { makeScenarioRecall } from './memory-eval.js';

const report = JSON.parse(readFileSync(process.argv[2], 'utf-8'));
const scenarios = new Map((JSON.parse(readFileSync(report.meta.scenarioFile, 'utf-8')).scenarios as any[]).map(s => [s.id, s]));
const own = JSON.parse(readFileSync('eval/agent/scenarios_v6_memory.json', 'utf-8')).scenarios as any[];
const ownKeys = new Map(own.map(s => [s.id, new Set((s.memories ?? []).filter((m: any) => (m.outcome ?? 'confirmed') === 'confirmed').map((m: any) => m.summary))]));
// 사람이 틀렸다고 표시한 그 시나리오의 기억 (함정). 다른 시나리오의 기억과 따로 센다
const ownRefuted = new Map(own.map(s => [s.id, new Set((s.memories ?? []).filter((m: any) => m.outcome === 'refuted').map((m: any) => m.summary))]));
const category = new Map(own.map(s => [s.id, s.attrs.memoryCategory]));

async function main() {
  const stats: Record<string, { runs: number; recalled: number; ownHit: number; ownFirst: number; staleFlag: number; pitfall: number; distractors: number; calls: number }> = {};
  for (const r of report.results) {
    const cat = category.get(r.id)!;
    const st = (stats[cat] ??= { runs: 0, recalled: 0, ownHit: 0, ownFirst: 0, staleFlag: 0, pitfall: 0, distractors: 0, calls: 0 });
    st.runs++;
    const recall = makeScenarioRecall(scenarios.get(r.id));
    const queries = (r.steps ?? []).flatMap((s: any) =>
      s.action === 'recall_memory' ? [{ query: String(s.actionInput?.query ?? ''), functionName: s.actionInput?.functionName, topK: Number(s.actionInput?.topK) || undefined }]
        : s.action === 'analyze_error' ? [{ query: String(s.actionInput?.errorMessage ?? ''), functionName: s.actionInput?.functionName, topK: 3 }] : []);
    if (queries.length) st.recalled++;
    let hit = false, first = false, flag = false, pit = false;
    const traps = ownRefuted.get(r.id)!;
    for (const q of queries) {
      const views = await recall(q);
      st.calls++;
      const mine = ownKeys.get(r.id)!;
      if (views.some(v => mine.has(v.summary))) hit = true;
      if (views[0] && mine.has(views[0].summary)) first = true;
      if (views.some(v => mine.has(v.summary) && v.codeChanged === true)) flag = true;
      if (views.some(v => traps.has(v.summary))) pit = true;
      st.distractors += views.filter(v => !mine.has(v.summary) && !traps.has(v.summary)).length;
    }
    st.ownHit += Number(hit); st.ownFirst += Number(first); st.staleFlag += Number(flag); st.pitfall += Number(pit);
  }
  console.log('범주       실행  검색한 실행  자기 기억 검색됨  첫 번째로 검색됨  codeChanged 표시  함정 기억 검색됨  다른 시나리오 기억(검색 호출 합계)');
  for (const [cat, s] of Object.entries(stats)) {
    console.log(`${cat.padEnd(10)} ${String(s.runs).padStart(4)}  ${String(s.recalled).padStart(10)}  ${String(s.ownHit).padStart(15)}  ${String(s.ownFirst).padStart(15)}  ${String(s.staleFlag).padStart(15)}  ${String(s.pitfall).padStart(15)}  ${s.distractors} (${s.calls}회)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

/**
 * 구조화 진단의 결정적 지표 (DECISION_LOG E-34). 모델을 호출하지 않는다.
 *
 * 판정 모델(eval/ts/agent-judge.ts)이 1차 지표이고, 이 스크립트는 보조 지표다.
 * - 판정 일치: 근거 부족 사례는 hypothesis도 인정한다. 관대한 지표라 조심스러운 답이면 만점이 나온다.
 *   내용까지 맞았는지는 판정 모델이 본다. 18/18이 판정 모델로는 4/18이었던 일이 있어 제출 분포를 함께 보인다 (E-34).
 * - 장애 놓침: 실제 장애를 no_fault로 답한 비율. 가장 위험한 오류라 따로 본다.
 * - 과잉 단정: 근거 부족·정상 사례를 root_cause로 답한 비율.
 * - 구성요소·장애 유형: 원인이 확인되는 사례만 본다. 근거 부족 사례의 정답은 도구로 볼 수 없는 숨은 값이다.
 * - 근거 없는 시각: evidence에 든 시각이 도구 결과에 없는 실행. 수치는 단위 변환 때문에 오탐이 많아 시각만 본다.
 *
 * 실행: node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-structured-score.ts <결과>.json [<결과>.json ...]
 */
import { readFileSync } from 'fs';
import { makeTools } from './agent-eval.js';

const TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g;

interface Row { id: string; run: number; diagnosis?: any; steps?: any[]; metrics: { turns: number; estimatedCostUsd: number } }

async function toolText(scenario: any, steps: any[] | undefined): Promise<string> {
  const tools = makeTools(scenario, [], null, false);
  const parts: string[] = [];
  for (const st of steps ?? []) {
    if (!st.action || st.action === 'submit_diagnosis') continue;
    if (st.action === 'analyze_error') { parts.push(String(st.observation ?? '')); continue; }
    const res: any = await tools(st.action, st.actionInput ?? {});
    parts.push(JSON.stringify(res.data ?? res.error ?? ''));
  }
  return parts.join('\n');
}

const pct = (a: number, b: number) => (b ? `${a}/${b} (${((a / b) * 100).toFixed(0)}%)` : '-');

async function score(file: string): Promise<void> {
  const report = JSON.parse(readFileSync(file, 'utf-8')) as { meta: { scenarioFile: string; variant?: string; tag?: string }; results: Row[] };
  const scenarios = new Map((JSON.parse(readFileSync(report.meta.scenarioFile, 'utf-8')).scenarios as any[]).map(s => [s.id, s]));
  const c = { runs: 0, submitted: 0, fault: 0, missed: 0, verdictOk: 0, noFault: 0, noFaultOk: 0, unsure: 0, unsureOk: 0, unsureOverclaim: 0, unsureExact: 0, unsureHypothesis: 0, noFaultOverclaim: 0, faultOk: 0, compOk: 0, typeOk: 0, unsupportedTime: 0, turns: 0, cost: 0 };
  for (const r of report.results) {
    const truth = scenarios.get(r.id)?.truth;
    if (!truth) continue;
    c.runs++;
    c.turns += r.metrics.turns;
    c.cost += r.metrics.estimatedCostUsd;
    const d = r.diagnosis;
    if (d) c.submitted++;
    const verdict: string | undefined = d?.verdict;
    if (truth.verdict === 'root_cause') {
      c.fault++;
      if (verdict === 'no_fault') c.missed++;
      if (verdict === 'root_cause') { c.faultOk++; c.verdictOk++; }
      if (d?.component === truth.component) c.compOk++;
      if (d?.fault_type === truth.faultType) c.typeOk++;
    } else if (truth.verdict === 'insufficient_evidence') {
      c.unsure++;
      if (verdict === 'insufficient_evidence' || verdict === 'hypothesis') { c.unsureOk++; c.verdictOk++; }
      if (verdict === 'root_cause') c.unsureOverclaim++;
      if (verdict === 'insufficient_evidence') c.unsureExact++;
      if (verdict === 'hypothesis') c.unsureHypothesis++;
    } else {
      c.noFault++;
      if (verdict === 'no_fault') { c.noFaultOk++; c.verdictOk++; }
      if (verdict === 'root_cause') c.noFaultOverclaim++;
    }
    if (d?.evidence?.length) {
      const text = await toolText(scenarios.get(r.id), r.steps);
      const cited = (d.evidence as unknown[]).map(String).join(' ').match(TIME) ?? [];
      if (cited.some(t => !text.includes(t))) c.unsupportedTime++;
    }
  }
  console.log(`\n## ${report.meta.tag ?? file} (${report.meta.variant ?? '?'})`);
  console.log(`- 제출: ${pct(c.submitted, c.runs)}, 평균 턴 ${(c.turns / c.runs).toFixed(2)}, 실행당 $${(c.cost / c.runs).toFixed(4)}`);
  if (!c.submitted) { console.log('- 구조화 제출이 없어 판정 지표를 계산하지 않는다'); return; }
  console.log(`- 판정 일치: ${pct(c.verdictOk, c.runs)} (원인 확인 ${pct(c.faultOk, c.fault)}, 근거 부족 ${pct(c.unsureOk, c.unsure)}, 정상·오경보 ${pct(c.noFaultOk, c.noFault)})`);
  console.log(`- 근거 부족 사례의 제출: insufficient_evidence ${c.unsureExact}, hypothesis ${c.unsureHypothesis}, root_cause ${c.unsureOverclaim} (hypothesis는 내용을 판정 모델로 확인한다)`);
  console.log(`- 장애 놓침(실제 장애를 no_fault로): ${pct(c.missed, c.fault)}`);
  console.log(`- 과잉 단정(root_cause로): 근거 부족 ${pct(c.unsureOverclaim, c.unsure)}, 정상·오경보 ${pct(c.noFaultOverclaim, c.noFault)}`);
  console.log(`- 원인 확인 사례의 구성요소 일치 ${pct(c.compOk, c.fault)}, 장애 유형 일치 ${pct(c.typeOk, c.fault)}`);
  console.log(`- 근거에 도구 결과에 없는 시각을 쓴 실행: ${pct(c.unsupportedTime, c.submitted)}`);
}

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
  for (const f of files) await score(f);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

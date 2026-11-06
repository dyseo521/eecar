/**
 * 판정 모델 결과(다수결 포함)를 구성별 평가 보고서 형식(시나리오별 통과율)으로 바꾼다.
 * agent-compare.ts로 구성 간 쌍체 비교를 판정 모델 기준으로 다시 할 수 있다 (E-33 이후 채점 기준).
 *
 *   npx tsx eval/ts/agent-judge-to-report.ts <판정>.json --variant shipped --out <보고서>.json
 *   [--tpr 0.81 --tnr 0.92]  # 판정 모델 오차로 통과율을 보정한 값(Rogan-Gladen)도 함께 적는다
 */
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const input = args.find(a => a.endsWith('.json') && a !== opt('out'))!;
const variant = opt('variant')!;
const tpr = opt('tpr') ? Number(opt('tpr')) : undefined;
const tnr = opt('tnr') ? Number(opt('tnr')) : undefined;

const judgments = (JSON.parse(readFileSync(input, 'utf-8')).judgments as any[]).filter(j => j.variant === variant);
const byId = new Map<string, any[]>();
for (const j of judgments) byId.set(j.scenario, [...(byId.get(j.scenario) ?? []), j]);
const byScenario = [...byId.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, js]) => ({
  id, passRate: js.filter(j => j.pass).length / js.length, runs: js.length,
}));
const observed = judgments.filter(j => j.pass).length / judgments.length;
/** Rogan-Gladen: 판정 모델의 TPR·TNR을 알 때 실제 통과율 추정 = (관측 + TNR − 1) / (TPR + TNR − 1) */
const corrected = tpr !== undefined && tnr !== undefined ? Math.min(1, Math.max(0, (observed + tnr - 1) / (tpr + tnr - 1))) : undefined;
writeFileSync(opt('out')!, JSON.stringify({ meta: { source: input, variant, grader: 'judge', tpr, tnr }, summary: { passAt1: observed, ...(corrected !== undefined ? { passAt1Corrected: corrected } : {}) }, byScenario }, null, 2) + '\n', 'utf-8');
console.log(`${variant}: ${judgments.length}회, 판정 통과율 ${(observed * 100).toFixed(1)}%${corrected !== undefined ? `, 보정 ${(corrected * 100).toFixed(1)}%` : ''}`);

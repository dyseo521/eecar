/**
 * 기록된 도구 호출을 세계 상태로 다시 실행해, 에이전트가 실제로 본 도구 결과 전체를 복원한다.
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-replay-evidence.ts \
 *     --items eval/agent/labeling/holdout2-items.json --key eval/agent/labeling/holdout2-key.json \
 *     --scenarios eval/agent/holdout_v2_scenarios.json --out <파일>
 *
 * 실행 기록(steps)의 도구 결과는 앞 500자만 남는다(orchestrator 로그용). 판정자는 그 뒤에 있던 값을 지어낸 값으로
 * 오해할 수 있다. 도구 결과는 시나리오의 세계 상태로 정해지므로(시각만 다름) 같은 호출을 다시 실행하면 같은 내용이 나온다.
 * analyze_error는 모델을 다시 부르게 되므로 재실행하지 않고 기록된 앞부분을 쓴다.
 */
import { readFileSync, writeFileSync } from 'fs';
import { makeTools } from './agent-eval.js';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

async function main(): Promise<void> {
  const items = JSON.parse(readFileSync(opt('items')!, 'utf-8')) as Array<{ id: string; scenario: string; evidence: Array<{ tool: string; target: string; result: string }> }>;
  const key = new Map((JSON.parse(readFileSync(opt('key')!, 'utf-8')) as Array<{ id: string; variant: string; scenario: string; run: number }>).map(k => [k.id, k]));
  const scenarios = new Map((JSON.parse(readFileSync(opt('scenarios')!, 'utf-8')).scenarios as any[]).map(s => [s.id, s]));
  const reports: Record<string, any> = {};
  const out: Record<string, Array<{ tool: string; input: Record<string, unknown>; result: string; replayed: boolean }>> = {};
  for (const it of items) {
    const k = key.get(it.id)!;
    const file = `eval/reports/2026-11-06-agent-eval-holdout2-${k.variant}.json`;
    reports[file] ??= JSON.parse(readFileSync(file, 'utf-8'));
    const run = reports[file].results.find((r: any) => r.id === k.scenario && r.run === k.run);
    const scenario = scenarios.get(k.scenario);
    const tools = makeTools(scenario, [], null, false);
    out[it.id] = [];
    for (const st of run.steps ?? []) {
      if (!st.action) continue;
      if (st.action === 'analyze_error') {
        out[it.id].push({ tool: st.action, input: st.actionInput ?? {}, result: String(st.observation ?? ''), replayed: false });
        continue;
      }
      const res = await tools(st.action, st.actionInput ?? {});
      out[it.id].push({ tool: st.action, input: st.actionInput ?? {}, result: res.success ? JSON.stringify(res.data) : `Error: ${res.error}`, replayed: true });
    }
  }
  writeFileSync(opt('out')!, JSON.stringify(out, null, 1) + '\n', 'utf-8');
  console.log(`${Object.keys(out).length}건 → ${opt('out')}`);
}

main().catch(e => { console.error(e); process.exit(1); });

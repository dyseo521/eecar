/**
 * Haiku 5.5의 가설 판정 실행을 Sonnet 5.5로 승격해 다시 조사한다 (DECISION_LOG E-39).
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs eval/ts/agent-escalate.ts \
 *     --base <V2 평가 보고서> --scenarios eval/agent/scenarios_v3_holdout.json --harness eval/agent/h55/s55-escalate.json --tag h55-s55esc
 *
 * 같은 대화에서 모델만 바꾸지 않고 새 대화로 시작한다. Haiku 5.5의 사고 블록을 Sonnet 5.5가 읽는 경로는
 * Claude API와 Google Cloud로 한정되어 운영 대상인 Bedrock에 옮길 수 없다.
 * 1차 조사의 도구 결과와 미확인 항목만 넘기고 판정과 요약은 넘기지 않는다. 앞선 결론에 끌려가지 않게 하기 위해서다.
 * Sonnet이 진단을 제출하지 못하면 Haiku의 결과를 그대로 둔다.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { harnessDeps, makeTools, normalizeScenario, scenarioClock } from './agent-eval.js';
import { runPool } from './run-pool.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const RUNS = [0, 1];
const RESULT_LIMIT = 8000;
const MODEL = arg('model') ?? 'claude-sonnet-5-5';

async function evidenceOf(scenario: any, steps: any[]): Promise<string> {
  const tools = makeTools(scenario, [], null, false);
  const rows: string[] = [];
  for (const step of steps) {
    if (!step.action || step.action === 'submit_diagnosis') continue;
    let result: string;
    if (step.action === 'analyze_error') {
      result = String(step.observation ?? '');
    } else {
      const res = await tools(step.action, step.actionInput ?? {});
      result = res.success ? JSON.stringify(res.data) : `Error: ${res.error}`;
    }
    rows.push(`## ${step.action} ${JSON.stringify(step.actionInput ?? {})}\n${result.slice(0, RESULT_LIMIT)}`);
  }
  return rows.join('\n\n');
}

export function handoffMessage(question: string, evidence: string, unverified: string[]): string {
  const open = unverified.length ? unverified.map(u => `- ${u}`).join('\n') : '- 없음';
  return `${question}

---
아래는 1차 조사에서 수집한 도구 결과입니다. 1차 조사는 원인을 확정하지 못했습니다.
같은 조회를 반복하지 말고, 판단에 부족한 부분만 도구로 추가 확인한 뒤 submit_diagnosis로 제출하세요.
1차 조사의 결론은 제공하지 않습니다. 증거를 직접 검토해 판정하세요.

# 수집한 도구 결과
${evidence}

# 1차 조사에서 확인하지 못한 항목
${open}`;
}

async function main(): Promise<void> {
  const basePath = arg('base')!;
  const tag = arg('tag') ?? 'h55-s55esc';
  const limit = Number(arg('limit') ?? 0);
  const date = new Date().toISOString().slice(0, 10);
  const outFile = arg('out') ?? `eval/reports/${date}-agent-eval-${tag}.json`;

  const base = JSON.parse(readFileSync(basePath, 'utf-8'));
  const prior = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf-8')) : null;
  const scenarios = new Map<string, any>(JSON.parse(readFileSync(arg('scenarios')!, 'utf-8')).scenarios.map((s: any) => [s.id, normalizeScenario(s)]));
  const deps = harnessDeps(arg('harness')!, ['analyze_error', 'get_logs', 'get_function_status', 'get_error_summary', 'recall_memory', 'save_memory', 'get_function_config', 'get_function_permissions']);
  const { runReActAgent } = await import('../../backend/src/functions/slack-agent/orchestrator.js');
  const { analyzeError } = await import('../../backend/src/functions/slack-agent/tools/analyze-error.js');

  const results: any[] = prior?.results ?? base.results.filter((r: any) => scenarios.has(r.id) && RUNS.includes(r.run));
  let targets = results.filter(r => r.diagnosis?.verdict === 'hypothesis' && !r.escalation);
  if (limit) targets = targets.slice(0, limit);
  const save = () => writeFileSync(outFile, JSON.stringify({ ...base, meta: { ...base.meta, tag, escalationModel: MODEL }, results }, null, 1));

  const log = console.log;
  console.log = () => {};
  await runPool(targets.map(r => async () => {
    const scenario = scenarios.get(r.id);
    const evidence = await evidenceOf(scenario, r.steps);
    // V2는 strict 없이 실행해 not_verified가 문자열로 저장된 실행이 있다
    const notVerified = r.diagnosis.not_verified;
    const unverified: string[] = Array.isArray(notVerified) ? notVerified : typeof notVerified === 'string' && notVerified.trim() ? [notVerified] : [];
    const message = handoffMessage(scenario.message, evidence, unverified);
    const calls: any[] = [];
    let outcome: any;
    try {
      outcome = await runReActAgent(message, { userId: 'eval', channelId: 'eval' }, {
        ...deps,
        executeTool: makeTools(scenario, calls, analyzeError, false),
        emit: false,
        modelOverride: MODEL,
        currentTime: scenarioClock(scenario),
      });
    } catch (error) {
      outcome = { steps: [], metrics: { stopReason: `exception:${(error as Error).name}` } };
    }
    const haiku = { verdict: r.diagnosis.verdict, costUsd: r.metrics?.estimatedCostUsd };
    if (outcome.diagnosis) {
      r.steps = [...r.steps.filter((s: any) => s.action && s.action !== 'submit_diagnosis'), ...outcome.steps];
      r.calls = [...r.calls, ...calls];
      r.response = outcome.response;
      r.diagnosis = outcome.diagnosis;
    }
    r.escalation = { model: MODEL, applied: !!outcome.diagnosis, haiku, stopReason: outcome.metrics.stopReason, turns: outcome.metrics.turns, toolCalls: outcome.metrics.toolCalls, inputTokens: outcome.metrics.inputTokens, outputTokens: outcome.metrics.outputTokens, latencyMs: outcome.metrics.latencyMs };
    save();
    log(`${r.id}#${r.run} ${outcome.diagnosis ? `hypothesis -> ${outcome.diagnosis.verdict}` : `유지 (${outcome.metrics.stopReason})`} 턴 ${outcome.metrics.turns ?? '-'} 도구 ${outcome.metrics.toolCalls ?? '-'}`);
  }), Number(arg('concurrency') ?? 4));
  save();
  log(`승격 ${targets.length}회 처리 -> ${outFile}`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('agent-escalate.ts')) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

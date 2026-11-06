/**
 * 자동이 진단 평가 (C-15, DECISION_LOG E-29). Bedrock 자격 증명이 필요하다 (실제 모델 호출, 비용 발생).
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts [--runs 3] [--only s01,s03] [--model <modelId>] [--tag pilot]
 *
 * - 에이전트(orchestrator.runReActAgent)는 운영 코드 그대로 실행한다.
 * - 도구는 시나리오의 고정 데이터(eval/agent/scenarios.json)로 응답한다. 운영 도구와 같은 반환 형태다.
 *   analyze_error는 실제 Claude 분석을 하되 외부 컨텍스트(Bedrock KB, 장기 기억)는 비운다.
 *   save_memory는 쓰지 않고 호출만 기록한다.
 * - 채점은 결정적 규칙이다: 원인 표현, 조치 표현, 오진 표현, 필요한 도구 호출.
 * - 결과: eval/reports/<날짜>-agent-eval[-tag].{json,md}
 *
 *   ... agent-eval.ts --regrade eval/reports/<파일>.json   # 저장된 응답을 현재 채점 규칙으로 다시 채점 (모델 호출 없음)
 *   ... agent-eval.ts --scenarios eval/agent/holdout_scenarios.json --tag holdout
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface Fixture {
  status?: { invocations: number; errors: number; avgDuration: number };
  logs?: string[];
  errorSummary?: Array<[string, number]>;
}

interface Scenario {
  id: string;
  source: string;
  title: string;
  message: string;
  functions: Record<string, Fixture>;
  label: { cause: string[]; fix: string[]; mustNot: string[]; tools: string[] };
}

// 시나리오에 없는 함수는 정상 상태로 응답한다 (get_function_status "all" 대비)
// infrastructure/template.yaml의 함수 전체
const KNOWN_FUNCTIONS = [
  'VectorSearchFunction', 'PartRegistrationFunction', 'ComplianceCheckFunction', 'GetPartsFunction', 'WatchPartFunction',
  'ProposalFunction', 'SyntheticDataFunction', 'BatteryHealthAssessmentFunction', 'MaterialPropertySearchFunction',
  'ContactInquiryFunction', 'SlackNotificationFunction', 'SlackAgentFunction',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function norm(name: string): string {
  return name.toLowerCase().replace(/eecar-stack-/g, '').replace(/[^a-z0-9]/g, '').replace(/function$/, '');
}

function findFixture(scenario: Scenario, name: string): { key: string; fixture: Fixture } | undefined {
  const n = norm(name);
  for (const [key, fixture] of Object.entries(scenario.functions)) {
    const k = norm(key);
    if (k === n || (n.length >= 4 && (k.includes(n) || n.includes(k)))) return { key, fixture };
  }
  return undefined;
}

function isKnown(name: string): string | undefined {
  const n = norm(name);
  return KNOWN_FUNCTIONS.find(f => {
    const k = norm(f);
    return k === n || (n.length >= 4 && (k.includes(n) || n.includes(k)));
  });
}

const LEVEL = (m: string): 'ERROR' | 'WARN' | 'INFO' =>
  /error|exception|fatal/i.test(m) ? 'ERROR' : /warn/i.test(m) ? 'WARN' : 'INFO';

function logEntries(lines: string[]) {
  const now = Date.now();
  return lines.map((message, i) => ({
    timestamp: new Date(now - (lines.length - i) * 60_000).toISOString(),
    message: `${new Date(now - (lines.length - i) * 60_000).toISOString()}\treq-${i}\t${message}`,
    level: LEVEL(message),
  }));
}

function healthy(name: string) {
  return { functionName: name, invocations: 100, errors: 0, errorRate: 0, avgDuration: 250 };
}

interface Call { name: string; functionName?: string }

function makeTools(scenario: Scenario, calls: Call[], analyzeError: any, legacyTools = false) {
  return async (name: string, input: Record<string, unknown>) => {
    calls.push({ name, ...(input.functionName ? { functionName: String(input.functionName) } : {}) });
    const fn = String(input.functionName ?? '');
    const found = findFixture(scenario, fn);
    switch (name) {
      case 'get_logs': {
        const filter = String(input.filter ?? 'ERROR');
        const lines = found?.fixture.logs ?? [];
        const entries = logEntries(lines).filter(e =>
          filter === 'ALL' ? true : filter === 'ERROR' ? e.level === 'ERROR' : filter === 'WARN' ? e.level === 'WARN' : e.level === 'INFO');
        return { success: true, data: entries };
      }
      case 'get_function_status': {
        if (fn === 'all') {
          const names = [...new Set([...KNOWN_FUNCTIONS, ...Object.keys(scenario.functions)])];
          return {
            success: true,
            data: names.map(n => {
              const f = scenario.functions[n];
              return f?.status ? { functionName: n, ...f.status, errorRate: f.status.invocations ? (f.status.errors / f.status.invocations) * 100 : 0 } : healthy(n);
            }),
          };
        }
        if (found?.fixture.status) {
          const s = found.fixture.status;
          const lastErrorLine = (found.fixture.logs ?? []).find(l => LEVEL(l) === 'ERROR');
          return {
            success: true,
            data: {
              functionName: fn, ...s, errorRate: s.invocations ? (s.errors / s.invocations) * 100 : 0,
              ...(s.errors > 0 && lastErrorLine ? { lastError: { message: lastErrorLine, timestamp: new Date().toISOString() } } : {}),
            },
          };
        }
        // 운영 도구와 같은 동작: 스택에 없는 함수는 found=false (cloudwatch.ts getLambdaStatus, A-35)
        // --variant baseline은 이전 동작(0으로 채운 지표)을 재현한다
        if (legacyTools && !isKnown(fn)) return { success: true, data: { functionName: fn, invocations: 0, errors: 0, errorRate: 0, avgDuration: 0 } };
        return { success: true, data: isKnown(fn) ? healthy(fn) : {
          functionName: fn, found: false, note: `'${fn}' 함수를 스택에서 찾지 못했습니다. 함수 이름을 확인하세요.`,
          invocations: 0, errors: 0, errorRate: 0, avgDuration: 0,
        } };
      }
      case 'get_error_summary': {
        const rows = found?.fixture.errorSummary ?? [];
        return { success: true, data: rows.map(([errorType, count]) => ({ errorType, count, lastOccurred: new Date().toISOString() })) };
      }
      case 'recall_memory':
        return { success: true, data: [] };
      case 'save_memory':
        return { success: true, data: { saved: false, note: '평가에서는 저장하지 않음' } };
      case 'analyze_error': {
        const analysis = await analyzeError(
          { errorMessage: String(input.errorMessage ?? ''), functionName: fn || 'Unknown' },
          { searchCodebase: async () => [], recallMemory: async () => [] }
        );
        return { success: true, data: analysis };
      }
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  };
}

function grade(scenario: Scenario, response: string, calls: Call[]) {
  const text = response.toLowerCase();
  const has = (phrases: string[]) => phrases.filter(p => text.includes(p.toLowerCase()));
  const cause = has(scenario.label.cause);
  const fix = has(scenario.label.fix);
  const wrong = has(scenario.label.mustNot);
  const names = calls.map(c => c.name);
  const toolsOk = scenario.label.tools.every(group => group.split('|').some(t => names.includes(t)));
  // 증거 조건: 고정 데이터가 있는 함수를 실제로 조회했어야 한다 (엉뚱한 함수를 보고 짐작한 답을 거른다)
  const targets = Object.keys(scenario.functions);
  const evidence = targets.length === 0 || calls.some(c => c.functionName && findFixture(scenario, c.functionName) !== undefined);
  return {
    cause: cause.length > 0,
    fix: fix.length > 0,
    noWrongClaim: wrong.length === 0,
    tools: toolsOk,
    evidence,
    pass: cause.length > 0 && fix.length > 0 && wrong.length === 0 && toolsOk && evidence,
    matched: { cause, fix, wrong },
  };
}

async function main(): Promise<void> {
  const runs = Number(arg('runs') ?? '3');
  const only = arg('only')?.split(',');
  const model = arg('model');
  const tag = arg('tag');
  // baseline: A-35 수정 전 동작 (이전 시스템 프롬프트, 최종 답 병합 없음, 없는 함수에 0 지표)
  const variant = arg('variant') ?? 'current';
  const baselineDeps = variant === 'baseline'
    ? { systemPrompt: readFileSync('eval/agent/baseline-system-prompt.txt', 'utf-8'), mergeAnalysis: false }
    : {};
  const { runReActAgent } = await import('../../backend/src/functions/slack-agent/orchestrator.js');
  const { analyzeError } = await import('../../backend/src/functions/slack-agent/tools/analyze-error.js');
  const scenarioFile = arg('scenarios') ?? 'eval/agent/scenarios.json';
  const spec = JSON.parse(readFileSync(scenarioFile, 'utf-8')) as { scenarios: Scenario[] };
  const scenarios = spec.scenarios.filter(s => !only || only.includes(s.id));

  const regrade = arg('regrade');
  if (regrade) {
    const saved = JSON.parse(readFileSync(regrade, 'utf-8'));
    const byId = new Map(scenarios.map(s => [s.id, s]));
    const regraded = saved.results.map((r: any) => ({ ...r, ...grade(byId.get(r.id)!, r.response, r.calls) }));
    writeReport(scenarios, regraded, saved.meta.runs, saved.meta.model === 'routing(default)' ? undefined : saved.meta.model,
      `${saved.meta.tag ?? (regrade.match(/agent-eval-([a-z0-9-]+).json$/)?.[1] ?? 'run')}-regraded`, scenarioFile);
    return;
  }

  const originalLog = console.log;
  const originalError = console.error;
  const results = [];
  for (const scenario of scenarios) {
    for (let r = 0; r < runs; r++) {
      const calls: Call[] = [];
      console.log = () => {};
      console.error = () => {};
      let outcome;
      try {
        outcome = await runReActAgent(scenario.message, { userId: 'eval', channelId: 'eval' }, {
          executeTool: makeTools(scenario, calls, analyzeError, variant === 'baseline'), emit: false, modelOverride: model,
          ...baselineDeps,
        });
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
      const g = grade(scenario, outcome.response, calls);
      results.push({ id: scenario.id, run: r, source: scenario.source, title: scenario.title, ...g, calls, response: outcome.response, metrics: outcome.metrics, steps: outcome.steps });
      originalLog(`${g.pass ? 'pass' : 'FAIL'} ${scenario.id}#${r} cause=${g.cause} fix=${g.fix} noWrong=${g.noWrongClaim} tools=${g.tools} evidence=${g.evidence} turns=${outcome.metrics.turns} $${outcome.metrics.estimatedCostUsd.toFixed(4)}`);
    }
  }

  writeReport(scenarios, results, runs, model, tag, scenarioFile);
}

function writeReport(scenarios: Scenario[], results: any[], runs: number, model: string | undefined, tag: string | undefined, scenarioFile: string): void {
  const byScenario = scenarios.map(s => {
    const rs = results.filter(r => r.id === s.id);
    return { id: s.id, title: s.title, source: s.source, passRate: rs.filter(r => r.pass).length / rs.length, passAll: rs.every(r => r.pass), runs: rs.length };
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  const summary = {
    scenarios: scenarios.length,
    runsPerScenario: runs,
    passAt1: mean(results.map(r => (r.pass ? 1 : 0))),
    passHatK: mean(byScenario.map(s => (s.passAll ? 1 : 0))),
    cause: mean(results.map(r => (r.cause ? 1 : 0))),
    fix: mean(results.map(r => (r.fix ? 1 : 0))),
    noWrongClaim: mean(results.map(r => (r.noWrongClaim ? 1 : 0))),
    tools: mean(results.map(r => (r.tools ? 1 : 0))),
    evidence: mean(results.map(r => (r.evidence ? 1 : 0))),
    avgTurns: mean(results.map(r => r.metrics.turns)),
    avgToolCalls: mean(results.map(r => r.metrics.toolCalls)),
    avgInputTokens: mean(results.map(r => r.metrics.inputTokens)),
    avgOutputTokens: mean(results.map(r => r.metrics.outputTokens)),
    avgCostUsd: mean(results.map(r => r.metrics.estimatedCostUsd)),
    totalCostUsd: results.reduce((a, r) => a + r.metrics.estimatedCostUsd, 0),
    avgLatencyMs: mean(results.map(r => r.metrics.latencyMs)),
    maxTurnsRuns: results.filter(r => r.metrics.stopReason === 'max_turns').length,
    errorRuns: results.filter(r => r.metrics.stopReason === 'error').length,
  };

  const date = new Date().toISOString().slice(0, 10);
  const stem = join('eval/reports', `${date}-agent-eval${tag ? `-${tag}` : ''}`);
  mkdirSync('eval/reports', { recursive: true });
  writeFileSync(`${stem}.json`, JSON.stringify({ meta: { date, model: model ?? 'routing(default)', runs }, summary, byScenario, results }, null, 2) + '\n', 'utf-8');
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const md = [
    `# 자동이 진단 평가 (${date}${tag ? `, ${tag}` : ''})`,
    '',
    `- 시나리오 ${summary.scenarios}개 × ${runs}회, 모델: ${model ?? '기본 라우팅 (복잡한 질문 첫 턴만 Sonnet)'}`,
    `- 통과(원인·조치·오진 없음·필요 도구 모두): pass@1 ${pct(summary.passAt1)}, pass^${runs} ${pct(summary.passHatK)}`,
    `- 항목별: 원인 ${pct(summary.cause)}, 조치 ${pct(summary.fix)}, 오진 없음 ${pct(summary.noWrongClaim)}, 도구 ${pct(summary.tools)}, 증거(대상 함수 조회) ${pct(summary.evidence)}`,
    `- 실행당 평균: 턴 ${summary.avgTurns.toFixed(1)}, 도구 호출 ${summary.avgToolCalls.toFixed(1)}, 입력 토큰 ${summary.avgInputTokens.toFixed(0)}, 출력 토큰 ${summary.avgOutputTokens.toFixed(0)}, 비용 $${summary.avgCostUsd.toFixed(4)}, 지연 ${(summary.avgLatencyMs / 1000).toFixed(1)}s`,
    `- 총 비용 $${summary.totalCostUsd.toFixed(3)}, 턴 한도 도달 ${summary.maxTurnsRuns}회, 오류 ${summary.errorRuns}회`,
    '',
    '| 시나리오 | 출처 | 통과율 |',
    '|---|---|---:|',
    ...byScenario.map(s => `| ${s.id} ${s.title} | ${s.source} | ${pct(s.passRate)} |`),
    '',
  ].join('\n');
  writeFileSync(`${stem}.md`, md, 'utf-8');
  console.log(`\n${md}`);
}


main().catch(error => {
  console.error(error);
  process.exit(1);
});

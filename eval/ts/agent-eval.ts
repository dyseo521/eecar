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
 *   ... agent-eval.ts --variant shipped   # v1.9.1 재현 (설정·권한 도구와 한도 런북 이전, A-38)
 *
 * 세계 상태: 함수 설정·권한의 기본값은 운영 스냅숏(eval/agent/world-default.json)이고, 시나리오는 다른 부분만 덮어쓴다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { runPool } from './run-pool.js';
import { SUBMIT_DIAGNOSIS_TOOL } from '../../backend/src/functions/slack-agent/tools/diagnosis.js';

interface Fixture {
  status?: { invocations: number; errors: number; avgDuration: number };
  logs?: string[];
  errorSummary?: Array<[string, number]>;
  /** 기본 설정에서 바꾼 부분. environment는 키 단위로 합치고(null은 삭제), 나머지 필드는 바꿔 끼운다 */
  config?: Record<string, unknown> & { environment?: Record<string, string | null> };
  /** statements가 있으면 기본 권한 목록을 통째로 바꾼다 */
  permissions?: { statements?: unknown[] };
}

interface WorldFunction { config: Record<string, unknown> & { environment?: Record<string, string> }; permissions: Record<string, unknown> }
const WORLD: Record<string, WorldFunction> = JSON.parse(readFileSync('eval/agent/world-default.json', 'utf-8')).functions;

/** 운영 도구(get_function_config / get_function_permissions)와 같은 형태로 세계 상태를 돌려준다 */
function worldConfig(known: string, fixture?: Fixture): Record<string, unknown> {
  const base = WORLD[known]?.config ?? { functionName: known, found: true };
  const override = fixture?.config ?? {};
  const environment: Record<string, string> = { ...(base.environment ?? {}) };
  for (const [k, v] of Object.entries(override.environment ?? {})) {
    if (v === null) delete environment[k];
    else environment[k] = v;
  }
  const { environment: _ignored, ...rest } = override;
  return { ...base, ...rest, environment };
}

function worldPermissions(known: string, fixture?: Fixture): Record<string, unknown> {
  const base = WORLD[known]?.permissions ?? { functionName: known, found: true, statements: [] };
  return fixture?.permissions?.statements ? { ...base, statements: fixture.permissions.statements } : base;
}

interface Scenario {
  id: string;
  source: string;
  title: string;
  message: string;
  functions: Record<string, Fixture>;
  category?: string;
  /** 표현 목록 채점용 (v1·v2 시나리오). v3부터는 truth + 판정 모델로 채점한다 (E-33) */
  label?: { cause: string[]; fix: string[]; mustNot: string[]; tools: string[] };
  /** v3 시나리오: 실제 장애 분포를 따른 분류 코드(A1~F4)와 세계 상태 */
  code?: string;
  world?: {
    functions?: Record<string, Fixture>;
    changes?: Array<{ time: string; type: string; target: string; actor?: string; summary?: string; details?: unknown }>;
    metrics?: { bedrock?: Record<string, Record<string, number>>; dynamodb?: Record<string, number>; apiGateway?: Record<string, number>; canary?: Record<string, unknown> };
    externalStatus?: Array<{ provider: string; time?: string; severity?: string; title?: string; body?: string }>;
  };
  truth?: { verdict: string; component?: string; faultType?: string; cause: string; fix: string; acceptableFixes?: string[]; forbiddenFixes?: string[]; contributing?: string[] };
}

/** v3 세계 상태의 함수 고정 데이터를 v1·v2와 같은 자리로 옮긴다 */
export function normalizeScenario<T extends { functions?: Record<string, Fixture>; world?: Scenario['world']; category?: string; code?: string }>(s: T): T {
  s.functions = s.functions ?? s.world?.functions ?? {};
  s.category = s.category ?? s.code;
  return s;
}

const HEALTHY_BEDROCK = [
  { modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', invocations: 200, throttles: 0, serverErrors: 0, clientErrors: 0 },
  { modelId: 'amazon.titan-embed-text-v2:0', invocations: 400, throttles: 0, serverErrors: 0, clientErrors: 0 },
];

/** 운영 도구(get_service_metrics)와 같은 형태로 세계 상태의 지표를 돌려준다. 시나리오에 없으면 정상값이다 */
function worldServiceMetrics(scenario: Scenario, service: string, fn: string): Record<string, unknown> {
  const m = scenario.world?.metrics ?? {};
  const windowHours = 24;
  if (service === 'lambda') {
    const known = isKnown(fn);
    if (!known) return { service, functionName: fn, found: false, note: `'${fn}' 함수를 스택에서 찾지 못했습니다.` };
    const s = findFixture(scenario, fn)?.fixture.status as Record<string, number> | undefined;
    return { service, functionName: fn, windowHours, throttles: s?.throttles ?? 0, durationP99: s?.durationP99 ?? Math.round((s?.avgDuration ?? 250) * 2), maxConcurrency: s?.maxConcurrency ?? 3 };
  }
  if (service === 'bedrock') {
    const models = m.bedrock ? Object.entries(m.bedrock).map(([modelId, v]) => ({ modelId, clientErrors: 0, ...v })) : HEALTHY_BEDROCK;
    return { service, windowHours, models };
  }
  if (service === 'dynamodb') return { service, windowHours, throttledRequests: 0, consumedRCU: 3000, consumedWCU: 2000, systemErrors: 0, ...(m.dynamodb ?? {}) };
  if (service === 'apigateway') return { service, windowHours, count: 500, '5xx': 0, '4xx': 3, ...(m.apiGateway ?? {}) };
  if (service === 'canary') return { service, windowHours, runs: 24, minVectorCandidates: 100, ...(m.canary ?? {}) };
  return { service, error: `지원하지 않는 서비스입니다: ${service}` };
}

/** 운영 도구(get_provider_status)와 같은 형태. 세계 상태에 공지가 없으면 모두 정상이다 */
function worldProviderStatus(scenario: Scenario): Record<string, unknown> {
  const items = scenario.world?.externalStatus ?? [];
  const of = (p: string) => items.filter(i => i.provider.toLowerCase() === p);
  const aws = of('aws');
  const anthropic = of('anthropic');
  const slack = of('slack');
  return {
    aws: { region: 'ap-northeast-2', notices: aws.map(n => ({ title: n.title, published: n.time, description: n.body, severity: n.severity })) },
    anthropic: anthropic.length
      ? { indicator: anthropic[0].severity ?? 'minor', description: anthropic[0].title, incidents: anthropic.map(n => ({ name: n.title, status: n.severity, startedAt: n.time, body: n.body })) }
      : { indicator: 'none', description: 'All Systems Operational', incidents: [] },
    slack: slack.length
      ? { status: 'active', incidents: slack.map(n => ({ title: n.title, status: n.severity, startedAt: n.time, body: n.body })) }
      : { status: 'ok', incidents: [] },
  };
}

/** 운영 도구(get_recent_changes)와 같은 형태. 함수를 지정하면 그 함수와 스택 전체 변경만 돌려준다 */
function worldChanges(scenario: Scenario, fn: string): Record<string, unknown> {
  const n = fn ? norm(fn) : '';
  const changes = (scenario.world?.changes ?? [])
    .filter(c => !n || ['stack_update', 'layer_publish', 'ssm_param'].includes(c.type) || norm(c.target).includes(n))
    .sort((a, b) => b.time.localeCompare(a.time));
  return { windowHours: 168, changes };
}

// 시나리오에 없는 함수는 정상 상태로 응답한다 (get_function_status "all" 대비)
// infrastructure/template.yaml의 함수 전체
const KNOWN_FUNCTIONS = [
  'VectorSearchFunction', 'PartRegistrationFunction', 'ComplianceCheckFunction', 'GetPartsFunction', 'WatchPartFunction',
  'ProposalFunction', 'SyntheticDataFunction', 'BatteryHealthAssessmentFunction', 'MaterialPropertySearchFunction',
  'ContactInquiryFunction', 'SlackNotificationFunction', 'SlackAgentFunction',
];

/** Haiku 5.5 하네스 변형 (E-37). 설정 파일 하나가 프롬프트, 제출 방식, 도구 정의, effort를 정한다 */
function harnessDeps(file: string, configTools: string[]) {
  const h = JSON.parse(readFileSync(file, 'utf-8'));
  if (h.effort) process.env.EVAL_EFFORT = h.effort;
  const base = SUBMIT_DIAGNOSIS_TOOL.input_schema as any;
  const schema = h.verdictDescription
    ? { ...base, properties: { ...base.properties, verdict: { ...base.properties.verdict, description: h.verdictDescription } } }
    : base;
  const removed: string[] = h.removeTools ?? [];
  return {
    systemPrompt: readFileSync(h.prompt, 'utf-8').split('\r\n').join('\n'),
    toolNames: [...configTools, 'get_recent_changes', 'get_service_metrics', 'get_provider_status', 'submit_diagnosis'].filter(t => !removed.includes(t)),
    requireDiagnosis: true,
    cachePrompt: true,
    finalizeMode: h.finalizeMode ?? 'forced',
    ...(h.finalizePrompt ? { finalizePrompt: h.finalizePrompt } : {}),
    toolOverrides: { submit_diagnosis: { ...(h.submitDescription ? { description: h.submitDescription } : {}), input_schema: schema, strict: !!h.strict } },
  };
}

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

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z/;
/**
 * 시각이 없는 이전 시나리오(v1·v2) 로그와 기본 시계로 쓰는 고정 시각.
 * 실행 시각을 쓰면 v3 로그 앞에 모순되는 시각이 붙고, 판정 때 다시 실행한 결과와도 달라져
 * 시간 순서를 판단할 수 없었고 "시각을 지어냈다"는 허위 오진이 나왔다 (E-34).
 */
const FIXED_CLOCK = Date.parse('2026-11-06T12:00:00Z');

function logEntries(lines: string[]) {
  return lines.map((message, i) => {
    const own = ISO_PREFIX.exec(message)?.[0];
    const timestamp = own ?? new Date(FIXED_CLOCK - (lines.length - i) * 60_000).toISOString();
    return { timestamp, message: own ? message : `${timestamp}\treq-${i}\t${message}`, level: LEVEL(message) };
  });
}

/** 시나리오의 "지금": 작성자 노트대로 마지막 로그 직후(가장 늦은 시각의 1분 뒤). 시각이 없으면 고정 시각 */
export function scenarioClock(scenario: Scenario): string {
  normalizeScenario(scenario);
  const times = [
    ...Object.values(scenario.functions).flatMap(f => (f.logs ?? []).map(l => ISO_PREFIX.exec(l)?.[0])),
    ...(scenario.world?.changes ?? []).map(c => c.time),
  ].map(t => (t ? Date.parse(t) : NaN)).filter(t => !Number.isNaN(t));
  return new Date(times.length ? Math.max(...times) + 60_000 : FIXED_CLOCK).toISOString();
}

function healthy(name: string) {
  return { functionName: name, invocations: 100, errors: 0, errorRate: 0, avgDuration: 250 };
}

interface Call { name: string; functionName?: string }

/** 운영 get_function_status가 돌려주는 필드만. 스로틀·p99·동시 실행은 get_service_metrics로 본다 */
const baseStatus = (s: { invocations: number; errors: number; avgDuration: number }) => ({ invocations: s.invocations, errors: s.errors, avgDuration: s.avgDuration });

export function makeTools(scenario: Scenario, calls: Call[], analyzeError: any, legacyTools = false) {
  normalizeScenario(scenario);
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
          // 운영 도구(getAllLambdaStatuses)처럼 스택에 있는 함수만 나열한다. 시나리오의 없는 함수 이름은 나오지 않는다
          return {
            success: true,
            data: KNOWN_FUNCTIONS.map(n => {
              const f = findFixture(scenario, n)?.fixture;
              return f?.status ? { functionName: n, ...baseStatus(f.status), errorRate: f.status.invocations ? (f.status.errors / f.status.invocations) * 100 : 0 } : healthy(n);
            }),
          };
        }
        // 운영 도구처럼 스택에 없는 함수는 고정 데이터가 있어도 found=false (홀드아웃 v2 실행 전에 맞춤)
        if (!legacyTools && !isKnown(fn)) {
          return { success: true, data: {
            functionName: fn, found: false, note: `'${fn}' 함수를 스택에서 찾지 못했습니다. 함수 이름을 확인하세요.`,
            invocations: 0, errors: 0, errorRate: 0, avgDuration: 0,
          } };
        }
        if (found?.fixture.status) {
          const s = found.fixture.status;
          const errorLines = (found.fixture.logs ?? []).filter(l => LEVEL(l) === 'ERROR');
          const lastErrorLine = errorLines[errorLines.length - 1];
          return {
            success: true,
            data: {
              functionName: fn, ...baseStatus(s), errorRate: s.invocations ? (s.errors / s.invocations) * 100 : 0,
              ...(s.errors > 0 && lastErrorLine ? { lastError: { message: lastErrorLine, timestamp: ISO_PREFIX.exec(lastErrorLine)?.[0] ?? new Date(FIXED_CLOCK).toISOString() } } : {}),
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
      case 'get_recent_changes':
        return { success: true, data: worldChanges(scenario, fn) };
      case 'get_service_metrics':
        return { success: true, data: worldServiceMetrics(scenario, String(input.service ?? ''), fn) };
      case 'get_provider_status':
        return { success: true, data: worldProviderStatus(scenario) };
      case 'get_function_config':
      case 'get_function_permissions': {
        const known = isKnown(fn);
        if (!known) return { success: true, data: { functionName: fn, found: false, note: `'${fn}' 함수를 스택에서 찾지 못했습니다. 함수 이름을 확인하세요.` } };
        const data = name === 'get_function_config' ? worldConfig(known, found?.fixture) : worldPermissions(known, found?.fixture);
        return { success: true, data: { ...data, functionName: fn } };
      }
      case 'get_error_summary': {
        const rows = found?.fixture.errorSummary ?? [];
        const lastOccurred = logEntries(found?.fixture.logs ?? []).filter(e => e.level === 'ERROR').pop()?.timestamp ?? scenarioClock(scenario);
        return { success: true, data: rows.map(([errorType, count]) => ({ errorType, count, lastOccurred })) };
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
  // v3 시나리오는 표현 목록이 없다. 판정 모델로 따로 채점한다 (eval/ts/agent-judge.ts)
  if (!scenario.label) {
    return { cause: false, fix: false, noWrongClaim: true, tools: true, evidence: true, pass: false, graded: false, matched: { cause: [], fix: [], wrong: [] } };
  }
  const text = response.toLowerCase();
  const has = (phrases: string[]) => phrases.filter(p => text.includes(p.toLowerCase()));
  const cause = has(scenario.label.cause);
  const fix = has(scenario.label.fix);
  const wrong = has(scenario.label.mustNot);
  const names = calls.map(c => c.name);
  const toolsOk = scenario.label.tools.every(group => group.split('|').some(t => names.includes(t)));
  // 증거 조건: 고정 데이터가 있는 함수를 실제로 조회했어야 한다 (엉뚱한 함수를 보고 짐작한 답을 거른다)
  // 전체 상태 조회(get_function_status 'all')는 모든 함수를 보므로 증거로 인정한다 (E-30에서 찾은 채점 결함, h12)
  const targets = Object.keys(scenario.functions);
  const evidence = targets.length === 0 || calls.some(c => c.functionName && (
    findFixture(scenario, c.functionName) !== undefined || (c.name === 'get_function_status' && c.functionName === 'all')));
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
  // current: 운영 코드 그대로 (v1.9.1 이후 운영 = shipped와 같음)
  // baseline: A-35 수정 전 동작 (이전 시스템 프롬프트, 최종 답 병합 없음, 없는 함수에 0 지표)
  // shipped: v1.9.1 프롬프트 + 운영 도구
  // config: 설정·권한 도구 + 한도 런북 프롬프트 (A-38 실험, 홀드아웃 v2 미채택 E-32. 커밋 1cdebd3의 current와 같음)
  // tools-only: v1.9.1 프롬프트 + 설정·권한 도구 (탐색용)
  const variant = arg('variant') ?? 'current';
  const LEGACY_TOOLS = ['analyze_error', 'get_logs', 'get_function_status', 'get_error_summary', 'recall_memory', 'save_memory'];
  const CONFIG_TOOLS = [...LEGACY_TOOLS, 'get_function_config', 'get_function_permissions'];
  // 체크아웃 환경에 따라 CRLF가 될 수 있어 운영과 같은 LF로 맞춘다
  const promptFile = (f: string) => readFileSync(f, 'utf-8').split('\r\n').join('\n');
  const shippedPrompt = () => promptFile('eval/agent/shipped-v1.9.1-system-prompt.txt');
  const baselineDeps = variant === 'baseline'
    ? { systemPrompt: promptFile('eval/agent/baseline-system-prompt.txt'), mergeAnalysis: false, toolNames: LEGACY_TOOLS }
    : variant === 'shipped'
      ? { systemPrompt: shippedPrompt(), toolNames: LEGACY_TOOLS }
      : variant === 'config'
        ? { systemPrompt: promptFile('eval/agent/config-runbook-system-prompt.txt'), toolNames: CONFIG_TOOLS }
        : variant === 'tools-only'
          ? { systemPrompt: shippedPrompt(), toolNames: CONFIG_TOOLS }
          : variant === 'h55'
            ? harnessDeps(arg('harness')!, CONFIG_TOOLS)
          : variant === 'candidate'
            ? { systemPrompt: promptFile(arg('prompt') ?? 'eval/agent/candidate-system-prompt.txt'), toolNames: [...CONFIG_TOOLS, 'get_recent_changes', 'get_service_metrics', 'get_provider_status', 'submit_diagnosis'], requireDiagnosis: !process.argv.includes('--free-text'), cachePrompt: true }
            : {};
  const { runReActAgent } = await import('../../backend/src/functions/slack-agent/orchestrator.js');
  const { analyzeError } = await import('../../backend/src/functions/slack-agent/tools/analyze-error.js');
  const scenarioFile = arg('scenarios') ?? 'eval/agent/scenarios.json';
  const spec = JSON.parse(readFileSync(scenarioFile, 'utf-8')) as { scenarios: Scenario[] };
  const scenarios = spec.scenarios.filter(s => !only || only.includes(s.id)).map(s => normalizeScenario(s));

  const regrade = arg('regrade');
  if (regrade) {
    const saved = JSON.parse(readFileSync(regrade, 'utf-8'));
    const byId = new Map(scenarios.map(s => [s.id, s]));
    const regraded = saved.results.map((r: any) => ({ ...r, ...grade(byId.get(r.id)!, r.response, r.calls) }));
    writeReport(scenarios, regraded, saved.meta.runs, saved.meta.model === 'routing(default)' ? undefined : saved.meta.model,
      arg('tag') ?? `${saved.meta.tag ?? (regrade.match(/agent-eval-([a-z0-9-]+).json$/)?.[1] ?? 'run')}-regraded`, scenarioFile, saved.meta.variant);
    return;
  }

  const originalLog = console.log;
  const originalError = console.error;
  const results: any[] = [];
  const order = new Map(scenarios.map((s, i) => [s.id, i]));
  const tasks = scenarios.flatMap(scenario => Array.from({ length: runs }, (_, r) => async () => {
      const calls: Call[] = [];
      const outcome = await runReActAgent(scenario.message, { userId: 'eval', channelId: 'eval' }, {
          executeTool: makeTools(scenario, calls, analyzeError, variant === 'baseline'), emit: false, modelOverride: model,
          ...baselineDeps,
          // 운영 v1.9.1에는 현재 시각이 없다. 후보에만 넣는다
          ...(variant === 'candidate' || variant === 'h55' ? { currentTime: scenarioClock(scenario) } : {}),
        });
      const g = grade(scenario, outcome.response, calls);
      results.push({ id: scenario.id, run: r, source: scenario.source ?? 'v3', code: scenario.code, title: scenario.title, ...g, calls, response: outcome.response, ...(outcome.diagnosis ? { diagnosis: outcome.diagnosis } : {}), metrics: outcome.metrics, steps: outcome.steps });
      originalLog(`${g.pass ? 'pass' : 'FAIL'} ${scenario.id}#${r} cause=${g.cause} fix=${g.fix} noWrong=${g.noWrongClaim} tools=${g.tools} evidence=${g.evidence} turns=${outcome.metrics.turns} $${outcome.metrics.estimatedCostUsd.toFixed(4)}`);
  }));

  // 병렬 실행 동안 에이전트 로그를 끈다. 진행 줄은 원래 console로 찍는다
  console.log = () => {};
  console.error = () => {};
  try {
    await runPool(tasks, Number(arg('concurrency') ?? 1));
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  results.sort((a, b) => order.get(a.id)! - order.get(b.id)! || a.run - b.run);

  writeReport(scenarios, results, runs, model, tag, scenarioFile, variant);
}

function writeReport(scenarios: Scenario[], results: any[], runs: number, model: string | undefined, tag: string | undefined, scenarioFile: string, variant?: string): void {
  const byScenario = scenarios.filter(s => results.some(r => r.id === s.id)).map(s => {
    const rs = results.filter(r => r.id === s.id);
    return { id: s.id, title: s.title, source: s.source, ...(s.category ? { category: s.category } : {}), passRate: rs.filter(r => r.pass).length / rs.length, passAll: rs.every(r => r.pass), runs: rs.length };
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  const summary = {
    scenarios: byScenario.length,
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
  writeFileSync(`${stem}.json`, JSON.stringify({ meta: { date, model: model ?? 'routing(default)', runs, variant: variant ?? 'current', scenarioFile, tag }, summary, byScenario, results }, null, 2) + '\n', 'utf-8');
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const md = [
    `# 자동이 진단 평가 (${date}${tag ? `, ${tag}` : ''})`,
    '',
    `- 시나리오 ${summary.scenarios}개 × ${runs}회 (${scenarioFile}, 구성 ${variant ?? 'current'}), 모델: ${model ?? '기본 라우팅 (복잡한 질문 첫 턴만 Sonnet)'}`,
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


// 직접 실행할 때만 평가를 돌린다 (다른 스크립트가 makeTools를 가져다 쓸 수 있게)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

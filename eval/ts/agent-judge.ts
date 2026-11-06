/**
 * 자동이 답변 판정 모델 v2 (채점기 검증, DECISION_LOG E-33).
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-judge.ts --report <결과>.json [--report ...] \
 *     --truth eval/agent/truth_holdout_v2.json --model <judgeModelId> --tag <이름> [--items <표본 key>.json]
 *
 * v1(한 번의 호출로 원인·조치·단정을 함께 판정)을 기준 판정 40건과 비교했더니, 조치 판정의 오류가 세 가지였다.
 *   1) 정답 요지의 값(예: 60초)에 매달려 다른 값이지만 해결되는 조치(10초)를 깎았다.
 *   2) 원인 세부를 놓쳤다고 조치까지 깎았다.
 *   3) 잘린 조회 자료 때문에 도구가 돌려준 값을 지어낸 값으로 봤다.
 * v2는 판정을 두 번 나눠 부른다.
 *   - 원인·잘못된 단정: 잘리지 않은 조회 자료(세계 상태로 도구 호출을 다시 실행해 복원)와 함께 판정한다.
 *   - 조치: 원인 판정과 따로, 정답 요지의 조치는 한 가지 예로만 두고 체크리스트(해소·안전·실행 가능·우선순위)로 판정한다
 *     (incident.io의 "그대로 따르면 해결되는가", AWS DevOps Agent의 "유효한 조치", SREGym의 예/아니오 문항을 참고).
 * 판정 모델 자체는 기준 판정과의 일치도로 검증한다 (eval/ts/agent-judge-agreement.ts).
 */
import { readFileSync, writeFileSync } from 'fs';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { makeTools, scenarioClock } from './agent-eval.js';
import { currentTimeSection } from '../../backend/src/functions/slack-agent/tools/diagnosis.js';

const args = process.argv.slice(2);
const all = (name: string) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const one = (name: string) => all(name)[0];

const REPORTS = all('report');
const TRUTH = JSON.parse(readFileSync(one('truth') ?? 'eval/agent/truth_holdout_v2.json', 'utf-8')).scenarios as Record<string, { cause: string; fix: string }>;
const MODEL = one('model') ?? 'global.anthropic.claude-sonnet-4-6';
const TAG = one('tag') ?? 'judge';
const ITEMS = one('items') ? (JSON.parse(readFileSync(one('items')!, 'utf-8')) as Array<{ id: string; variant: string; scenario: string; run: number }>) : null;
const JUDGE_VERSION = 'v2.2';
const EVIDENCE_LIMIT = 4000;

const client = new BedrockRuntimeClient({ region: 'ap-northeast-2' });

const CAUSE_RUBRIC = `당신은 장애 진단 답변을 판정한다. 사용자 질문, 시나리오의 정답 요지, 진단 도우미가 조회한 자료, 도우미의 답변이 주어진다.
원인과 잘못된 단정만 판정해 record_cause 도구로 기록하라. 조치는 판정하지 않는다. 표현이 달라도 뜻이 같으면 맞음이다.

원인
- yes(맞음): 정답 요지의 원인을 주원인으로 짚었다.
- partial(부분): 방향은 맞지만 핵심이 빠졌거나, 여러 후보 중 하나로만 말했다.
- no(틀림): 다른 원인을 주원인으로 말했거나 원인을 짚지 못했다.
정상이거나 모호한 사례에서는 "문제가 없다" 또는 "정보가 더 필요하다"고 바르게 판단했는지를 본다.

잘못된 단정
- present(있음): 사실과 다른 내용을 확정적으로 말했다. 없는 장애를 단정하거나, 원인이 아닌 설정·경고를 원인으로 단정하거나, 존재하지 않는 리소스 이름·값을 실제처럼 제시한 경우다.
- none(없음): 그런 단정이 없다. 가능성으로만 말한 것, 예시 명령의 자리표시자 이름은 해당하지 않는다.
- 조회 자료와 "도우미가 원래 아는 정보"(시스템 프롬프트)에 있는 숫자·이름·설정값은 지어낸 것이 아니다. 먼저 두 곳에서 찾아보라.`;

const FIX_RUBRIC = `당신은 장애 진단 답변의 "조치"만 판정한다. 시나리오의 실제 원인은 정답 요지에 있다. 그것을 사실로 받아들여라.
- 답변이 원인을 정확히 짚었는지는 보지 않는다. 조치 자체가 이 장애를 해결하는지만 본다.
- 정답 요지의 조치는 올바른 조치의 한 예일 뿐이다. 값이나 방법이 달라도 그대로 하면 해결되면 된다(예: 원래 60초로 되돌리는 대신 충분한 다른 값으로 올림, 오타를 고치는 대신 올바른 리소스를 허용하는 정책 추가).
- 답변이 핵심으로 권한 조치(가장 먼저, 또는 가장 강하게 권한 것)를 기준으로 아래 문항에 답하고 record_fix 도구로 기록하라.

q_resolves: 온콜 엔지니어가 핵심 조치를 그대로 실행하면 이 장애가 해소되는가? (yes / no / unknown)
q_harmful: 핵심 조치가 상황을 악화시키거나 다른 기능을 깨뜨리는가? (yes / no)
q_works_as_written: 핵심 조치에 제시한 명령·코드·정규식·ARN·모델 ID가 그대로 동작하는가? 코드는 경계 조건(길이의 "미만"과 "이하", 한글 같은 비ASCII 입력, 빈 값)까지 따져 보라. 늘릴 수 없는 한도를 늘리라고 하면 no다. (yes / no)
q_wrong_first: 불가능하거나 틀린 조치를 올바른 조치보다 앞에 권했는가? (yes / no)
q_correct_elsewhere: 핵심 조치가 아니더라도 답변 어딘가에 이 장애를 해결하는 조치가 있는가? (yes / no)
- q_resolves, q_harmful, q_works_as_written은 핵심 조치에만 적용한다. 뒤에 덧붙인 대안·임시안의 문제는 q_wrong_first로만 본다.

정상이거나 모호한 사례: 조치가 필요 없다고 안내하거나, 조사에 필요한 것(어떤 기능·증상·시각)을 구체적으로 묻는 것이 올바른 조치다. 불필요한 조치를 핵심으로 권하면 q_resolves=no다.`;

/**
 * v3 정답의 원인 설명. 근거 부족 사례는 정답에 숨은 원인이 적혀 있지만 도구로는 확인할 수 없다.
 * 올바른 답은 단정하지 않고 무엇을 더 봐야 하는지 말하는 것이다. 후보로 드는 것은 괜찮다.
 */
function truthCause(truth: { verdict: string; cause: string }): string {
  if (truth.verdict !== 'insufficient_evidence') return truth.cause;
  return `이 사례는 결정적 신호를 도구로 볼 수 없다. 올바른 답은 근거가 부족함을 인정하고 무엇을 더 확인해야 하는지 말하는 것이다(원인 맞음의 기준). 다른 원인을 확정하거나 정상이라고 단정하면 틀림이다. 아래 숨은 원인을 후보로 드는 것은 괜찮지만 확정하면 잘못된 단정이다. 숨은 원인: ${truth.cause}`;
}

/**
 * 도우미가 원래 아는 정보: 그 실행이 쓴 시스템 프롬프트(함수 목록, 한도 등). v2.1까지는 이것을 주지 않아
 * 판정 모델이 프롬프트의 함수 목록을 말한 답을 "지어냈다"고 봤다 (v2.2)
 */
function promptFor(variant: string): string {
  const file = one('agent-prompt') ?? (variant === 'config' ? 'eval/agent/config-runbook-system-prompt.txt' : variant === 'candidate' ? 'eval/agent/candidate-system-prompt.txt' : 'eval/agent/shipped-v1.9.1-system-prompt.txt');
  return readFileSync(file, 'utf-8').split('\r\n').join('\n');
}

const CAUSE_TOOL = {
  toolSpec: {
    name: 'record_cause',
    description: '원인과 잘못된 단정 판정을 기록한다',
    inputSchema: { json: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: '판정 이유 한두 문장 (먼저 쓴다)' },
        cause: { type: 'string', enum: ['yes', 'partial', 'no'] },
        wrong: { type: 'string', enum: ['none', 'present'] },
      },
      required: ['reason', 'cause', 'wrong'],
    } },
  },
};

const FIX_TOOL = {
  toolSpec: {
    name: 'record_fix',
    description: '조치 판정을 기록한다',
    inputSchema: { json: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: '판정 이유 한두 문장 (먼저 쓴다)' },
        q_resolves: { type: 'string', enum: ['yes', 'no', 'unknown'] },
        q_harmful: { type: 'string', enum: ['yes', 'no'] },
        q_works_as_written: { type: 'string', enum: ['yes', 'no'] },
        q_wrong_first: { type: 'string', enum: ['yes', 'no'] },
        q_correct_elsewhere: { type: 'string', enum: ['yes', 'no'] },
      },
      required: ['reason', 'q_resolves', 'q_harmful', 'q_works_as_written', 'q_wrong_first', 'q_correct_elsewhere'],
    } },
  },
};

/**
 * 체크리스트 → 조치 판정.
 * - 맞음: 핵심 조치가 해소하고, 해롭지 않고, 그대로 동작하고, 틀린 조치를 앞세우지 않았다.
 * - 부분: 핵심 조치가 해소하지만 그대로는 안 되거나 틀린 조치를 앞세웠다. 또는 핵심은 틀렸지만 답변 어딘가에 해결하는 조치가 있다.
 * - 틀림: 그 밖의 경우.
 */
export function fixLabel(q: { q_resolves: string; q_harmful: string; q_works_as_written: string; q_wrong_first: string; q_correct_elsewhere?: string }): 'yes' | 'partial' | 'no' {
  if (q.q_resolves === 'yes' && q.q_harmful !== 'yes') {
    return q.q_works_as_written === 'no' || q.q_wrong_first === 'yes' ? 'partial' : 'yes';
  }
  return q.q_correct_elsewhere === 'yes' ? 'partial' : 'no';
}

async function callTool(system: string, prompt: string, tool: any): Promise<{ input: any; inTok: number; outTok: number }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.send(new ConverseCommand({
        modelId: MODEL,
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        toolConfig: { tools: [tool], toolChoice: { tool: { name: tool.toolSpec.name } } as any },
        inferenceConfig: { maxTokens: 800, temperature: 0 },
      }));
      const use = res.output?.message?.content?.find(c => 'toolUse' in c && c.toolUse)?.toolUse;
      if (use?.input) return { input: use.input, inTok: res.usage?.inputTokens ?? 0, outTok: res.usage?.outputTokens ?? 0 };
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`judge did not call ${tool.toolSpec.name}`);
}

/** 기록된 도구 호출을 세계 상태로 다시 실행해 잘리지 않은 결과를 만든다 (analyze_error는 기록된 앞부분) */
async function fullEvidence(scenario: any, steps: any[] | undefined): Promise<string> {
  const tools = makeTools(scenario, [], null, false);
  const rows: string[] = [];
  for (const st of steps ?? []) {
    if (!st.action) continue;
    const target = String(st.actionInput?.functionName ?? st.actionInput?.query ?? '');
    let result: string;
    if (st.action === 'analyze_error') result = String(st.observation ?? '');
    else {
      const res = await tools(st.action, st.actionInput ?? {});
      result = res.success ? JSON.stringify(res.data) : `Error: ${res.error}`;
    }
    rows.push(`- ${st.action}${target ? `(${target})` : ''}: ${result.slice(0, EVIDENCE_LIMIT)}`);
  }
  return rows.length ? rows.join('\n') : '(조회 없음)';
}

async function main(): Promise<void> {
  const out: any[] = [];
  let inTok = 0, outTok = 0;
  for (const file of REPORTS) {
    const report = JSON.parse(readFileSync(file, 'utf-8'));
    const variant = (file.match(/holdout2-([a-z]+)\.json$/)?.[1]) ?? report.meta?.variant ?? report.meta?.tag ?? 'unknown';
    const scenarioFile = report.meta?.scenarioFile ?? 'eval/agent/holdout_v2_scenarios.json';
    const scenarios = new Map((JSON.parse(readFileSync(scenarioFile, 'utf-8')).scenarios as any[]).map(s => [s.id, s]));
    for (const r of report.results) {
      const item = ITEMS?.find(i => i.variant === variant && i.scenario === r.id && i.run === r.run);
      if (ITEMS && !item) continue;
      const scenario = scenarios.get(r.id);
      // v3 시나리오는 정답을 시나리오에 함께 둔다. 유효한 다른 조치와 금지 조치도 정답 요지에 넣는다
      const truth = scenario?.truth
        ? { cause: truthCause(scenario.truth), fix: [scenario.truth.fix, ...(scenario.truth.acceptableFixes ?? []).map((f: string) => `또는 ${f}`), ...(scenario.truth.forbiddenFixes?.length ? [`(하면 안 되는 조치: ${scenario.truth.forbiddenFixes.join(', ')})`] : [])].join(' ') }
        : TRUTH[r.id];
      if (!truth) continue;
      const evidence = await fullEvidence(scenario, r.steps);
      const head = `## 사용자 질문\n${scenario.message}\n\n## 정답 요지\n- 원인: ${truth.cause}\n- 올바른 조치(한 가지 예): ${truth.fix}\n\n`;
      const c = await callTool(CAUSE_RUBRIC, `${head}## 도우미가 원래 아는 정보 (시스템 프롬프트)\n${promptFor(variant)}${variant === 'candidate' ? currentTimeSection(scenarioClock(scenario)) : ''}\n\n## 도우미가 조회한 자료\n${evidence}\n\n## 진단 도우미의 답변\n${r.response}`, CAUSE_TOOL);
      const f = await callTool(FIX_RUBRIC, `${head}## 진단 도우미의 답변\n${r.response}`, FIX_TOOL);
      inTok += c.inTok + f.inTok; outTok += c.outTok + f.outTok;
      const fix = fixLabel(f.input);
      const { reason: _fr, ...checklist } = f.input;
      const j = { cause: c.input.cause, wrong: c.input.wrong, fix, checklist, reason: c.input.reason, fixReason: f.input.reason };
      const pass = j.cause === 'yes' && j.fix === 'yes' && j.wrong === 'none';
      out.push({ item: item?.id, variant, scenario: r.id, run: r.run, ...j, pass, phrasePass: r.pass });
      console.log(`${item?.id ?? ''} ${variant} ${r.id}#${r.run} cause=${j.cause} fix=${j.fix} wrong=${j.wrong} pass=${pass} (phrase ${r.pass})`);
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  const file = `eval/reports/${date}-agent-judge-${TAG}.json`;
  writeFileSync(file, JSON.stringify({ meta: { date, judgeVersion: JUDGE_VERSION, model: MODEL, reports: REPORTS, items: one('items') ?? null, inputTokens: inTok, outputTokens: outTok }, judgments: out }, null, 2) + '\n', 'utf-8');
  console.log(`\n${out.length}건 → ${file} (입력 ${inTok}, 출력 ${outTok} 토큰)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

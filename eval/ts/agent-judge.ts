/**
 * 자동이 답변 판정 모델 (채점기 검증용, DECISION_LOG E-32 다음 단계).
 *
 *   node --import tsx eval/ts/agent-judge.ts --report eval/reports/<결과>.json [--report ...] \
 *     --truth eval/agent/truth_holdout_v2.json --model <judgeModelId> --tag <이름> [--items eval/agent/labeling/holdout2-key.json]
 *
 * - 표현 목록 대신 시나리오의 정답 요지(원인·올바른 조치)와 답변을 판정 모델에 주고, 사람 판정 페이지와 같은
 *   기준(원인·조치: 맞음/부분/틀림, 잘못된 단정: 없음/있음)으로 판정하게 한다.
 * - 출력은 도구 호출(record_judgment)로 받아 형식이 깨지지 않게 한다.
 * - --items: 판정할 실행을 사람 판정 표본으로 한정한다(같은 실행끼리 일치도를 재기 위해).
 * - 판정 모델 자체가 맞는지는 사람 판정과의 일치도로 따로 검증한다 (eval/ts/agent-judge-agreement.ts).
 * - 결과: eval/reports/<날짜>-agent-judge-<tag>.json. Bedrock 자격 증명 필요.
 */
import { readFileSync, writeFileSync } from 'fs';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const args = process.argv.slice(2);
const all = (name: string) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const one = (name: string) => all(name)[0];

const REPORTS = all('report');
const TRUTH = JSON.parse(readFileSync(one('truth') ?? 'eval/agent/truth_holdout_v2.json', 'utf-8')).scenarios as Record<string, { cause: string; fix: string }>;
const MODEL = one('model') ?? 'global.anthropic.claude-sonnet-4-6';
const TAG = one('tag') ?? 'judge';
const ITEMS = one('items') ? (JSON.parse(readFileSync(one('items')!, 'utf-8')) as Array<{ id: string; variant: string; scenario: string; run: number }>) : null;

const client = new BedrockRuntimeClient({ region: 'ap-northeast-2' });

const RUBRIC = `당신은 장애 진단 답변을 판정한다. 사용자 질문, 시나리오의 정답 요지(실제 원인과 올바른 조치), 진단 도우미의 답변이 주어진다.
정답 요지를 기준으로 답변을 아래 세 항목으로 판정하고 record_judgment 도구로 기록하라. 표현이 달라도 뜻이 같으면 맞음이다.

원인
- yes(맞음): 정답 요지의 원인을 주원인으로 짚었다.
- partial(부분): 방향은 맞지만 핵심이 빠졌거나, 여러 후보 중 하나로만 말했다.
- no(틀림): 다른 원인을 주원인으로 말했거나 원인을 짚지 못했다.

조치
- yes(맞음): 그대로 따르면 해결되는 조치를 권했다. 곁들인 다른 제안은 상관없다.
- partial(부분): 방향은 맞지만 그대로는 실패한다(잘못된 ARN·ID 형식, 핵심 누락, 우회책만).
- no(틀림): 원인과 무관하거나 해로운 조치다.

잘못된 단정
- present(있음): 사실과 다른 내용을 확정적으로 말했다(없는 장애를 단정, 원인이 아닌 설정을 탓함, 지어낸 값을 사실처럼 씀). 가능성으로만 말한 것은 해당하지 않는다.
- none(없음): 그런 단정이 없다.
- 도우미가 조회한 자료에 있는 숫자·이름·설정값은 지어낸 것이 아니다. 조회 자료에도 정답 요지에도 없는 구체적인 사실을 확정적으로 말했을 때만 지어낸 값으로 본다.

정상이거나 모호한 사례에서는, 원인은 "문제가 없다" 또는 "정보가 더 필요하다"고 바르게 판단했는지를 본다. 조치는 불필요한 조치 없이 알맞게 안내했는지(예: 조치 불필요, 구체적인 질문)를 본다.`;

const TOOL = {
  toolSpec: {
    name: 'record_judgment',
    description: '판정 결과를 기록한다',
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          cause: { type: 'string', enum: ['yes', 'partial', 'no'] },
          fix: { type: 'string', enum: ['yes', 'partial', 'no'] },
          wrong: { type: 'string', enum: ['none', 'present'] },
          reason: { type: 'string', description: '판정 이유 한두 문장' },
        },
        required: ['cause', 'fix', 'wrong', 'reason'],
      },
    },
  },
};

interface Judgment { cause: string; fix: string; wrong: string; reason: string }

/** 도우미가 본 자료: 기록된 도구 호출과 결과(앞부분). 판정 모델이 조회한 값을 지어낸 값으로 오해하지 않게 한다 */
function evidenceText(steps: Array<{ action?: string; actionInput?: Record<string, unknown>; observation?: string }> | undefined): string {
  const rows = (steps ?? []).filter(s => s.action).map(s => {
    const target = String(s.actionInput?.functionName ?? s.actionInput?.query ?? '');
    return `- ${s.action}${target ? `(${target})` : ''}: ${String(s.observation ?? '').slice(0, 1200)}`;
  });
  return rows.length ? rows.join('\n') : '(조회 없음)';
}

async function judge(question: string, truth: { cause: string; fix: string }, answer: string, evidence: string): Promise<{ j: Judgment; inputTokens: number; outputTokens: number }> {
  const prompt = `## 사용자 질문\n${question}\n\n## 정답 요지\n- 원인: ${truth.cause}\n- 올바른 조치: ${truth.fix}\n\n## 도우미가 조회한 자료 (도구 호출과 결과 앞부분)\n${evidence}\n\n## 진단 도우미의 답변\n${answer}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.send(new ConverseCommand({
        modelId: MODEL,
        system: [{ text: RUBRIC }],
        messages: [{ role: 'user', content: [{ text: prompt }] }],
        toolConfig: { tools: [TOOL as any], toolChoice: { tool: { name: 'record_judgment' } } as any },
        inferenceConfig: { maxTokens: 600, temperature: 0 },
      }));
      const use = res.output?.message?.content?.find(c => 'toolUse' in c && c.toolUse)?.toolUse;
      const j = use?.input as unknown as Judgment | undefined;
      if (j && ['yes', 'partial', 'no'].includes(j.cause) && ['yes', 'partial', 'no'].includes(j.fix) && ['none', 'present'].includes(j.wrong)) {
        return { j, inputTokens: res.usage?.inputTokens ?? 0, outputTokens: res.usage?.outputTokens ?? 0 };
      }
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error('judge did not return a valid judgment');
}

async function main(): Promise<void> {
  const scenarios = new Map<string, { message: string }>();
  const out: any[] = [];
  let inTok = 0, outTok = 0;
  for (const file of REPORTS) {
    const report = JSON.parse(readFileSync(file, 'utf-8'));
    const variant = (file.match(/holdout2-([a-z]+)\.json$/)?.[1]) ?? report.meta?.variant ?? 'unknown';
    const scenarioFile = report.meta?.scenarioFile ?? 'eval/agent/holdout_v2_scenarios.json';
    if (!scenarios.size) for (const s of JSON.parse(readFileSync(scenarioFile, 'utf-8')).scenarios) scenarios.set(s.id, s);
    for (const r of report.results) {
      const item = ITEMS?.find(i => i.variant === variant && i.scenario === r.id && i.run === r.run);
      if (ITEMS && !item) continue;
      const truth = TRUTH[r.id];
      if (!truth) continue;
      const { j, inputTokens, outputTokens } = await judge(scenarios.get(r.id)!.message, truth, r.response, evidenceText(r.steps));
      inTok += inputTokens; outTok += outputTokens;
      const pass = j.cause === 'yes' && j.fix === 'yes' && j.wrong === 'none';
      out.push({ item: item?.id, variant, scenario: r.id, run: r.run, ...j, pass, phrasePass: r.pass });
      console.log(`${item?.id ?? ''} ${variant} ${r.id}#${r.run} cause=${j.cause} fix=${j.fix} wrong=${j.wrong} pass=${pass} (phrase ${r.pass})`);
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  const file = `eval/reports/${date}-agent-judge-${TAG}.json`;
  writeFileSync(file, JSON.stringify({ meta: { date, model: MODEL, reports: REPORTS, items: one('items') ?? null, inputTokens: inTok, outputTokens: outTok }, judgments: out }, null, 2) + '\n', 'utf-8');
  console.log(`\n${out.length}건 → ${file} (입력 ${inTok}, 출력 ${outTok} 토큰)`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

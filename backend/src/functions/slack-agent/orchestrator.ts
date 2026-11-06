/**
 * ReAct 에이전트 오케스트레이터
 * Thought → Action → Observation 루프
 */

import { randomUUID } from 'crypto';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
  ConverseCommandOutput,
  ContentBlock,
  Message,
  ToolUseBlock,
  ToolResultBlock,
  Tool as BedrockTool,
} from '@aws-sdk/client-bedrock-runtime';
import { AgentStep, ToolResult } from './types.js';
import { JADONG_SYSTEM_PROMPT } from './prompts/system.js';
import { TOOLS, executeTool } from './tools/index.js';
import { emitMetrics } from '/opt/nodejs/utils/emf.js';

const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });

/**
 * 모델 단가 (USD / 100만 토큰). Anthropic 가격 페이지(2026-11) 기준이며, Bedrock global 엔드포인트는
 * 할증이 없다(리전 엔드포인트는 10% 할증). 실제 청구액과는 Bedrock 청구서로 대조한다 (DECISION_LOG A-34)
 */
const PRICE_PER_MTOK: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /haiku-4-5/, input: 1, output: 5 },
  { match: /sonnet-4-6/, input: 3, output: 15 },
];

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK.find(p => p.match.test(modelId));
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** 실행 1회의 관측 지표 (C-14) */
export interface AgentRunMetrics {
  runId: string;
  turns: number;
  stopReason: 'final' | 'max_turns' | 'error' | 'empty';
  modelCalls: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  toolCalls: number;
  toolErrors: number;
  tools: Array<{ name: string; ok: boolean; latencyMs: number; resultChars: number }>;
  latencyMs: number;
}

/** 평가·테스트에서 모델 호출과 도구 실행을 바꿔 끼우기 위한 의존성 */
export interface AgentDeps {
  converse?: (input: ConverseCommandInput) => Promise<ConverseCommandOutput>;
  executeTool?: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  /** false면 EMF 지표를 쓰지 않는다 (평가 실행) */
  emit?: boolean;
  /** 모델 선택을 고정한다 (평가에서 모델 비교) */
  modelOverride?: string;
  /** 시스템 프롬프트를 바꾼다 (평가에서 이전 프롬프트와 비교) */
  systemPrompt?: string;
  /** false면 앞 턴의 분석을 최종 답에 붙이지 않는다 (평가에서 이전 동작 재현) */
  mergeAnalysis?: boolean;
  /** 모델에 보여줄 도구 이름. 없으면 전부 (평가에서 도구를 추가하기 전 동작 재현) */
  toolNames?: string[];
}

// 기본 모델과 복잡한 분석용 모델 (template.yaml에서 주입, 퇴역 모델 하드코딩 제거: DECISION_LOG A-11)
const HAIKU_MODEL_ID = process.env.AGENT_MODEL_ID || 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const SONNET_MODEL_ID = process.env.AGENT_COMPLEX_MODEL_ID || 'global.anthropic.claude-sonnet-4-6';

const MAX_TURNS = 10; // 최대 에이전트 턴 수

/**
 * 이 길이 이상이면 도구 호출 전 텍스트를 분석으로 본다. 평가에서 "로그를 확인해 볼게요" 같은 진행 문구는
 * 100자 안쪽이었고, 분석 본문은 수백 자였다 (판단, A-35)
 */
const ANALYSIS_MIN_CHARS = 200;
const SHORT_FINAL_CHARS = 200;

/**
 * 모델이 분석을 쓴 뒤 도구(예: recall_memory)를 한 번 더 부르고 짧은 마무리만 쓰면, 사용자에게 분석이 빠진 답이 갔다.
 * 마지막 답이 짧고 앞 턴에 분석이 있으면 둘을 이어 붙인다.
 */
export function mergeFinalResponse(lastAnalysis: string, finalText: string): string {
  if (!lastAnalysis || finalText.length >= SHORT_FINAL_CHARS || finalText.includes(lastAnalysis)) return finalText;
  return `${lastAnalysis}\n\n${finalText}`;
}

interface AgentContext {
  userId: string;
  channelId: string;
  threadTs?: string;
}

export interface AgentResult {
  response: string;
  steps: AgentStep[];
  metrics: AgentRunMetrics;
}

/**
 * ReAct 에이전트 실행
 */
export async function runReActAgent(
  userMessage: string,
  context: AgentContext,
  deps: AgentDeps = {}
): Promise<AgentResult> {
  const converse = deps.converse ?? (input => bedrockClient.send(new ConverseCommand(input)));
  const runTool = deps.executeTool ?? executeTool;
  const started = Date.now();
  const metrics: AgentRunMetrics = {
    runId: randomUUID(),
    turns: 0,
    stopReason: 'empty',
    modelCalls: {},
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    toolCalls: 0,
    toolErrors: 0,
    tools: [],
    latencyMs: 0,
  };
  console.log('Starting ReAct agent:', { runId: metrics.runId, userMessage, context });

  const steps: AgentStep[] = [];
  const messages: Message[] = [];

  // 초기 사용자 메시지
  messages.push({
    role: 'user',
    content: [{ text: userMessage }],
  });

  let turnCount = 0;
  let finalResponse = '';
  // 도구 호출과 함께 쓴 분석 텍스트. 마지막 턴이 짧은 마무리만 쓰면 이것을 앞에 붙인다 (A-35)
  let lastAnalysis = '';

  // Bedrock Converse API용 도구 정의
  const tools = TOOLS.filter(tool => !deps.toolNames || deps.toolNames.includes(tool.name)).map((tool) => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        json: tool.input_schema as Record<string, unknown>,
      },
    },
  })) as BedrockTool[];

  while (turnCount < MAX_TURNS) {
    turnCount++;
    console.log(`Agent turn ${turnCount}/${MAX_TURNS}`);

    try {
      // Claude 호출 (Tool Use)
      const modelId = deps.modelOverride ?? selectModel(userMessage, turnCount);
      const response = await converse({
        modelId,
        system: [{ text: deps.systemPrompt ?? JADONG_SYSTEM_PROMPT }],
        messages,
        toolConfig: {
          tools,
        },
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.5,
        },
      });
      metrics.turns = turnCount;
      metrics.modelCalls[modelId] = (metrics.modelCalls[modelId] ?? 0) + 1;
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;
      metrics.inputTokens += inputTokens;
      metrics.outputTokens += outputTokens;
      metrics.estimatedCostUsd += estimateCostUsd(modelId, inputTokens, outputTokens);

      const assistantMessage = response.output?.message;
      if (!assistantMessage?.content) {
        console.error('No content in response');
        break;
      }

      // 대화 기록에 추가
      messages.push(assistantMessage);

      // 응답 처리
      const { hasToolUse, textResponse, toolUses } = parseResponse(
        assistantMessage.content as ContentBlock[]
      );

      // Tool 호출이 있으면 실행
      if (hasToolUse && toolUses.length > 0) {
        if (textResponse.length >= ANALYSIS_MIN_CHARS) lastAnalysis = textResponse;
        const toolResults: ToolResultBlock[] = [];

        for (const toolUse of toolUses) {
          console.log('Tool call:', toolUse.name, toolUse.input);

          // 스텝 기록
          steps.push({
            thought: textResponse || `${toolUse.name} 호출`,
            action: toolUse.name,
            actionInput: toolUse.input as Record<string, unknown>,
          });

          // 도구 실행
          const toolStarted = Date.now();
          const result = await runTool(
            toolUse.name!,
            toolUse.input as Record<string, unknown>
          );
          const resultText = result.success ? JSON.stringify(result.data) : `Error: ${result.error}`;
          const toolRecord = {
            name: toolUse.name!,
            ok: result.success,
            latencyMs: Date.now() - toolStarted,
            resultChars: resultText.length,
          };
          metrics.toolCalls++;
          if (!result.success) metrics.toolErrors++;
          metrics.tools.push(toolRecord);
          // OpenTelemetry GenAI semantic conventions의 속성 이름을 따른 구조화 로그 (Logs Insights로 조회)
          console.log(JSON.stringify({
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.agent.name': 'jadong',
            'gen_ai.conversation.id': metrics.runId,
            'gen_ai.tool.name': toolRecord.name,
            'gen_ai.tool.call.id': toolUse.toolUseId,
            'eecar.turn': turnCount,
            'eecar.tool.ok': toolRecord.ok,
            'eecar.tool.latency_ms': toolRecord.latencyMs,
            'eecar.tool.result_chars': toolRecord.resultChars,
          }));

          // 결과 기록
          steps[steps.length - 1].observation = result.success
            ? JSON.stringify(result.data).slice(0, 500)
            : result.error;

          toolResults.push({
            toolUseId: toolUse.toolUseId!,
            content: [{ text: resultText }],
          });
        }

        // 도구 결과를 대화에 추가
        messages.push({
          role: 'user',
          content: toolResults.map((tr) => ({
            toolResult: tr,
          })),
        });

        // 다음 턴으로 계속
        continue;
      }

      // Tool 호출 없음 = 최종 응답
      if (textResponse) {
        finalResponse = deps.mergeAnalysis === false ? textResponse : mergeFinalResponse(lastAnalysis, textResponse);
        metrics.stopReason = 'final';
        steps.push({
          thought: '최종 답변 완료',
        });
        break;
      }

      // 응답이 비었으면 종료
      break;
    } catch (error) {
      console.error('Agent error:', error);
      finalResponse = '죄송합니다, 처리 중 오류가 발생했습니다.';
      metrics.stopReason = 'error';
      break;
    }
  }

  // 최대 턴 도달
  if (turnCount >= MAX_TURNS && !finalResponse) {
    metrics.stopReason = 'max_turns';
    finalResponse =
      '분석이 복잡하여 완료하지 못했습니다. 더 구체적인 질문을 해주시면 도움이 됩니다.';
  }

  metrics.latencyMs = Date.now() - started;
  console.log(JSON.stringify({
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'jadong',
    'gen_ai.conversation.id': metrics.runId,
    'gen_ai.usage.input_tokens': metrics.inputTokens,
    'gen_ai.usage.output_tokens': metrics.outputTokens,
    'eecar.agent.turns': metrics.turns,
    'eecar.agent.stop_reason': metrics.stopReason,
    'eecar.agent.models': metrics.modelCalls,
    'eecar.agent.tool_calls': metrics.toolCalls,
    'eecar.agent.tool_errors': metrics.toolErrors,
    'eecar.agent.cost_usd': Number(metrics.estimatedCostUsd.toFixed(6)),
    'eecar.agent.latency_ms': metrics.latencyMs,
  }));
  if (deps.emit !== false) emitAgentMetrics(metrics);

  return {
    response: finalResponse,
    steps,
    metrics,
  };
}

/**
 * 에이전트 실행 지표를 EMF로 남긴다 (네임스페이스 EECAR/Agent).
 * 실행 단위 지표는 차원 없이, 도구 단위 지표는 Tool 차원으로 발행한다.
 */
export function emitAgentMetrics(metrics: AgentRunMetrics): void {
  emitMetrics('EECAR/Agent', {}, {
    AgentRuns: { value: 1, unit: 'Count' },
    AgentTurns: { value: metrics.turns, unit: 'Count' },
    AgentToolCalls: { value: metrics.toolCalls, unit: 'Count' },
    AgentToolErrors: { value: metrics.toolErrors, unit: 'Count' },
    AgentInputTokens: { value: metrics.inputTokens, unit: 'Count' },
    AgentOutputTokens: { value: metrics.outputTokens, unit: 'Count' },
    // EMF 단위에 통화가 없어 마이크로달러(1e-6 USD) 정수로 남긴다
    AgentCostMicroUsd: { value: Math.round(metrics.estimatedCostUsd * 1_000_000), unit: 'Count' },
    AgentLatency: { value: metrics.latencyMs, unit: 'Milliseconds' },
    AgentMaxTurns: { value: metrics.stopReason === 'max_turns' ? 1 : 0, unit: 'Count' },
    AgentErrors: { value: metrics.stopReason === 'error' ? 1 : 0, unit: 'Count' },
  }, [[]]);
  for (const tool of metrics.tools) {
    emitMetrics('EECAR/Agent', { Tool: tool.name }, {
      ToolCalls: { value: 1, unit: 'Count' },
      ToolErrors: { value: tool.ok ? 0 : 1, unit: 'Count' },
      ToolLatency: { value: tool.latencyMs, unit: 'Milliseconds' },
    });
  }
}

/**
 * 모델 선택 (비용 최적화)
 */
function selectModel(message: string, turnCount: number): string {
  // 복잡한 분석이 필요한 경우 Sonnet 사용
  const complexPatterns = [
    /분석해/,
    /왜.*그런/,
    /원인.*뭐/,
    /해결.*방법/,
    /설명해/,
  ];

  const isComplex = complexPatterns.some((p) => p.test(message));

  // 첫 번째 턴에서 복잡한 질문이면 Sonnet
  if (turnCount === 1 && isComplex) {
    console.log('Using Sonnet for complex analysis');
    return SONNET_MODEL_ID;
  }

  // 기본은 Haiku (비용 1/12)
  return HAIKU_MODEL_ID;
}

/**
 * 응답 파싱
 */
function parseResponse(content: ContentBlock[]): {
  hasToolUse: boolean;
  textResponse: string;
  toolUses: ToolUseBlock[];
} {
  let textResponse = '';
  const toolUses: ToolUseBlock[] = [];

  for (const block of content) {
    if ('text' in block && block.text) {
      textResponse += block.text;
    }
    if ('toolUse' in block && block.toolUse) {
      toolUses.push(block.toolUse as ToolUseBlock);
    }
  }

  return {
    hasToolUse: toolUses.length > 0,
    textResponse: textResponse.trim(),
    toolUses,
  };
}

/**
 * 간단한 질문 처리 (에이전트 없이)
 */
export async function handleSimpleQuery(message: string): Promise<string> {
  // 인사, 감사 등 간단한 응답
  const greetings: Record<string, string> = {
    안녕: '안녕하세요! 자동이입니다. 무엇을 도와드릴까요? 😊',
    고마워: '도움이 되었다니 기쁩니다! 또 필요하시면 말씀해주세요. 😊',
    수고해: '감사합니다! 언제든 불러주세요. 💪',
  };

  for (const [key, response] of Object.entries(greetings)) {
    if (message.includes(key)) {
      return response;
    }
  }

  // 매칭되지 않으면 null 반환 (에이전트 사용)
  return '';
}

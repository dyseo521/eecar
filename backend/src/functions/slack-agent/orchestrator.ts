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
import { PRODUCTION_TOOL_NAMES, TOOLS, executeTool } from './tools/index.js';
import { Diagnosis, normalizeDiagnosis, renderDiagnosis, DIAGNOSIS_FINALIZE_PROMPT, DIAGNOSIS_INVESTIGATE_PROMPT, currentTimeSection } from './tools/diagnosis.js';
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

/** 프롬프트 캐시 가격: 읽기는 입력의 약 0.1배, 쓰기는 약 1.25배 (공식 문서) */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number, cacheReadTokens = 0, cacheWriteTokens = 0): number {
  const price = PRICE_PER_MTOK.find(p => p.match.test(modelId));
  if (!price) return 0;
  const input = inputTokens + cacheReadTokens * CACHE_READ_MULTIPLIER + cacheWriteTokens * CACHE_WRITE_MULTIPLIER;
  return (input * price.input + outputTokens * price.output) / 1_000_000;
}

/** 실행 1회의 관측 지표 (C-14) */
export interface AgentRunMetrics {
  runId: string;
  turns: number;
  stopReason: 'final' | 'max_turns' | 'error' | 'empty';
  modelCalls: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  /** 프롬프트 캐시에서 읽거나 쓴 입력 토큰. inputTokens에는 포함되지 않는다 */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
  toolCalls: number;
  toolErrors: number;
  /** 복잡한 질문용 모델이 스로틀되어 기본 모델로 답한 횟수 (A-42) */
  modelFallbacks: number;
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
  /** 모델에 보여줄 도구 이름. 없으면 운영 도구(PRODUCTION_TOOL_NAMES). 평가에서 실험 도구를 켤 때 쓴다 */
  toolNames?: string[];
  /**
   * 구조화 진단으로만 끝나게 한다 (A-40). 프롬프트로 요청하면 Haiku 4.5는 60회 중 1회만 제출했다(dev 측정).
   * 조사는 모델에 맡기고, 텍스트로 끝내려는 시점과 마지막 턴에만 제출을 강제한다.
   * 매 턴 도구 호출을 강제하면 평균 턴과 비용이 2배가 됐고 판정 결과는 나아지지 않았다.
   */
  requireDiagnosis?: boolean;
  /** 인사나 기억 조회처럼 일반 대화인 요청은 진단 제출을 강제하지 않는다. 평가는 검증한 구성을 재현하도록 끈다 (A-46) */
  allowConversation?: boolean;
  /** 제출 지시문을 바꾼다 (평가에서 Haiku 5.5 하네스 비교) */
  finalizePrompt?: string;
  /** auto-first면 결론 시점에 먼저 강제 없이 제출을 받는다. 강제하면 Haiku 5.5는 사고 없이 바로 호출한다 (E-37) */
  finalizeMode?: 'forced' | 'auto-first' | 'auto-only';
  /** 도구 정의를 평가에서 바꾼다. strict면 입력 스키마를 API가 보장한다 */
  toolOverrides?: Record<string, { description?: string; input_schema?: Record<string, unknown>; strict?: boolean }>;
  /** 시스템 프롬프트에 넣을 현재 시각(ISO). 평가에서는 시나리오 시계를 쓴다 */
  currentTime?: string;
  /** 도구 정의와 시스템 프롬프트를 캐시한다 (A-44). Haiku 4.5의 최소 크기 4,096토큰을 넘을 때만 효과가 있다 */
  cachePrompt?: boolean;
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
const MEMORY_TOOLS = new Set(['recall_memory', 'save_memory']);
const SMALL_TALK = /^(안녕|하이|ㅎㅇ|hello|hi\b|hey\b|고마워|감사|수고|도움말|help\b|누구(야|세요)|뭐\s*할\s*수)/i;
const SMALL_TALK_MAX_CHARS = 30;
const EMPTY_RESPONSE_MESSAGE = '답변을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.';

/**
 * 진단이 아니라 일반 대화인 요청인가. 기억 도구만 썼거나, 도구 없이 끝난 짧은 인사·도움말이면 그렇다.
 * 넓게 잡으면 진단을 건너뛰게 되므로 좁게 둔다. 애매하면 진단으로 처리한다 (A-46)
 */
export function isConversational(message: string, toolsUsed: string[]): boolean {
  if (toolsUsed.length > 0) return toolsUsed.every(t => MEMORY_TOOLS.has(t));
  const text = message.trim();
  return text.length <= SMALL_TALK_MAX_CHARS && SMALL_TALK.test(text);
}

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
  /** submit_diagnosis로 제출한 구조화 진단 (제출한 경우만) */
  diagnosis?: Diagnosis;
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
  const converseOnce = deps.converse ?? (input => bedrockClient.send(new ConverseCommand(input)));
  const runTool = deps.executeTool ?? executeTool;
  const started = Date.now();
  const metrics: AgentRunMetrics = {
    runId: randomUUID(),
    turns: 0,
    stopReason: 'empty',
    modelCalls: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
    toolCalls: 0,
    toolErrors: 0,
    modelFallbacks: 0,
    tools: [],
    latencyMs: 0,
  };
  console.log('Starting ReAct agent:', { runId: metrics.runId, userMessage, context });

  // 복잡한 질문용 모델이 스로틀되면 기본 모델로 답한다. 일일 토큰 한도에 닿으면 그날 복잡한 질문이 모두 실패했다 (A-42)
  let usedModel = '';
  const converse = async (input: ConverseCommandInput): Promise<ConverseCommandOutput> => {
    usedModel = input.modelId!;
    try {
      return await converseOnce(input);
    } catch (error) {
      if ((error as Error)?.name !== 'ThrottlingException' || deps.modelOverride || usedModel === HAIKU_MODEL_ID) throw error;
      console.warn('Complex model throttled, using default model:', (error as Error).message);
      metrics.modelFallbacks++;
      usedModel = HAIKU_MODEL_ID;
      return converseOnce({ ...input, modelId: usedModel });
    }
  };

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
  let diagnosis: Diagnosis | undefined;
  let finalizing = false;
  let finalizeRetried = false;
  let investigating = false;

  // Bedrock Converse API용 도구 정의
  const offered = deps.toolNames ?? PRODUCTION_TOOL_NAMES;
  const tools = TOOLS.filter(tool => offered.includes(tool.name)).map((tool) => {
    const override = deps.toolOverrides?.[tool.name];
    const schema = (override?.input_schema ?? tool.input_schema) as Record<string, unknown>;
    return {
      toolSpec: {
        name: tool.name,
        description: override?.description ?? tool.description,
        inputSchema: { json: override?.strict ? { ...schema, additionalProperties: false } : schema },
        ...(override?.strict ? { strict: true } : {}),
      },
    };
  }) as BedrockTool[];

  while (turnCount < MAX_TURNS) {
    turnCount++;
    console.log(`Agent turn ${turnCount}/${MAX_TURNS}`);

    try {
      // Claude 호출 (Tool Use)
      const modelId = deps.modelOverride ?? selectModel(userMessage, turnCount);
      const response = await converse({
        modelId,
        // 현재 시각은 실행마다 바뀌므로 캐시 지점 뒤에 둔다
        system: [
          { text: deps.systemPrompt ?? JADONG_SYSTEM_PROMPT },
          ...(deps.cachePrompt ? [{ cachePoint: { type: 'default' as const } }] : []),
          ...(deps.currentTime ? [{ text: currentTimeSection(deps.currentTime) }] : []),
        ],
        messages,
        toolConfig: {
          tools,
          // auto-only: Sonnet 5.5처럼 강제 tool_choice를 400으로 거부하는 모델용 (E-39)
          ...(deps.finalizeMode === 'auto-only' ? {}
            : deps.requireDiagnosis && ((finalizing && (deps.finalizeMode !== 'auto-first' || finalizeRetried)) || turnCount === MAX_TURNS)
              ? { toolChoice: { tool: { name: 'submit_diagnosis' } } }
              : investigating ? { toolChoice: { any: {} } } : {}),
        },
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.5,
        },
      });
      metrics.turns = turnCount;
      metrics.modelCalls[usedModel] = (metrics.modelCalls[usedModel] ?? 0) + 1;
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;
      const cacheReadTokens = response.usage?.cacheReadInputTokens ?? 0;
      const cacheWriteTokens = response.usage?.cacheWriteInputTokens ?? 0;
      metrics.inputTokens += inputTokens;
      metrics.outputTokens += outputTokens;
      metrics.cacheReadTokens += cacheReadTokens;
      metrics.cacheWriteTokens += cacheWriteTokens;
      metrics.estimatedCostUsd += estimateCostUsd(usedModel, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

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
        // 구조화 진단 제출: 다른 도구 호출과 함께 와도 제출을 최종 답으로 삼고 끝낸다 (A-40)
        const submitted = toolUses.find(t => t.name === 'submit_diagnosis');
        if (submitted) {
          diagnosis = normalizeDiagnosis(submitted.input as Record<string, unknown>);
          finalResponse = renderDiagnosis(diagnosis);
          metrics.stopReason = 'final';
          steps.push({ thought: '진단 제출', action: 'submit_diagnosis', actionInput: submitted.input as Record<string, unknown> });
          break;
        }
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

      // 구조화 진단이 필요하면 텍스트로 끝내지 않고 제출을 받는다 (앞의 분석은 대화에 남아 있다)
      const conversational = deps.allowConversation && isConversational(userMessage, metrics.tools.map(t => t.name));
      if (textResponse && deps.requireDiagnosis && !finalizing && !conversational) {
        if (metrics.toolCalls === 0 && !investigating) {
          investigating = true;
          messages.push({ role: 'user', content: [{ text: DIAGNOSIS_INVESTIGATE_PROMPT }] });
          continue;
        }
        finalizing = true;
        messages.push({ role: 'user', content: [{ text: deps.finalizePrompt ?? DIAGNOSIS_FINALIZE_PROMPT }] });
        continue;
      }
      // auto-first에서 제출 없이 또 텍스트로 끝내면 그때 강제한다
      if (textResponse && deps.requireDiagnosis && finalizing && (deps.finalizeMode === 'auto-first' || deps.finalizeMode === 'auto-only') && !finalizeRetried) {
        finalizeRetried = true;
        messages.push({ role: 'user', content: [{ text: deps.finalizePrompt ?? DIAGNOSIS_FINALIZE_PROMPT }] });
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

  // 빈 답을 Slack에 보내면 사용자는 아무것도 받지 못한다. 홀드아웃 120회 중 1회 있었다 (A-46)
  if (!finalResponse) finalResponse = EMPTY_RESPONSE_MESSAGE;

  metrics.latencyMs = Date.now() - started;
  console.log(JSON.stringify({
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'jadong',
    'gen_ai.conversation.id': metrics.runId,
    'gen_ai.usage.input_tokens': metrics.inputTokens,
    'gen_ai.usage.output_tokens': metrics.outputTokens,
    'eecar.agent.cache_read_tokens': metrics.cacheReadTokens,
    'eecar.agent.cache_write_tokens': metrics.cacheWriteTokens,
    'eecar.agent.turns': metrics.turns,
    'eecar.agent.stop_reason': metrics.stopReason,
    'eecar.agent.models': metrics.modelCalls,
    'eecar.agent.tool_calls': metrics.toolCalls,
    'eecar.agent.tool_errors': metrics.toolErrors,
    'eecar.agent.model_fallbacks': metrics.modelFallbacks,
    'eecar.agent.cost_usd': Number(metrics.estimatedCostUsd.toFixed(6)),
    'eecar.agent.latency_ms': metrics.latencyMs,
  }));
  if (deps.emit !== false) emitAgentMetrics(metrics);

  return {
    response: finalResponse,
    ...(diagnosis ? { diagnosis } : {}),
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
    AgentModelFallbacks: { value: metrics.modelFallbacks, unit: 'Count' },
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

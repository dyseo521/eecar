/**
 * 자동이 오케스트레이터: 실행 지표(C-14)와 의존성 주입(평가용)
 */
import { jest } from '@jest/globals';
import type { ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { emitAgentMetrics, estimateCostUsd, mergeFinalResponse, runReActAgent } from '../../src/functions/slack-agent/orchestrator.js';

const HAIKU = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const context = { userId: 'U1', channelId: 'C1' };

function toolTurn(name: string, input: Record<string, unknown>, tokens = [1000, 100]): ConverseCommandOutput {
  return {
    output: { message: { role: 'assistant', content: [{ text: '확인해 볼게요' }, { toolUse: { toolUseId: `t-${name}`, name, input } }] } },
    usage: { inputTokens: tokens[0], outputTokens: tokens[1], totalTokens: tokens[0] + tokens[1] },
  } as unknown as ConverseCommandOutput;
}

function finalTurn(text: string, tokens = [1500, 200]): ConverseCommandOutput {
  return {
    output: { message: { role: 'assistant', content: [{ text }] } },
    usage: { inputTokens: tokens[0], outputTokens: tokens[1], totalTokens: tokens[0] + tokens[1] },
  } as unknown as ConverseCommandOutput;
}

describe('runReActAgent', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe('when the complex model is throttled', () => {
    const throttled = () => Object.assign(new Error('Too many tokens per day, please wait before trying again.'), { name: 'ThrottlingException' });

    it('answers with the default model and counts the fallback', async () => {
      const models: string[] = [];
      const converse = jest.fn(async (input: ConverseCommandInput) => {
        models.push(input.modelId!);
        if (input.modelId !== HAIKU) throw throttled();
        return finalTurn('기본 모델의 답입니다.');
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await runReActAgent('이 에러 분석해줘', context, { converse, emit: false });

      expect(models[0]).not.toBe(HAIKU);
      expect(models[1]).toBe(HAIKU);
      expect(result.response).toBe('기본 모델의 답입니다.');
      expect(result.metrics).toMatchObject({ stopReason: 'final', modelFallbacks: 1, modelCalls: { [HAIKU]: 1 } });
      expect(warn).toHaveBeenCalled();
    });

    it('does not retry other errors on the default model', async () => {
      const converse = jest.fn(async (_: ConverseCommandInput) => { throw Object.assign(new Error('denied'), { name: 'AccessDeniedException' }); });
      const result = await runReActAgent('이 에러 분석해줘', context, { converse, emit: false });
      expect(converse).toHaveBeenCalledTimes(1);
      expect(result.metrics).toMatchObject({ stopReason: 'error', modelFallbacks: 0 });
    });

    it('reports an error when the default model is throttled too', async () => {
      const converse = jest.fn(async (_: ConverseCommandInput) => { throw throttled(); });
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await runReActAgent('이 에러 분석해줘', context, { converse, emit: false });
      expect(converse).toHaveBeenCalledTimes(2);
      expect(result.metrics.stopReason).toBe('error');
    });

    it('keeps a pinned model so evaluations measure the model they asked for', async () => {
      const converse = jest.fn(async (_: ConverseCommandInput) => { throw throttled(); });
      const result = await runReActAgent('이 에러 분석해줘', context, { converse, emit: false, modelOverride: 'global.anthropic.claude-sonnet-4-6' });
      expect(converse).toHaveBeenCalledTimes(1);
      expect(result.metrics).toMatchObject({ stopReason: 'error', modelFallbacks: 0 });
    });
  });

  it('records turns, tokens, cost and tool results for a tool-using run', async () => {
    const replies = [toolTurn('get_logs', { functionName: 'VectorSearch' }), finalTurn('원인은 Bedrock 스로틀링입니다.')];
    const converse = jest.fn(async (_: ConverseCommandInput) => replies.shift()!);
    const executeTool = jest.fn(async () => ({ success: true, data: { logs: ['ThrottlingException'] } }));

    const result = await runReActAgent('VectorSearch 에러 확인해줘', context, {
      converse, executeTool, emit: false, modelOverride: HAIKU,
    });

    expect(result.response).toBe('원인은 Bedrock 스로틀링입니다.');
    expect(executeTool).toHaveBeenCalledWith('get_logs', { functionName: 'VectorSearch' });
    expect(result.metrics).toMatchObject({
      turns: 2,
      stopReason: 'final',
      modelCalls: { [HAIKU]: 2 },
      inputTokens: 2500,
      outputTokens: 300,
      toolCalls: 1,
      toolErrors: 0,
    });
    expect(result.metrics.estimatedCostUsd).toBeCloseTo((2500 * 1 + 300 * 5) / 1e6, 10);
    expect(result.metrics.tools[0]).toMatchObject({ name: 'get_logs', ok: true });
    // 두 번째 호출에는 도구 결과가 대화에 들어 있다
    const secondCall = converse.mock.calls[1][0] as ConverseCommandInput;
    expect(JSON.stringify(secondCall.messages)).toContain('ThrottlingException');
  });

  it('offers the production tools by default; evaluation can narrow them', async () => {
    const seen: string[][] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      seen.push((input.toolConfig?.tools ?? []).map(t => t.toolSpec?.name ?? ''));
      return finalTurn('정상입니다.');
    });
    await runReActAgent('상태 알려줘', context, { converse, emit: false, modelOverride: HAIKU });
    await runReActAgent('상태 알려줘', context, { converse, emit: false, modelOverride: HAIKU, toolNames: ['get_logs', 'get_function_config'] });
    // 사전 등록 홀드아웃을 통과해 운영에 노출한다 (E-35, A-46)
    expect(seen[0]).toHaveLength(15);
    expect(seen[0]).toContain('get_function_config');
    expect(seen[1]).toEqual(['get_logs', 'get_function_config']);
  });

  it('counts tool errors and passes the error text to the model', async () => {
    const replies = [toolTurn('get_function_status', { functionName: 'x' }), finalTurn('권한 문제로 조회하지 못했습니다.')];
    const converse = jest.fn(async () => replies.shift()!);
    const executeTool = jest.fn(async () => ({ success: false, error: 'AccessDeniedException' }));
    const result = await runReActAgent('상태 알려줘', context, { converse, executeTool, emit: false });
    expect(result.metrics.toolErrors).toBe(1);
    expect(JSON.stringify((converse.mock.calls[1] as unknown[])[0])).toContain('Error: AccessDeniedException');
  });

  it('marks model failures and runs that hit the turn limit', async () => {
    const failing = await runReActAgent('질문', context, {
      converse: async () => { throw new Error('ThrottlingException'); },
      emit: false,
    });
    expect(failing.metrics.stopReason).toBe('error');

    const looping = await runReActAgent('질문', context, {
      converse: async () => toolTurn('get_logs', { functionName: 'x' }, [10, 1]),
      executeTool: async () => ({ success: true, data: {} }),
      emit: false,
    });
    expect(looping.metrics).toMatchObject({ stopReason: 'max_turns', turns: 10, toolCalls: 10 });
  });

  it('uses Sonnet only for the first turn of complex questions', async () => {
    const replies = [toolTurn('get_logs', { functionName: 'x' }), finalTurn('답')];
    const converse = jest.fn(async (_: ConverseCommandInput) => replies.shift()!);
    await runReActAgent('왜 그런지 원인 분석해줘', context, {
      converse, executeTool: async () => ({ success: true, data: {} }), emit: false,
    });
    expect(converse.mock.calls.map(c => (c[0] as ConverseCommandInput).modelId)).toEqual([
      'global.anthropic.claude-sonnet-4-6',
      HAIKU,
    ]);
  });
});

describe('agent metrics', () => {
  it('estimates cost from per-model prices and ignores unknown models', () => {
    expect(estimateCostUsd(HAIKU, 1_000_000, 100_000)).toBeCloseTo(1.5);
    expect(estimateCostUsd('global.anthropic.claude-sonnet-4-6', 1_000_000, 100_000)).toBeCloseTo(4.5);
    expect(estimateCostUsd('unknown-model', 1_000_000, 1_000_000)).toBe(0);
  });

  it('writes one run record and one record per tool call as EMF', () => {
    const lines: string[] = [];
    jest.spyOn(process.stdout, 'write').mockImplementation(chunk => { lines.push(String(chunk)); return true; });
    emitAgentMetrics({
      runId: 'r', turns: 2, stopReason: 'final', modelCalls: {}, inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0,
      estimatedCostUsd: 0.000123, toolCalls: 1, toolErrors: 0, modelFallbacks: 1, latencyMs: 50,
      tools: [{ name: 'get_logs', ok: true, latencyMs: 20, resultChars: 100 }],
    });
    jest.restoreAllMocks();
    expect(lines).toHaveLength(2);
    const run = JSON.parse(lines[0]);
    expect(run._aws.CloudWatchMetrics[0].Namespace).toBe('EECAR/Agent');
    expect(run.AgentCostMicroUsd).toBe(123);
    expect(run.AgentModelFallbacks).toBe(1);
    expect(JSON.parse(lines[1]).Tool).toBe('get_logs');
  });
});

describe('final response (A-35)', () => {
  it('keeps the analysis written before a last tool call when the final text is short', () => {
    const analysis = '원인 분석: '.padEnd(250, '가');
    expect(mergeFinalResponse(analysis, '해결되면 알려주세요!')).toBe(`${analysis}\n\n해결되면 알려주세요!`);
    expect(mergeFinalResponse('', '짧은 답')).toBe('짧은 답');
    const long = '최종 답변 '.padEnd(300, '나');
    expect(mergeFinalResponse(analysis, long)).toBe(long);
  });

  it('includes the earlier analysis in the agent result', async () => {
    const analysis = '로그를 보니 일일 토큰 한도 초과입니다. '.padEnd(260, '.');
    const replies = [
      { output: { message: { role: 'assistant', content: [{ text: analysis }, { toolUse: { toolUseId: 't1', name: 'recall_memory', input: { query: 'quota' } } }] } }, usage: { inputTokens: 1, outputTokens: 1 } },
      { output: { message: { role: 'assistant', content: [{ text: '이번이 첫 사례네요.' }] } }, usage: { inputTokens: 1, outputTokens: 1 } },
    ] as unknown as ConverseCommandOutput[];
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await runReActAgent('질문', context, {
      converse: async () => replies.shift()!, executeTool: async () => ({ success: true, data: [] }), emit: false,
    });
    jest.restoreAllMocks();
    expect(result.response.startsWith(analysis)).toBe(true);
  });
});

describe('system prompt function list', () => {
  it('lists every Lambda function defined in template.yaml', async () => {
    const { readFileSync } = await import('fs');
    const { JADONG_SYSTEM_PROMPT } = await import('../../src/functions/slack-agent/prompts/system.js');
    const template = readFileSync(new URL('../../../infrastructure/template.yaml', import.meta.url), 'utf-8');
    const functions = [...template.matchAll(/^ {2}(\w+):\r?\n {4}Type: AWS::Serverless::Function/gm)].map(m => m[1]);
    expect(functions.length).toBeGreaterThan(10);
    // 목록이 템플릿과 어긋나 "SlackAgent"를 SlackNotificationFunction으로 착각했다 (E-29 기준값 s02·s11·s18)
    for (const fn of functions) expect(JADONG_SYSTEM_PROMPT).toContain(`- ${fn}:`);
  });
});

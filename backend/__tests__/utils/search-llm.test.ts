import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { invokeClaude } from '../../src/utils/bedrock.js';
import {
  averageEmbeddings,
  buildExpansionPrompt,
  buildExplanationPrompt,
  expandSearchQuery,
  generateExplanations,
  parseExpansion,
  parseExplanations,
  FALLBACK_REASON,
  EXPANSION_MAX_TOKENS,
  EXPLANATION_MAX_TOKENS,
} from '../../src/utils/search-llm.js';

const bedrockMock = mockClient(BedrockRuntimeClient);

function quiet() {
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  return () => {
    err.mockRestore();
    warn.mockRestore();
  };
}

describe('query expansion', () => {
  it('keeps the production prompt text', () => {
    const prompt = buildExpansionPrompt('LFP 배터리');
    expect(prompt).toContain('입력: "LFP 배터리"');
    expect(prompt).toContain('예시 출력: ["배터리 팩", "리튬이온 셀", "에너지 저장 모듈"]');
    expect(prompt.endsWith('JSON 배열만 출력하세요:')).toBe(true);
  });

  it('parses fenced JSON, keeps the original query first and caps expansions at three', () => {
    const response = '```json\n["LFP 셀", "리튬인산철", "LFP 배터리", "ESS 배터리"]\n```';
    expect(parseExpansion('LFP 배터리', response)).toEqual(['LFP 배터리', 'LFP 셀', '리튬인산철']);
  });

  it('returns null for empty or non-array JSON and throws for non-JSON text', () => {
    expect(parseExpansion('q', '[]')).toBeNull();
    expect(parseExpansion('q', '{"a": 1}')).toBeNull();
    expect(() => parseExpansion('q', '확장 결과입니다: 배터리')).toThrow();
  });

  it('falls back to the original query when the model fails', async () => {
    const restore = quiet();
    const failing = async () => {
      throw new Error('ResourceNotFoundException: Legacy');
    };
    const result = await expandSearchQuery('모델3 인버터', failing);
    restore();
    expect(result).toEqual({ queries: ['모델3 인버터'], fallback: true, error: 'ResourceNotFoundException: Legacy' });
  });

  it('passes the expansion token budget to the generator', async () => {
    const generate = jest.fn(async (_prompt: string, _max: number) => '["a", "b"]');
    const result = await expandSearchQuery('q', generate);
    expect(result).toEqual({ queries: ['q', 'a', 'b'], fallback: false });
    expect(generate.mock.calls[0][1]).toBe(EXPANSION_MAX_TOKENS);
  });
});

describe('averageEmbeddings', () => {
  it('returns a single embedding unchanged', () => {
    const v = [0.6, 0.8];
    expect(averageEmbeddings([v])).toBe(v);
  });

  it('averages and L2-normalizes multiple embeddings', () => {
    const avg = averageEmbeddings([[1, 0], [0, 1]]);
    expect(avg[0]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(avg[1]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.hypot(...avg)).toBeCloseTo(1, 10);
  });
});

describe('explanations', () => {
  const items = [
    { id: 'bat-001', name: '아이오닉5 배터리 팩', manufacturer: 'SK온', category: 'battery' },
    { id: 'bat-002', name: 'EV6 배터리 팩', manufacturer: 'SK온', category: 'battery' },
  ];

  it('numbers the parts in the prompt', () => {
    const prompt = buildExplanationPrompt('SOH 높은 배터리', items);
    expect(prompt).toContain('1. [bat-001] 아이오닉5 배터리 팩 (SK온, battery)');
    expect(prompt).toContain('2. [bat-002] EV6 배터리 팩 (SK온, battery)');
  });

  it('grounds each part with the checked conditions and does not presuppose a fit', () => {
    const prompt = buildExplanationPrompt('60kWh 이상 배터리', [
      { ...items[0], matched: ['카테고리', '용량 72.6kWh'] },
      { ...items[1], matched: ['카테고리'], mismatched: ['용량 58kWh'] },
    ]);
    expect(prompt).toContain('1. [bat-001] 아이오닉5 배터리 팩 (SK온, battery) | 일치: 카테고리, 용량 72.6kWh');
    expect(prompt).toContain('| 불일치: 용량 58kWh');
    expect(prompt).toContain('지어내지 않는다');
    expect(prompt).not.toContain('~이므로 적합');
  });

  it('accepts exactly one explanation per part', () => {
    expect(parseExplanations('```json\n["이유1", "이유2"]\n```', 2)).toEqual({
      explanations: ['이유1', '이유2'],
      ok: true,
      fallback: false,
    });
  });

  it('pads missing explanations with the fallback reason', () => {
    const restore = quiet();
    const result = parseExplanations('["이유1"]', 2);
    restore();
    expect(result).toEqual({ explanations: ['이유1', FALLBACK_REASON], ok: false, fallback: false });
  });

  it('falls back entirely when no array is present', () => {
    const restore = quiet();
    const result = parseExplanations('설명을 생성할 수 없습니다', 2);
    restore();
    expect(result).toEqual({ explanations: [FALLBACK_REASON, FALLBACK_REASON], ok: false, fallback: true });
  });

  it('falls back entirely when the model call fails', async () => {
    const restore = quiet();
    const result = await generateExplanations('q', items, async () => {
      throw new Error('throttled');
    });
    restore();
    expect(result.fallback).toBe(true);
    expect(result.explanations).toEqual([FALLBACK_REASON, FALLBACK_REASON]);
  });

  it('logs one error per fallback so that one failure raises one alert', async () => {
    // 회귀 테스트: 호출이 실패하면 빈 "Raw response:" 줄이 하나 더 남아 알림이 두 건씩 나갔다 (A-49)
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await generateExplanations('q', items, async () => {
      throw new Error('throttled');
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).not.toContain('Raw response:');

    error.mockClear();
    await generateExplanations('q', items, async () => '[not json]');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toEqual(expect.arrayContaining(['Raw response:', '[not json]']));
    error.mockRestore();
  });

  it('passes the explanation token budget to the generator', async () => {
    const generate = jest.fn(async (_prompt: string, _max: number) => '["a", "b"]');
    await generateExplanations('q', items, generate);
    expect(generate.mock.calls[0][1]).toBe(EXPLANATION_MAX_TOKENS);
  });
});

describe('invokeClaude', () => {
  beforeEach(() => bedrockMock.reset());

  it('returns the first text block even when a thinking block comes first', async () => {
    bedrockMock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(JSON.stringify({
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '["a"]' }],
        usage: { input_tokens: 88, output_tokens: 12 },
        stop_reason: 'end_turn',
      })) as never,
    });

    const result = await invokeClaude([{ role: 'user', content: 'hi' }], { modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0' });

    expect(result).toEqual({ text: '["a"]', inputTokens: 88, outputTokens: 12, stopReason: 'end_turn' });
    const input = bedrockMock.commandCalls(InvokeModelCommand)[0].args[0].input;
    expect(input.modelId).toBe('global.anthropic.claude-haiku-4-5-20251001-v1:0');
  });

  it('returns empty text when the response has no text block', async () => {
    bedrockMock.on(InvokeModelCommand).resolves({
      body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'thinking', thinking: '' }] })) as never,
    });
    const result = await invokeClaude([{ role: 'user', content: 'hi' }]);
    expect(result.text).toBe('');
    expect(result.inputTokens).toBe(0);
  });
});

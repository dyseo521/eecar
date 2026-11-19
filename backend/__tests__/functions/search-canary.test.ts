/**
 * 검색 합성 검사의 일정 실행 함수 (A-39, A-52)
 */
import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { mockClient } from 'aws-sdk-client-mock';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { handler, resetParameterCache } from '../../src/functions/search-canary/index.js';
import { CANARY_SPEC } from '../../src/functions/search-canary/spec.js';

const ssmMock = mockClient(SSMClient);
const WEBHOOK = 'https://hooks.example.test/canary';
const API = 'https://api.example.test/prod';

const categoryOf = (query: string) => CANARY_SPEC.checks.find(c => c.query === query)?.category ?? 'battery';

type Overrides = { vectorCandidates?: number; fallback?: boolean; failQuery?: string; slackStatus?: number };

function installFetch(o: Overrides = {}) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchMock = jest.fn(async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body });
    const json = (status: number, value: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(value) });
    if (String(url) === WEBHOOK) return json(o.slackStatus ?? 200, {});
    if (String(url).endsWith('/api/search/explain')) return json(200, { explanations: {}, fallback: o.fallback ?? false });
    if (body.query === o.failQuery) throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    const results = Array.from({ length: body.topK }, (_, i) => ({ partId: `p${i}`, part: { name: `부품 ${i}`, category: categoryOf(body.query) }, conditions: { mismatched: [] } }));
    return json(200, { results, diagnostics: { vectorCandidates: o.vectorCandidates ?? 100, bm25Candidates: 40, indexSize: 186 } });
  });
  global.fetch = fetchMock as any;
  return calls;
}

beforeEach(() => {
  resetParameterCache();
  ssmMock.reset();
  ssmMock.on(GetParameterCommand, { Name: '/eecar/canary-token' }).resolves({ Parameter: { Value: 'token' } });
  ssmMock.on(GetParameterCommand, { Name: '/eecar/slack/webhook-url' }).resolves({ Parameter: { Value: WEBHOOK } });
  process.env.EECAR_API_URL = API;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('search canary spec', () => {
  it('matches eval/prod/canary.json used by the manual run', () => {
    const { description: _d, ...manual } = JSON.parse(readFileSync(resolve(process.cwd(), '../eval/prod/canary.json'), 'utf-8'));
    expect(CANARY_SPEC).toEqual(manual);
  });
});

describe('search canary handler', () => {
  it('passes without notifying Slack when every check holds', async () => {
    const calls = installFetch();
    const result = await handler({});
    expect(result.passed).toBe(true);
    expect(calls.some(c => c.url === WEBHOOK)).toBe(false);
    // 검사 5개 + 설명용 검색 1개 + 설명 1개, 모두 캐시를 거치지 않는다
    expect(calls).toHaveLength(7);
    expect(calls.every(c => c.body.canary === true)).toBe(true);
  });

  it('reports missing vector candidates to Slack', async () => {
    const calls = installFetch({ vectorCandidates: 0 });
    const result = await handler({});
    expect(result.passed).toBe(false);
    expect(result.failures.filter(f => f.includes('벡터 후보 0'))).toHaveLength(5);
    const slack = calls.find(c => c.url === WEBHOOK);
    expect(slack?.body.text).toContain('*검색 합성 검사 실패* (일정 실행, 5건)');
  });

  it('fails when the explanation fell back', async () => {
    installFetch({ fallback: true });
    const result = await handler({});
    expect(result.failures).toEqual([expect.stringContaining('explain: LLM 설명이 폴백됨')]);
  });

  it('keeps checking after one request times out', async () => {
    installFetch({ failQuery: '테슬라 모델3 모터' });
    const result = await handler({});
    expect(result.failures).toEqual([expect.stringContaining('c2: 요청 실패 (TimeoutError')]);
    expect(result.lines.some(l => l.startsWith('c5'))).toBe(true);
  });

  it('reports a run failure when the token cannot be read', async () => {
    ssmMock.on(GetParameterCommand, { Name: '/eecar/canary-token' }).resolves({ Parameter: { Value: '' } });
    const calls = installFetch();
    const result = await handler({});
    expect(result.failures).toEqual([expect.stringContaining('실행 실패')]);
    expect(calls.filter(c => c.url !== WEBHOOK)).toHaveLength(0);
    expect(calls.some(c => c.url === WEBHOOK)).toBe(true);
  });

  it('does not throw when Slack rejects the alert', async () => {
    installFetch({ vectorCandidates: 0, slackStatus: 500 });
    await expect(handler({})).resolves.toMatchObject({ passed: false });
  });

  it('uses a spec from the event to exercise the alert path', async () => {
    installFetch();
    const spec = { ...CANARY_SPEC, checks: [{ id: 'x1', query: '아이오닉5 배터리 팩', top: 1, category: 'motor' }] };
    const result = await handler({ spec });
    expect(result.failures).toEqual([expect.stringContaining('x1: 1위 카테고리 battery (기대 motor)')]);
  });
});

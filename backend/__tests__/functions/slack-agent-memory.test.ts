/**
 * 자동이 장기 기억 (A-53). 이전 구현은 저장 0건이었고, 유사도가 늘 0, 함수 필터 미적용, 하한 없음이었다.
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3VectorsClient, QueryVectorsCommand, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { DynamoDBDocumentClient, BatchGetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  MEMORY_MIN_SIMILARITY, MemoryRecord, cosine, formatRecall, memoryIndexText, mergeRecord, rankMemories, recordFromDiagnosis, sameCase,
} from '../../src/functions/slack-agent/tools/memory-core.js';
import { recallMemory, saveMemoryRecord } from '../../src/functions/slack-agent/tools/memory.js';
import { handleMemoryFeedback } from '../../src/functions/slack-agent/handlers/memory-feedback.js';
import { prepareFeedback, feedbackBlocks } from '../../src/functions/slack-agent/handlers/app-mention.js';
import { PRODUCTION_TOOL_NAMES, executeTool } from '../../src/functions/slack-agent/tools/index.js';
import type { Diagnosis } from '../../src/functions/slack-agent/tools/diagnosis.js';

const bedrockMock = mockClient(BedrockRuntimeClient);
const s3vMock = mockClient(S3VectorsClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

const NOW = '2026-11-24T00:00:00.000Z';

function record(key: string, over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    key, outcome: 'confirmed', verdict: 'root_cause', question: '검색이 0건이에요', summary: '색인 이름 오타', cause: 'S3_VECTORS_INDEX 값이 틀림',
    functionName: 'VectorSearchFunction', component: 'lambda:VectorSearchFunction', faultType: 'config_env_wrong', evidence: [],
    codeVersion: 'v1', createdAt: NOW, lastSeenAt: NOW, count: 1, ...over,
  };
}

const diagnosis = (over: Partial<Diagnosis> = {}): Diagnosis => ({
  verdict: 'root_cause', summary: '색인 이름 오타로 검색이 0건', cause: 'S3_VECTORS_INDEX가 parts-vector로 바뀜',
  component: 'lambda:VectorSearchFunction', fault_type: 'config_env_wrong', evidence: ['a', 'b', 'c', 'd'], fix: { action: '값을 되돌린다' }, ...over,
});

beforeEach(() => {
  bedrockMock.reset();
  s3vMock.reset();
  ddbMock.reset();
  process.env.PARTS_TABLE_NAME = 'eecar-parts-table';
  bedrockMock.on(InvokeModelCommand).resolves({ body: new TextEncoder().encode(JSON.stringify({ embedding: [1, 0] })) } as any);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('rankMemories', () => {
  const records = new Map([
    ['a', record('a', { functionName: 'GetPartsFunction' })],
    ['b', record('b')],
    ['c', record('c', { codeVersion: 'old' })],
    ['far', record('far')],
  ]);

  it('drops memories below the similarity floor instead of always returning the top results', () => {
    const views = rankMemories([{ key: 'far', similarity: MEMORY_MIN_SIMILARITY - 0.01 }], records);
    expect(views).toEqual([]);
    expect(formatRecall(views).note).toContain('관련 기억 없음');
  });

  it('puts the same function first, then flags memories made before the code changed', () => {
    const views = rankMemories(
      [{ key: 'a', similarity: 0.9 }, { key: 'b', similarity: 0.6 }, { key: 'c', similarity: 0.7 }],
      records,
      { functionName: 'VectorSearch', currentVersions: new Map([['VectorSearchFunction', 'v1']]) },
    );
    expect(views.map(v => v.cause && v.sameFunction)).toEqual([true, true, false]);
    expect(views[0].codeChanged).toBe(true); // c: old != v1, 유사도가 더 높아 같은 함수 중 앞
    expect(views[1].codeChanged).toBe(false);
    expect(views[2].codeChanged).toBeNull(); // 다른 함수의 현재 지문은 모름
    expect(formatRecall(views).note).toContain('가설');
  });
});

describe('recordFromDiagnosis', () => {
  it('keeps only diagnoses that named a cause, with the function and at most three evidence lines', () => {
    expect(recordFromDiagnosis('q', diagnosis({ verdict: 'no_fault' }), { key: 'k', outcome: 'confirmed', now: NOW })).toBeNull();
    const r = recordFromDiagnosis('q', diagnosis(), { key: 'k', outcome: 'refuted', now: NOW, codeVersion: 'v1' })!;
    expect(r).toMatchObject({ functionName: 'VectorSearchFunction', faultType: 'config_env_wrong', outcome: 'refuted', codeVersion: 'v1', count: 1 });
    expect(r.evidence).toHaveLength(3);
    expect(memoryIndexText(r)).toContain('원인: S3_VECTORS_INDEX');
  });

  it('treats the same function, fault type, outcome and code version as one case and counts confirmations', () => {
    const a = record('a');
    expect(sameCase(a, record('b'))).toBe(true);
    expect(sameCase(a, record('b', { outcome: 'refuted' }))).toBe(false);
    expect(sameCase(a, record('b', { codeVersion: 'v2' }))).toBe(false);
    expect(mergeRecord({ ...a, count: 2 }, record('b', { createdAt: '2026-12-01T00:00:00.000Z' }))).toMatchObject({ key: 'a', count: 3, createdAt: NOW });
  });

  it('computes cosine similarity for the in-memory index', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe('recallMemory', () => {
  it('asks S3 Vectors for distances and turns them into similarity (it used to be always 0)', async () => {
    s3vMock.on(QueryVectorsCommand).resolves({ vectors: [{ key: 'b', distance: 0.2 }, { key: 'far', distance: 0.9 }] });
    ddbMock.on(BatchGetCommand).resolves({ Responses: { 'eecar-parts-table': [{ PK: 'JADONGMEM#b', SK: 'RECORD', ...record('b') }, { PK: 'JADONGMEM#far', SK: 'RECORD', ...record('far') }] } });
    const views = await recallMemory({ query: '검색 결과가 없어요', functionName: 'VectorSearchFunction' }, { codeVersion: async () => 'v1' });
    expect(s3vMock.commandCalls(QueryVectorsCommand)[0].args[0].input).toMatchObject({ returnDistance: true, indexName: 'jadong-memories' });
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ similarity: 0.8, sameFunction: true, codeChanged: false });
  });

  it('returns no memories when the store fails, so the investigation continues', async () => {
    s3vMock.on(QueryVectorsCommand).rejects(new Error('boom'));
    expect(await recallMemory({ query: 'x' })).toEqual([]);
  });
});

describe('saveMemoryRecord', () => {
  it('updates the existing case instead of adding a duplicate', async () => {
    s3vMock.on(QueryVectorsCommand).resolves({ vectors: [{ key: 'old', distance: 0.05 }] });
    ddbMock.on(BatchGetCommand).resolves({ Responses: { 'eecar-parts-table': [{ PK: 'JADONGMEM#old', SK: 'RECORD', ...record('old', { count: 2 }) }] } });
    const result = await saveMemoryRecord(record('new'));
    expect(result).toEqual({ action: 'updated', key: 'old', count: 3 });
    expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ PK: 'JADONGMEM#old', count: 3 });
    // 필터용 메타데이터에는 짧은 값만 넣는다 (2KB 한도)
    const meta = s3vMock.commandCalls(PutVectorsCommand)[0].args[0].input.vectors![0].metadata as Record<string, string>;
    expect(Object.keys(meta).sort()).toEqual(['codeVersion', 'createdAt', 'faultType', 'functionName', 'outcome']);
  });

  it('adds a new case when the similar memory is a different fault', async () => {
    s3vMock.on(QueryVectorsCommand).resolves({ vectors: [{ key: 'old', distance: 0.05 }] });
    ddbMock.on(BatchGetCommand).resolves({ Responses: { 'eecar-parts-table': [{ PK: 'JADONGMEM#old', SK: 'RECORD', ...record('old', { faultType: 'iam_permission_denied' }) }] } });
    expect(await saveMemoryRecord(record('new'))).toEqual({ action: 'added', key: 'new', count: 1 });
  });
});

describe('memory feedback', () => {
  const pending = { id: 'p1', question: '검색이 0건', diagnosis: diagnosis(), codeVersion: 'v1', createdAt: NOW };

  it('stores a confirmed diagnosis once and tells the user', async () => {
    const saved: MemoryRecord[] = [];
    const text = await handleMemoryFeedback(
      { id: 'p1', outcome: 'confirmed', userId: 'U1', responseUrl: 'https://hooks.slack.test/r' },
      { claim: async () => pending, save: async r => { saved.push(r); return { action: 'added', key: r.key, count: 1 }; }, reply: async () => {}, now: () => NOW },
    );
    expect(saved[0]).toMatchObject({ key: 'mem-p1', outcome: 'confirmed', confirmedBy: 'U1', codeVersion: 'v1' });
    expect(text).toContain('기억했습니다');
  });

  it('ignores a second click and expired diagnoses', async () => {
    const text = await handleMemoryFeedback({ id: 'p1', outcome: 'confirmed', userId: 'U1' }, { claim: async () => null });
    expect(text).toContain('이미 기록');
  });

  it('keeps a refuted diagnosis as a pitfall and releases the claim when saving fails', async () => {
    const released: string[] = [];
    const ok = await handleMemoryFeedback({ id: 'p1', outcome: 'refuted', userId: 'U1' }, { claim: async () => pending, save: async r => ({ action: 'added', key: r.key, count: 1 }) });
    expect(ok).toContain('틀린 판단');
    const failed = await handleMemoryFeedback(
      { id: 'p1', outcome: 'confirmed', userId: 'U1' },
      { claim: async () => pending, save: async () => { throw new Error('s3'); }, release: async id => { released.push(id); } },
    );
    expect(failed).toContain('다시 눌러');
    expect(released).toEqual(['p1']);
  });
});

describe('prepareFeedback', () => {
  it('adds buttons only to diagnoses that named a cause, and records the code version at diagnosis time', async () => {
    const saved: unknown[] = [];
    const deps = { save: async (p: unknown) => { saved.push(p); }, version: async () => 'v9', id: () => 'id1', now: () => NOW };
    expect(await prepareFeedback('q', diagnosis({ verdict: 'no_fault' }), deps)).toBeUndefined();
    expect(await prepareFeedback('q', undefined, deps)).toBeUndefined();
    expect(await prepareFeedback('q', diagnosis(), deps)).toBe('id1');
    expect(saved[0]).toMatchObject({ id: 'id1', codeVersion: 'v9', question: 'q' });
    expect(JSON.stringify(feedbackBlocks('id1'))).toContain('memory_confirm');
  });

  it('still answers when the pending record cannot be saved', async () => {
    expect(await prepareFeedback('q', diagnosis(), { save: async () => { throw new Error('ddb'); }, version: async () => undefined })).toBeUndefined();
  });
});

describe('memory tools', () => {
  it('does not let the model write memories in production', () => {
    expect(PRODUCTION_TOOL_NAMES).toContain('recall_memory');
    expect(PRODUCTION_TOOL_NAMES).not.toContain('save_memory');
  });

  it('wraps recall results with a note that memories are hypotheses', async () => {
    s3vMock.on(QueryVectorsCommand).resolves({ vectors: [] });
    ddbMock.on(BatchGetCommand).resolves({ Responses: {} });
    const res = await executeTool('recall_memory', { query: 'x' });
    expect(res).toMatchObject({ success: true, data: { memories: [], note: expect.stringContaining('관련 기억 없음') } });
  });
});

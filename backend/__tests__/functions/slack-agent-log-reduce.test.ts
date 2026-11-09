/**
 * 로그 정리 규칙. 형식이 다르면 원문을 그대로 둔다 (E-37)
 */
import { reduceLogs } from '../../src/functions/slack-agent/tools/log-reduce.js';

const ID = '676ac979-e3eb-4e52-aa5f-92a0cc3a690b';
const entry = (message: string, level = 'INFO', timestamp = '2026-11-09T01:00:00.000Z') => ({ timestamp, message, level });

describe('reduceLogs', () => {
  it('drops exact START and END lines', () => {
    const { entries } = reduceLogs([entry(`START RequestId: ${ID} Version: $LATEST\n`), entry(`END RequestId: ${ID}\n`)]);
    expect(entries).toEqual([]);
  });

  it('shortens REPORT lines and keeps duration, memory and cold start', () => {
    const { entries } = reduceLogs([entry(`REPORT RequestId: ${ID}\tDuration: 402.00 ms\tBilled Duration: 402 ms\tMemory Size: 1024 MB\tMax Memory Used: 205 MB\tInit Duration: 812.50 ms\t\n`)]);
    expect(entries[0].message).toBe('REPORT 676ac979 402.00ms 메모리 205/1024MB 콜드 스타트 812.50ms');
  });

  it('keeps every EMF value and removes only the _aws block', () => {
    const emf = JSON.stringify({ _aws: { Timestamp: 1, CloudWatchMetrics: [{ Namespace: 'EECAR/Search' }] }, Operation: 'Search', EmbeddingMs: 115, VectorCandidates: 100 });
    const { entries } = reduceLogs([entry(emf)]);
    expect(entries[0].message).toBe('지표 Operation=Search EmbeddingMs=115 VectorCandidates=100');
  });

  it('merges lines that differ only by request id and time', () => {
    const { entries } = reduceLogs([
      entry(`2026-11-09T01:00:00.000Z\t${ID}\tINFO\tCache hit!`, 'INFO', '2026-11-09T01:00:00.000Z'),
      entry(`2026-11-09T01:05:00.000Z\t3c215137-71ee-43d1-8d98-10055c275863\tINFO\tCache hit!`, 'INFO', '2026-11-09T01:05:00.000Z'),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toContain('같은 줄 ×2, 2026-11-09T01:00:00.000Z ~ 2026-11-09T01:05:00.000Z');
  });

  it('does not merge lines whose numbers differ, because the numbers can be the signal', () => {
    const { entries } = reduceLogs([entry('vector 100, bm25 96 (index 186, loaded)'), entry('vector 100, bm25 0 (index 186, loaded)')]);
    expect(entries.map(e => e.message)).toEqual(['vector 100, bm25 96 (index 186, loaded)', 'vector 100, bm25 0 (index 186, loaded)']);
  });

  it('never changes error or warning lines', () => {
    const lines = [entry(`END RequestId: ${ID}`, 'ERROR'), entry('같은 오류', 'ERROR'), entry('같은 오류', 'ERROR'), entry('경고', 'WARN')];
    expect(reduceLogs(lines).entries.map(e => e.message)).toEqual(lines.map(e => e.message));
  });

  it.each([
    ['다른 REPORT 형식', `REPORT RequestId: ${ID} Duration=402ms`],
    ['깨진 EMF', '{"_aws":{"Timestamp":1'],
    ['앱 로그가 START로 시작', 'START RequestId 없이 시작한 작업 로그'],
    ['JSON 플랫폼 로그', '{"time":"2026-11-09T01:00:00Z","type":"platform.report","record":{"metrics":{"durationMs":402}}}'],
  ])('keeps the original when the format is unknown: %s', (_name, message) => {
    expect(reduceLogs([entry(message)]).entries[0].message).toBe(message);
  });

  it('reports how much it removed and does not mutate the input', () => {
    const input = [entry(`START RequestId: ${ID} Version: $LATEST`), entry('처리 시작')];
    const { summary } = reduceLogs(input);
    expect(summary).toContain('2줄');
    expect(summary).toContain('1줄');
    expect(input).toHaveLength(2);
    expect(input[1].message).toBe('처리 시작');
  });
});

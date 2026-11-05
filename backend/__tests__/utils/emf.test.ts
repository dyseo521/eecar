import { jest } from '@jest/globals';
import { buildEmfRecord, emitMetrics } from '../../src/utils/emf.js';

describe('buildEmfRecord', () => {
  it('produces a CloudWatch Embedded Metric Format document', () => {
    const record = buildEmfRecord(
      'EECAR/Search',
      { Feature: 'Explanation' },
      { LLMFallback: { value: 1, unit: 'Count' }, LLMLatency: { value: 812, unit: 'Milliseconds' } },
      [['Feature'], []],
      1_700_000_000_000
    );

    expect(record).toEqual({
      _aws: {
        Timestamp: 1_700_000_000_000,
        CloudWatchMetrics: [
          {
            Namespace: 'EECAR/Search',
            Dimensions: [['Feature'], []],
            Metrics: [
              { Name: 'LLMFallback', Unit: 'Count' },
              { Name: 'LLMLatency', Unit: 'Milliseconds' },
            ],
          },
        ],
      },
      Feature: 'Explanation',
      LLMFallback: 1,
      LLMLatency: 812,
    });
  });

  it('uses the given dimension keys by default', () => {
    const record = buildEmfRecord('NS', { Operation: 'Search' }, { SearchRequests: { value: 1, unit: 'Count' } });
    const aws = record._aws as { CloudWatchMetrics: Array<{ Dimensions: string[][] }> };
    expect(aws.CloudWatchMetrics[0].Dimensions).toEqual([['Operation']]);
  });
});

describe('emitMetrics', () => {
  it('writes one raw JSON line to stdout (console.log would add the Lambda prefix and break EMF parsing)', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const log = jest.spyOn(console, 'log');

    emitMetrics('NS', { Operation: 'Search' }, { ZeroResult: { value: 0, unit: 'Count' } });

    expect(log).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    const line = String(write.mock.calls[0][0]);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toMatchObject({ Operation: 'Search', ZeroResult: 0 });
    write.mockRestore();
    log.mockRestore();
  });
});

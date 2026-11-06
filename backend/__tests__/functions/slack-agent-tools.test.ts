/**
 * 자동이 CloudWatch 도구. 이전에는 테스트가 없었다 (커버리지 집계에서도 빠져 있었음, A-35)
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  GetQueryResultsCommand,
  StartQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  getAllLambdaStatuses,
  getErrorSummary,
  getLambdaStatus,
  getRecentLogs,
  resolveFunction,
} from '../../src/functions/slack-agent/tools/cloudwatch.js';

const lambdaMock = mockClient(LambdaClient);
const cwMock = mockClient(CloudWatchClient);
const logsMock = mockClient(CloudWatchLogsClient);

const FULL = 'eecar-stack-VectorSearchFunction-AbC123';

beforeAll(() => {
  lambdaMock.on(ListFunctionsCommand).resolves({
    Functions: [{ FunctionName: FULL }, { FunctionName: 'eecar-stack-GetPartsFunction-Xyz' }, { FunctionName: 'other-app-fn' }],
  });
});

beforeEach(() => {
  cwMock.reset();
  logsMock.reset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('resolveFunction', () => {
  it('matches short names regardless of case and the Function suffix', async () => {
    expect(await resolveFunction('VectorSearchFunction')).toEqual({ fullName: FULL, found: true });
    expect(await resolveFunction('vectorsearch')).toEqual({ fullName: FULL, found: true });
    expect(await resolveFunction(FULL)).toEqual({ fullName: FULL, found: true });
  });

  it('reports functions that are not in the stack', async () => {
    expect(await resolveFunction('PaymentFunction')).toMatchObject({ found: false });
  });
});

describe('getLambdaStatus', () => {
  it('returns found=false instead of zero metrics for an unknown function', async () => {
    const status = await getLambdaStatus('PaymentFunction');
    expect(status).toMatchObject({ functionName: 'PaymentFunction', found: false });
    expect(status.note).toContain('찾지 못했습니다');
    expect(cwMock.commandCalls(GetMetricStatisticsCommand)).toHaveLength(0);
  });

  it('sums metrics and attaches the latest error log when there are errors', async () => {
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Invocations' }).resolves({ Datapoints: [{ Sum: 60 }, { Sum: 40 }] });
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Errors' }).resolves({ Datapoints: [{ Sum: 5 }] });
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Duration' }).resolves({ Datapoints: [{ Average: 200 }, { Average: 400 }] });
    logsMock.on(FilterLogEventsCommand).resolves({ events: [{ timestamp: 1, message: 'ERROR ThrottlingException' }] });

    const status = await getLambdaStatus('VectorSearch');
    expect(status).toMatchObject({ invocations: 100, errors: 5, errorRate: 5, avgDuration: 300 });
    expect(status.lastError?.message).toBe('ERROR ThrottlingException');
  });

  it('falls back to zeros when CloudWatch fails', async () => {
    cwMock.on(GetMetricStatisticsCommand).rejects(new Error('AccessDenied'));
    expect(await getLambdaStatus('VectorSearch')).toMatchObject({ invocations: 0, errors: 0 });
  });
});

describe('getRecentLogs', () => {
  it('maps events with level and request id', async () => {
    logsMock.on(FilterLogEventsCommand).resolves({
      events: [
        { timestamp: 0, message: 'WARN slow response RequestId: 0b6c9a3e-1f2d-4c5b-8a7e-123456789abc' },
        { timestamp: 0, message: 'INFO ok' },
      ],
    });
    const logs = await getRecentLogs('VectorSearch', 10, 'ALL');
    expect(logs).toEqual([
      { timestamp: new Date(0).toISOString(), message: expect.stringContaining('WARN'), requestId: '0b6c9a3e-1f2d-4c5b-8a7e-123456789abc', level: 'WARN' },
      { timestamp: new Date(0).toISOString(), message: 'INFO ok', requestId: undefined, level: 'INFO' },
    ]);
    expect(logsMock.commandCalls(FilterLogEventsCommand)[0].args[0].input.logGroupName).toBe(`/aws/lambda/${FULL}`);
  });

  it('returns an empty list on failure', async () => {
    logsMock.on(FilterLogEventsCommand).rejects(new Error('ResourceNotFoundException'));
    expect(await getRecentLogs('VectorSearch')).toEqual([]);
  });
});

describe('getErrorSummary', () => {
  it('runs a Logs Insights query and maps the rows', async () => {
    logsMock.on(StartQueryCommand).resolves({ queryId: 'q1' });
    logsMock.on(GetQueryResultsCommand).resolves({
      status: 'Complete',
      results: [[{ field: 'errorType', value: 'ThrottlingException' }, { field: 'count', value: '7' }, { field: 'lastOccurred', value: 't' }]],
    });
    expect(await getErrorSummary('VectorSearch', 1)).toEqual([{ errorType: 'ThrottlingException', count: 7, lastOccurred: 't' }]);
  });

  it('returns nothing when the query fails', async () => {
    logsMock.on(StartQueryCommand).resolves({ queryId: 'q2' });
    logsMock.on(GetQueryResultsCommand).resolves({ status: 'Failed' });
    expect(await getErrorSummary('VectorSearch', 1)).toEqual([]);
  });
});

describe('getAllLambdaStatuses', () => {
  it('summarizes every function of the stack', async () => {
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Invocations' }).resolves({ Datapoints: [{ Sum: 10 }] });
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Errors' }).resolves({ Datapoints: [] });
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Duration' }).resolves({ Datapoints: [] });
    const all = await getAllLambdaStatuses(1);
    expect(all).toMatchObject({ totalFunctions: 2, totalInvocations: 20, totalErrors: 0 });
  });
});

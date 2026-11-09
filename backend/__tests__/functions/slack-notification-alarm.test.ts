/**
 * CloudWatch 경보가 알림 함수를 직접 호출하는 경로 (A-45)
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { handler } from '../../src/functions/slack-notification/index.js';
import { formatAlarmMessage } from '../../src/functions/slack-notification/slack-formatter.js';

const ssmMock = mockClient(SSMClient);

const alarm = (value: string, previous = 'OK') => ({
  source: 'aws.cloudwatch',
  alarmData: {
    alarmName: 'eecar-stack-search-canary-vector',
    state: { value, reason: 'Threshold Crossed: no datapoints were received for 12 periods' },
    previousState: { value: previous },
    configuration: { description: 'Search canary stopped or saw no vector candidates' },
  },
});

describe('formatAlarmMessage', () => {
  it('reports an alarm with its description and reason', () => {
    const text = formatAlarmMessage(alarm('ALARM'))!.text;
    expect(text).toContain('eecar-stack-search-canary-vector');
    expect(text).toContain('Search canary stopped');
    expect(text).toContain('no datapoints');
  });

  it('reports recovery only when the alarm was firing', () => {
    expect(formatAlarmMessage(alarm('OK', 'ALARM'))!.text).toContain('복구됨');
    expect(formatAlarmMessage(alarm('OK', 'INSUFFICIENT_DATA'))).toBeNull();
    expect(formatAlarmMessage(alarm('INSUFFICIENT_DATA'))).toBeNull();
  });
});

describe('handler with an alarm event', () => {
  let fetchMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    ssmMock.reset();
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'https://hooks.slack.test/x' } });
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }));
    (globalThis as any).fetch = fetchMock;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('posts the alarm to Slack without touching the log pipeline', async () => {
    const res = await handler(alarm('ALARM') as any);
    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://hooks.slack.test/x');
    expect(JSON.parse(init.body).text).toContain('CloudWatch 경보');
  });

  it('skips states that are not worth a message', async () => {
    const res = await handler(alarm('INSUFFICIENT_DATA') as any);
    expect(res.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when Slack rejects it so the asynchronous invoke is retried', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }));
    await expect(handler(alarm('ALARM') as any)).rejects.toThrow('503');
  });
});

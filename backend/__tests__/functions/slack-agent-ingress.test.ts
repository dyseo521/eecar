/**
 * 자동이 Slack 수신 경로 (C-13): 서명 검증 → event_id 선점 → 비동기 전달 → 즉시 응답
 */
import { jest } from '@jest/globals';
import { createHmac } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../src/functions/slack-agent/index.js';
import { claimSlackEvent } from '../../src/functions/slack-agent/async-dispatch.js';

const ssmMock = mockClient(SSMClient);
const lambdaMock = mockClient(LambdaClient);
const ddbMock = mockClient(DynamoDBDocumentClient);
const SECRET = 'test-signing-secret';

function signed(body: string, extra: Record<string, string> = {}, contentType = 'application/json'): APIGatewayProxyEvent {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v0=${createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex')}`;
  return {
    body,
    headers: { 'Content-Type': contentType, 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': sig, ...extra },
  } as unknown as APIGatewayProxyEvent;
}

const mention = JSON.stringify({
  type: 'event_callback',
  event_id: 'Ev123',
  event: { type: 'app_mention', user: 'U1', text: '<@B1> 상태 알려줘', channel: 'C1', ts: '1.0' },
});

beforeAll(() => {
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'eecar-stack-SlackAgentFunction-test';
  ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: SECRET } });
});

beforeEach(() => {
  lambdaMock.reset();
  ddbMock.reset();
  lambdaMock.on(InvokeCommand).resolves({ StatusCode: 202 });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => jest.restoreAllMocks());

describe('Slack ingress', () => {
  it('rejects requests with a bad signature, including retries', async () => {
    const event = signed(mention, { 'X-Slack-Retry-Num': '1' });
    event.headers['X-Slack-Signature'] = 'v0=deadbeef';
    const res = (await handler(event)) as APIGatewayProxyResult;
    expect(res.statusCode).toBe(401);
    expect(lambdaMock.commandCalls(InvokeCommand)).toHaveLength(0);
  });

  it('claims a new mention, hands it to an async job and answers immediately', async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = (await handler(signed(mention))) as APIGatewayProxyResult;
    expect(res.statusCode).toBe(200);
    const invoke = lambdaMock.commandCalls(InvokeCommand)[0].args[0].input;
    expect(invoke.InvocationType).toBe('Event');
    expect(JSON.parse(Buffer.from(invoke.Payload as Uint8Array).toString()).jadongJob.type).toBe('app_mention');
    expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.Item?.PK).toBe('SLACKEVENT#Ev123');
  });

  it('does not process a retry of an event that was already claimed', async () => {
    ddbMock.on(PutCommand).rejects(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
    const res = (await handler(signed(mention, { 'X-Slack-Retry-Num': '1', 'X-Slack-Retry-Reason': 'http_timeout' }))) as APIGatewayProxyResult;
    expect(res.statusCode).toBe(200);
    expect(lambdaMock.commandCalls(InvokeCommand)).toHaveLength(0);
  });

  it('processes a retry when the first attempt never claimed the event (previously lost)', async () => {
    ddbMock.on(PutCommand).resolves({});
    await handler(signed(mention, { 'X-Slack-Retry-Num': '1' }));
    expect(lambdaMock.commandCalls(InvokeCommand)).toHaveLength(1);
  });

  it('answers help inline and hands heavy slash commands to an async job', async () => {
    const help = (await handler(signed('command=%2F%EC%9E%90%EB%8F%99%EC%9D%B4&text=help&response_url=https%3A%2F%2Fhooks.slack.com%2Fx', {}, 'application/x-www-form-urlencoded'))) as APIGatewayProxyResult;
    expect(help.statusCode).toBe(200);
    expect(lambdaMock.commandCalls(InvokeCommand)).toHaveLength(0);

    const status = (await handler(signed('command=%2Fx&text=status&response_url=https%3A%2F%2Fhooks.slack.com%2Fx', {}, 'application/x-www-form-urlencoded'))) as APIGatewayProxyResult;
    expect(JSON.parse(status.body).text).toContain('처리 중');
    expect(lambdaMock.commandCalls(InvokeCommand)).toHaveLength(1);
  });

  it('answers the URL verification challenge', async () => {
    const res = (await handler(signed(JSON.stringify({ type: 'url_verification', challenge: 'abc' })))) as APIGatewayProxyResult;
    expect(JSON.parse(res.body)).toEqual({ challenge: 'abc' });
  });
});

describe('async job', () => {
  it('posts slash command results to response_url', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await handler({ jadongJob: { type: 'slash_command', event: { type: 'slash_command', text: 'help', response_url: 'https://hooks.slack.com/x' } } });
    } finally {
      global.fetch = original;
    }
    expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack.com/x', expect.objectContaining({ method: 'POST' }));
  });

  it('never throws, so Lambda does not retry the job and answer twice', async () => {
    const original = global.fetch;
    global.fetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const writes: string[] = [];
    (process.stdout.write as unknown as jest.Mock).mockImplementation(((chunk: string) => { writes.push(String(chunk)); return true; }) as any);
    try {
      await expect(handler({ jadongJob: { type: 'slash_command', event: { type: 'slash_command', text: 'help', response_url: 'https://hooks.slack.com/x' } } })).resolves.toBeUndefined();
    } finally {
      global.fetch = original;
    }
    expect(writes.join('')).toContain('JobErrors');
  });
});

describe('claimSlackEvent', () => {
  it('fails open when the dedup store is unavailable', async () => {
    ddbMock.on(PutCommand).rejects(new Error('ServiceUnavailable'));
    expect(await claimSlackEvent('Ev9')).toBe(true);
  });
});

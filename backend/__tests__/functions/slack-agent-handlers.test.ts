/**
 * 자동이 핸들러(슬래시 커맨드·@멘션)와 에러 분석 도구. 이전에는 테스트가 없었다 (A-35, A-36)
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { handleSlashCommand } from '../../src/functions/slack-agent/handlers/slash-command.js';
import { handleAppMention } from '../../src/functions/slack-agent/handlers/app-mention.js';
import { analyzeError } from '../../src/functions/slack-agent/tools/analyze-error.js';
import { verifySlackRequest } from '../../src/functions/slack-agent/slack-verifier.js';

const ssmMock = mockClient(SSMClient);
const lambdaMock = mockClient(LambdaClient);
const cwMock = mockClient(CloudWatchClient);
const logsMock = mockClient(CloudWatchLogsClient);
const bedrockMock = mockClient(BedrockRuntimeClient);
const s3vMock = mockClient(S3VectorsClient);

// ERROR_ANALYSIS_PROMPT가 요청하는 형식의 응답
const analysisJson = [
  '1. 원인 분석: Bedrock 호출 한도 초과',
  '2. 해결책:',
  '- 지수 백오프를 적용해 재시도하기',
  '- Service Quotas에서 쿼터 상향 요청',
  '3. 관련 파일: utils/bedrock.ts',
].join('\n');

let fetchCalls: Array<{ url: string; body: any }> = [];
const originalFetch = global.fetch;

beforeAll(() => {
  ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'xoxb-test' } });
  lambdaMock.on(ListFunctionsCommand).resolves({ Functions: [{ FunctionName: 'eecar-stack-VectorSearchFunction-Abc' }] });
});

beforeEach(() => {
  cwMock.reset();
  logsMock.reset();
  bedrockMock.reset();
  s3vMock.reset();
  fetchCalls = [];
  global.fetch = (async (url: string, init?: { body?: string }) => {
    fetchCalls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
  cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Invocations' }).resolves({ Datapoints: [{ Sum: 50 }] });
  cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Errors' }).resolves({ Datapoints: [{ Sum: 5 }] });
  cwMock.on(GetMetricStatisticsCommand, { MetricName: 'Duration' }).resolves({ Datapoints: [{ Average: 800 }] });
  logsMock.on(FilterLogEventsCommand).resolves({ events: [{ timestamp: 0, message: 'ERROR ThrottlingException: Too many requests' }] });
  bedrockMock.on(InvokeModelCommand).resolves({ body: new TextEncoder().encode(JSON.stringify({ embedding: [0.1, 0.2] })) } as any);
  bedrockMock.on(ConverseCommand).resolves({ output: { message: { role: 'assistant', content: [{ text: analysisJson }] } }, usage: { inputTokens: 10, outputTokens: 5 } } as any);
  s3vMock.on(QueryVectorsCommand).resolves({ vectors: [] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

const slash = (text: string) => ({ type: 'slash_command', text, response_url: 'https://hooks.slack.com/x' });

describe('slash commands', () => {
  it('shows help for an empty or help command and rejects unknown commands', async () => {
    expect(JSON.stringify(await handleSlashCommand(slash('help')))).toContain('자동이');
    expect(JSON.stringify(await handleSlashCommand(slash('')))).toContain('자동이');
    expect(JSON.stringify(await handleSlashCommand(slash('춤춰')))).toContain('알 수 없는 명령어');
  });

  it('reports function status', async () => {
    const res = JSON.stringify(await handleSlashCommand(slash('상태 VectorSearch')));
    expect(res).toContain('VectorSearch');
  });

  it('lists recent error logs', async () => {
    const res = JSON.stringify(await handleSlashCommand(slash('로그 VectorSearch')));
    expect(res).toContain('ThrottlingException');
  });

  it('analyzes an error message with Claude', async () => {
    const res = JSON.stringify(await handleSlashCommand(slash('분석 ThrottlingException: Too many requests')));
    expect(res).toContain('Bedrock 호출 한도 초과');
  });

  it('searches past resolutions', async () => {
    const res = JSON.stringify(await handleSlashCommand(slash('기억 Throttling')));
    expect(res.length).toBeGreaterThan(10);
  });
});

describe('app mention', () => {
  const mention = (text: string) => ({ type: 'event_callback', event: { type: 'app_mention', user: 'U1', text, channel: 'C1', ts: '1.0' } });

  it('answers an empty mention with usage help', async () => {
    await handleAppMention(mention('<@B1>') as any);
    const post = fetchCalls.find(c => c.url.includes('chat.postMessage'));
    expect(post?.body.text).toContain('무엇을 도와드릴까요');
  });

  it('runs the agent and posts its answer in the thread', async () => {
    bedrockMock.on(ConverseCommand).resolves({
      output: { message: { role: 'assistant', content: [{ text: 'VectorSearch는 정상입니다.' }] } },
      usage: { inputTokens: 100, outputTokens: 20 },
    } as any);
    await handleAppMention(mention('<@B1> VectorSearch 상태 알려줘') as any);
    const post = fetchCalls.filter(c => c.url.includes('chat.postMessage')).pop();
    expect(JSON.stringify(post?.body)).toContain('VectorSearch는 정상입니다.');
    expect(post?.body.thread_ts).toBe('1.0');
  });
});

describe('analyzeError', () => {
  it('uses injected context and returns the parsed analysis', async () => {
    const result = await analyzeError(
      { errorMessage: 'ThrottlingException: Too many requests', functionName: 'VectorSearchFunction' },
      { searchCodebase: async () => ['bedrock.ts: invokeClaude'], recallMemory: async () => [] }
    );
    expect(result).toMatchObject({ errorType: 'ThrottlingException', cause: 'Bedrock 호출 한도 초과' });
    expect(result.solutions.join(' ')).toContain('지수 백오프');
    const prompt = JSON.stringify(bedrockMock.commandCalls(ConverseCommand)[0].args[0].input.messages);
    expect(prompt).toContain('bedrock.ts: invokeClaude');
  });

  it('degrades gracefully when Claude fails', async () => {
    bedrockMock.on(ConverseCommand).rejects(new Error('ThrottlingException'));
    const result = await analyzeError({ errorMessage: 'TimeoutError', functionName: 'x' }, { searchCodebase: async () => [], recallMemory: async () => [] });
    expect(result.errorType).toBe('TimeoutError');
    expect(typeof result.cause).toBe('string');
  });
});

describe('verifySlackRequest', () => {
  it('rejects missing headers and stale timestamps', async () => {
    expect(await verifySlackRequest('{}', undefined, 'v0=x')).toBe(false);
    expect(await verifySlackRequest('{}', String(Math.floor(Date.now() / 1000) - 3600), 'v0=x')).toBe(false);
    expect(await verifySlackRequest('{}', String(Math.floor(Date.now() / 1000)), 'v0=short')).toBe(false);
  });
});

/**
 * 자동이 조사 도구(변경 이력, 의존 서비스 지표, 공급자 상태)와 구조화 진단 제출 (A-40)
 */
import { jest } from '@jest/globals';
import type { ConverseCommandInput, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';
import { CloudFormationClient, DescribeStackEventsCommand } from '@aws-sdk/client-cloudformation';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import {
  changeDetails,
  collapseDeploys,
  getProviderStatus,
  getRecentChanges,
  getServiceMetrics,
  parseAwsFeed,
  type ChangeEvent,
} from '../../src/functions/slack-agent/tools/investigate.js';
import { renderDiagnosis } from '../../src/functions/slack-agent/tools/diagnosis.js';
import { runReActAgent } from '../../src/functions/slack-agent/orchestrator.js';

const trailMock = mockClient(CloudTrailClient);
const cfnMock = mockClient(CloudFormationClient);
const cwMock = mockClient(CloudWatchClient);

const trailEvent = (name: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  EventName: name,
  EventTime: new Date('2026-11-06T03:00:00Z'),
  Username: 'user-a',
  CloudTrailEvent: JSON.stringify({ requestParameters: params, ...extra }),
});

beforeEach(() => {
  trailMock.reset();
  cfnMock.reset();
  cwMock.reset();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('changeDetails', () => {
  it('keeps limits but never the values of environment variables', () => {
    const d = changeDetails('UpdateFunctionConfiguration20150331v2', { functionName: 'f', timeout: 3, memorySize: 128, environment: { variables: { API_TOKEN: 'secret-value', X: 'y' } } });
    expect(d).toEqual({ timeout: 3, memorySize: 128, environmentKeys: ['API_TOKEN', 'X'] });
    expect(JSON.stringify(d)).not.toContain('secret-value');
  });

  it('does not keep SSM parameter values', () => {
    expect(changeDetails('PutParameter', { name: '/eecar/slack/webhook-url', type: 'SecureString', value: 'https://hooks.slack.com/services/x' })).toEqual({ name: '/eecar/slack/webhook-url', type: 'SecureString' });
  });
});

describe('collapseDeploys', () => {
  const at = (t: string) => `2026-11-06T${t}:00.000Z`;
  it('folds per-function deploys into the stack update that finished right after them', () => {
    const changes: ChangeEvent[] = [
      { time: at('05:03'), type: 'deploy', target: 'VectorSearchFunction', actor: 'cloudformation', summary: 'a' },
      { time: at('05:03'), type: 'deploy', target: 'GetPartsFunction', actor: 'cloudformation', summary: 'b' },
      { time: at('05:04'), type: 'stack_update', target: 'eecar-stack', actor: 'cloudformation', summary: 'c' },
      { time: at('01:00'), type: 'function_config', target: 'GetPartsFunction', actor: 'user-a', summary: 'd' },
    ];
    const out = collapseDeploys(changes);
    expect(out.map(c => c.type).sort()).toEqual(['function_config', 'stack_update']);
    expect(out.find(c => c.type === 'stack_update')?.details).toEqual({ deployedFunctions: ['VectorSearchFunction', 'GetPartsFunction'] });
  });
});

describe('getRecentChanges', () => {
  it('merges stack events and console changes, skipping changes made by CloudFormation and unrelated writes', async () => {
    cfnMock.on(DescribeStackEventsCommand).resolves({
      StackEvents: [{ Timestamp: new Date(Date.now() - 3_600_000), ResourceType: 'AWS::CloudFormation::Stack', ResourceStatus: 'UPDATE_COMPLETE', LogicalResourceId: 'eecar-stack' } as any],
    });
    trailMock.on(LookupEventsCommand).resolves({
      Events: [
        trailEvent('UpdateFunctionConfiguration20150331v2', { functionName: 'eecar-stack-GetPartsFunction-abc', timeout: 3 }),
        trailEvent('UpdateFunctionConfiguration20150331v2', { functionName: 'eecar-stack-VectorSearchFunction-abc', timeout: 60 }, { invokedBy: 'cloudformation.amazonaws.com' }),
        trailEvent('CreateBucket', { bucketName: 'x' }),
      ],
    });
    const res = await getRecentChanges(undefined, 48);
    expect(res.changes.map(c => c.type).sort()).toEqual(['function_config', 'stack_update']);
    expect(res.changes.find(c => c.type === 'function_config')).toMatchObject({ target: 'eecar-stack-GetPartsFunction-abc', actor: 'user-a', details: { timeout: 3 } });
    expect(trailMock.commandCalls(LookupEventsCommand)[0].args[0].input.LookupAttributes).toEqual([{ AttributeKey: 'ReadOnly', AttributeValue: 'false' }]);
  });

  it('narrows to one function but keeps stack-wide changes', async () => {
    cfnMock.on(DescribeStackEventsCommand).resolves({ StackEvents: [] });
    trailMock.on(LookupEventsCommand).resolves({
      Events: [
        trailEvent('UpdateFunctionConfiguration20150331v2', { functionName: 'eecar-stack-GetPartsFunction-abc', timeout: 3 }),
        trailEvent('UpdateFunctionConfiguration20150331v2', { functionName: 'eecar-stack-ProposalFunction-abc', timeout: 3 }),
        trailEvent('PutParameter', { name: '/eecar/slack/webhook-url', type: 'SecureString' }),
      ],
    });
    const res = await getRecentChanges('GetParts', 48);
    expect(res.changes.map(c => c.target).sort()).toEqual(['/eecar/slack/webhook-url', 'eecar-stack-GetPartsFunction-abc']);
  });

  it('reports what it could not read instead of implying nothing changed', async () => {
    cfnMock.on(DescribeStackEventsCommand).resolves({ StackEvents: [] });
    trailMock.on(LookupEventsCommand).rejects(new Error('AccessDenied'));
    const res = await getRecentChanges(undefined, 24);
    expect(res.changes).toEqual([]);
    expect(res.incomplete?.[0]).toContain('CloudTrail');
  });
});

describe('getServiceMetrics', () => {
  it('sums Bedrock metrics per model', async () => {
    process.env.BEDROCK_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
    cwMock.on(GetMetricStatisticsCommand).resolves({ Datapoints: [] });
    cwMock.on(GetMetricStatisticsCommand, { MetricName: 'InvocationThrottles' }).resolves({ Datapoints: [{ Sum: 3 }, { Sum: 4 }] });
    const res = await getServiceMetrics('bedrock', 24) as { models: Array<{ modelId: string; throttles: number }> };
    expect(res.models.find(m => m.modelId === process.env.BEDROCK_MODEL_ID)?.throttles).toBe(7);
  });

  it('rejects unknown services with a usable message', async () => {
    expect(await getServiceMetrics('s3')).toMatchObject({ error: expect.stringContaining('bedrock') });
  });
});

describe('getProviderStatus', () => {
  it('says a status page could not be read rather than reporting no incident', async () => {
    const original = global.fetch;
    global.fetch = (async (url: string) => {
      if (String(url).includes('claude.com')) throw new Error('timeout');
      return { ok: true, json: async () => ({ status: 'active', active_incidents: [{ title: 'Events delayed', status: 'active', type: 'incident' }] }) };
    }) as unknown as typeof fetch;
    try {
      const res = await getProviderStatus() as any;
      expect(res.anthropic.unavailable).toContain('timeout');
      expect(res.slack.incidents[0].title).toBe('Events delayed');
    } finally {
      global.fetch = original;
    }
  });
});

describe('parseAwsFeed', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const item = (title: string, date: string) => `<item><title><![CDATA[${title}]]></title><pubDate>${date}</pubDate><description><![CDATA[<p>details</p>]]></description></item>`;

  it('keeps recent notices and strips markup', () => {
    const xml = `<rss><channel><title>feed</title>${item('Increased error rates', 'Thu, 05 Nov 2026 10:00:00 GMT')}${item('Old event', 'Thu, 01 Oct 2026 10:00:00 GMT')}</channel></rss>`;
    expect(parseAwsFeed('lambda', xml, now)).toEqual([
      { service: 'lambda', title: 'Increased error rates', published: 'Thu, 05 Nov 2026 10:00:00 GMT', description: 'details' },
    ]);
  });

  it('returns nothing for an empty feed', () => {
    expect(parseAwsFeed('lambda', '<rss><channel><title>feed</title></channel></rss>', now)).toEqual([]);
  });
});

describe('renderDiagnosis', () => {
  it('shows verdict, evidence, fix and what was not verified', () => {
    const text = renderDiagnosis({
      verdict: 'root_cause',
      summary: '콘솔에서 제한 시간을 3초로 줄여 등록이 실패합니다.',
      cause: 'Timeout 3초',
      component: 'lambda:PartRegistrationFunction',
      fault_type: 'config_timeout_or_memory',
      evidence: ['UpdateFunctionConfiguration timeout=3 (user-a)'],
      fix: { action: 'Timeout을 60초로 되돌립니다', type: 'fix', verify: '등록 API 재시도', rollback: 'sam deploy' },
      not_verified: ['변경 사유'],
    });
    expect(text).toContain('원인 확인');
    expect(text).toContain('UpdateFunctionConfiguration timeout=3');
    expect(text).toContain('*조치*: Timeout을 60초로 되돌립니다');
    expect(text).toContain('변경 사유');
  });

  it('marks healthy conclusions and mitigation fixes', () => {
    expect(renderDiagnosis({ verdict: 'no_fault', summary: '정상입니다.', component: 'none', fault_type: 'no_fault' })).toContain('장애 아님');
    expect(renderDiagnosis({ verdict: 'hypothesis', summary: 's', fix: { action: 'a', type: 'mitigation' } })).toContain('완화 조치');
  });
});

describe('orchestrator with submit_diagnosis', () => {
  const HAIKU = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
  const usage = { inputTokens: 100, outputTokens: 10, totalTokens: 110 };

  it('ends the run with the structured diagnosis and renders it as the answer', async () => {
    const replies: ConverseCommandOutput[] = [
      { output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't1', name: 'get_recent_changes', input: {} } }] } }, usage } as unknown as ConverseCommandOutput,
      { output: { message: { role: 'assistant', content: [{ toolUse: { toolUseId: 't2', name: 'submit_diagnosis', input: { verdict: 'no_fault', summary: '변경도 오류도 없습니다.' } } }] } }, usage } as unknown as ConverseCommandOutput,
    ];
    const seen: string[][] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      seen.push((input.toolConfig?.tools ?? []).map(t => t.toolSpec?.name ?? ''));
      return replies.shift()!;
    });
    const executeTool = jest.fn(async () => ({ success: true, data: { changes: [] } }));
    const result = await runReActAgent('어제 뭐 있었어?', { userId: 'U', channelId: 'C' }, {
      converse, executeTool, emit: false, modelOverride: HAIKU, toolNames: ['get_recent_changes', 'submit_diagnosis'],
    });
    expect(result.diagnosis).toMatchObject({ verdict: 'no_fault' });
    expect(result.response).toContain('변경도 오류도 없습니다.');
    expect(result.metrics.stopReason).toBe('final');
    // 제출은 도구로 실행하지 않는다
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(seen[0]).toEqual(['get_recent_changes', 'submit_diagnosis']);
  });

  const submit = (verdict: string) => ({ toolUse: { toolUseId: 'end', name: 'submit_diagnosis', input: { verdict, summary: '요약입니다.' } } });
  const reply = (content: unknown[]) => ({ output: { message: { role: 'assistant', content } }, usage }) as unknown as ConverseCommandOutput;

  it('lets the model investigate and forces the submission when it tries to end with text', async () => {
    const choices: unknown[] = [];
    const lastUser: string[] = [];
    const replies = [
      reply([{ toolUse: { toolUseId: 't1', name: 'get_recent_changes', input: {} } }]),
      reply([{ text: '변경 이력을 보니 배포가 원인 같습니다.' }]),
      reply([submit('hypothesis')]),
    ];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      choices.push(input.toolConfig?.toolChoice);
      const last = input.messages?.[input.messages.length - 1];
      lastUser.push(String(last?.content?.[0]?.text ?? ''));
      return replies.shift()!;
    });
    const executeTool = jest.fn(async () => ({ success: true, data: { changes: [] } }));
    const result = await runReActAgent('원인 찾아줘', { userId: 'U', channelId: 'C' }, {
      converse, executeTool, emit: false, modelOverride: HAIKU, toolNames: ['get_recent_changes', 'submit_diagnosis'], requireDiagnosis: true,
    });
    expect(choices).toEqual([undefined, undefined, { tool: { name: 'submit_diagnosis' } }]);
    expect(lastUser[2]).toContain('submit_diagnosis');
    expect(result.diagnosis).toMatchObject({ verdict: 'hypothesis' });
    expect(result.metrics.stopReason).toBe('final');
  });

  it('makes the model investigate before it can conclude without calling any tool', async () => {
    const choices: unknown[] = [];
    const replies = [
      reply([{ text: '근거가 부족합니다.' }]),
      reply([{ toolUse: { toolUseId: 't1', name: 'get_recent_changes', input: {} } }]),
      reply([{ text: '변경이 없습니다.' }]),
      reply([submit('insufficient_evidence')]),
    ];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      choices.push(input.toolConfig?.toolChoice);
      return replies.shift()!;
    });
    const executeTool = jest.fn(async () => ({ success: true, data: { changes: [] } }));
    const result = await runReActAgent('이상해요', { userId: 'U', channelId: 'C' }, {
      converse, executeTool, emit: false, modelOverride: HAIKU, toolNames: ['get_recent_changes', 'submit_diagnosis'], requireDiagnosis: true,
    });
    expect(choices[1]).toEqual({ any: {} });
    expect(choices[3]).toEqual({ tool: { name: 'submit_diagnosis' } });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.diagnosis).toMatchObject({ verdict: 'insufficient_evidence' });
  });

  it('forces the submission on the last turn so a long run still ends with a diagnosis', async () => {
    const choices: unknown[] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      choices.push(input.toolConfig?.toolChoice);
      return choices.length === 10
        ? reply([submit('insufficient_evidence')])
        : reply([{ toolUse: { toolUseId: `t${choices.length}`, name: 'get_recent_changes', input: {} } }]);
    });
    const executeTool = jest.fn(async () => ({ success: true, data: { changes: [] } }));
    const result = await runReActAgent('원인 찾아줘', { userId: 'U', channelId: 'C' }, {
      converse, executeTool, emit: false, modelOverride: HAIKU, toolNames: ['get_recent_changes', 'submit_diagnosis'], requireDiagnosis: true,
    });
    expect(choices[8]).toBeUndefined();
    expect(choices[9]).toEqual({ tool: { name: 'submit_diagnosis' } });
    expect(result.diagnosis).toMatchObject({ verdict: 'insufficient_evidence' });
  });

  it('tells the model the current time only when given', async () => {
    const systems: string[] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      systems.push((input.system ?? []).map(b => ('text' in b ? b.text : '')).join(''));
      return reply([{ text: '정상입니다.' }]);
    });
    await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU, systemPrompt: '기본', currentTime: '2026-11-06T10:10:00.000Z' });
    await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU, systemPrompt: '기본' });
    expect(systems[0]).toContain('2026-11-06T10:10:00.000Z');
    expect(systems[1]).toBe('기본');
  });

  it('leaves the tool choice to the model by default', async () => {
    const choices: unknown[] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      choices.push(input.toolConfig?.toolChoice);
      return { output: { message: { role: 'assistant', content: [{ text: '정상입니다.' }] } }, usage } as unknown as ConverseCommandOutput;
    });
    await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU });
    expect(choices).toEqual([undefined]);
  });

  it('puts the cache point after the fixed prompt and before the current time', async () => {
    const blocks: unknown[][] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      blocks.push(input.system ?? []);
      return reply([{ text: '정상입니다.' }]);
    });
    await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU, systemPrompt: '기본', cachePrompt: true, currentTime: '2026-11-06T10:10:00.000Z' });
    await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU, systemPrompt: '기본' });
    expect(blocks[0][0]).toEqual({ text: '기본' });
    expect(blocks[0][1]).toEqual({ cachePoint: { type: 'default' } });
    expect(JSON.stringify(blocks[0][2])).toContain('2026-11-06T10:10:00.000Z');
    expect(blocks[1]).toEqual([{ text: '기본' }]);
  });

  it('prices cached tokens at the cache rates', async () => {
    const replies = [
      { output: { message: { role: 'assistant', content: [{ text: '정상입니다.' }] } }, usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100, cacheReadInputTokens: 10_000, cacheWriteInputTokens: 2000 } },
    ] as unknown as ConverseCommandOutput[];
    const converse = jest.fn(async (_: ConverseCommandInput) => replies.shift()!);
    const { metrics } = await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU });
    expect(metrics).toMatchObject({ inputTokens: 1000, cacheReadTokens: 10_000, cacheWriteTokens: 2000 });
    // 입력 1000 + 읽기 10000×0.1 + 쓰기 2000×1.25 = 4500 상당, Haiku 입력 $1/M, 출력 100×$5/M
    expect(metrics.estimatedCostUsd).toBeCloseTo((4500 * 1 + 100 * 5) / 1_000_000, 8);
  });

  it('does not offer the investigation tools in production', async () => {
    const seen: string[][] = [];
    const converse = jest.fn(async (input: ConverseCommandInput) => {
      seen.push((input.toolConfig?.tools ?? []).map(t => t.toolSpec?.name ?? ''));
      return { output: { message: { role: 'assistant', content: [{ text: '정상입니다.' }] } }, usage } as unknown as ConverseCommandOutput;
    });
    await runReActAgent('상태', { userId: 'U', channelId: 'C' }, { converse, emit: false, modelOverride: HAIKU });
    for (const name of ['get_recent_changes', 'get_service_metrics', 'get_provider_status', 'submit_diagnosis']) expect(seen[0]).not.toContain(name);
  });
});

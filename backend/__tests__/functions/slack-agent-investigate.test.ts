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

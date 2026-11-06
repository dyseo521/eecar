/**
 * 장애 조사 도구: 무엇이 바뀌었나, 의존 서비스 지표, 공급자 상태 (읽기 전용, DECISION_LOG A-40)
 *
 * 현업 장애의 52~68%는 배포·설정 변경에서 시작하고 가장 흔한 완화는 롤백이다(Google, Microsoft 연구).
 * 현업 AI SRE(AWS DevOps Agent, Datadog Bits AI SRE, incident.io)도 장애를 최근 변경과 의존성 상태에 연결해 조사한다.
 * 이전 자동이는 로그와 함수 지표만 볼 수 있어, 변경 이력과 의존성 상태를 짐작해야 했다.
 */
import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';
import { CloudFormationClient, DescribeStackEventsCommand } from '@aws-sdk/client-cloudformation';
import { CloudWatchClient, GetMetricStatisticsCommand, type Datapoint } from '@aws-sdk/client-cloudwatch';
import { resolveFunction } from './cloudwatch.js';

const REGION = 'ap-northeast-2';
const STACK = process.env.STACK_NAME || 'eecar-stack';
const cloudTrail = new CloudTrailClient({ region: REGION });
const cloudFormation = new CloudFormationClient({ region: REGION });
const cloudWatch = new CloudWatchClient({ region: REGION });

export interface ChangeEvent {
  time: string;
  type: 'stack_update' | 'deploy' | 'layer_publish' | 'function_config' | 'function_code' | 'iam_policy' | 'ssm_param' | 'other';
  target: string;
  actor: string;
  summary: string;
  details?: Record<string, unknown>;
}

/** CloudTrail 이벤트 이름 → 변경 종류. 읽기 이벤트와 무관한 쓰기 이벤트는 뺀다 */
const CHANGE_EVENTS: Array<{ match: RegExp; type: ChangeEvent['type'] }> = [
  { match: /^UpdateFunctionConfiguration/, type: 'function_config' },
  { match: /^UpdateFunctionCode/, type: 'function_code' },
  { match: /^PublishLayerVersion/, type: 'layer_publish' },
  { match: /^(PutFunctionConcurrency|DeleteFunctionConcurrency)/, type: 'function_config' },
  { match: /^(PutRolePolicy|DeleteRolePolicy|AttachRolePolicy|DetachRolePolicy|UpdateAssumeRolePolicy)$/, type: 'iam_policy' },
  { match: /^(PutParameter|DeleteParameter)$/, type: 'ssm_param' },
];

const MAX_CHANGES = 40;
const MAX_PAGES = 3;

/** 요청 파라미터에서 조사에 쓸 값만 남긴다. 비밀값이 섞일 수 있는 환경 변수 값과 SSM 값은 키 이름만 남긴다 */
export function changeDetails(eventName: string, params: Record<string, any> | undefined): Record<string, unknown> | undefined {
  if (!params) return undefined;
  if (/^UpdateFunctionConfiguration/.test(eventName)) {
    const { timeout, memorySize, layers, runtime, environment, handler } = params;
    return {
      ...(timeout !== undefined ? { timeout } : {}),
      ...(memorySize !== undefined ? { memorySize } : {}),
      ...(layers ? { layers } : {}),
      ...(runtime ? { runtime } : {}),
      ...(handler ? { handler } : {}),
      ...(environment?.variables ? { environmentKeys: Object.keys(environment.variables) } : {}),
    };
  }
  if (/RolePolicy$/.test(eventName)) return { roleName: params.roleName, policyName: params.policyName ?? params.policyArn };
  if (/Parameter$/.test(eventName)) return { name: params.name, type: params.type };
  return undefined;
}

function targetOf(params: Record<string, any> | undefined, resources: Array<{ ResourceName?: string }> | undefined): string {
  return String(params?.functionName ?? params?.layerName ?? params?.roleName ?? params?.name ?? resources?.[0]?.ResourceName ?? 'unknown');
}

async function cloudTrailChanges(since: Date): Promise<ChangeEvent[]> {
  const out: ChangeEvent[] = [];
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await cloudTrail.send(new LookupEventsCommand({
      StartTime: since,
      LookupAttributes: [{ AttributeKey: 'ReadOnly', AttributeValue: 'false' }],
      MaxResults: 50,
      NextToken: token,
    }));
    for (const e of res.Events ?? []) {
      const kind = CHANGE_EVENTS.find(c => c.match.test(e.EventName ?? ''));
      if (!kind) continue;
      let parsed: any = {};
      try { parsed = JSON.parse(e.CloudTrailEvent ?? '{}'); } catch { /* 본문 없이 처리 */ }
      // CloudFormation이 일으킨 변경은 스택 이벤트로 따로 본다 (배포)
      if (parsed.invokedBy === 'cloudformation.amazonaws.com' || parsed.userIdentity?.invokedBy === 'cloudformation.amazonaws.com') continue;
      const params = parsed.requestParameters;
      const target = targetOf(params, e.Resources);
      out.push({
        time: (e.EventTime ?? new Date()).toISOString(),
        type: kind.type,
        target,
        actor: e.Username ?? parsed.userIdentity?.arn ?? 'unknown',
        summary: `${e.EventName} ${target}`,
        details: changeDetails(e.EventName ?? '', params),
      });
    }
    token = res.NextToken;
    if (!token) break;
  }
  return out;
}

async function stackChanges(since: Date): Promise<ChangeEvent[]> {
  const out: ChangeEvent[] = [];
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await cloudFormation.send(new DescribeStackEventsCommand({ StackName: STACK, NextToken: token }));
    for (const e of res.StackEvents ?? []) {
      if (!e.Timestamp || e.Timestamp < since) return out;
      const status = e.ResourceStatus ?? '';
      if (e.ResourceType === 'AWS::CloudFormation::Stack' && /^(UPDATE_COMPLETE|UPDATE_ROLLBACK_COMPLETE|UPDATE_FAILED)$/.test(status)) {
        out.push({ time: e.Timestamp.toISOString(), type: 'stack_update', target: STACK, actor: 'cloudformation', summary: `스택 ${status}`, details: e.ResourceStatusReason ? { reason: e.ResourceStatusReason } : undefined });
      } else if (e.ResourceType === 'AWS::Lambda::Function' && status === 'UPDATE_COMPLETE') {
        out.push({ time: e.Timestamp.toISOString(), type: 'deploy', target: e.LogicalResourceId ?? 'unknown', actor: 'cloudformation', summary: `함수 배포 ${e.LogicalResourceId}` });
      } else if (e.ResourceType === 'AWS::Lambda::LayerVersion' && status === 'CREATE_COMPLETE') {
        out.push({ time: e.Timestamp.toISOString(), type: 'layer_publish', target: e.LogicalResourceId ?? 'layer', actor: 'cloudformation', summary: `레이어 새 버전 ${e.PhysicalResourceId ?? ''}`.trim() });
      } else if (/_FAILED$/.test(status)) {
        out.push({ time: e.Timestamp.toISOString(), type: 'other', target: e.LogicalResourceId ?? 'unknown', actor: 'cloudformation', summary: `${status}: ${e.ResourceStatusReason ?? ''}`.slice(0, 300) });
      }
    }
    token = res.NextToken;
    if (!token) break;
  }
  return out;
}

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/function$/, '');
}

const DEPLOY_WINDOW_MS = 10 * 60_000;

/** 함수별 배포 이벤트를 바로 뒤의 스택 배포 완료 이벤트에 묶는다 (함수 이름 목록만 남긴다) */
export function collapseDeploys(changes: ChangeEvent[]): ChangeEvent[] {
  const stacks = changes.filter(c => c.type === 'stack_update');
  const deploys = changes.filter(c => c.type === 'deploy');
  const merged = new Map<ChangeEvent, string[]>();
  const orphans: ChangeEvent[] = [];
  for (const d of deploys) {
    const t = Date.parse(d.time);
    const owner = stacks.find(s => { const st = Date.parse(s.time); return st >= t && st - t <= DEPLOY_WINDOW_MS; });
    if (owner) merged.set(owner, [...(merged.get(owner) ?? []), d.target]);
    else orphans.push(d);
  }
  return [
    ...changes.filter(c => c.type !== 'stack_update' && c.type !== 'deploy'),
    ...orphans,
    ...stacks.map(s => (merged.has(s) ? { ...s, details: { ...s.details, deployedFunctions: merged.get(s) } } : s)),
  ];
}

/**
 * 최근 변경 이력: 스택 배포 + 콘솔·스크립트의 함수 설정·코드·IAM·SSM 변경. 최신순.
 * 한쪽 조회가 실패해도 다른 쪽 결과를 돌려주고, 실패 사실을 알린다 (없는 변경으로 오해하지 않게).
 */
export async function getRecentChanges(functionName?: string, hours = 168): Promise<{ windowHours: number; changes: ChangeEvent[]; incomplete?: string[]; truncated?: boolean }> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const results = await Promise.allSettled([stackChanges(since), cloudTrailChanges(since)]);
  const incomplete: string[] = [];
  const all: ChangeEvent[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else incomplete.push(`${i === 0 ? 'CloudFormation' : 'CloudTrail'} 조회 실패: ${(r.reason as Error)?.message ?? r.reason}`);
  });
  const want = functionName ? norm(functionName) : undefined;
  // 전체 조회에서는 함수별 배포를 스택 배포 한 건으로 묶는다. 배포 한 번이 함수 12개를 갱신해, 그대로 두면 콘솔 변경이 상한에 밀려 잘린다
  const collapsed = want ? all : collapseDeploys(all);
  const filtered = collapsed
    .filter(c => !want || c.type === 'stack_update' || c.type === 'layer_publish' || c.type === 'ssm_param' || norm(c.target).includes(want))
    .sort((a, b) => b.time.localeCompare(a.time));
  return {
    windowHours: hours,
    changes: filtered.slice(0, MAX_CHANGES),
    ...(incomplete.length ? { incomplete } : {}),
    ...(filtered.length > MAX_CHANGES ? { truncated: true } : {}),
  };
}

const sum = (dps: Datapoint[] | undefined) => (dps ?? []).reduce((a, d) => a + (d.Sum ?? 0), 0);

async function metricSum(namespace: string, metric: string, dimensions: Array<{ Name: string; Value: string }>, since: Date, end: Date, period: number): Promise<number> {
  const r = await cloudWatch.send(new GetMetricStatisticsCommand({ Namespace: namespace, MetricName: metric, Dimensions: dimensions, StartTime: since, EndTime: end, Period: period, Statistics: ['Sum'] }));
  return sum(r.Datapoints);
}

/** 의존 서비스 지표: Bedrock 모델별 호출·스로틀·서버 오류, DynamoDB 스로틀·소비 용량, API Gateway 5XX·4XX, 합성 검사 */
export async function getServiceMetrics(service: string, hours = 24, functionName?: string): Promise<Record<string, unknown>> {
  const end = new Date();
  const since = new Date(end.getTime() - hours * 3_600_000);
  const period = Math.max(3600, hours * 60);
  if (service === 'lambda') {
    // 함수 한도 신호: 스로틀, 지연 p99, 최대 동시 실행 (get_function_status에는 평균 지연만 있다)
    if (!functionName) return { service, error: 'functionName이 필요합니다' };
    const { fullName, found } = await resolveFunction(functionName);
    if (!found) return { service, functionName, found: false, note: `'${functionName}' 함수를 스택에서 찾지 못했습니다.` };
    const d = [{ Name: 'FunctionName', Value: fullName }];
    const stat = (metric: string, opts: { Statistics?: Array<'Maximum' | 'Sum'>; ExtendedStatistics?: string[] }) =>
      cloudWatch.send(new GetMetricStatisticsCommand({ Namespace: 'AWS/Lambda', MetricName: metric, Dimensions: d, StartTime: since, EndTime: end, Period: period, ...opts }));
    const [throttles, duration, concurrency] = await Promise.all([
      stat('Throttles', { Statistics: ['Sum'] }),
      stat('Duration', { ExtendedStatistics: ['p99'] }),
      stat('ConcurrentExecutions', { Statistics: ['Maximum'] }),
    ]);
    const maxOf = (values: number[]) => (values.length ? Math.max(...values) : 0);
    return {
      service, functionName, windowHours: hours,
      throttles: sum(throttles.Datapoints),
      durationP99: Math.round(maxOf((duration.Datapoints ?? []).map(p => p.ExtendedStatistics?.p99 ?? 0))),
      maxConcurrency: maxOf((concurrency.Datapoints ?? []).map(p => p.Maximum ?? 0)),
    };
  }
  if (service === 'canary') {
    // 검색 합성 검사(A-39): 벡터 후보가 0이면 오류 없이 벡터 검색이 꺼진 것이다
    const r = await cloudWatch.send(new GetMetricStatisticsCommand({ Namespace: 'EECAR/Search', MetricName: 'VectorCandidates', Dimensions: [{ Name: 'Operation', Value: 'Canary' }], StartTime: since, EndTime: end, Period: period, Statistics: ['Minimum', 'SampleCount'] }));
    const points = r.Datapoints ?? [];
    return { service, windowHours: hours, runs: points.reduce((a, d) => a + (d.SampleCount ?? 0), 0), minVectorCandidates: points.length ? Math.min(...points.map(d => d.Minimum ?? 0)) : null };
  }
  if (service === 'bedrock') {
    const models = [...new Set([process.env.BEDROCK_MODEL_ID, process.env.AGENT_MODEL_ID, process.env.AGENT_COMPLEX_MODEL_ID, 'amazon.titan-embed-text-v2:0'].filter(Boolean) as string[])];
    const rows = await Promise.all(models.map(async modelId => {
      const d = [{ Name: 'ModelId', Value: modelId }];
      const [invocations, throttles, serverErrors, clientErrors] = await Promise.all(['Invocations', 'InvocationThrottles', 'InvocationServerErrors', 'InvocationClientErrors'].map(m => metricSum('AWS/Bedrock', m, d, since, end, period)));
      return { modelId, invocations, throttles, serverErrors, clientErrors };
    }));
    return { service, windowHours: hours, models: rows };
  }
  if (service === 'dynamodb') {
    const d = [{ Name: 'TableName', Value: process.env.PARTS_TABLE_NAME || 'eecar-parts-table' }];
    const [throttledRequests, consumedRCU, consumedWCU, systemErrors] = await Promise.all(['ThrottledRequests', 'ConsumedReadCapacityUnits', 'ConsumedWriteCapacityUnits', 'SystemErrors'].map(m => metricSum('AWS/DynamoDB', m, d, since, end, period)));
    return { service, windowHours: hours, throttledRequests, consumedRCU, consumedWCU, systemErrors };
  }
  if (service === 'apigateway') {
    const d = [{ Name: 'ApiName', Value: STACK }];
    const [count, errors5xx, errors4xx] = await Promise.all(['Count', '5XXError', '4XXError'].map(m => metricSum('AWS/ApiGateway', m, d, since, end, period)));
    return { service, windowHours: hours, count, '5xx': errors5xx, '4xx': errors4xx };
  }
  return { service, error: `지원하지 않는 서비스입니다: ${service} (bedrock, dynamodb, apigateway)` };
}

const STATUS_TIMEOUT_MS = 3000;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const AWS_FEEDS = ['lambda', 'bedrock', 'dynamodb', 'apigateway', 's3', 'sns'];
const AWS_NOTICE_WINDOW_DAYS = 7;

/** AWS 공개 상태 RSS의 항목을 읽는다 (최근 7일) */
export function parseAwsFeed(service: string, xml: string, now = Date.now()): Array<{ service: string; title: string; published: string; description: string }> {
  const clean = (s: string | undefined) => (s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.map(item => ({
    service,
    title: clean(item.match(/<title>([\s\S]*?)<\/title>/)?.[1]),
    published: clean(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]),
    description: clean(item.match(/<description>([\s\S]*?)<\/description>/)?.[1]).slice(0, 300),
  })).filter(i => {
    const t = Date.parse(i.published);
    return Number.isNaN(t) || now - t <= AWS_NOTICE_WINDOW_DAYS * 86_400_000;
  });
}

async function awsNotices(): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled(AWS_FEEDS.map(async service => {
    const res = await fetch(`https://status.aws.amazon.com/rss/${service}-ap-northeast-2.rss`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseAwsFeed(service, await res.text());
  }));
  const failed = AWS_FEEDS.filter((_, i) => results[i].status === 'rejected');
  return {
    region: 'ap-northeast-2',
    notices: results.flatMap(r => (r.status === 'fulfilled' ? r.value : [])),
    ...(failed.length ? { unavailable: failed } : {}),
  };
}

/**
 * 공급자 공개 상태 페이지. 조회 실패는 "장애 없음"이 아니라 "확인 못 함"으로 돌려준다.
 * AWS Health API는 Business 이상 지원 플랜이 필요해, AWS는 공개 상태 RSS(서울 리전)를 읽는다.
 */
export async function getProviderStatus(): Promise<Record<string, unknown>> {
  const [anthropic, slack, aws] = await Promise.allSettled([
    fetchJson('https://status.claude.com/api/v2/summary.json'),
    fetchJson('https://slack-status.com/api/v2.0.0/current'),
    awsNotices(),
  ]);
  return {
    aws: aws.status === 'fulfilled' ? aws.value : { unavailable: String((aws.reason as Error)?.message ?? aws.reason) },
    anthropic: anthropic.status === 'fulfilled'
      ? {
          indicator: anthropic.value?.status?.indicator,
          description: anthropic.value?.status?.description,
          incidents: (anthropic.value?.incidents ?? []).slice(0, 5).map((i: any) => ({ name: i.name, status: i.status, impact: i.impact, startedAt: i.started_at ?? i.created_at })),
        }
      : { unavailable: String((anthropic.reason as Error)?.message ?? anthropic.reason) },
    slack: slack.status === 'fulfilled'
      ? { status: slack.value?.status, incidents: (slack.value?.active_incidents ?? []).slice(0, 5).map((i: any) => ({ title: i.title, status: i.status, type: i.type })) }
      : { unavailable: String((slack.reason as Error)?.message ?? slack.reason) },
  };
}

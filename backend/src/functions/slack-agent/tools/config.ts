/**
 * Lambda 함수 설정과 실행 역할 권한 조회 (읽기 전용, DECISION_LOG A-38)
 *
 * 이전에는 에이전트가 로그와 지표만 볼 수 있었다. 홀드아웃 실패 29건 중 22건이 환경 변수·레이어·IAM 권한·
 * 플랫폼 한도처럼 로그에 직접 나오지 않는 정보를 요구했고, 에이전트는 이를 짐작으로 답했다 (E-30).
 */
import {
  GetFunctionConfigurationCommand,
  GetLayerVersionByArnCommand,
  LambdaClient,
  ListLayerVersionsCommand,
} from '@aws-sdk/client-lambda';
import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import { resolveFunction } from './cloudwatch.js';

const lambda = new LambdaClient({ region: 'ap-northeast-2' });
const iam = new IAMClient({ region: 'ap-northeast-2' });

/** 이름이 비밀값을 뜻하는 환경 변수. 단, 값이 아니라 위치를 가리키는 이름(…_PARAM, …_ARN, …_NAME)은 제외한다 */
const SECRET_KEY = /SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|API_?KEY|WEBHOOK|AUTH/i;
const REFERENCE_KEY = /(_SSM_PARAM|_PARAM|_PARAMETER|_ARN|_NAME)$/i;
/** 이름과 관계없이 비밀값으로 보이는 값 (알려진 형식) */
const SECRET_VALUE = [
  /^xox[abprs]-/,
  /hooks\.slack\.com\/services\//,
  /\bA(KIA|SIA)[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
/** 긴 무작위 문자열. 위치를 가리키는 이름(…_NAME 등)의 값은 리소스 이름이라 이 규칙을 적용하지 않는다 */
const LONG_TOKEN = /^[A-Za-z0-9+/=_-]{32,}$/;

/** 비밀값으로 보이는 환경 변수 값을 가린다 (이름은 남긴다) */
export function maskEnvironment(vars: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars ?? {})) {
    const secretByName = SECRET_KEY.test(key) && !REFERENCE_KEY.test(key);
    const secretByValue = SECRET_VALUE.some(p => p.test(value)) || (!REFERENCE_KEY.test(key) && LONG_TOKEN.test(value));
    out[key] = secretByName || secretByValue ? `****(가림, ${value.length}자)` : value.length > 300 ? `${value.slice(0, 300)}…` : value;
  }
  return out;
}

export interface LayerInfo {
  name: string;
  version: number;
  createdDate?: string;
  latestVersion?: number;
  latestCreatedDate?: string;
  isLatest?: boolean;
}

export interface FunctionConfig {
  functionName: string;
  found: boolean;
  note?: string;
  runtime?: string;
  handler?: string;
  timeoutSec?: number;
  memoryMB?: number;
  ephemeralStorageMB?: number;
  architecture?: string;
  lastModified?: string;
  state?: string;
  lastUpdateStatus?: string;
  lastUpdateStatusReason?: string;
  environment?: Record<string, string>;
  layers?: LayerInfo[];
  roleName?: string;
}

/** arn:aws:lambda:<region>:<account>:layer:<name>:<version> */
function parseLayerArn(arn: string): { layerArn: string; name: string; version: number } | undefined {
  const m = arn.match(/^(arn:aws:lambda:[^:]+:\d+:layer:([^:]+)):(\d+)$/);
  return m ? { layerArn: m[1], name: m[2], version: Number(m[3]) } : undefined;
}

async function describeLayer(arn: string): Promise<LayerInfo | undefined> {
  const parsed = parseLayerArn(arn);
  if (!parsed) return undefined;
  const info: LayerInfo = { name: parsed.name, version: parsed.version };
  try {
    const current = await lambda.send(new GetLayerVersionByArnCommand({ Arn: arn }));
    info.createdDate = current.CreatedDate;
    const latest = await lambda.send(new ListLayerVersionsCommand({ LayerName: parsed.layerArn, MaxItems: 1 }));
    const top = latest.LayerVersions?.[0];
    if (top?.Version !== undefined) {
      info.latestVersion = top.Version;
      info.latestCreatedDate = top.CreatedDate;
      info.isLatest = top.Version === parsed.version;
    }
  } catch (error) {
    console.error('Failed to describe layer:', arn, error);
  }
  return info;
}

/**
 * 함수 설정: 런타임, 제한 시간, 메모리, 환경 변수(비밀값은 가림), 레이어 버전과 최신 여부, 마지막 배포 시각
 */
export async function getFunctionConfig(shortName: string): Promise<FunctionConfig> {
  const { fullName, found } = await resolveFunction(shortName);
  if (!found) {
    return { functionName: shortName, found: false, note: `'${shortName}' 함수를 스택에서 찾지 못했습니다. 함수 이름을 확인하세요.` };
  }
  const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fullName }));
  const layers = (await Promise.all((c.Layers ?? []).map(l => (l.Arn ? describeLayer(l.Arn) : undefined))))
    .filter((l): l is LayerInfo => Boolean(l));
  return {
    functionName: shortName,
    found: true,
    runtime: c.Runtime,
    handler: c.Handler,
    timeoutSec: c.Timeout,
    memoryMB: c.MemorySize,
    ephemeralStorageMB: c.EphemeralStorage?.Size,
    architecture: c.Architectures?.[0],
    lastModified: c.LastModified,
    state: c.State,
    lastUpdateStatus: c.LastUpdateStatus,
    ...(c.LastUpdateStatusReason ? { lastUpdateStatusReason: c.LastUpdateStatusReason } : {}),
    environment: maskEnvironment(c.Environment?.Variables),
    layers,
    roleName: c.Role?.split('/').pop(),
  };
}

export interface PolicyStatement {
  policy: string;
  effect: string;
  actions: string[];
  resources: string[];
  hasCondition?: boolean;
}

export interface FunctionPermissions {
  functionName: string;
  found: boolean;
  note?: string;
  roleName?: string;
  statements?: PolicyStatement[];
  truncated?: boolean;
}

/** 한 번에 돌려줄 문장·액션·리소스 수 상한 (컨텍스트 크기 제한, 판단) */
const MAX_STATEMENTS = 40;
const MAX_ITEMS = 25;

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);

export function flattenPolicy(policy: string, document: string): PolicyStatement[] {
  const doc = JSON.parse(decodeURIComponent(document)) as { Statement?: unknown };
  const statements = Array.isArray(doc.Statement) ? doc.Statement : doc.Statement ? [doc.Statement] : [];
  return statements.map((s: Record<string, unknown>) => ({
    policy,
    effect: String(s.Effect ?? 'Allow'),
    actions: asList(s.Action ?? (s.NotAction ? asList(s.NotAction).map(a => `NOT ${a}`) : [])).slice(0, MAX_ITEMS),
    resources: asList(s.Resource ?? (s.NotResource ? asList(s.NotResource).map(r => `NOT ${r}`) : [])).slice(0, MAX_ITEMS),
    ...(s.Condition ? { hasCondition: true } : {}),
  }));
}

/**
 * 실행 역할의 IAM 정책: 인라인 정책과 연결된 관리형 정책의 허용 액션·리소스
 */
export async function getFunctionPermissions(shortName: string): Promise<FunctionPermissions> {
  const { fullName, found } = await resolveFunction(shortName);
  if (!found) {
    return { functionName: shortName, found: false, note: `'${shortName}' 함수를 스택에서 찾지 못했습니다. 함수 이름을 확인하세요.` };
  }
  const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fullName }));
  const roleName = c.Role?.split('/').pop();
  if (!roleName) return { functionName: shortName, found: true, note: '실행 역할을 찾지 못했습니다.' };

  const statements: PolicyStatement[] = [];
  const inline = await iam.send(new ListRolePoliciesCommand({ RoleName: roleName }));
  for (const name of inline.PolicyNames ?? []) {
    const p = await iam.send(new GetRolePolicyCommand({ RoleName: roleName, PolicyName: name }));
    if (p.PolicyDocument) statements.push(...flattenPolicy(name, p.PolicyDocument));
  }
  const attached = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
  for (const ap of attached.AttachedPolicies ?? []) {
    if (!ap.PolicyArn) continue;
    const meta = await iam.send(new GetPolicyCommand({ PolicyArn: ap.PolicyArn }));
    const versionId = meta.Policy?.DefaultVersionId;
    if (!versionId) continue;
    const v = await iam.send(new GetPolicyVersionCommand({ PolicyArn: ap.PolicyArn, VersionId: versionId }));
    if (v.PolicyVersion?.Document) statements.push(...flattenPolicy(ap.PolicyName ?? ap.PolicyArn, v.PolicyVersion.Document));
  }
  return {
    functionName: shortName,
    found: true,
    roleName,
    statements: statements.slice(0, MAX_STATEMENTS),
    ...(statements.length > MAX_STATEMENTS ? { truncated: true } : {}),
  };
}

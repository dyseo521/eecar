/**
 * 구조화된 진단 제출 (DECISION_LOG A-40).
 *
 * 현업·벤치마크의 공통점을 따른다.
 * - AWS DevOps Agent: 결과를 원인 / 기여 원인 / 가설로 나누고, 근거가 부족하면 없는 가설을 만들지 않고 한계를 말한다.
 * - AIOpsLab·OpenRCA·ITBench: 구성요소와 장애 유형을 닫힌 목록에서 고르게 해 결정적으로 채점한다.
 * - Meta: 인용할 수 없으면 말하지 않는다.
 * 문제가 없다고 말할 선택지(no_fault)와 모른다고 말할 선택지(insufficient_evidence)를 형식에 넣는다.
 * 이전 자유 서술에서는 정상·함정 시나리오에서도 원인과 조치를 만들어 내는 경향이 있었다(E-33).
 */
import { Tool } from '../types.js';

export const VERDICTS = ['root_cause', 'hypothesis', 'insufficient_evidence', 'no_fault'] as const;

export const COMPONENTS = [
  'lambda:VectorSearchFunction', 'lambda:PartRegistrationFunction', 'lambda:ComplianceCheckFunction', 'lambda:GetPartsFunction',
  'lambda:WatchPartFunction', 'lambda:ProposalFunction', 'lambda:SyntheticDataFunction', 'lambda:BatteryHealthAssessmentFunction',
  'lambda:MaterialPropertySearchFunction', 'lambda:ContactInquiryFunction', 'lambda:SlackNotificationFunction', 'lambda:SlackAgentFunction',
  'layer:eecar-utils-layer', 'dynamodb:eecar-parts-table', 's3:vectors-bucket', 's3:documents-bucket', 's3vectors:parts-vectors',
  'apigateway:eecar-api', 'bedrock:claude', 'bedrock:titan', 'sns:eecar-notifications', 'ssm:parameter', 'slack:platform', 'client:request', 'aws:region', 'none',
] as const;

export const FAULT_TYPES = [
  'bad_deploy_code', 'layer_version_mismatch', 'config_env_wrong', 'config_timeout_or_memory', 'iam_permission_denied', 'kms_access_denied',
  'secret_or_param_missing', 'data_schema_mismatch', 'index_version_mismatch', 'stale_cache', 'provider_outage', 'model_lifecycle', 'api_contract_change',
  'slack_platform', 'aws_regional_event', 'platform_limit_timeout', 'platform_limit_size', 'quota_or_throttling', 'ddb_throttle_or_hot_key', 'memory_exhausted',
  'runaway_loop_or_cost', 'latent_data_bug', 'duplicate_processing', 'expiry_or_rotation', 'llm_quality_regression', 'llm_output_parse_failure', 'prompt_injection',
  'embedding_mismatch', 'no_fault', 'transient_self_healed', 'monitor_misconfig', 'no_user_impact', 'unknown',
] as const;

export interface Diagnosis {
  verdict: typeof VERDICTS[number];
  summary: string;
  cause?: string;
  component?: string;
  fault_type?: string;
  evidence?: string[];
  contributing?: string[];
  fix?: { action?: string; type?: 'fix' | 'mitigation' | 'none'; verify?: string; rollback?: string };
  not_verified?: string[];
}

export const SUBMIT_DIAGNOSIS_TOOL: Tool = {
  name: 'submit_diagnosis',
  description:
    '조사를 마치면 이 도구로 진단을 제출합니다. 호출하면 그대로 사용자에게 전달되고 대화가 끝납니다. 근거 없이 원인을 단정하지 말고, 문제가 없으면 no_fault, 근거가 부족하면 insufficient_evidence를 고르세요.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', description: 'root_cause: 근거로 확인한 원인 / hypothesis: 가능성이 높지만 확인하지 못함 / insufficient_evidence: 판단할 근거 부족 / no_fault: 장애가 아님 (정상, 의도된 동작, 일시적으로 회복됨)', enum: [...VERDICTS] },
      summary: { type: 'string', description: '결론 한두 문장 (사용자가 가장 먼저 읽는 문장)' },
      cause: { type: 'string', description: '원인 설명. no_fault면 왜 문제가 아닌지' },
      component: { type: 'string', description: '원인이 있는 구성요소', enum: [...COMPONENTS] },
      fault_type: { type: 'string', description: '장애 유형', enum: [...FAULT_TYPES] },
      evidence: { type: 'array', items: { type: 'string' }, description: '도구 결과에서 그대로 옮긴 근거 (로그 문구, 변경 이력, 설정값). 도구 결과에 없는 값은 쓰지 않는다' },
      contributing: { type: 'array', items: { type: 'string' }, description: '기여 요인 (알림 누락, 재시도 없음 등)' },
      fix: {
        type: 'object',
        description: '조치. 장애가 아니면 type을 none으로 두고 필요한 안내만 쓴다',
        properties: {
          action: { type: 'string', description: '바로 실행할 조치. 도구로 확인한 실제 이름과 값을 쓰고, 확인하지 못한 값은 지어내지 않는다' },
          type: { type: 'string', description: 'fix: 원인을 제거 / mitigation: 증상만 줄임 / none: 조치 불필요', enum: ['fix', 'mitigation', 'none'] },
          verify: { type: 'string', description: '해결을 확인하는 방법' },
          rollback: { type: 'string', description: '조치를 되돌리는 방법' },
        },
      },
      not_verified: { type: 'array', items: { type: 'string' }, description: '확인하지 못한 것과 더 필요한 정보' },
    },
    required: ['verdict', 'summary'],
  },
};

/**
 * 조사를 마친 뒤 제출을 강제할 때 함께 주는 지시 (A-40).
 * dev에서 근거 부족 사례의 대부분을 root_cause로 단정했다. 결론을 쓰는 시점에 판정 기준을 다시 확인하게 한다.
 */
export const DIAGNOSIS_FINALIZE_PROMPT = `조사 결과를 submit_diagnosis로 제출하세요. 제출 전에 확인하세요.
- root_cause는 증상을 직접 설명하는 도구 결과를 evidence에 옮길 수 있을 때만 씁니다. 시각이 비슷한 변경이 있다는 것만으로는 hypothesis입니다.
- 호출 주체나 요청 내용처럼 원인을 가르는 신호를 볼 수 없으면 insufficient_evidence입니다.
- 오류가 이미 멈췄고 지금 정상이면 no_fault입니다. 마지막 오류 시각과 현재 시각을 비교하세요.
- 원인을 확인하지 못했으면 fix.action에는 코드·설정 변경이 아니라 다음에 확인할 것을 씁니다.
- evidence와 cause에는 도구 결과에 있는 값만 씁니다.`;

/** 시스템 프롬프트에 붙이는 현재 시각. 없으면 모델은 "최근"이나 "이미 회복됨"을 판단할 기준이 없다 (A-40) */
export const currentTimeSection = (iso: string): string =>
  `\n\n# 현재 시각\n${iso} (UTC). 로그와 변경 이력의 시각도 UTC다. "최근"과 "이미 회복됨"은 이 시각을 기준으로 판단한다.`;

const VERDICT_LABEL: Record<string, string> = {
  root_cause: '🎯 원인 확인',
  hypothesis: '🔍 가설 (확인 필요)',
  insufficient_evidence: '❓ 근거 부족',
  no_fault: '✅ 장애 아님',
};

const FIX_LABEL: Record<string, string> = { fix: '조치', mitigation: '완화 조치', none: '조치' };

const list = (items: unknown): string[] => (Array.isArray(items) ? items.map(String).filter(Boolean) : items ? [String(items)] : []);

/** 제출된 진단을 Slack 메시지로 만든다 */
export function renderDiagnosis(d: Diagnosis): string {
  const lines = [`*${VERDICT_LABEL[d.verdict] ?? d.verdict}*`, d.summary];
  if (d.cause) lines.push('', `*원인*: ${d.cause}`);
  const where = [d.component && d.component !== 'none' ? d.component : '', d.fault_type && !['no_fault', 'unknown'].includes(d.fault_type) ? d.fault_type : ''].filter(Boolean).join(' · ');
  if (where) lines.push(`_${where}_`);
  const evidence = list(d.evidence);
  if (evidence.length) lines.push('', '*근거*', ...evidence.map(e => `• ${e}`));
  const contributing = list(d.contributing);
  if (contributing.length) lines.push('', '*기여 요인*', ...contributing.map(c => `• ${c}`));
  if (d.fix?.action) {
    lines.push('', `*${FIX_LABEL[d.fix.type ?? 'fix'] ?? '조치'}*: ${d.fix.action}`);
    if (d.fix.verify) lines.push(`확인: ${d.fix.verify}`);
    if (d.fix.rollback) lines.push(`되돌리기: ${d.fix.rollback}`);
  }
  const notVerified = list(d.not_verified);
  if (notVerified.length) lines.push('', '*확인하지 못한 것*', ...notVerified.map(n => `• ${n}`));
  return lines.join('\n');
}

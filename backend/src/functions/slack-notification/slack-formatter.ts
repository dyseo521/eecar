import { ParsedLogEvent } from './parser.js';
import { Severity, getSeverityColor, getSeverityEmoji } from './severity.js';

const AWS_REGION = 'ap-northeast-2';
const DASHBOARD_NAME = 'eecar-monitoring';

/**
 * AWS 콘솔 링크 생성 함수들
 */
function generateCloudWatchLogsUrl(logGroup: string): string {
  const encodedLogGroup = encodeURIComponent(logGroup);
  return `https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#logsV2:log-groups/log-group/${encodedLogGroup}`;
}

function generateXRayServiceMapUrl(): string {
  return `https://console.aws.amazon.com/xray/home?region=${AWS_REGION}#/service-map`;
}

function generateXRayTraceUrl(traceId: string): string {
  return `https://console.aws.amazon.com/xray/home?region=${AWS_REGION}#/traces/${traceId}`;
}

function generateCloudWatchDashboardUrl(): string {
  return `https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards:name=${DASHBOARD_NAME}`;
}

/** CloudWatch 경보가 Lambda를 직접 호출할 때의 이벤트 (필요한 필드만, DECISION_LOG A-45) */
export interface CloudWatchAlarmEvent {
  source?: string;
  alarmData: {
    alarmName: string;
    state: { value: string; reason?: string; timestamp?: string };
    previousState?: { value?: string };
    configuration?: { description?: string };
  };
}

/** 경보와 복구만 알린다. 데이터 부족 상태로 오가는 변화는 알리지 않는다 */
export function formatAlarmMessage(event: CloudWatchAlarmEvent): { text: string } | null {
  const { alarmName, state, previousState, configuration } = event.alarmData;
  if (state.value === 'ALARM') {
    const lines = [`:rotating_light: *CloudWatch 경보: ${alarmName}*`];
    if (configuration?.description) lines.push(configuration.description);
    if (state.reason) lines.push(`사유: ${state.reason.slice(0, 300)}`);
    return { text: lines.join('\n') };
  }
  if (state.value === 'OK' && previousState?.value === 'ALARM') {
    return { text: `:white_check_mark: *복구됨: ${alarmName}*` };
  }
  return null;
}

/**
 * Slack Block Kit 형식으로 메시지 포맷팅
 * - 레거시 attachments 대신 blocks 사용
 * - CloudWatch Logs, X-Ray, Dashboard 링크 버튼 제공
 */
export function formatSlackMessage(
  event: ParsedLogEvent,
  severity: Severity,
  logGroup: string,
  options: { suppressedSinceLastAlert?: number } = {}
): any {
  const color = getSeverityColor(severity);
  const emoji = getSeverityEmoji(severity);
  const timestamp = new Date(event.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  // 에러 메시지 포맷팅 (최대 300자)
  const truncatedMessage = event.errorMessage.length > 300
    ? `${event.errorMessage.slice(0, 297)}...`
    : event.errorMessage;

  // 스택 추적 포맷팅 (최대 500자)
  const truncatedStackTrace = event.stackTrace
    ? event.stackTrace.length > 500
      ? `${event.stackTrace.slice(0, 497)}...`
      : event.stackTrace
    : undefined;

  // URL 생성
  const logsUrl = generateCloudWatchLogsUrl(logGroup);
  const xrayUrl = event.xrayTraceId
    ? generateXRayTraceUrl(event.xrayTraceId)
    : generateXRayServiceMapUrl();
  const dashboardUrl = generateCloudWatchDashboardUrl();

  // Block Kit 형식 메시지 구성
  const blocks: any[] = [
    // 헤더
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${severity}: ${event.functionName}`,
        emoji: true,
      },
    },
    // 구분선
    { type: 'divider' },
    // 에러 정보 (2열 레이아웃)
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*에러 타입*\n${event.errorType}`,
        },
        {
          type: 'mrkdwn',
          text: `*발생 시간*\n${timestamp}`,
        },
      ],
    },
    // 에러 메시지
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*에러 메시지*\n\`\`\`${truncatedMessage}\`\`\``,
      },
    },
  ];

  // 직전 억제 구간에 묻힌 발생 횟수 (중복 제거로 알림이 생략된 건수)
  if (options.suppressedSinceLastAlert && options.suppressedSinceLastAlert > 0) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🔁 직전 알림 이후 같은 에러가 *${options.suppressedSinceLastAlert}회* 더 발생했습니다 (중복 제거로 알림 생략)`,
        },
      ],
    });
  }

  // 스택 추적 (있는 경우)
  if (truncatedStackTrace) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*스택 추적*\n\`\`\`${truncatedStackTrace}\`\`\``,
      },
    });
  }

  // Request ID
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `*Request ID:* \`${event.requestId}\`${event.xrayTraceId ? ` | *Trace ID:* \`${event.xrayTraceId}\`` : ''}`,
      },
    ],
  });

  // 구분선
  blocks.push({ type: 'divider' });

  // 액션 버튼 (CloudWatch Logs, X-Ray, Dashboard)
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📊 CloudWatch Logs',
          emoji: true,
        },
        url: logsUrl,
        action_id: 'cloudwatch_logs',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: event.xrayTraceId ? '🔍 X-Ray Trace' : '🔍 X-Ray Map',
          emoji: true,
        },
        url: xrayUrl,
        action_id: 'xray',
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📈 Dashboard',
          emoji: true,
        },
        url: dashboardUrl,
        action_id: 'dashboard',
      },
    ],
  });

  // Footer 컨텍스트
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `EECAR Lambda Monitoring | ${new Date().toISOString()}`,
      },
    ],
  });

  // Block Kit + 레거시 attachments 조합 (색상 표시용)
  return {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
}

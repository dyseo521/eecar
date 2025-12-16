import { ParsedLogEvent } from './parser.js';
import { Severity, getSeverityColor, getSeverityEmoji } from './severity.js';

export function formatSlackMessage(
  event: ParsedLogEvent,
  severity: Severity,
  logGroup: string
): any {
  const color = getSeverityColor(severity);
  const emoji = getSeverityEmoji(severity);

  // CloudWatch Logs 링크 생성
  const region = 'ap-northeast-2';
  const encodedLogGroup = encodeURIComponent(logGroup);
  const logsUrl = `https://console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodedLogGroup}`;

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

  const fields: any[] = [
    {
      title: '에러 타입',
      value: event.errorType,
      short: true,
    },
    {
      title: '발생 시간',
      value: new Date(event.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
      short: true,
    },
    {
      title: '에러 메시지',
      value: `\`\`\`${truncatedMessage}\`\`\``,
      short: false,
    },
  ];

  if (truncatedStackTrace) {
    fields.push({
      title: '스택 추적',
      value: `\`\`\`${truncatedStackTrace}\`\`\``,
      short: false,
    });
  }

  fields.push({
    title: 'Request ID',
    value: `\`${event.requestId}\``,
    short: true,
  });

  return {
    attachments: [
      {
        color,
        title: `${emoji} ${severity}: ${event.functionName}`,
        fields,
        actions: [
          {
            type: 'button',
            text: '📊 CloudWatch Logs 보기',
            url: logsUrl,
          },
        ],
        footer: 'EECAR Lambda Monitoring',
        ts: Math.floor(event.timestamp / 1000),
      },
    ],
  };
}

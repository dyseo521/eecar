import { CloudWatchLogsEvent } from 'aws-lambda';
import { gunzipSync } from 'zlib';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { parseLogEvent } from './parser.js';
import { classifySeverity } from './severity.js';
import { formatSlackMessage } from './slack-formatter.js';
import { checkDuplicate, recordError } from './deduplicator.js';

const ssmClient = new SSMClient({ region: 'ap-northeast-2' });
const SLACK_WEBHOOK_PARAM = process.env.SLACK_WEBHOOK_SSM_PARAM || '/eecar/slack/webhook-url';

let cachedWebhookUrl: string | null = null;

async function getSlackWebhookUrl(): Promise<string> {
  if (cachedWebhookUrl) {
    return cachedWebhookUrl;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: SLACK_WEBHOOK_PARAM,
      WithDecryption: true,
    })
  );

  const webhookUrl = response.Parameter?.Value || '';
  cachedWebhookUrl = webhookUrl;
  return webhookUrl;
}

export const handler = async (event: CloudWatchLogsEvent) => {
  try {
    // 1. Base64 + Gzip 압축 해제
    const payload = Buffer.from(event.awslogs.data, 'base64');
    const decompressed = gunzipSync(payload);
    const logData = JSON.parse(decompressed.toString('utf-8'));

    console.log(`Processing ${logData.logEvents.length} log events from ${logData.logGroup}`);

    // 2. 로그 이벤트 파싱
    const parsedEvents = logData.logEvents.map((logEvent: any) =>
      parseLogEvent(logEvent, logData.logGroup)
    );

    // 3. 에러 이벤트만 필터링
    const errorEvents = parsedEvents.filter((e: any) => e.isError);

    if (errorEvents.length === 0) {
      console.log('No error events found');
      return { statusCode: 200, body: 'No errors to process' };
    }

    console.log(`Found ${errorEvents.length} error events`);

    // 4. Webhook URL 조회
    const webhookUrl = await getSlackWebhookUrl();

    if (!webhookUrl) {
      console.error('Slack Webhook URL not found in Parameter Store');
      return { statusCode: 500, body: 'Webhook URL not configured' };
    }

    // 5. 각 에러에 대해 처리
    let sentCount = 0;
    for (const errorEvent of errorEvents) {
      // 5.1 중복 확인
      const isDuplicate = await checkDuplicate(errorEvent);
      if (isDuplicate) {
        console.log(`Duplicate error detected: ${errorEvent.errorHash}`);
        continue;
      }

      // 5.2 심각도 분류
      const severity = classifySeverity(errorEvent.functionName, errorEvent.errorType);

      // 5.3 Slack 메시지 생성
      const slackMessage = formatSlackMessage(errorEvent, severity, logData.logGroup);

      // 5.4 Slack 전송
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage),
      });

      if (!response.ok) {
        console.error(`Failed to send Slack notification: ${response.status} ${response.statusText}`);
      } else {
        console.log(`Sent ${severity} alert for ${errorEvent.functionName}: ${errorEvent.errorType}`);
        sentCount++;
      }

      // 5.5 중복 제거 레코드 저장
      await recordError(errorEvent);
    }

    console.log(`Successfully sent ${sentCount}/${errorEvents.length} notifications to Slack`);
    return { statusCode: 200, body: `Processed ${errorEvents.length} errors, sent ${sentCount} alerts` };
  } catch (error) {
    console.error('Failed to process CloudWatch Logs event:', error);
    throw error;
  }
};

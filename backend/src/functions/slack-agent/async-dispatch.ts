/**
 * Slack 이벤트를 즉시 응답하고 비동기로 처리한다 (C-13, DECISION_LOG A-36).
 *
 * 이전에는 ReAct 루프(평균 5~7초)를 끝낸 뒤 200을 돌려줘 Slack의 3초 제한을 넘겼다. Slack은 재시도를 보냈고,
 * 핸들러는 재시도를 서명 검증 전에 무조건 버렸다. 첫 요청이 콜드 스타트나 오류로 실패하면 그 이벤트는 유실됐다.
 * 이제 수신 경로는 서명 검증 → event_id 선점(DynamoDB 조건부 쓰기) → 같은 함수 비동기 호출 → 즉시 200 응답만 한다.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { SlackEvent } from './types.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-northeast-2' }));
const lambda = new LambdaClient({ region: 'ap-northeast-2' });

/** 중복 이벤트 기록 유지 시간. Slack 재시도는 수 분 안에 끝나므로 하루면 충분하다 (판단) */
export const EVENT_DEDUP_TTL_SECONDS = 24 * 60 * 60;

export type JadongJob =
  | { type: 'app_mention'; event: SlackEvent }
  | { type: 'slash_command'; event: SlackEvent };

/**
 * event_id를 처음 처리하는지 확인한다. 이미 있으면 false (Slack 재시도 또는 중복 전달).
 * 저장소 장애 시에는 처리를 막지 않는다 (fail open, 알림 중복 제거와 같은 판단, A-03).
 */
export async function claimSlackEvent(eventId: string, now = Date.now()): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: process.env.PARTS_TABLE_NAME,
      Item: {
        PK: `SLACKEVENT#${eventId}`,
        SK: 'DEDUP',
        createdAt: new Date(now).toISOString(),
        TTL: Math.floor(now / 1000) + EVENT_DEDUP_TTL_SECONDS,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    return true;
  } catch (error) {
    if ((error as { name?: string })?.name === 'ConditionalCheckFailedException') return false;
    console.error('Failed to claim Slack event, processing anyway:', error);
    return true;
  }
}

/** 같은 Lambda를 비동기(Event)로 호출해 실제 처리를 넘긴다 */
export async function dispatchJob(job: JadongJob): Promise<void> {
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName) throw new Error('AWS_LAMBDA_FUNCTION_NAME is not set');
  await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({ jadongJob: job })),
  }));
}

export function isJobEvent(event: unknown): event is { jadongJob: JadongJob } {
  return typeof event === 'object' && event !== null && 'jadongJob' in event;
}

/** 슬래시 커맨드 결과를 response_url로 보낸다 (3초 제한이 없는 지연 응답) */
export async function postToResponseUrl(responseUrl: string, message: unknown): Promise<void> {
  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) console.error('response_url post failed:', res.status);
}

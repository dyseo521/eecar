import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { ParsedLogEvent } from './parser.js';

const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-2' });
const TABLE_NAME = process.env.PARTS_TABLE_NAME || 'eecar-parts-table';
const DEDUP_WINDOW_SECONDS = 5 * 60; // 5분

export interface AlertSlot {
  /** 이번 발생에 대해 Slack 알림을 보낼지 여부 */
  shouldAlert: boolean;
  /** 직전 억제 구간에서 알림 없이 묻힌 발생 횟수 (알림 메시지에 표시) */
  suppressedSinceLastAlert: number;
}

function dedupKey(event: ParsedLogEvent) {
  return {
    PK: { S: `ERROR_DEDUP#${event.errorHash}` },
    SK: { S: 'LATEST' },
  };
}

/**
 * 알림 슬롯을 원자적으로 확보한다.
 *
 * 이전 구현은 GetItem으로 확인한 뒤 PutItem으로 기록해서, 같은 에러가 동시에 여러
 * Lambda 실행으로 들어오면 모두 "첫 발생"으로 판단해 중복 알림이 나갔다.
 * 조건부 PutItem 한 번으로 판정해 억제 구간(5분)마다 정확히 한 번만 알림을 보낸다.
 * 억제되는 동안 늘린 Count는 다음 알림을 보낼 때 ALL_OLD로 읽어 "N회 추가 발생"으로 보고한다.
 */
export async function acquireAlertSlot(
  event: ParsedLogEvent,
  now: number = Math.floor(Date.now() / 1000)
): Promise<AlertSlot> {
  try {
    const response = await dynamoClient.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          ...dedupKey(event),
          FunctionName: { S: event.functionName },
          ErrorType: { S: event.errorType },
          ErrorMessage: { S: event.errorMessage },
          FirstOccurrence: { N: now.toString() },
          LastOccurrence: { N: now.toString() },
          Count: { N: '1' },
          TTL: { N: (now + DEDUP_WINDOW_SECONDS).toString() },
        },
        // TTL 삭제는 지연되므로 만료 여부를 직접 비교한다
        ConditionExpression: 'attribute_not_exists(PK) OR #ttl < :now',
        ExpressionAttributeNames: { '#ttl': 'TTL' },
        ExpressionAttributeValues: { ':now': { N: now.toString() } },
        ReturnValues: 'ALL_OLD',
      })
    );

    const previousCount = Number(response.Attributes?.Count?.N ?? '0');
    return {
      shouldAlert: true,
      suppressedSinceLastAlert: Math.max(previousCount - 1, 0),
    };
  } catch (error) {
    if ((error as { name?: string })?.name === 'ConditionalCheckFailedException') {
      await recordSuppressed(event, now);
      return { shouldAlert: false, suppressedSinceLastAlert: 0 };
    }

    // 중복 제거 저장소 장애 시에는 알림을 막지 않는다 (fail open)
    console.error('Failed to acquire alert slot:', error);
    return { shouldAlert: true, suppressedSinceLastAlert: 0 };
  }
}

async function recordSuppressed(event: ParsedLogEvent, now: number): Promise<void> {
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: dedupKey(event),
        UpdateExpression: 'ADD #count :inc SET LastOccurrence = :now',
        ExpressionAttributeNames: { '#count': 'Count' },
        ExpressionAttributeValues: {
          ':inc': { N: '1' },
          ':now': { N: now.toString() },
        },
      })
    );
  } catch (error) {
    console.error('Failed to record suppressed error:', error);
  }
}

/**
 * Slack 전송이 실패하면 슬롯을 반납해 다음 발생 때 다시 알림을 시도하게 한다.
 */
export async function releaseAlertSlot(event: ParsedLogEvent): Promise<void> {
  try {
    await dynamoClient.send(new DeleteItemCommand({ TableName: TABLE_NAME, Key: dedupKey(event) }));
  } catch (error) {
    console.error('Failed to release alert slot:', error);
  }
}

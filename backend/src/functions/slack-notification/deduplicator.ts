import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { ParsedLogEvent } from './parser.js';

const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-2' });
const TABLE_NAME = process.env.PARTS_TABLE_NAME || 'eecar-parts-table';
const DEDUP_WINDOW_SECONDS = 5 * 60; // 5분

export async function checkDuplicate(event: ParsedLogEvent): Promise<boolean> {
  try {
    const response = await dynamoClient.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: `ERROR_DEDUP#${event.errorHash}` },
          SK: { S: 'LATEST' },
        },
      })
    );

    if (!response.Item) {
      return false; // 첫 발생
    }

    // TTL 확인 (5분 이내인지)
    const ttl = parseInt(response.Item.TTL?.N || '0', 10);
    const now = Math.floor(Date.now() / 1000);

    if (now > ttl) {
      return false; // TTL 만료됨 (5분 경과)
    }

    // 중복 발견 - 카운터 증가
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: { S: `ERROR_DEDUP#${event.errorHash}` },
          SK: { S: 'LATEST' },
        },
        UpdateExpression: 'SET #count = #count + :inc, LastOccurrence = :now',
        ExpressionAttributeNames: {
          '#count': 'Count',
        },
        ExpressionAttributeValues: {
          ':inc': { N: '1' },
          ':now': { N: now.toString() },
        },
      })
    );

    console.log(`Duplicate error (hash: ${event.errorHash}), incrementing counter`);
    return true; // 중복
  } catch (error) {
    console.error('Failed to check duplicate:', error);
    return false; // 에러 시 알림 허용 (안전한 실패)
  }
}

export async function recordError(event: ParsedLogEvent): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const ttl = now + DEDUP_WINDOW_SECONDS;

    await dynamoClient.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: { S: `ERROR_DEDUP#${event.errorHash}` },
          SK: { S: 'LATEST' },
          FunctionName: { S: event.functionName },
          ErrorType: { S: event.errorType },
          ErrorMessage: { S: event.errorMessage },
          FirstOccurrence: { N: now.toString() },
          LastOccurrence: { N: now.toString() },
          Count: { N: '1' },
          TTL: { N: ttl.toString() },
        },
      })
    );

    console.log(`Recorded new error (hash: ${event.errorHash}, TTL: ${ttl})`);
  } catch (error) {
    console.error('Failed to record error:', error);
    // 중복 제거 실패 시에도 알림은 전송됨 (이미 전송 완료)
  }
}

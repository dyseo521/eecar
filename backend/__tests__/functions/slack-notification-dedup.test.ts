import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import type { ParsedLogEvent } from '../../src/functions/slack-notification/parser.js';
import { acquireAlertSlot, releaseAlertSlot } from '../../src/functions/slack-notification/deduplicator.js';
import { formatSlackMessage } from '../../src/functions/slack-notification/slack-formatter.js';

const ddbMock = mockClient(DynamoDBClient);

const VECTOR_SEARCH_LOG_GROUP = '/aws/lambda/eecar-stack-VectorSearchFunction-yXyHE1D702wX';

function makeEvent(overrides: Partial<ParsedLogEvent> = {}): ParsedLogEvent {
  return {
    functionName: 'eecar-stack-VectorSearchFunction-yXyHE1D702wX',
    requestId: 'req-1',
    errorType: 'GenericError',
    errorMessage: 'boom',
    timestamp: Date.UTC(2026, 10, 5),
    isError: true,
    errorHash: 'hash-1',
    ...overrides,
  };
}

describe('acquireAlertSlot', () => {
  beforeEach(() => ddbMock.reset());

  it('alerts on the first occurrence using a conditional write', async () => {
    ddbMock.on(PutItemCommand).resolves({});

    const slot = await acquireAlertSlot(makeEvent(), 1_000);

    expect(slot).toEqual({ shouldAlert: true, suppressedSinceLastAlert: 0 });
    const put = ddbMock.commandCalls(PutItemCommand)[0].args[0].input;
    expect(put.ConditionExpression).toBe('attribute_not_exists(PK) OR #ttl < :now');
    expect(put.Item?.TTL?.N).toBe(String(1_000 + 300));
  });

  it('reports how many occurrences were suppressed in the previous window', async () => {
    // 만료된 이전 레코드: 알림 1회 + 억제 4회
    ddbMock.on(PutItemCommand).resolves({ Attributes: { Count: { N: '5' } } });

    const slot = await acquireAlertSlot(makeEvent(), 2_000);

    expect(slot).toEqual({ shouldAlert: true, suppressedSinceLastAlert: 4 });
  });

  it('suppresses duplicates inside the window and counts them atomically', async () => {
    ddbMock
      .on(PutItemCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'exists', $metadata: {} }));
    ddbMock.on(UpdateItemCommand).resolves({});

    const slot = await acquireAlertSlot(makeEvent(), 1_100);

    expect(slot.shouldAlert).toBe(false);
    const update = ddbMock.commandCalls(UpdateItemCommand)[0].args[0].input;
    expect(update.UpdateExpression).toContain('ADD #count :inc');
  });

  it('fails open when the dedup store is unavailable', async () => {
    ddbMock.on(PutItemCommand).rejects(new Error('DynamoDB unavailable'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const slot = await acquireAlertSlot(makeEvent(), 1_000);

    expect(slot.shouldAlert).toBe(true);
    consoleError.mockRestore();
  });

  it('releases the slot so a failed Slack delivery is retried on the next occurrence', async () => {
    ddbMock.on(DeleteItemCommand).resolves({});

    await releaseAlertSlot(makeEvent());

    const del = ddbMock.commandCalls(DeleteItemCommand)[0].args[0].input;
    expect(del.Key?.PK?.S).toBe('ERROR_DEDUP#hash-1');
  });
});

describe('formatSlackMessage', () => {
  function allText(message: { attachments: Array<{ blocks: unknown[] }> }): string {
    return JSON.stringify(message.attachments[0].blocks);
  }

  it('shows the suppressed count when duplicates were collapsed', () => {
    const message = formatSlackMessage(makeEvent(), 'CRITICAL', VECTOR_SEARCH_LOG_GROUP, {
      suppressedSinceLastAlert: 4,
    });
    expect(allText(message)).toContain('*4회*');
  });

  it('omits the suppressed count when nothing was suppressed', () => {
    const message = formatSlackMessage(makeEvent(), 'CRITICAL', VECTOR_SEARCH_LOG_GROUP);
    expect(allText(message)).not.toContain('중복 제거로 알림 생략');
  });
});

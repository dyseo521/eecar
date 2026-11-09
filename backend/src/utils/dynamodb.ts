import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const ddbDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.PARTS_TABLE_NAME!;

export interface DynamoDBItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  TTL?: number;
  [key: string]: any;
}

/**
 * Get a single item from DynamoDB
 */
export async function getItem(pk: string, sk: string): Promise<DynamoDBItem | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
  });

  const response = await ddbDocClient.send(command);
  return response.Item as DynamoDBItem || null;
}

/**
 * Put an item into DynamoDB
 */
export async function putItem(item: DynamoDBItem): Promise<void> {
  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
  });

  await ddbDocClient.send(command);
}

/**
 * Query items by partition key
 */
export async function queryByPK(pk: string, skPrefix?: string): Promise<DynamoDBItem[]> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: skPrefix
      ? 'PK = :pk AND begins_with(SK, :sk)'
      : 'PK = :pk',
    ExpressionAttributeValues: skPrefix
      ? { ':pk': pk, ':sk': skPrefix }
      : { ':pk': pk },
  });

  const response = await ddbDocClient.send(command);
  return response.Items as DynamoDBItem[] || [];
}

/**
 * Query GSI1
 */
export async function queryGSI1(gsi1pk: string, gsi1skPrefix?: string, limit?: number): Promise<DynamoDBItem[]> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: gsi1skPrefix
      ? 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)'
      : 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: gsi1skPrefix
      ? { ':gsi1pk': gsi1pk, ':gsi1sk': gsi1skPrefix }
      : { ':gsi1pk': gsi1pk },
    Limit: limit,
    ScanIndexForward: false, // Descending order (newest first)
  });

  const response = await ddbDocClient.send(command);
  return response.Items as DynamoDBItem[] || [];
}

/**
 * Update item attributes
 */
export async function updateItem(
  pk: string,
  sk: string,
  updates: Record<string, any>
): Promise<void> {
  const updateExpression: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  Object.keys(updates).forEach((key, index) => {
    const placeholder = `#attr${index}`;
    const valuePlaceholder = `:val${index}`;
    updateExpression.push(`${placeholder} = ${valuePlaceholder}`);
    expressionAttributeNames[placeholder] = key;
    expressionAttributeValues[valuePlaceholder] = updates[key];
  });

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
    UpdateExpression: `SET ${updateExpression.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  });

  await ddbDocClient.send(command);
}

/**
 * 숫자 속성을 원자적으로 올린다 (읽고 덮어쓰지 않으므로 동시 요청이 값을 잃지 않는다)
 */
export async function incrementAttribute(pk: string, sk: string, attribute: string, by = 1): Promise<void> {
  await ddbDocClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
    UpdateExpression: 'ADD #attr :by',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeNames: { '#attr': attribute },
    ExpressionAttributeValues: { ':by': by },
  }));
}

/**
 * 상한이 있는 카운터를 원자적으로 1 올린다. 항목이 없으면 만든다.
 * 이미 상한에 도달했으면 false를 돌려준다.
 */
export async function incrementWithinLimit(pk: string, sk: string, limit: number, ttl: number): Promise<boolean> {
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: 'ADD #count :one SET #ttl = :ttl',
      ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'TTL' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': ttl, ':limit': limit },
    }));
    return true;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}

/**
 * Batch get items
 */
const BATCH_GET_MAX_KEYS = 100; // DynamoDB BatchGetItem hard limit
const BATCH_GET_MAX_ATTEMPTS = 4;

/**
 * Batch get items.
 * Splits into chunks of 100 keys and retries UnprocessedKeys with backoff,
 * which BatchGetItem returns instead of throwing when it is throttled.
 */
export async function batchGetItems(keys: Array<{ pk: string; sk: string }>): Promise<DynamoDBItem[]> {
  const results: DynamoDBItem[] = [];

  for (let i = 0; i < keys.length; i += BATCH_GET_MAX_KEYS) {
    let pending: Record<string, unknown>[] = keys
      .slice(i, i + BATCH_GET_MAX_KEYS)
      .map(k => ({ PK: k.pk, SK: k.sk }));

    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt >= BATCH_GET_MAX_ATTEMPTS) {
        throw new Error(`BatchGetItem left ${pending.length} keys unprocessed after ${BATCH_GET_MAX_ATTEMPTS} attempts`);
      }
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt));
      }

      const response = await ddbDocClient.send(new BatchGetCommand({
        RequestItems: { [TABLE_NAME]: { Keys: pending } },
      }));

      results.push(...((response.Responses?.[TABLE_NAME] as DynamoDBItem[]) || []));
      pending = (response.UnprocessedKeys?.[TABLE_NAME]?.Keys as Record<string, unknown>[]) || [];
    }
  }

  return results;
}

export interface PaginatedResult {
  items: DynamoDBItem[];
  lastKey: Record<string, any> | null;
}

/**
 * Query GSI1 with pagination support
 * Returns items in descending order (newest first) by default
 */
export async function queryGSI1WithPagination(
  gsi1pk: string,
  gsi1skPrefix: string,
  limit: number,
  exclusiveStartKey?: Record<string, any>,
  scanIndexForward: boolean = false // false = descending (newest first)
): Promise<PaginatedResult> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: gsi1skPrefix
      ? 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)'
      : 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: gsi1skPrefix
      ? { ':gsi1pk': gsi1pk, ':gsi1sk': gsi1skPrefix }
      : { ':gsi1pk': gsi1pk },
    Limit: limit,
    ScanIndexForward: scanIndexForward,
    ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
  });

  const response = await ddbDocClient.send(command);
  return {
    items: response.Items as DynamoDBItem[] || [],
    lastKey: response.LastEvaluatedKey || null,
  };
}

/**
 * Query GSI2 for all METADATA items with pagination support
 * Uses GSI2 (GSI2PK='ALL#METADATA') for efficient full-table query
 * Returns items in descending order (newest first) by default
 */
export async function queryAllMetadataWithPagination(
  limit: number,
  exclusiveStartKey?: Record<string, any>,
  scanIndexForward: boolean = false // false = descending (newest first)
): Promise<PaginatedResult> {
  const command = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk',
    ExpressionAttributeValues: { ':gsi2pk': 'ALL#METADATA' },
    Limit: limit,
    ScanIndexForward: scanIndexForward,
    ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
  });

  const response = await ddbDocClient.send(command);
  return {
    items: response.Items as DynamoDBItem[] || [],
    lastKey: response.LastEvaluatedKey || null,
  };
}

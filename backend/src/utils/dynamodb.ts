import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, BatchGetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

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
 * Batch get items
 */
export async function batchGetItems(keys: Array<{ pk: string; sk: string }>): Promise<DynamoDBItem[]> {
  if (keys.length === 0) return [];

  const command = new BatchGetCommand({
    RequestItems: {
      [TABLE_NAME]: {
        Keys: keys.map(k => ({ PK: k.pk, SK: k.sk })),
      },
    },
  });

  const response = await ddbDocClient.send(command);
  return response.Responses?.[TABLE_NAME] as DynamoDBItem[] || [];
}

/**
 * Scan table with optional filter
 */
export async function scanTable(filterExpression?: string, expressionAttributeValues?: Record<string, any>, limit?: number): Promise<DynamoDBItem[]> {
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    ...(filterExpression && { FilterExpression: filterExpression }),
    ...(expressionAttributeValues && { ExpressionAttributeValues: expressionAttributeValues }),
    ...(limit && { Limit: limit }),
  });

  const response = await ddbDocClient.send(command);
  return response.Items as DynamoDBItem[] || [];
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
 * Scan table with pagination support
 * Returns METADATA items only, sorted by createdAt descending
 */
export async function scanTableWithPagination(
  limit: number,
  exclusiveStartKey?: Record<string, any>
): Promise<PaginatedResult> {
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'SK = :sk',
    ExpressionAttributeValues: { ':sk': 'METADATA' },
    Limit: limit * 5, // Scan more to account for filtering
    ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
  });

  const response = await ddbDocClient.send(command);
  const items = response.Items as DynamoDBItem[] || [];

  // Sort by createdAt descending
  items.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  return {
    items: items.slice(0, limit),
    lastKey: response.LastEvaluatedKey || null,
  };
}

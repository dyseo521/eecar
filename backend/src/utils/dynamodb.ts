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

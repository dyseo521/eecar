import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  getItem,
  putItem,
  queryByPK,
  queryGSI1,
  updateItem,
  queryGSI1WithPagination,
  queryAllMetadataWithPagination,
} from '../../src/utils/dynamodb.js';

const docMock = mockClient(DynamoDBDocumentClient);
const TABLE = 'eecar-parts-table-test';

beforeEach(() => docMock.reset());

describe('getItem / putItem', () => {
  it('returns the item or null', async () => {
    docMock.on(GetCommand).resolvesOnce({ Item: { PK: 'PART#1', SK: 'METADATA' } }).resolvesOnce({});

    await expect(getItem('PART#1', 'METADATA')).resolves.toEqual({ PK: 'PART#1', SK: 'METADATA' });
    await expect(getItem('PART#2', 'METADATA')).resolves.toBeNull();
    expect(docMock.commandCalls(GetCommand)[0].args[0].input).toEqual({
      TableName: TABLE,
      Key: { PK: 'PART#1', SK: 'METADATA' },
    });
  });

  it('writes the item to the parts table', async () => {
    docMock.on(PutCommand).resolves({});
    await putItem({ PK: 'PART#1', SK: 'METADATA', name: 'x' });
    expect(docMock.commandCalls(PutCommand)[0].args[0].input).toEqual({
      TableName: TABLE,
      Item: { PK: 'PART#1', SK: 'METADATA', name: 'x' },
    });
  });
});

describe('queryByPK', () => {
  it('adds a begins_with condition only when a sort key prefix is given', async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    await queryByPK('PART#1');
    await queryByPK('PART#1', 'USAGE#');

    const [all, prefixed] = docMock.commandCalls(QueryCommand).map(c => c.args[0].input);
    expect(all.KeyConditionExpression).toBe('PK = :pk');
    expect(prefixed.KeyConditionExpression).toBe('PK = :pk AND begins_with(SK, :sk)');
    expect(prefixed.ExpressionAttributeValues).toEqual({ ':pk': 'PART#1', ':sk': 'USAGE#' });
  });

  it('returns an empty array when DynamoDB returns no Items', async () => {
    docMock.on(QueryCommand).resolves({});
    await expect(queryByPK('PART#none')).resolves.toEqual([]);
  });
});

describe('queryGSI1', () => {
  it('queries newest first with an optional prefix and limit', async () => {
    docMock.on(QueryCommand).resolves({ Items: [{ PK: 'P#1', SK: 'S' }] });

    await expect(queryGSI1('COMPANY#c1', 'PROPOSAL#', 50)).resolves.toHaveLength(1);
    await queryGSI1('COMPANY#c1');

    const [prefixed, plain] = docMock.commandCalls(QueryCommand).map(c => c.args[0].input);
    expect(prefixed).toMatchObject({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)',
      Limit: 50,
      ScanIndexForward: false,
    });
    expect(plain.KeyConditionExpression).toBe('GSI1PK = :gsi1pk');
  });
});

describe('updateItem', () => {
  it('builds a SET expression with placeholders for every attribute', async () => {
    docMock.on(UpdateCommand).resolves({});

    await updateItem('PART#1', 'METADATA', { price: 100, status: 'sold' });

    expect(docMock.commandCalls(UpdateCommand)[0].args[0].input).toEqual({
      TableName: TABLE,
      Key: { PK: 'PART#1', SK: 'METADATA' },
      UpdateExpression: 'SET #attr0 = :val0, #attr1 = :val1',
      ExpressionAttributeNames: { '#attr0': 'price', '#attr1': 'status' },
      ExpressionAttributeValues: { ':val0': 100, ':val1': 'sold' },
    });
  });
});

describe('paginated queries', () => {
  it('passes the cursor through and returns the next key', async () => {
    docMock.on(QueryCommand).resolves({ Items: [{ PK: 'PART#1', SK: 'METADATA' }], LastEvaluatedKey: { PK: 'PART#1' } });

    const page = await queryGSI1WithPagination('CATEGORY#battery', 'CREATED_AT#', 20, { PK: 'PART#0' });

    expect(page.lastKey).toEqual({ PK: 'PART#1' });
    expect(docMock.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({
      IndexName: 'GSI1',
      Limit: 20,
      ExclusiveStartKey: { PK: 'PART#0' },
    });
  });

  it('omits the begins_with condition when the GSI1 prefix is empty', async () => {
    docMock.on(QueryCommand).resolves({});

    const page = await queryGSI1WithPagination('CATEGORY#battery', '', 20);

    expect(page).toEqual({ items: [], lastKey: null });
    expect(docMock.commandCalls(QueryCommand)[0].args[0].input.KeyConditionExpression).toBe('GSI1PK = :gsi1pk');
  });

  it('queries all METADATA items through GSI2', async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    const page = await queryAllMetadataWithPagination(10, undefined, true);

    expect(page.lastKey).toBeNull();
    expect(docMock.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({
      IndexName: 'GSI2',
      ExpressionAttributeValues: { ':gsi2pk': 'ALL#METADATA' },
      ScanIndexForward: true,
    });
  });
});

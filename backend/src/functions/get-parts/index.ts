import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { queryByPK, queryGSI1WithPagination, queryAllMetadataWithPagination } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

/**
 * Get Parts Lambda Function
 * Retrieve part information by ID or list parts with pagination
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { pathParameters, queryStringParameters } = event;

    // Get single part by ID
    if (pathParameters?.id) {
      return await getPartById(pathParameters.id, event);
    }

    // List parts (with pagination and filters)
    return await listParts(queryStringParameters || {}, event);
  } catch (error: any) {
    console.error('Error in get-parts:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * Get single part with all related data
 */
async function getPartById(partId: string, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Fetch all records for this part
  const records = await queryByPK(`PART#${partId}`);

  if (records.length === 0) {
    return errorResponse('Part not found', undefined, 404, event);
  }

  // Organize data
  const metadata = records.find(r => r.SK === 'METADATA');
  const spec = records.find(r => r.SK === 'SPEC');
  const vector = records.find(r => r.SK === 'VECTOR');
  const useCases = records.filter(r => r.SK.startsWith('USAGE#'));

  return successResponse({
    partId,
    ...metadata,
    specifications: spec || null,
    vector: vector || null,
    useCases: useCases.map(uc => {
      // PK, SK는 내부 키이므로 응답에서 제외
      const { PK: _PK, SK: _SK, ...data } = uc;
      return data;
    }),
  }, 200, event);
}

/**
 * List parts with pagination and filters
 * Supports cursor-based pagination for infinite scroll
 */
async function listParts(params: any, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { category, limit = 20, cursor } = params;
  const parsedLimit = parseInt(limit);

  // Decode cursor if provided
  let exclusiveStartKey: Record<string, any> | undefined;
  if (cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch {
      return errorResponse('Invalid cursor', undefined, 400, event);
    }
  }

  let result;

  if (category) {
    // Query by category using GSI with pagination (newest first)
    result = await queryGSI1WithPagination(
      `CATEGORY#${category}`,
      'CREATED_AT#',
      parsedLimit,
      exclusiveStartKey,
      false // ScanIndexForward = false for descending order
    );
  } else {
    // Query all METADATA records using GSI2 with pagination (newest first)
    result = await queryAllMetadataWithPagination(parsedLimit, exclusiveStartKey, false);
  }

  // Format the response
  // DynamoDB 내부 키들은 응답에서 제외
  const metadata = result.items.map(p => {
    const { PK, SK: _SK, GSI1PK: _GSI1PK, GSI1SK: _GSI1SK, GSI2PK: _GSI2PK, GSI2SK: _GSI2SK, ...data } = p;
    return {
      partId: PK.split('#')[1],
      ...data,
    };
  });

  // Encode next cursor
  const nextCursor = result.lastKey
    ? Buffer.from(JSON.stringify(result.lastKey)).toString('base64')
    : null;

  return successResponse({
    parts: metadata,
    count: metadata.length,
    nextCursor,
  }, 200, event);
}

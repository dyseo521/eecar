import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getItem, queryByPK, queryGSI1 } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

/**
 * Get Parts Lambda Function
 * Retrieve part information by ID or list parts
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { pathParameters, queryStringParameters } = event;

    // Get single part by ID
    if (pathParameters?.id) {
      return await getPartById(pathParameters.id, event);
    }

    // List parts (with filters)
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
      const { PK, SK, ...data } = uc;
      return data;
    }),
  }, 200, event);
}

/**
 * List parts with filters
 */
async function listParts(params: any, event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { category, limit = 20 } = params;

  let parts = [];

  if (category) {
    // Query by category
    parts = await queryGSI1(`CATEGORY#${category}`, 'CREATED_AT#', parseInt(limit));
  } else {
    // For now, return empty (in production, implement pagination or default category)
    return errorResponse('Category filter is required', undefined, 400, event);
  }

  // Filter to only metadata records
  const metadata = parts.map(p => {
    const { PK, SK, GSI1PK, GSI1SK, ...data } = p;
    return {
      partId: PK.split('#')[1],
      ...data,
    };
  });

  return successResponse({
    parts: metadata,
    count: metadata.length,
  }, 200, event);
}

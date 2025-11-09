import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getItem, queryByPK, queryGSI1 } from '../../utils/dynamodb';

/**
 * Get Parts Lambda Function
 * Retrieve part information by ID or list parts
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { pathParameters, queryStringParameters } = event;

    // Get single part by ID
    if (pathParameters?.id) {
      return await getPartById(pathParameters.id);
    }

    // List parts (with filters)
    return await listParts(queryStringParameters || {});
  } catch (error: any) {
    console.error('Error in get-parts:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
}

/**
 * Get single part with all related data
 */
async function getPartById(partId: string): Promise<APIGatewayProxyResult> {
  // Fetch all records for this part
  const records = await queryByPK(`PART#${partId}`);

  if (records.length === 0) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Part not found' }),
    };
  }

  // Organize data
  const metadata = records.find(r => r.SK === 'METADATA');
  const spec = records.find(r => r.SK === 'SPEC');
  const vector = records.find(r => r.SK === 'VECTOR');
  const useCases = records.filter(r => r.SK.startsWith('USAGE#'));

  return {
    statusCode: 200,
    body: JSON.stringify({
      partId,
      ...metadata,
      specifications: spec || null,
      vector: vector || null,
      useCases: useCases.map(uc => {
        const { PK, SK, ...data } = uc;
        return data;
      }),
    }),
  };
}

/**
 * List parts with filters
 */
async function listParts(params: any): Promise<APIGatewayProxyResult> {
  const { category, limit = 20 } = params;

  let parts = [];

  if (category) {
    // Query by category
    parts = await queryGSI1(`CATEGORY#${category}`, 'CREATED_AT#', parseInt(limit));
  } else {
    // For now, return empty (in production, implement pagination or default category)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Category filter is required' }),
    };
  }

  // Filter to only metadata records
  const metadata = parts.map(p => {
    const { PK, SK, GSI1PK, GSI1SK, ...data } = p;
    return {
      partId: PK.split('#')[1],
      ...data,
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      parts: metadata,
      count: metadata.length,
    }),
  };
}

import { APIGatewayProxyResult, APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Allowed origins for CORS
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://dyseo521-eecar-demo-web-service-12234628.s3-website.ap-northeast-2.amazonaws.com',
  'https://d1kv6iduk9u0pi.cloudfront.net',
  // Add your CloudFront or custom domain here when deployed
];

/**
 * Get CORS headers based on request origin
 */
function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]; // Default to localhost for development

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'false',
    'Content-Type': 'application/json',
  };
}

/**
 * Create a success response with CORS headers
 */
export function successResponse(
  data: any,
  statusCode: number = 200,
  event?: APIGatewayProxyEvent
): APIGatewayProxyResult {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return {
    statusCode,
    headers: getCorsHeaders(origin),
    body: JSON.stringify(data),
  };
}

/**
 * Create an error response with CORS headers
 */
export function errorResponse(
  error: string,
  message?: string,
  statusCode: number = 500,
  event?: APIGatewayProxyEvent
): APIGatewayProxyResult {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return {
    statusCode,
    headers: getCorsHeaders(origin),
    body: JSON.stringify({
      error,
      ...(message && { message }),
    }),
  };
}

export type ParsedBody<T> =
  | { ok: true; body: T }
  | { ok: false; response: APIGatewayProxyResult };

/**
 * Parse a JSON object request body.
 * Malformed input is a client error (400), not a server error: returning 500 here
 * made bad requests show up as Lambda errors and fire Slack alerts.
 */
export function parseJsonBody<T = Record<string, any>>(event: APIGatewayProxyEvent): ParsedBody<T> {
  if (!event.body) {
    return { ok: true, body: {} as T };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    return { ok: false, response: errorResponse('Invalid JSON body', undefined, 400, event) };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, response: errorResponse('Request body must be a JSON object', undefined, 400, event) };
  }

  return { ok: true, body: parsed as T };
}

/**
 * Create a response with custom status code and CORS headers
 */
export function customResponse(
  statusCode: number,
  body: any,
  event?: APIGatewayProxyEvent
): APIGatewayProxyResult {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  return {
    statusCode,
    headers: getCorsHeaders(origin),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { putItem, queryGSI1 } from '../../utils/dynamodb';

const snsClient = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

/**
 * Proposal Lambda Function
 * Handle B2B contract proposals
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;

    if (method === 'POST') {
      return await createProposal(event);
    } else if (method === 'GET') {
      return await getProposals(event);
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error: any) {
    console.error('Error in proposal:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
}

/**
 * Create a new proposal
 */
async function createProposal(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}');
  const {
    fromCompanyId,
    toCompanyId,
    partIds,
    proposalType,
    message,
    quantity,
    priceOffer,
    terms,
  } = body;

  // Validation
  if (!fromCompanyId || !toCompanyId || !partIds || !proposalType) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Missing required fields: fromCompanyId, toCompanyId, partIds, proposalType',
      }),
    };
  }

  const proposalId = uuidv4();
  const timestamp = new Date().toISOString();

  console.log('Creating proposal:', proposalId);

  // Store proposal
  await putItem({
    PK: `PROPOSAL#${proposalId}`,
    SK: 'METADATA',
    fromCompanyId,
    toCompanyId,
    partIds,
    proposalType,
    message: message || '',
    quantity: quantity || 1,
    priceOffer: priceOffer || 0,
    terms: terms || {},
    status: 'pending',
    createdAt: timestamp,
    GSI1PK: `COMPANY#${toCompanyId}`,
    GSI1SK: `STATUS#pending#CREATED#${timestamp}`,
  });

  // Send notification
  await sendProposalNotification(toCompanyId, proposalType, partIds);

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Proposal created successfully',
      proposalId,
    }),
  };
}

/**
 * Get proposals for a company
 */
async function getProposals(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const { companyId, status } = event.queryStringParameters || {};

  if (!companyId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'companyId is required' }),
    };
  }

  const skPrefix = status ? `STATUS#${status}#` : undefined;
  const proposals = await queryGSI1(`COMPANY#${companyId}`, skPrefix, 50);

  const results = proposals.map(p => {
    const { PK, SK, GSI1PK, GSI1SK, ...data } = p;
    return {
      proposalId: PK.split('#')[1],
      ...data,
    };
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      proposals: results,
      count: results.length,
    }),
  };
}

/**
 * Send proposal notification
 */
async function sendProposalNotification(
  toCompanyId: string,
  proposalType: string,
  partIds: string[]
): Promise<void> {
  const typeText = proposalType === 'buy' ? '구매' : '판매';
  const message = `
[EECAR 계약 제안 도착]

회사 ID: ${toCompanyId}
제안 유형: ${typeText} 제안
관련 부품: ${partIds.length}개

자세한 내용은 플랫폼에서 확인해주세요.
  `.trim();

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `[EECAR] ${typeText} 제안이 도착했습니다`,
        Message: message,
      })
    );
  } catch (error) {
    console.error('Failed to send proposal notification:', error);
  }
}

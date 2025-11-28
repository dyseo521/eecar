import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { putItem, queryGSI1 } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

const snsClient = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

/**
 * Watch Part Lambda Function
 * Register alerts for desired parts
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { buyerId, email, phone, criteria } = body;

    // Validation
    if (!buyerId || !criteria) {
      return errorResponse('Missing required fields: buyerId, criteria', undefined, 400, event);
    }

    if (!email && !phone) {
      return errorResponse('At least one contact method (email or phone) is required', undefined, 400, event);
    }

    const watchId = uuidv4();
    const timestamp = new Date().toISOString();

    console.log('Creating watch:', watchId);

    // Store watch
    await putItem({
      PK: `WATCH#${watchId}`,
      SK: 'METADATA',
      buyerId,
      email: email || '',
      phone: phone || '',
      criteria,
      status: 'active',
      createdAt: timestamp,
      GSI1PK: `BUYER#${buyerId}`,
      GSI1SK: `STATUS#active#CREATED#${timestamp}`,
    });

    // Send confirmation
    await sendWatchConfirmation(email, criteria);

    return successResponse({
      message: 'Watch created successfully',
      watchId,
    }, 201, event);
  } catch (error: any) {
    console.error('Error in watch-part:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * Send watch confirmation notification
 */
async function sendWatchConfirmation(email: string, criteria: any): Promise<void> {
  if (!email) return;

  const message = `
[EECAR 알림 등록 완료]

다음 조건에 맞는 부품이 등록되면 알려드리겠습니다:
- 카테고리: ${criteria.category || '전체'}
- 최대 가격: ${criteria.maxPrice ? `${criteria.maxPrice}원` : '제한 없음'}
- 기타 조건: ${JSON.stringify(criteria.minSpecs || {}, null, 2)}

감사합니다.
  `.trim();

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: '[EECAR] 알림 등록 완료',
        Message: message,
      })
    );
  } catch (error) {
    console.error('Failed to send confirmation:', error);
  }
}

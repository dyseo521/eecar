import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

const snsClient = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

/**
 * Contact Inquiry Lambda Function
 * Handle general inquiries from users via SNS notification
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { name, email, subject, message, partId, partName } = body;

    // Validation
    if (!name || !email || !subject || !message) {
      return errorResponse(
        'Missing required fields: name, email, subject, message',
        undefined,
        400,
        event
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format', undefined, 400, event);
    }

    console.log('Processing contact inquiry from:', email);

    // Send notification via SNS
    await sendContactNotification(name, email, subject, message, partId, partName);

    return successResponse({
      message: '문의가 성공적으로 접수되었습니다',
      success: true,
    }, 200, event);
  } catch (error: any) {
    console.error('Error in contact-inquiry:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * Send contact inquiry notification via SNS
 */
async function sendContactNotification(
  name: string,
  email: string,
  subject: string,
  message: string,
  partId?: string,
  partName?: string
): Promise<void> {
  const partInfo = partId && partName
    ? `\n부품 ID: ${partId}\n부품명: ${partName}\n`
    : '';

  const snsMessage = `
[EECAR 일반 문의]

문의자 이름: ${name}
문의자 이메일: ${email}
제목: ${subject}${partInfo}
문의 내용:
${message}

---
고객에게 회신이 필요합니다.
답변 이메일: ${email}
  `.trim();

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `[EECAR] 일반 문의 - ${subject}`,
        Message: snsMessage,
      })
    );
    console.log('Contact inquiry notification sent successfully');
  } catch (error) {
    console.error('Failed to send contact inquiry notification:', error);
    throw error; // Re-throw to trigger error response
  }
}

/**
 * 자동이 2.0: AI DevOps 어시스턴트
 * Slack 이벤트 수신 및 라우팅
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { verifySlackRequest } from './slack-verifier.js';
import { handleSlashCommand } from './handlers/slash-command.js';
import { handleAppMention } from './handlers/app-mention.js';
import { handleInteraction } from './handlers/interaction.js';
import { SlackEvent } from './types.js';

/**
 * Slack 재시도 요청 감지
 * Slack은 3초 내 응답 없으면 X-Slack-Retry-Num 헤더와 함께 재시도
 */
function isSlackRetry(headers: Record<string, string | undefined>): boolean {
  const retryNum = headers['x-slack-retry-num'] || headers['X-Slack-Retry-Num'];
  const retryReason = headers['x-slack-retry-reason'] || headers['X-Slack-Retry-Reason'];

  if (retryNum) {
    console.log('Slack retry detected:', { retryNum, retryReason });
    return true;
  }
  return false;
}

/**
 * Lambda 핸들러
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  console.log('Received Slack event:', JSON.stringify(event, null, 2));

  try {
    const body = event.body || '';
    const headers = event.headers || {};

    // Slack 재시도 요청은 즉시 200 응답 (중복 메시지 방지)
    if (isSlackRetry(headers)) {
      return response(200, { ok: true, message: 'Retry acknowledged' });
    }

    // Slack 요청 검증
    const isValid = await verifySlackRequest(
      body,
      headers['x-slack-request-timestamp'] || headers['X-Slack-Request-Timestamp'],
      headers['x-slack-signature'] || headers['X-Slack-Signature']
    );

    if (!isValid) {
      console.error('Slack verification failed');
      return response(401, { error: 'Unauthorized' });
    }

    // Content-Type에 따라 파싱
    const contentType = headers['content-type'] || headers['Content-Type'] || '';
    let slackEvent: SlackEvent;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Slash Command 또는 Interactive Component
      const params = new URLSearchParams(body);

      // Interactive Component (payload 필드 있음)
      if (params.has('payload')) {
        // payload 파싱은 handleInteraction에서 수행
        slackEvent = { type: 'interactive', payload: params.get('payload') || '' };
      } else {
        // Slash Command
        slackEvent = {
          type: 'slash_command',
          command: params.get('command') || '',
          text: params.get('text') || '',
          response_url: params.get('response_url') || '',
          trigger_id: params.get('trigger_id') || '',
          user_id: params.get('user_id') || '',
          user_name: params.get('user_name') || '',
          channel_id: params.get('channel_id') || '',
          channel_name: params.get('channel_name') || '',
        };
      }
    } else {
      // JSON (Event API)
      slackEvent = JSON.parse(body);
    }

    // URL 검증 (Slack App 설정 시 필요)
    if (slackEvent.type === 'url_verification') {
      console.log('URL verification challenge');
      return response(200, { challenge: slackEvent.challenge });
    }

    // 이벤트 타입별 라우팅
    if (slackEvent.type === 'slash_command') {
      return await handleSlashCommandWithAck(slackEvent);
    }

    if (slackEvent.type === 'interactive') {
      return await handleInteractionWithAck(slackEvent);
    }

    if (slackEvent.type === 'event_callback') {
      const eventPayload = slackEvent.event;

      // 봇 자신의 메시지는 무시
      if (eventPayload?.bot_id) {
        console.log('Ignoring bot message');
        return response(200, { ok: true });
      }

      if (eventPayload?.type === 'app_mention') {
        return await handleAppMentionWithAck(slackEvent);
      }

      // 기타 이벤트 (message 등)
      console.log('Unhandled event type:', eventPayload?.type);
      return response(200, { ok: true });
    }

    console.log('Unknown event type:', slackEvent.type);
    return response(200, { ok: true });
  } catch (error) {
    console.error('Error processing Slack event:', error);
    return response(500, { error: 'Internal server error' });
  }
};

/**
 * Slash Command 처리 (3초 내 응답 + 비동기 처리)
 */
async function handleSlashCommandWithAck(slackEvent: SlackEvent): Promise<APIGatewayProxyResult> {
  // Slack은 3초 내 응답 필요
  // 복잡한 처리는 response_url로 나중에 전송

  // 즉시 응답: "처리 중..." 메시지
  const immediateResponse = {
    response_type: 'ephemeral',
    text: ':robot_face: 자동이가 처리 중입니다...',
  };

  // 비동기로 실제 처리 수행
  // Lambda에서는 동기적으로 처리하고 response_url로 업데이트
  try {
    // 간단한 명령은 즉시 응답
    const result = await handleSlashCommand(slackEvent);

    if (result) {
      return response(200, result);
    }
  } catch (error) {
    console.error('Error handling slash command:', error);
  }

  return response(200, immediateResponse);
}

/**
 * App Mention 처리
 */
async function handleAppMentionWithAck(slackEvent: SlackEvent): Promise<APIGatewayProxyResult> {
  // 즉시 200 응답 (Slack 재시도 방지)
  // 비동기로 처리 후 chat.postMessage로 응답

  try {
    await handleAppMention(slackEvent);
  } catch (error) {
    console.error('Error handling app mention:', error);
  }

  return response(200, { ok: true });
}

/**
 * Interactive Component 처리
 */
async function handleInteractionWithAck(slackEvent: SlackEvent): Promise<APIGatewayProxyResult> {
  try {
    const result = await handleInteraction(slackEvent);
    if (result) {
      return response(200, result);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
  }

  return response(200, { ok: true });
}

/**
 * HTTP 응답 헬퍼
 */
function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

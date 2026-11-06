/**
 * 자동이 2.0: AI DevOps 어시스턴트
 * Slack 이벤트 수신 및 라우팅
 *
 * 수신 경로(API Gateway): 서명 검증 → (이벤트면) event_id 선점 → 비동기 작업 전달 → 즉시 응답
 * 작업 경로(같은 함수의 비동기 호출): 에이전트·슬래시 커맨드 실행 → Slack으로 결과 전송 (C-13, A-36)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifySlackRequest } from './slack-verifier.js';
import { handleSlashCommand } from './handlers/slash-command.js';
import { handleAppMention } from './handlers/app-mention.js';
import { handleInteraction } from './handlers/interaction.js';
import { SlackEvent } from './types.js';
import { claimSlackEvent, dispatchJob, isJobEvent, JadongJob, postToResponseUrl } from './async-dispatch.js';
import { emitMetrics } from '/opt/nodejs/utils/emf.js';

/** 즉시 처리해도 3초 안에 끝나는 슬래시 커맨드 (외부 조회 없음) */
const INLINE_SLASH_COMMANDS = new Set(['', '도움말', 'help']);

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}

/** Slack 수신 지표: 응답 시간, 재시도 수신, 중복 이벤트 (C-13 검증 기준) */
function recordIngress(kind: string, started: number, retry: boolean, duplicate: boolean): void {
  emitMetrics('EECAR/Agent', { Ingress: kind }, {
    SlackRequests: { value: 1, unit: 'Count' },
    SlackAckLatency: { value: Date.now() - started, unit: 'Milliseconds' },
    SlackRetries: { value: retry ? 1 : 0, unit: 'Count' },
    SlackDuplicates: { value: duplicate ? 1 : 0, unit: 'Count' },
  }, [['Ingress'], []]);
}

/**
 * Lambda 핸들러
 */
export const handler = async (
  event: APIGatewayProxyEvent | { jadongJob: JadongJob }
): Promise<APIGatewayProxyResult | void> => {
  if (isJobEvent(event)) {
    return runJob(event.jadongJob);
  }
  const started = Date.now();

  try {
    const body = event.body || '';
    const headers = event.headers || {};
    const retryNum = header(headers, 'X-Slack-Retry-Num');
    // 요청 전체(서명 헤더·사용자 메시지)를 로그에 남기지 않는다 (이전에는 이벤트 전체를 INFO로 남겼다)
    console.log('Slack request:', { retryNum, retryReason: header(headers, 'X-Slack-Retry-Reason'), bytes: body.length });

    // 재시도도 서명부터 검증한다. 이전에는 서명 검증 전에 재시도를 일괄로 버려, 첫 요청이 실패한 이벤트가 유실됐다
    const isValid = await verifySlackRequest(
      body,
      header(headers, 'X-Slack-Request-Timestamp'),
      header(headers, 'X-Slack-Signature')
    );

    if (!isValid) {
      console.error('Slack verification failed');
      return response(401, { error: 'Unauthorized' });
    }

    // Content-Type에 따라 파싱
    const contentType = header(headers, 'Content-Type') || '';
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
      return response(200, { challenge: slackEvent.challenge });
    }

    if (slackEvent.type === 'slash_command') {
      const command = (slackEvent.text || '').trim().split(/\s+/)[0].toLowerCase();
      if (INLINE_SLASH_COMMANDS.has(command)) {
        const result = await handleSlashCommand(slackEvent);
        recordIngress('slash_inline', started, false, false);
        return response(200, result);
      }
      await dispatchJob({ type: 'slash_command', event: slackEvent });
      recordIngress('slash_async', started, false, false);
      return response(200, { response_type: 'ephemeral', text: ':robot_face: 자동이가 처리 중입니다...' });
    }

    if (slackEvent.type === 'interactive') {
      return await handleInteractionWithAck(slackEvent);
    }

    if (slackEvent.type === 'event_callback') {
      const eventPayload = slackEvent.event;

      // 봇 자신의 메시지는 무시
      if (eventPayload?.bot_id) {
        return response(200, { ok: true });
      }

      if (eventPayload?.type === 'app_mention') {
        // 같은 이벤트는 한 번만 처리한다 (Slack 재시도·중복 전달)
        const eventId = slackEvent.event_id;
        const first = eventId ? await claimSlackEvent(eventId) : true;
        if (first) await dispatchJob({ type: 'app_mention', event: slackEvent });
        recordIngress('app_mention', started, Boolean(retryNum), !first);
        return response(200, { ok: true });
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
 * 비동기 작업 실행 (같은 함수의 Event 호출로 들어온다)
 *
 * 예외를 밖으로 던지지 않는다. 던지면 Lambda가 비동기 호출을 두 번 더 재시도해 Slack에 답이 여러 번 갈 수 있다.
 * 재시도 횟수 설정(EventInvokeConfig)은 배포 역할 권한이 없어 쓰지 않았다 (A-36). 대신 실패는 지표로 남긴다.
 */
export async function runJob(job: JadongJob): Promise<void> {
  try {
    if (job.type === 'app_mention') {
      await handleAppMention(job.event);
      return;
    }
    const responseUrl = job.event.response_url;
    try {
      const result = await handleSlashCommand(job.event);
      if (responseUrl && result) await postToResponseUrl(responseUrl, result);
    } catch (error) {
      console.error('Error handling slash command job:', error);
      recordJobError(job.type);
      if (responseUrl) {
        await postToResponseUrl(responseUrl, { response_type: 'ephemeral', text: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
      }
    }
  } catch (error) {
    console.error('Jadong job failed:', error);
    recordJobError(job.type);
  }
}

/** 작업 경로는 예외를 삼키므로 Lambda Errors 지표에 잡히지 않는다. 대신 이 지표로 본다 */
function recordJobError(jobType: string): void {
  emitMetrics('EECAR/Agent', { JobType: jobType }, { JobErrors: { value: 1, unit: 'Count' } }, [['JobType'], []]);
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

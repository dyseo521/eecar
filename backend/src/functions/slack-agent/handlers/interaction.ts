/**
 * Interactive Components 핸들러
 * 버튼 클릭, 모달 제출 등 처리
 */

import { SlackEvent } from '../types.js';
import { getBotToken } from '../slack-verifier.js';
import { saveMemory } from '../tools/memory.js';

/**
 * Interaction 타입
 */
interface InteractionPayload {
  type: string;
  user: { id: string; name: string };
  channel?: { id: string };
  actions?: Array<{
    action_id: string;
    block_id: string;
    value?: string;
    type: string;
  }>;
  response_url?: string;
  trigger_id?: string;
  view?: {
    callback_id: string;
    state: {
      values: Record<string, Record<string, { value: string }>>;
    };
  };
  message?: {
    ts: string;
    thread_ts?: string;
  };
}

/**
 * Interactive Component 처리
 */
export async function handleInteraction(event: SlackEvent): Promise<unknown> {
  if (!event.payload) {
    return { ok: true };
  }

  const payload: InteractionPayload = JSON.parse(event.payload);
  console.log('Interaction:', { type: payload.type, user: payload.user?.id });

  switch (payload.type) {
    case 'block_actions':
      return await handleBlockActions(payload);

    case 'view_submission':
      return await handleViewSubmission(payload);

    case 'shortcut':
      return await handleShortcut(payload);

    default:
      console.log('Unknown interaction type:', payload.type);
      return { ok: true };
  }
}

/**
 * 버튼/메뉴 액션 처리
 */
async function handleBlockActions(
  payload: InteractionPayload
): Promise<unknown> {
  const action = payload.actions?.[0];
  if (!action) {
    return { ok: true };
  }

  console.log('Block action:', { action_id: action.action_id, value: action.value });

  switch (action.action_id) {
    case 'mark_resolved':
      // 에러 해결됨 버튼
      return await handleMarkResolved(payload, action.value);

    case 'view_details':
      // 상세 보기 버튼
      return await handleViewDetails(payload, action.value);

    case 'analyze_error':
      // 분석 버튼
      return await handleAnalyzeButton(payload, action.value);

    case 'dismiss':
      // 알림 닫기
      return await handleDismiss(payload);

    default:
      console.log('Unknown action:', action.action_id);
      return { ok: true };
  }
}

/**
 * 에러 해결됨 처리 (학습)
 */
async function handleMarkResolved(
  payload: InteractionPayload,
  value?: string
): Promise<unknown> {
  if (!value) {
    return { ok: true };
  }

  try {
    // value: "errorType:functionName:resolution" 형식
    const [errorType, functionName, ...resolutionParts] = value.split(':');
    const resolution = resolutionParts.join(':') || '해결됨 (상세 정보 없음)';

    // 기억에 저장 (S3 Vectors)
    await saveMemory({
      errorType,
      functionName,
      resolution,
      resolvedBy: payload.user.id,
    });

    // 응답 업데이트
    if (payload.response_url) {
      await updateMessage(payload.response_url, {
        text: `✅ 해결 사례가 저장되었습니다! 자동이가 학습했습니다. 🧠\n\n*에러:* ${errorType}\n*함수:* ${functionName}\n*해결:* ${resolution}`,
        replace_original: false,
        response_type: 'ephemeral',
      });
    }

    return { ok: true };
  } catch (error) {
    console.error('Error saving resolution:', error);
    return {
      response_type: 'ephemeral',
      text: '해결 사례 저장 중 오류가 발생했습니다.',
    };
  }
}

/**
 * 상세 보기 모달 열기
 */
async function handleViewDetails(
  payload: InteractionPayload,
  value?: string
): Promise<unknown> {
  if (!payload.trigger_id || !value) {
    return { ok: true };
  }

  const botToken = await getBotToken();

  // 모달 열기
  const modal = {
    type: 'modal',
    callback_id: 'error_details_modal',
    title: {
      type: 'plain_text',
      text: '에러 상세 정보',
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*에러 ID:* ${value}\n\n상세 로그와 스택 트레이스를 확인하세요.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '```\n로그 내용이 여기에 표시됩니다...\n```',
        },
      },
    ],
  };

  await fetch('https://slack.com/api/views.open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({
      trigger_id: payload.trigger_id,
      view: modal,
    }),
  });

  return { ok: true };
}

/**
 * 분석 버튼 처리
 */
async function handleAnalyzeButton(
  payload: InteractionPayload,
  value?: string
): Promise<unknown> {
  if (!payload.response_url || !value) {
    return { ok: true };
  }

  // 분석 중 메시지
  await updateMessage(payload.response_url, {
    text: '🤖 자동이가 분석 중입니다...',
    response_type: 'ephemeral',
    replace_original: false,
  });

  // TODO: 실제 분석 수행 (analyze_error Tool 호출)

  return { ok: true };
}

/**
 * 알림 닫기
 */
async function handleDismiss(payload: InteractionPayload): Promise<unknown> {
  if (payload.response_url) {
    await updateMessage(payload.response_url, {
      delete_original: true,
    });
  }
  return { ok: true };
}

/**
 * 모달 제출 처리
 */
async function handleViewSubmission(
  payload: InteractionPayload
): Promise<unknown> {
  const callbackId = payload.view?.callback_id;

  switch (callbackId) {
    case 'resolution_modal': {
      // 해결 방법 입력 모달
      const resolution =
        payload.view?.state?.values?.resolution_block?.resolution_input?.value;
      console.log('Resolution submitted:', resolution);
      // TODO: 기억에 저장
      return { response_action: 'clear' };
    }

    default:
      return { ok: true };
  }
}

/**
 * 단축키 (Shortcut) 처리
 */
async function handleShortcut(payload: InteractionPayload): Promise<unknown> {
  // Global/Message 단축키 처리
  console.log('Shortcut triggered:', payload);
  return { ok: true };
}

/**
 * response_url로 메시지 업데이트
 */
async function updateMessage(
  responseUrl: string,
  body: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('Failed to update message:', error);
  }
}

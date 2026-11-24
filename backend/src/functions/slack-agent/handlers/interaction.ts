/**
 * Interactive Components 핸들러
 * 버튼 클릭, 모달 제출 등 처리
 */

import { SlackEvent } from '../types.js';
import { getBotToken } from '../slack-verifier.js';
import { dispatchJob } from '../async-dispatch.js';

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
    case 'memory_confirm':
    case 'memory_refute':
      // 진단 아래의 원인 맞음 / 원인 틀림 버튼 (A-53)
      return await handleMemoryButton(payload, action.action_id === 'memory_confirm' ? 'confirmed' : 'refuted', action.value);

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
 * 원인 맞음 / 틀림 버튼. 임베딩과 저장은 3초를 넘길 수 있어 비동기 작업으로 넘기고 바로 응답한다 (A-36과 같은 이유).
 * 이전의 mark_resolved는 버튼 값에 해결책 문장을 담아 그대로 저장했고, 그 버튼을 붙이는 메시지는 없었다 (A-53)
 */
async function handleMemoryButton(
  payload: InteractionPayload,
  outcome: 'confirmed' | 'refuted',
  value?: string
): Promise<unknown> {
  if (!value) return { ok: true };
  try {
    await dispatchJob({ type: 'memory_feedback', id: value, outcome, userId: payload.user.id, responseUrl: payload.response_url });
  } catch (error) {
    console.error('Failed to dispatch memory feedback:', (error as Error).name);
    if (payload.response_url) {
      await updateMessage(payload.response_url, { text: '피드백을 기록하지 못했습니다. 잠시 후 다시 눌러 주세요.', replace_original: false, response_type: 'ephemeral' });
    }
  }
  return { ok: true };
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

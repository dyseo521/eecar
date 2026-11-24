/**
 * 진단 아래의 원인 맞음 / 원인 틀림 버튼을 기억으로 옮긴다 (DECISION_LOG A-53).
 *
 * 사람이 확인한 진단만 기억한다. 모델이 직접 저장하면 질문만으로 기억을 오염시킬 수 있다(MINJA).
 * 틀렸다고 확인된 진단도 남긴다. 같은 결론을 다시 내리기 전에 근거를 보게 하는 함정 기억이다(ReasoningBank).
 */
import { claimFeedback, releaseFeedback, saveMemoryRecord } from '../tools/memory.js';
import { recordFromDiagnosis } from '../tools/memory-core.js';
import { postToResponseUrl } from '../async-dispatch.js';

export interface MemoryFeedbackJob {
  id: string;
  outcome: 'confirmed' | 'refuted';
  userId: string;
  responseUrl?: string;
}

export interface MemoryFeedbackDeps {
  claim?: typeof claimFeedback;
  save?: typeof saveMemoryRecord;
  release?: typeof releaseFeedback;
  reply?: (responseUrl: string, message: unknown) => Promise<void>;
  now?: () => string;
}

export async function handleMemoryFeedback(job: MemoryFeedbackJob, deps: MemoryFeedbackDeps = {}): Promise<string> {
  const reply = async (text: string) => {
    if (job.responseUrl) await (deps.reply ?? postToResponseUrl)(job.responseUrl, { text, replace_original: false, response_type: 'ephemeral' });
    return text;
  };

  const pending = await (deps.claim ?? claimFeedback)(job.id, job.outcome, job.userId);
  if (!pending) return reply('이미 기록했거나 확인 기간(14일)이 지난 진단입니다.');

  const record = recordFromDiagnosis(pending.question, pending.diagnosis, {
    key: `mem-${job.id}`,
    outcome: job.outcome,
    codeVersion: pending.codeVersion,
    now: (deps.now ?? (() => new Date().toISOString()))(),
    confirmedBy: job.userId,
  });
  if (!record) return reply('원인을 말한 진단(root_cause, hypothesis)만 기억합니다.');

  try {
    const saved = await (deps.save ?? saveMemoryRecord)(record);
    if (job.outcome === 'refuted') {
      return reply('틀린 판단으로 기억했습니다. 비슷한 장애에서 같은 결론을 내리기 전에 근거를 다시 확인합니다.');
    }
    return reply(saved.action === 'updated'
      ? `기억했습니다. 같은 사례를 ${saved.count}번째 확인했습니다.`
      : '기억했습니다. 비슷한 장애를 조사할 때 확인할 가설로 참고합니다.');
  } catch (error) {
    console.error('[memory] 저장 실패:', (error as Error).name, (error as Error).message);
    await (deps.release ?? releaseFeedback)(job.id).catch(e => console.error('[memory] 선점 해제 실패:', (e as Error).name));
    return reply('기억을 저장하지 못했습니다. 잠시 후 다시 눌러 주세요.');
  }
}

/**
 * 운영 검색 합성 검사의 일정 실행 (DECISION_LOG A-39, A-52).
 *
 * EventBridge Scheduler가 매시 호출한다. 공개 API 주소로 요청해 사용자와 같은 경로를 시험한다.
 * 실패하면 에러 알림과 같은 Slack 웹훅으로 보낸다. 벡터 후보 지표는 검색 함수가 남기고, 검사가 멈추면 경보가 잡는다.
 *
 * - 검사 실패로 예외를 던지지 않는다. 비동기 호출이라 예외를 던지면 Lambda가 재시도해 LLM을 더 부른다.
 * - 이벤트에 spec을 넣으면 그 정의로 검사한다. 일부러 실패하는 검사로 알림 경로를 확인할 때 쓴다(IAM 호출만 가능).
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { runCanary, type Post } from './checks.js';
import { CANARY_SPEC, type CanarySpec } from './spec.js';

const ssm = new SSMClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const TOKEN_PARAM = process.env.CANARY_TOKEN_SSM_PARAM || '/eecar/canary-token';
const WEBHOOK_PARAM = process.env.SLACK_WEBHOOK_SSM_PARAM || '/eecar/slack/webhook-url';
const REQUEST_TIMEOUT_MS = 15000;

const cache = new Map<string, string>();

export function resetParameterCache(): void {
  cache.clear();
}

async function parameter(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = res.Parameter?.Value ?? '';
  if (!value) throw new Error(`SSM parameter ${name} is empty`);
  cache.set(name, value);
  return value;
}

function makePost(apiUrl: string, token: string): Post {
  return async (path, payload) => {
    const started = performance.now();
    const res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Eecar-Canary-Token': token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const ms = Math.round(performance.now() - started);
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
    return { status: res.status, ms, body };
  };
}

async function notifySlack(failures: string[]): Promise<void> {
  const shown = failures.slice(0, 5).map(f => `• ${f}`).join('\n');
  const more = failures.length > 5 ? `\n외 ${failures.length - 5}건` : '';
  const text = `:rotating_light: *검색 합성 검사 실패* (일정 실행, ${failures.length}건)\n${shown}${more}\n로그: /aws/lambda/${process.env.AWS_LAMBDA_FUNCTION_NAME ?? 'search-canary'}`;
  const webhookUrl = await parameter(WEBHOOK_PARAM);
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack ${res.status}`);
}

export const handler = async (event: { spec?: CanarySpec } = {}) => {
  let lines: string[] = [];
  let failures: string[];
  try {
    const apiUrl = process.env.EECAR_API_URL;
    if (!apiUrl) throw new Error('EECAR_API_URL is not set');
    const token = await parameter(TOKEN_PARAM);
    ({ lines, failures } = await runCanary(event?.spec ?? CANARY_SPEC, makePost(apiUrl, token)));
  } catch (error) {
    failures = [`실행 실패: ${(error as Error).name}: ${(error as Error).message}`];
  }

  const passed = failures.length === 0;
  console.log(JSON.stringify({ message: 'search canary', passed, failures, lines }));
  if (!passed) {
    try {
      await notifySlack(failures);
    } catch (error) {
      console.error('[search-canary] Slack 알림 실패:', (error as Error).message);
    }
  }
  return { passed, failures, lines };
};

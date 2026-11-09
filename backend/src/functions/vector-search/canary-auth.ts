/**
 * canary=true 요청의 토큰 확인 (DECISION_LOG A-47).
 *
 * canary는 캐시를 건너뛰고 진단값을 돌려준다. 공개 API에서 본문 값만 믿으면 누구나 매번 LLM을 부를 수 있다.
 * 토큰이 없거나 틀리면, 또는 토큰을 읽지 못하면 오류 없이 일반 요청으로 처리한다.
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import crypto from 'crypto';

const HEADER = 'x-eecar-canary-token';
const PARAMETER = '/eecar/canary-token';
const CACHE_MS = 5 * 60 * 1000;

const ssm = new SSMClient({});
let cached: { token: string; expires: number } | undefined;

export function resetCanaryTokenCache(): void {
  cached = undefined;
}

async function expectedToken(): Promise<string> {
  if (cached && Date.now() < cached.expires) return cached.token;
  const result = await ssm.send(new GetParameterCommand({ Name: PARAMETER, WithDecryption: true }));
  const token = result.Parameter?.Value;
  if (!token) throw new Error('canary token parameter is empty');
  cached = { token, expires: Date.now() + CACHE_MS };
  return token;
}

const digest = (value: string) => crypto.createHash('sha256').update(value).digest();

export async function isAuthorizedCanary(event: APIGatewayProxyEvent): Promise<boolean> {
  const name = Object.keys(event.headers ?? {}).find(key => key.toLowerCase() === HEADER);
  const presented = name ? event.headers[name] : undefined;
  if (!presented) return false;
  try {
    return crypto.timingSafeEqual(digest(presented), digest(await expectedToken()));
  } catch (error) {
    console.warn('[canary] 토큰을 읽지 못해 일반 요청으로 처리:', (error as Error).name);
    return false;
  }
}

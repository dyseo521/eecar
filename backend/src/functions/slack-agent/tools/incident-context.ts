/**
 * 장애 조사 첫 단계에서 거의 항상 함께 보는 조회를 한 번에 돌려준다 (DECISION_LOG E-40).
 * 조회는 병렬로 실행하고, 일부가 실패해도 나머지 결과와 실패 항목을 함께 돌려준다.
 */
import { getAllLambdaStatuses, getErrorSummary, getLambdaStatus, getRecentLogs } from './cloudwatch.js';
import { getFunctionConfig } from './config.js';
import { getRecentChanges, getServiceMetrics } from './investigate.js';

const LOG_LIMIT = 30;
const GLOBAL_SERVICES = ['apigateway', 'bedrock', 'dynamodb', 'canary'] as const;

export interface IncidentContextDeps {
  status: (functionName: string, days: number) => Promise<unknown>;
  allStatuses: (days: number) => Promise<unknown>;
  logs: (functionName: string, minutes: number) => Promise<unknown[]>;
  errorSummary: (functionName: string, hours: number) => Promise<unknown>;
  changes: (functionName: string | undefined) => Promise<unknown>;
  config: (functionName: string) => Promise<unknown>;
  metrics: (service: string, hours: number, functionName?: string) => Promise<unknown>;
}

const defaultDeps: IncidentContextDeps = {
  status: getLambdaStatus,
  allStatuses: getAllLambdaStatuses,
  logs: (functionName, minutes) => getRecentLogs(functionName, minutes, 'ERROR'),
  errorSummary: getErrorSummary,
  changes: getRecentChanges,
  config: getFunctionConfig,
  metrics: getServiceMetrics,
};

export async function getIncidentContext(
  functionName: string | undefined,
  hours = 24,
  deps: IncidentContextDeps = defaultDeps,
): Promise<Record<string, unknown>> {
  const days = Math.max(1, Math.ceil(hours / 24));
  const jobs: Record<string, () => Promise<unknown>> = {
    recentChanges: () => deps.changes(functionName),
    ...Object.fromEntries(GLOBAL_SERVICES.map(service => [service, () => deps.metrics(service, hours)])),
    ...(functionName
      ? {
        status: () => deps.status(functionName, days),
        errorLogs: async () => (await deps.logs(functionName, hours * 60)).slice(-LOG_LIMIT),
        errorSummary: () => deps.errorSummary(functionName, hours),
        config: () => deps.config(functionName),
        lambda: () => deps.metrics('lambda', hours, functionName),
      }
      : { status: () => deps.allStatuses(days) }),
  };

  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(names.map(name => jobs[name]()));
  const data: Record<string, unknown> = { functionName: functionName ?? 'all', windowHours: hours };
  const incomplete: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') data[names[i]] = result.value;
    else incomplete.push(`${names[i]}: ${(result.reason as Error).message}`);
  });
  if (incomplete.length) data.incomplete = incomplete;
  return data;
}

/**
 * CloudWatch 로그/메트릭 조회 도구
 */

import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  StartQueryCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  LambdaClient,
  ListFunctionsCommand,
} from '@aws-sdk/client-lambda';
import { LambdaStatus, LogEntry } from '../types.js';

const logsClient = new CloudWatchLogsClient({ region: 'ap-northeast-2' });
const cwClient = new CloudWatchClient({ region: 'ap-northeast-2' });
const lambdaClient = new LambdaClient({ region: 'ap-northeast-2' });

// Lambda 함수 이름 접두사 (SAM 스택 이름)
const STACK_PREFIX = process.env.STACK_NAME || 'eecar-stack';

// 함수 이름 캐시 (SAM suffix 포함된 실제 이름)
const functionNameCache: Map<string, string> = new Map();
let cacheLoaded = false;

/**
 * Lambda 함수 목록을 가져와서 캐시
 */
async function loadFunctionNameCache(): Promise<void> {
  if (cacheLoaded) return;

  try {
    const response = await lambdaClient.send(new ListFunctionsCommand({}));
    const functions = response.Functions || [];

    for (const fn of functions) {
      if (fn.FunctionName?.startsWith(STACK_PREFIX)) {
        // eecar-stack-VectorSearchFunction-xxx -> VectorSearchFunction
        const parts = fn.FunctionName.split('-');
        // 첫 두 부분 (eecar-stack) 제외하고 마지막 (suffix) 제외
        if (parts.length >= 3) {
          const shortName = parts.slice(2, -1).join('-');
          functionNameCache.set(shortName, fn.FunctionName);
        }
      }
    }
    cacheLoaded = true;
    console.log('Function name cache loaded:', Object.fromEntries(functionNameCache));
  } catch (error) {
    console.error('Failed to load function name cache:', error);
  }
}

/**
 * 짧은 함수 이름을 실제 Lambda 함수 이름으로 변환
 */
async function resolveActualFunctionName(shortName: string): Promise<string> {
  await loadFunctionNameCache();
  return functionNameCache.get(shortName) || `${STACK_PREFIX}-${shortName}`;
}

/**
 * Lambda 함수 상태 조회
 * @param functionName 함수명 (짧은 이름)
 * @param days 조회 기간 (일, 기본 1일, 최대 30일)
 */
export async function getLambdaStatus(
  functionName: string,
  days: number = 1
): Promise<LambdaStatus> {
  const fullFunctionName = await resolveActualFunctionName(functionName);
  const endTime = new Date();
  // days 파라미터에 따라 조회 기간 설정
  const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);
  // Period: 1일 이하면 1시간 단위, 초과면 1일 단위 (CloudWatch 최대 1440 datapoints)
  const period = days <= 1 ? 3600 : 86400;

  console.log(`Getting status for ${functionName} -> ${fullFunctionName} (${days} days, period: ${period}s)`);

  try {
    // 호출 횟수
    const invocationsResult = await cwClient.send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Invocations',
        Dimensions: [{ Name: 'FunctionName', Value: fullFunctionName }],
        StartTime: startTime,
        EndTime: endTime,
        Period: period,
        Statistics: ['Sum'],
      })
    );

    // 에러 횟수
    const errorsResult = await cwClient.send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Errors',
        Dimensions: [{ Name: 'FunctionName', Value: fullFunctionName }],
        StartTime: startTime,
        EndTime: endTime,
        Period: period,
        Statistics: ['Sum'],
      })
    );

    // 평균 실행 시간
    const durationResult = await cwClient.send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/Lambda',
        MetricName: 'Duration',
        Dimensions: [{ Name: 'FunctionName', Value: fullFunctionName }],
        StartTime: startTime,
        EndTime: endTime,
        Period: period,
        Statistics: ['Average'],
      })
    );

    // 여러 데이터 포인트의 합계/평균 계산
    const invocations = (invocationsResult.Datapoints || []).reduce(
      (sum, dp) => sum + (dp.Sum || 0),
      0
    );
    const errors = (errorsResult.Datapoints || []).reduce(
      (sum, dp) => sum + (dp.Sum || 0),
      0
    );
    // 평균은 모든 데이터 포인트의 평균을 다시 평균
    const durationDatapoints = durationResult.Datapoints || [];
    const avgDuration =
      durationDatapoints.length > 0
        ? durationDatapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) /
          durationDatapoints.length
        : 0;

    // 마지막 에러 메시지 조회
    let lastError: { message: string; timestamp: string } | undefined;
    if (errors > 0) {
      const recentLogs = await getRecentLogs(functionName, 30, 'ERROR');
      if (recentLogs.length > 0) {
        lastError = {
          message: recentLogs[0].message,
          timestamp: recentLogs[0].timestamp,
        };
      }
    }

    return {
      functionName,
      invocations,
      errors,
      errorRate: invocations > 0 ? (errors / invocations) * 100 : 0,
      avgDuration,
      lastError,
    };
  } catch (error) {
    console.error(`Error getting status for ${functionName}:`, error);
    return {
      functionName,
      invocations: 0,
      errors: 0,
      errorRate: 0,
      avgDuration: 0,
    };
  }
}

/**
 * 최근 로그 조회
 */
export async function getRecentLogs(
  functionName: string,
  minutes: number = 30,
  filter: 'ERROR' | 'WARN' | 'INFO' | 'ALL' = 'ERROR'
): Promise<LogEntry[]> {
  const fullFunctionName = await resolveActualFunctionName(functionName);
  const logGroupName = `/aws/lambda/${fullFunctionName}`;
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);

  // 필터 패턴
  const filterPatterns: Record<string, string> = {
    ERROR: '?ERROR ?Error ?error ?Exception ?exception ?FATAL',
    WARN: '?WARN ?warn ?WARNING ?warning',
    INFO: '?INFO ?info',
    ALL: '',
  };

  try {
    const result = await logsClient.send(
      new FilterLogEventsCommand({
        logGroupName,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
        filterPattern: filterPatterns[filter],
        limit: 50,
      })
    );

    return (result.events || []).map((event) => ({
      timestamp: new Date(event.timestamp || 0).toISOString(),
      message: event.message || '',
      requestId: extractRequestId(event.message || ''),
      level: detectLogLevel(event.message || ''),
    }));
  } catch (error) {
    console.error(`Error getting logs for ${functionName}:`, error);
    return [];
  }
}

/**
 * Logs Insights 쿼리 실행
 */
export async function queryLogs(
  functionName: string,
  query: string,
  minutes: number = 60
): Promise<Record<string, unknown>[]> {
  const fullFunctionName = await resolveActualFunctionName(functionName);
  const logGroupName = `/aws/lambda/${fullFunctionName}`;
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);

  try {
    // 쿼리 시작
    const startResult = await logsClient.send(
      new StartQueryCommand({
        logGroupName,
        startTime: Math.floor(startTime.getTime() / 1000),
        endTime: Math.floor(endTime.getTime() / 1000),
        queryString: query,
      })
    );

    if (!startResult.queryId) {
      return [];
    }

    // 쿼리 결과 대기 (최대 10초)
    let attempts = 0;
    while (attempts < 10) {
      await sleep(1000);
      attempts++;

      const result = await logsClient.send(
        new GetQueryResultsCommand({
          queryId: startResult.queryId,
        })
      );

      if (result.status === 'Complete') {
        return (result.results || []).map((row) => {
          const obj: Record<string, unknown> = {};
          row.forEach((field) => {
            if (field.field && field.value) {
              obj[field.field] = field.value;
            }
          });
          return obj;
        });
      }

      if (result.status === 'Failed' || result.status === 'Cancelled') {
        console.error('Query failed:', result.status);
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error('Error querying logs:', error);
    return [];
  }
}

/**
 * 에러 요약 조회
 */
export async function getErrorSummary(
  functionName: string,
  hours: number = 24
): Promise<{ errorType: string; count: number; lastOccurred: string }[]> {
  const query = `
    fields @timestamp, @message
    | filter @message like /(?i)error|exception/
    | parse @message /(?<errorType>[A-Za-z]+Exception|[A-Za-z]+Error)/
    | stats count(*) as count, max(@timestamp) as lastOccurred by errorType
    | sort count desc
    | limit 10
  `;

  const results = await queryLogs(functionName, query, hours * 60);

  return results.map((r) => ({
    errorType: String(r.errorType || 'Unknown'),
    count: Number(r.count) || 0,
    lastOccurred: String(r.lastOccurred || ''),
  }));
}

/**
 * 요청 ID 추출
 */
function extractRequestId(message: string): string | undefined {
  // Lambda RequestId 형식: RequestId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const match = message.match(
    /RequestId:\s*([a-f0-9-]{36})/i
  );
  return match?.[1];
}

/**
 * 로그 레벨 감지
 */
function detectLogLevel(message: string): 'ERROR' | 'WARN' | 'INFO' {
  if (/error|exception|fatal/i.test(message)) return 'ERROR';
  if (/warn/i.test(message)) return 'WARN';
  return 'INFO';
}

/**
 * sleep 유틸
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 모든 Lambda 함수 상태 조회 (요약 형식)
 * @param days 조회 기간 (일, 기본 1일, 최대 30일)
 */
export async function getAllLambdaStatuses(
  days: number = 1
): Promise<{
  totalFunctions: number;
  totalInvocations: number;
  totalErrors: number;
  functions: { name: string; invocations: number; errors: number; errorRate: number }[];
}> {
  await loadFunctionNameCache();

  const statuses: LambdaStatus[] = [];
  for (const shortName of functionNameCache.keys()) {
    const status = await getLambdaStatus(shortName, days);
    statuses.push(status);
  }

  // 요약 형식으로 반환 (observation 500자 제한 대응)
  return {
    totalFunctions: statuses.length,
    totalInvocations: statuses.reduce((sum, s) => sum + s.invocations, 0),
    totalErrors: statuses.reduce((sum, s) => sum + s.errors, 0),
    functions: statuses.map((s) => ({
      name: s.functionName,
      invocations: s.invocations,
      errors: s.errors,
      errorRate: s.errorRate,
    })),
  };
}

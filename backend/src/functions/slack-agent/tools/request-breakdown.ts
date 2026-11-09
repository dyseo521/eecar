/**
 * API Gateway 접근 로그 집계 (DECISION_LOG E-41).
 * 스캐너, 시험 호출처럼 요청 주체를 봐야 판단되는 경우에 쓴다. Lambda까지 오지 않는 4XX도 접근 로그에는 남는다.
 */
import { CloudWatchLogsClient, GetQueryResultsCommand, StartQueryCommand } from '@aws-sdk/client-cloudwatch-logs';

const logs = new CloudWatchLogsClient({});
const POLL_MS = 1000;
const POLL_LIMIT = 15;
const TOP = 10;

type Row = Array<{ field?: string; value?: string }>;
export type RunQuery = (query: string, hours: number) => Promise<Row[]>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runInsights: RunQuery = async (queryString, hours) => {
  const logGroupName = process.env.API_ACCESS_LOG_GROUP;
  if (!logGroupName) throw new Error('API_ACCESS_LOG_GROUP이 설정되지 않았습니다');
  const endTime = Math.floor(Date.now() / 1000);
  const { queryId } = await logs.send(new StartQueryCommand({ logGroupName, startTime: endTime - hours * 3600, endTime, queryString }));
  for (let i = 0; i < POLL_LIMIT; i++) {
    await sleep(POLL_MS);
    const res = await logs.send(new GetQueryResultsCommand({ queryId }));
    if (res.status === 'Complete') return (res.results ?? []) as Row[];
    if (res.status === 'Failed' || res.status === 'Cancelled') throw new Error(`접근 로그 조회 실패: ${res.status}`);
  }
  throw new Error('접근 로그 조회 시간 초과');
};

const toPairs = (rows: Row[], key: string): Array<[string, number]> => rows.map(row => {
  const get = (name: string) => row.find(c => c.field === name)?.value ?? '';
  return [get(key), Number(get('c'))] as [string, number];
});

/** statusClass는 4xx, 5xx 같은 값만 받아 쿼리에 그대로 넣지 않는다 */
export async function getRequestBreakdown(hours = 24, statusClass?: string, run: RunQuery = runInsights): Promise<Record<string, unknown>> {
  const digit = /^[1-5]xx$/i.test(statusClass ?? '') ? statusClass![0] : undefined;
  const filter = digit ? `filter status like /^${digit}/ | ` : '';
  const by = (field: string) => `${filter}stats count(*) as c by ${field} | sort c desc | limit ${TOP}`;
  const [status, paths, ips, agents] = await Promise.all([by('status'), by('path'), by('ip'), by('userAgent')].map(q => run(q, hours)));
  const byStatus = Object.fromEntries(toPairs(status, 'status'));
  return {
    windowHours: hours,
    ...(digit ? { statusClass: `${digit}xx` } : {}),
    total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
    byStatus,
    topPaths: toPairs(paths, 'path'),
    topIps: toPairs(ips, 'ip'),
    topUserAgents: toPairs(agents, 'userAgent'),
  };
}

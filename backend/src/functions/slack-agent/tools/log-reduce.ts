/**
 * 로그를 모델에 넘기기 전에 규칙으로 정리한다 (DECISION_LOG E-37).
 *
 * 원칙: 규칙이 정확히 맞을 때만 줄이고, 아니면 원문을 그대로 둔다.
 * 로그 형식이 바뀌면 덜 줄어들 뿐 내용은 사라지지 않는다.
 * - START·END: 형식 전체가 맞는 줄만 뺀다.
 * - REPORT: 값을 뽑는 데 성공할 때만 실행 시간·메모리로 줄인다.
 * - EMF: JSON 파싱에 성공할 때만 `_aws` 설정부를 빼고 값을 모두 남긴다. 단계별 지연처럼 진단에 쓰는 값이 여기 있다.
 * - 반복 줄: 요청 ID와 시각만 가려 완전히 같으면 묶는다. 숫자는 가리지 않는다. "bm25 96"과 "bm25 0"은 다른 신호다.
 * - 오류·경고 줄은 건드리지 않는다.
 */
export interface ReducibleLogEntry {
  timestamp: string;
  message: string;
  level?: string;
  [key: string]: unknown;
}

const ISO_PREFIX = '(?:\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z\\s+)?';
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const START_END = new RegExp(`^${ISO_PREFIX}(?:START RequestId: ${UUID} Version: \\S+|END RequestId: ${UUID})\\s*$`);
const REPORT = new RegExp(
  `^${ISO_PREFIX}REPORT RequestId: (${UUID})\\s+Duration: ([\\d.]+) ms\\s+Billed Duration: [\\d.]+ ms\\s+Memory Size: (\\d+) MB\\s+Max Memory Used: (\\d+) MB(?:\\s+Init Duration: ([\\d.]+) ms)?`,
);
const ISO_ANYWHERE = /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g;
const UUID_ANYWHERE = new RegExp(UUID, 'g');
const HEX_ID = /\b[0-9a-f]{24,}\b/g;

function compressReport(message: string): string | undefined {
  const m = REPORT.exec(message);
  if (!m) return undefined;
  const init = m[5] ? ` 콜드 스타트 ${m[5]}ms` : '';
  return `REPORT ${m[1].slice(0, 8)} ${m[2]}ms 메모리 ${m[4]}/${m[3]}MB${init}`;
}

function compressEmf(message: string): string | undefined {
  const start = message.indexOf('{"_aws"');
  if (start < 0) return undefined;
  try {
    const { _aws: _ignored, ...values } = JSON.parse(message.slice(start).trim()) as Record<string, unknown>;
    return `지표 ${Object.entries(values).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')}`;
  } catch {
    return undefined;
  }
}

const isProblem = (e: ReducibleLogEntry) => e.level === 'ERROR' || e.level === 'WARN';
const repeatKey = (message: string) => message.replace(ISO_ANYWHERE, '').replace(UUID_ANYWHERE, '').replace(HEX_ID, '').trim();

export function reduceLogs<T extends ReducibleLogEntry>(entries: T[]): { entries: T[]; summary: string } {
  const before = entries.reduce((n, e) => n + e.message.length, 0);
  const out: T[] = [];
  const seen = new Map<string, { entry: T; count: number; first: string; last: string }>();
  let dropped = 0;

  for (const entry of entries) {
    if (isProblem(entry)) {
      out.push(entry);
      continue;
    }
    if (START_END.test(entry.message)) {
      dropped++;
      continue;
    }
    const message = compressReport(entry.message) ?? compressEmf(entry.message) ?? entry.message;
    // 줄인 줄은 값이 들어 있으므로 묶지 않는다
    if (message !== entry.message) {
      out.push({ ...entry, message });
      continue;
    }
    const key = repeatKey(message);
    const prior = seen.get(key);
    if (prior) {
      prior.count++;
      prior.last = entry.timestamp;
      dropped++;
      continue;
    }
    const copy = { ...entry };
    seen.set(key, { entry: copy, count: 1, first: entry.timestamp, last: entry.timestamp });
    out.push(copy);
  }

  for (const { entry, count, first, last } of seen.values()) {
    if (count > 1) entry.message = `${entry.message.trimEnd()} (같은 줄 ×${count}, ${first} ~ ${last})`;
  }

  const after = out.reduce((n, e) => n + e.message.length, 0);
  return { entries: out, summary: `로그 정리: ${entries.length}줄 ${before}자 → ${out.length}줄 ${after}자. 오류·경고 줄은 원문이다.` };
}

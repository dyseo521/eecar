/**
 * 배포된 소스 코드 조회 (DECISION_LOG E-41).
 * 소스 스냅샷을 Lambda 패키지에 함께 넣어 운영 중인 코드와 조회 결과가 항상 일치한다. 별도 비밀값이 필요 없다.
 * 입력 경로로 파일시스템에 접근하지 않고, 스냅샷 목록에 있는 파일만 읽는다.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const MAX_MATCHES = 20;
const MAX_LINES = 150;
const LINE_CHARS = 200;
const CONTEXT = 2;

export type CodeFiles = Record<string, string>;

const clip = (line: string) => (line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}...` : line);

let snapshot: CodeFiles | undefined;

function loadSnapshot(): CodeFiles {
  if (snapshot) return snapshot;
  const root = process.env.CODE_SNAPSHOT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'source-snapshot');
  const files: CodeFiles = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf-8');
    }
  };
  walk(root);
  snapshot = files;
  return files;
}

export interface CodeSearchInput {
  query?: string;
  path?: string;
  startLine?: number;
}

export function searchCode(input: CodeSearchInput, files: CodeFiles = loadSnapshot()): Record<string, unknown> {
  if (input.path) {
    const wanted = input.path.replace(/\\/g, '/').replace(/^\.?\//, '');
    const found = Object.keys(files).find(p => p === wanted) ?? Object.keys(files).find(p => p.endsWith(`/${wanted}`));
    if (!found) return { found: false, path: input.path, note: '해당 파일이 스냅샷에 없습니다. query로 파일을 먼저 찾으세요.' };
    const lines = files[found].split(/\r?\n/);
    const start = Math.max(1, Math.floor(input.startLine ?? 1));
    const end = Math.min(lines.length, start + MAX_LINES - 1);
    return { found: true, path: found, startLine: start, endLine: end, totalLines: lines.length, content: lines.slice(start - 1, end).map(clip).join('\n') };
  }
  const query = (input.query ?? '').trim().toLowerCase();
  if (!query) return { error: 'query 또는 path가 필요합니다.' };
  const matches: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const [path, text] of Object.entries(files)) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.toLowerCase().includes(query)) return;
      total++;
      if (matches.length >= MAX_MATCHES) return;
      matches.push({ path, line: i + 1, context: lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).map(clip).join('\n') });
    });
  }
  return { query: input.query, totalMatches: total, truncated: total > matches.length, matches };
}

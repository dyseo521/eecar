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
const LAYOUT = '함수 코드는 backend/src/functions/<kebab-case 이름>/index.ts, 공통 코드는 backend/src/utils/, 인프라는 infrastructure/template.yaml에 있습니다.';

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

/** 대소문자와 구분 기호를 무시한다. max_tokens, maxTokens, MAX-TOKENS를 같게 본다 */
const normalize = (text: string) => text.toLowerCase().replace(/[_-]/g, '');

/** VectorSearchFunction을 실제 폴더 이름 vector-search로 바꾼다 */
function kebabFunctionName(segment: string): string {
  return segment.replace(/Function$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function resolvePath(wanted: string, files: CodeFiles): string | undefined {
  const paths = Object.keys(files);
  const candidates = [wanted, wanted.split('/').map(s => (/^[A-Z].*Function$/.test(s) ? kebabFunctionName(s) : s)).join('/')];
  for (const c of candidates) {
    const found = paths.find(p => p === c) ?? paths.find(p => p.endsWith(`/${c}`));
    if (found) return found;
  }
  return undefined;
}

function suggestPaths(text: string, files: CodeFiles): string[] {
  const tokens = text.split(/[\s/.]+/).map(s => normalize(s.replace(/Function$/, ''))).filter(s => s.length >= 3 && s !== 'backend' && s !== 'src' && s !== 'functions' && s !== 'index');
  return Object.keys(files)
    .map(p => ({ p, score: tokens.filter(token => normalize(p).includes(token)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(x => x.p);
}

export function searchCode(input: CodeSearchInput, files: CodeFiles = loadSnapshot()): Record<string, unknown> {
  if (input.path) {
    const wanted = input.path.replace(/\\/g, '/').replace(/^\.?\//, '');
    const found = resolvePath(wanted, files);
    if (!found) return { found: false, path: input.path, note: '해당 파일이 스냅샷에 없습니다.', suggestions: suggestPaths(wanted, files) };
    const lines = files[found].split(/\r?\n/);
    const start = Math.max(1, Math.floor(input.startLine ?? 1));
    const end = Math.min(lines.length, start + MAX_LINES - 1);
    return { found: true, path: found, startLine: start, endLine: end, totalLines: lines.length, content: lines.slice(start - 1, end).map(clip).join('\n') };
  }
  const tokens = [...new Set((input.query ?? '').trim().split(/\s+/).map(normalize).filter(Boolean))];
  if (tokens.length === 0) return { error: 'query 또는 path가 필요합니다.' };

  // 여러 단어는 한 줄에 많이 나온 순서로 돌려준다. 모든 단어가 함께 있는 줄이 없어도 일부 일치를 보여 준다
  const hits: Array<{ path: string; line: number; score: number; context: string }> = [];
  for (const [path, text] of Object.entries(files)) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const normalized = normalize(line);
      const score = tokens.filter(token => normalized.includes(token)).length;
      if (score > 0) hits.push({ path, line: i + 1, score, context: lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).map(clip).join('\n') });
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const matches = hits.slice(0, MAX_MATCHES);
  return {
    query: input.query,
    totalMatches: hits.length,
    truncated: hits.length > matches.length,
    matchedAllTerms: matches.length > 0 && matches[0].score === tokens.length,
    matches,
    ...(hits.length === 0 ? { note: '일치하는 줄이 없습니다. 코드에 쓰인 영문 식별자로 검색하세요.', layout: LAYOUT } : {}),
  };
}

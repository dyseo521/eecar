/**
 * 평가용 장기 기억 (DECISION_LOG A-53, E-44).
 *
 * 시나리오의 `memories`(미리 넣어 둔 기억)와 `codeVersions`(지금 함수 코드 지문)로 운영과 같은 검색 경로를 돌린다.
 * 순위, 하한, 코드 변경 표시는 운영 코드(memory-core.ts의 rankMemories, formatRecall)를 그대로 쓰고,
 * 저장소만 S3 Vectors 대신 메모리 안의 코사인 검색으로 바꾼다.
 * 기억을 시나리오 데이터에 두는 이유: LLM Judge가 도구 호출을 다시 실행해 근거를 복원할 때 같은 검색 결과가 나와야 한다.
 * 임베딩은 운영과 같은 Titan v2를 쓰고 파일에 캐시한다(같은 문장은 같은 벡터).
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { embed } from '../../backend/src/functions/slack-agent/tools/memory.js';
import { recallMemory } from '../../backend/src/functions/slack-agent/tools/memory.js';
import { MemoryRecord, MemoryView, cosine, memoryIndexText } from '../../backend/src/functions/slack-agent/tools/memory-core.js';

const CACHE_FILE = process.env.MEMORY_EMBED_CACHE ?? 'eval/agent/.memory-embed-cache.json';
let cache: Record<string, number[]> | null = null;

function loadCache(): Record<string, number[]> {
  if (!cache) cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) : {};
  return cache!;
}

export async function cachedEmbed(text: string): Promise<number[]> {
  const c = loadCache();
  const key = createHash('sha256').update(text).digest('hex');
  if (!c[key]) {
    c[key] = await embed(text);
    writeFileSync(CACHE_FILE, JSON.stringify(c));
  }
  return c[key];
}

export interface ScenarioMemory extends Omit<MemoryRecord, 'evidence' | 'lastSeenAt' | 'count' | 'kind' | 'verdict'> {
  kind?: MemoryRecord['kind'];
  verdict?: string;
  evidence?: string[];
  lastSeenAt?: string;
  count?: number;
}

export function toRecord(m: ScenarioMemory): MemoryRecord {
  return {
    ...m,
    kind: m.kind ?? 'case',
    verdict: m.verdict ?? (m.kind === 'fact' ? 'fact' : 'root_cause'),
    evidence: m.evidence ?? [],
    lastSeenAt: m.lastSeenAt ?? m.createdAt,
    count: m.count ?? 1,
  };
}

/** 시나리오의 기억으로 recall 함수를 만든다. 기억이 없으면 늘 빈 결과(운영의 하한 미달과 같은 안내) */
export function makeScenarioRecall(scenario: { memories?: ScenarioMemory[]; codeVersions?: Record<string, string> }) {
  const records = new Map((scenario.memories ?? []).map(m => [m.key, toRecord(m)] as const));
  return async (input: { query: string; functionName?: string; topK?: number }): Promise<MemoryView[]> => {
    if (records.size === 0) return [];
    return recallMemory(input, {
      embed: cachedEmbed,
      query: async (vector, topK) => {
        const scored = await Promise.all([...records.values()].map(async r => ({ key: r.key, similarity: cosine(vector, await cachedEmbed(memoryIndexText(r))) })));
        return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
      },
      loadRecords: async keys => new Map(keys.filter(k => records.has(k)).map(k => [k, records.get(k)!] as const)),
      codeVersion: async fn => scenario.codeVersions?.[fn],
    });
  };
}

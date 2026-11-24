/**
 * 자동이 장기 기억의 저장소 입출력 (DECISION_LOG A-53).
 *
 * - 검색용 벡터와 짧은 필터 값은 S3 Vectors(jadong-memories)에, 기억 원문은 DynamoDB(JADONGMEM#{key})에 둔다.
 *   S3 Vectors의 필터용 메타데이터는 2KB 한도라 원문을 넣지 않는다.
 * - 저장은 사람의 버튼 피드백으로만 한다. 진단을 보낼 때 대기 항목(JADONGDIAG#{id})을 남기고, 버튼을 누르면 기억으로 옮긴다.
 * - 판단 로직(하한, 정렬, 갱신 조건)은 memory-core.ts에 있다.
 */
import { createHash } from 'crypto';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3VectorsClient, PutVectorsCommand, QueryVectorsCommand, DeleteVectorsCommand } from '@aws-sdk/client-s3vectors';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';
import type { Diagnosis } from './diagnosis.js';
import { resolveFunction } from './cloudwatch.js';
import {
  MemoryHit, MemoryOutcome, MemoryProposal, MemoryRecord, MemoryView, MEMORY_DUPLICATE_SIMILARITY, MEMORY_RECALL_LIMIT,
  memoryIndexText, memoryQueryText, mergeRecord, rankMemories, sameCase,
} from './memory-core.js';

const REGION = 'ap-northeast-2';
const VECTOR_BUCKET = process.env.S3_VECTORS_BUCKET || 'eecar-vectors-index-12234628';
const MEMORY_INDEX = process.env.S3_VECTORS_MEMORY_INDEX || 'jadong-memories';
const EMBED_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBED_DIMENSION = 1024;
/** 버튼을 누를 수 있는 기간. 진단 뒤 2주 안에 확인되지 않으면 기억하지 않는다 (판단) */
export const PENDING_TTL_SECONDS = 14 * 24 * 60 * 60;

const bedrock = new BedrockRuntimeClient({ region: REGION });
const s3vectors = new S3VectorsClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });
const lambda = new LambdaClient({ region: REGION });
const table = () => process.env.PARTS_TABLE_NAME;

export async function embed(text: string): Promise<number[]> {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: EMBED_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: text.slice(0, 8192), dimensions: EMBED_DIMENSION, normalize: true }),
  }));
  return JSON.parse(new TextDecoder().decode(res.body)).embedding;
}

/** 함수 코드와 레이어의 지문. 레이어만 바뀌어도 동작이 바뀌므로 함께 본다 */
export async function codeVersion(functionName: string): Promise<string | undefined> {
  try {
    const { fullName, found } = await resolveFunction(functionName);
    if (!found) return undefined;
    const c = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: fullName }));
    if (!c.CodeSha256) return undefined;
    const layers = (c.Layers ?? []).map(l => l.Arn ?? '').sort().join(',');
    return createHash('sha256').update(`${c.CodeSha256}|${layers}`).digest('hex').slice(0, 12);
  } catch (error) {
    console.warn('[memory] 코드 지문 조회 실패:', (error as Error).name);
    return undefined;
  }
}

async function queryVectors(vector: number[], topK: number, filter?: Record<string, unknown>): Promise<MemoryHit[]> {
  const res = await s3vectors.send(new QueryVectorsCommand({
    vectorBucketName: VECTOR_BUCKET,
    indexName: MEMORY_INDEX,
    queryVector: { float32: vector },
    topK,
    returnDistance: true,
    ...(filter ? { filter: filter as never } : {}),
  }));
  // 코사인 거리 = 1 - 유사도. 이전에는 returnDistance를 주지 않아 유사도가 늘 0이었다
  return (res.vectors ?? []).filter(v => v.key).map(v => ({ key: v.key!, similarity: 1 - (v.distance ?? 1) }));
}

async function loadRecords(keys: string[]): Promise<Map<string, MemoryRecord>> {
  const out = new Map<string, MemoryRecord>();
  if (keys.length === 0) return out;
  const res = await ddb.send(new BatchGetCommand({
    RequestItems: { [table()!]: { Keys: keys.map(k => ({ PK: `JADONGMEM#${k}`, SK: 'RECORD' })) } },
  }));
  for (const item of res.Responses?.[table()!] ?? []) {
    const { PK: _pk, SK: _sk, ...record } = item;
    out.set(String(record.key), record as MemoryRecord);
  }
  return out;
}

export interface RecallDeps {
  embed?: (text: string) => Promise<number[]>;
  query?: (vector: number[], topK: number) => Promise<MemoryHit[]>;
  loadRecords?: (keys: string[]) => Promise<Map<string, MemoryRecord>>;
  codeVersion?: (functionName: string) => Promise<string | undefined>;
}

/**
 * 과거 사례 검색. 하한을 넘는 기억만, 같은 함수를 먼저, 코드가 바뀐 기억은 표시해서 돌려준다.
 * 실패하면 빈 목록을 돌려준다(기억 없이 조사를 계속한다).
 */
export async function recallMemory(
  input: { query: string; functionName?: string; topK?: number },
  deps: RecallDeps = {},
): Promise<MemoryView[]> {
  try {
    const vector = await (deps.embed ?? embed)(memoryQueryText(input.query, input.functionName));
    const limit = Math.min(Math.max(Number(input.topK) || MEMORY_RECALL_LIMIT, 1), 5);
    // 같은 함수를 앞에 세우려면 후보가 조금 더 필요하다
    const hits = await (deps.query ?? queryVectors)(vector, limit * 3);
    const records = await (deps.loadRecords ?? loadRecords)(hits.map(h => h.key));
    const functions = [...new Set([...records.values()].map(r => r.functionName).filter((f): f is string => Boolean(f)))];
    const versions = await Promise.all(functions.map(async f => [f, await (deps.codeVersion ?? codeVersion)(f)] as const));
    return rankMemories(hits, records, { functionName: input.functionName, currentVersions: new Map(versions), limit });
  } catch (error) {
    console.error('[memory] 검색 실패:', (error as Error).name, (error as Error).message);
    return [];
  }
}

/**
 * 확인된 기억을 저장한다. 같은 사례(함수, 장애 유형, 판정, 코드 지문이 같고 매우 비슷함)가 있으면 횟수만 올린다.
 */
export async function saveMemoryRecord(record: MemoryRecord): Promise<{ action: 'added' | 'updated'; key: string; count: number }> {
  const vector = await embed(memoryIndexText(record));
  const filter = record.functionName ? { functionName: { $eq: record.functionName } } : undefined;
  const hits = (await queryVectors(vector, 3, filter)).filter(h => h.similarity >= MEMORY_DUPLICATE_SIMILARITY);
  const existing = [...(await loadRecords(hits.map(h => h.key))).values()].find(r => sameCase(r, record));
  const final = existing ? mergeRecord(existing, record) : record;

  await ddb.send(new PutCommand({ TableName: table(), Item: { PK: `JADONGMEM#${final.key}`, SK: 'RECORD', ...final } }));
  await s3vectors.send(new PutVectorsCommand({
    vectorBucketName: VECTOR_BUCKET,
    indexName: MEMORY_INDEX,
    vectors: [{
      key: final.key,
      data: { float32: vector },
      metadata: {
        outcome: final.outcome,
        ...(final.functionName ? { functionName: final.functionName } : {}),
        ...(final.faultType ? { faultType: final.faultType } : {}),
        ...(final.codeVersion ? { codeVersion: final.codeVersion } : {}),
        createdAt: final.createdAt,
      },
    }],
  }));
  return { action: existing ? 'updated' : 'added', key: final.key, count: final.count };
}

export async function deleteMemory(key: string): Promise<void> {
  await s3vectors.send(new DeleteVectorsCommand({ vectorBucketName: VECTOR_BUCKET, indexName: MEMORY_INDEX, keys: [key] }));
  await ddb.send(new DeleteCommand({ TableName: table(), Key: { PK: `JADONGMEM#${key}`, SK: 'RECORD' } }));
}

/** 버튼 피드백을 기다리는 항목. 진단(원인 맞음 / 틀림) 또는 에이전트의 기억 제안(기억하기 / 기억하지 않기) */
export interface PendingDiagnosis {
  id: string;
  question: string;
  diagnosis?: Diagnosis;
  proposal?: MemoryProposal;
  codeVersion?: string;
  createdAt: string;
}

/** 진단을 보낼 때 버튼 피드백을 받을 대기 항목을 남긴다 */
export async function savePendingDiagnosis(p: PendingDiagnosis, now = Date.now()): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { PK: `JADONGDIAG#${p.id}`, SK: 'PENDING', ...p, TTL: Math.floor(now / 1000) + PENDING_TTL_SECONDS },
  }));
}

/**
 * 피드백을 한 번만 받는다. 이미 판정됐거나 만료됐으면 null.
 * 조건부 갱신이라 버튼을 여러 번 눌러도 기억이 한 번만 바뀐다.
 */
export async function claimFeedback(id: string, outcome: MemoryOutcome, user: string, now = new Date().toISOString()): Promise<PendingDiagnosis | null> {
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: { PK: `JADONGDIAG#${id}`, SK: 'PENDING' },
      UpdateExpression: 'SET feedback = :o, feedbackBy = :u, feedbackAt = :t',
      ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(feedback)',
      ExpressionAttributeValues: { ':o': outcome, ':u': user, ':t': now },
      ReturnValues: 'ALL_NEW',
    }));
    return (res.Attributes as PendingDiagnosis | undefined) ?? null;
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return null;
    throw error;
  }
}

/** 저장이 실패하면 다시 누를 수 있게 선점을 되돌린다 */
export async function releaseFeedback(id: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: table(),
    Key: { PK: `JADONGDIAG#${id}`, SK: 'PENDING' },
    UpdateExpression: 'REMOVE feedback, feedbackBy, feedbackAt',
    ConditionExpression: 'attribute_exists(PK)',
  }));
}

export async function getPendingDiagnosis(id: string): Promise<(PendingDiagnosis & { feedback?: MemoryOutcome }) | null> {
  const res = await ddb.send(new GetCommand({ TableName: table(), Key: { PK: `JADONGDIAG#${id}`, SK: 'PENDING' } }));
  return (res.Item as (PendingDiagnosis & { feedback?: MemoryOutcome }) | undefined) ?? null;
}

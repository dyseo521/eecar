/**
 * 평가 전용: Bedrock 호출을 Anthropic API로 돌린다 (DECISION_LOG E-35).
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs eval/ts/agent-eval.ts ...
 *
 * 왜 필요한가: 평가가 AWS 비용(2026-11-06 하루 약 $69)과 운영의 일일 토큰 한도(A-42)를 함께 썼다.
 * 에이전트·판정 코드는 그대로 두고 BedrockRuntimeClient.send만 바꾼다.
 *
 * - 안전: Converse·InvokeModel 외의 Bedrock 호출은 막는다. 이 모듈이 켜지면 AWS로 나가는 모델 호출은 없다.
 * - 조건 유지: API 버전을 2023-06-01로 고정한다. 최신 버전은 temperature를 받지 않아 운영·판정 검증 때와 조건이 달라진다.
 * - 키: 저장소 루트 .env에서 읽어 클라이언트에만 넘긴다. 환경 변수, 로그, 명령줄에 두지 않는다.
 * - 지출 상한: 호출마다 사용량을 홈 디렉터리의 JSONL에 남기고(내용 없이 토큰 수만), EVAL_USD_CAP(기본 50)을 넘으면 멈춘다.
 * - EVAL_MODEL_MAP="원본=대상,..."으로 모델을 바꿔 시험한다. 예: claude-haiku-4-5-20251001=claude-haiku-5-5
 * - EVAL_SPEND_FILE로 지출 장부를 나눈다. 동시에 도는 실행이 서로의 상한을 쓰지 않게 한다.
 * - Haiku 5.5 이후 모델은 공식 이전 안내에 맞춘다: temperature를 보내지 않고, 사고 블록을 도구 결과와 함께 그대로 돌려주며,
 *   max_tokens를 넉넉히 준다(사고가 한도에 포함되고 같은 글이 토큰으로 약 30% 더 많다).
 */
import { createRequire } from 'module';
import { appendFileSync, existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

const require = createRequire(resolve('package.json'));
const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.default ?? sdk;
const bedrock = require('@aws-sdk/client-bedrock-runtime');

function readKey() {
  const line = readFileSync(resolve('.env'), 'utf-8').split(/\r?\n/).find(l => l.startsWith('ANTHROPIC_API_KEY='));
  const key = (line ?? '').slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('.env에 ANTHROPIC_API_KEY가 없다');
  return key;
}

const client = new Anthropic({ apiKey: readKey(), maxRetries: 6, defaultHeaders: { 'anthropic-version': '2023-06-01' } });

const SPEND_FILE = process.env.EVAL_SPEND_FILE ?? join(homedir(), '.eecar-anthropic-spend.jsonl');
const CAP = Number(process.env.EVAL_USD_CAP ?? 50);
// 달러/백만 토큰. 단가를 모르는 모델은 상한을 지키기 위해 높게 잡는다
const PRICE = [[/haiku-5-5/, 0.1, 0.5], [/haiku-4-5/, 1, 5], [/sonnet-4-6/, 3, 15]];
const UNKNOWN_PRICE = [3, 15];
const MODEL_MAP = Object.fromEntries((process.env.EVAL_MODEL_MAP ?? '').split(',').filter(Boolean).map(p => p.split('=')));

function apiModel(modelId) {
  const id = modelId.replace(/^(global|apac|us|eu)\./, '').replace(/^anthropic\./, '').replace(/-v\d+:\d+$/, '');
  if (!id.startsWith('claude-')) throw new Error(`평가에서 허용하지 않은 모델: ${modelId}`);
  return MODEL_MAP[id] ?? id;
}

/** 5세대 이후 모델은 temperature를 받지 않고, 사고가 기본으로 켜져 있어 max_tokens에 여유가 필요하다 */
const acceptsTemperature = model => !/-5(-\d+)?$/.test(model);
const THINKING_MIN_MAX_TOKENS = 8192;
const maxTokensFor = (model, requested) => (acceptsTemperature(model) ? requested : Math.max(requested, THINKING_MIN_MAX_TOKENS));

function spent() {
  if (!existsSync(SPEND_FILE)) return 0;
  // 동시에 도는 실행이 쓰는 중인 마지막 줄은 깨져 있을 수 있다. 읽기 실패로 평가를 멈추지 않는다
  return readFileSync(SPEND_FILE, 'utf-8').split('\n').filter(Boolean).reduce((sum, l) => {
    try {
      return sum + JSON.parse(l).usd;
    } catch {
      return sum;
    }
  }, 0);
}

function record(model, usage) {
  const [input, output] = PRICE.find(([re]) => re.test(model))?.slice(1) ?? UNKNOWN_PRICE;
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const usd = ((usage.input_tokens + read * 0.1 + write * 1.25) * input + usage.output_tokens * output) / 1_000_000;
  appendFileSync(SPEND_FILE, `${JSON.stringify({ t: new Date().toISOString(), model, in: usage.input_tokens, out: usage.output_tokens, read, write, usd })}\n`);
}

async function call(params) {
  if (spent() >= CAP) throw new Error(`평가 지출 상한 $${CAP}에 도달해 중단한다`);
  const response = await client.messages.create(params);
  record(params.model, response.usage);
  return response;
}

function toContent(block) {
  if (block.text !== undefined) return { type: 'text', text: block.text };
  // 사고 블록은 내용이 비어 있어도 그대로 돌려줘야 한다 (공식 이전 안내)
  if (block.reasoningContent?.reasoningText) {
    return { type: 'thinking', thinking: block.reasoningContent.reasoningText.text ?? '', signature: block.reasoningContent.reasoningText.signature };
  }
  if (block.reasoningContent?.redactedContent !== undefined) return { type: 'redacted_thinking', data: block.reasoningContent.redactedContent };
  if (block.toolUse) return { type: 'tool_use', id: block.toolUse.toolUseId, name: block.toolUse.name, input: block.toolUse.input };
  if (block.toolResult) {
    return { type: 'tool_result', tool_use_id: block.toolResult.toolUseId, content: block.toolResult.content.map(c => ({ type: 'text', text: c.text })) };
  }
  throw new Error(`변환할 수 없는 메시지 블록: ${Object.keys(block).join(',')}`);
}

/** Converse의 system 배열을 Messages 형식으로 바꾼다. cachePoint는 바로 앞 블록의 cache_control이 된다 */
function toSystem(blocks = []) {
  const system = [];
  for (const b of blocks) {
    if (b.cachePoint) system[system.length - 1].cache_control = { type: 'ephemeral' };
    else system.push({ type: 'text', text: b.text });
  }
  return system;
}

function toToolChoice(choice) {
  if (!choice) return undefined;
  if (choice.any) return { type: 'any' };
  if (choice.tool) return { type: 'tool', name: choice.tool.name };
  return { type: 'auto' };
}

async function converse(input) {
  const model = apiModel(input.modelId);
  const temperature = input.inferenceConfig?.temperature;
  const toolChoice = toToolChoice(input.toolConfig?.toolChoice);
  const system = toSystem(input.system);
  const response = await call({
    model,
    max_tokens: maxTokensFor(model, input.inferenceConfig?.maxTokens ?? 1024),
    ...(temperature !== undefined && acceptsTemperature(model) ? { temperature } : {}),
    ...(system.length ? { system } : {}),
    messages: input.messages.map(m => ({ role: m.role, content: m.content.map(toContent) })),
    ...(input.toolConfig?.tools?.length ? {
      tools: input.toolConfig.tools.map(t => ({ name: t.toolSpec.name, description: t.toolSpec.description, input_schema: t.toolSpec.inputSchema.json, ...(t.toolSpec.strict ? { strict: true } : {}) })),
    } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(process.env.EVAL_EFFORT && !acceptsTemperature(model) ? { output_config: { effort: process.env.EVAL_EFFORT } } : {}),
  });
  const content = response.content.flatMap(b => {
    if (b.type === 'text') return [{ text: b.text }];
    if (b.type === 'tool_use') return [{ toolUse: { toolUseId: b.id, name: b.name, input: b.input } }];
    if (b.type === 'thinking') return [{ reasoningContent: { reasoningText: { text: b.thinking, signature: b.signature } } }];
    if (b.type === 'redacted_thinking') return [{ reasoningContent: { redactedContent: b.data } }];
    return [];
  });
  const u = response.usage;
  return {
    output: { message: { role: 'assistant', content } },
    stopReason: response.stop_reason,
    usage: {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      totalTokens: u.input_tokens + u.output_tokens,
      cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteInputTokens: u.cache_creation_input_tokens ?? 0,
    },
  };
}

/** InvokeModel 본문은 이미 Messages 형식이다 */
async function invokeModel(input) {
  const body = JSON.parse(typeof input.body === 'string' ? input.body : new TextDecoder().decode(input.body));
  const { anthropic_version: _version, ...rest } = body;
  const model = apiModel(input.modelId);
  if (!acceptsTemperature(model)) {
    delete rest.temperature;
    rest.max_tokens = maxTokensFor(model, rest.max_tokens ?? 1024);
  }
  const response = await call({ ...rest, model });
  return { body: new TextEncoder().encode(JSON.stringify(response)) };
}

bedrock.BedrockRuntimeClient.prototype.send = async function send(command) {
  if (command instanceof bedrock.ConverseCommand) return converse(command.input);
  if (command instanceof bedrock.InvokeModelCommand) return invokeModel(command.input);
  throw new Error(`평가에서 허용하지 않은 Bedrock 호출: ${command.constructor.name}`);
};

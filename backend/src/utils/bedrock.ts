import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v1';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Call Claude via Bedrock for text generation
 */
export async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt?: string,
  maxTokens: number = 1024
): Promise<string> {
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    messages,
    ...(systemPrompt && { system: systemPrompt }),
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return responseBody.content[0].text;
}

/**
 * Generate text embedding using Bedrock Titan
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const body = {
    inputText: text,
  };

  const command = new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  return responseBody.embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find top-K most similar vectors
 */
export function findTopKSimilar(
  queryVector: number[],
  candidateVectors: Array<{ id: string; vector: number[] }>,
  k: number = 10
): Array<{ id: string; score: number }> {
  const similarities = candidateVectors.map(candidate => ({
    id: candidate.id,
    score: cosineSimilarity(queryVector, candidate.vector),
  }));

  // Sort by score descending
  similarities.sort((a, b) => b.score - a.score);

  return similarities.slice(0, k);
}

/**
 * Prepare text for embedding (combine part information)
 */
export function preparePartText(part: any): string {
  const sections = [
    `부품명: ${part.name}`,
    `카테고리: ${part.category}`,
    `제조사: ${part.manufacturer}`,
    `모델: ${part.model}`,
    `설명: ${part.description || '없음'}`,
  ];

  if (part.specifications) {
    const spec = part.specifications;
    sections.push(`소재: ${spec.materialComposition?.primary || '미상'}`);
    if (spec.electricalProps) {
      sections.push(
        `전기적 특성: 전압 ${spec.electricalProps.voltage}V, 용량 ${spec.electricalProps.capacity}Ah`
      );
    }
  }

  return sections.join('\n');
}

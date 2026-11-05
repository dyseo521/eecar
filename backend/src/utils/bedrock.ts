import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Bedrock 서울 리전 사용 (2024년 10월부터 지원)
const bedrockClient = new BedrockRuntimeClient({
  region: 'ap-northeast-2'  
});

// 기본값은 global inference profile. Claude 3 계열은 퇴역해 호출되지 않는다 (DECISION_LOG A-11, A-14)
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'global.anthropic.claude-haiku-4-5-20251001-v1:0';
const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';  // Titan Embeddings G2 (서울 지원)

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
}

/**
 * Call a Claude model (or inference profile) through the Anthropic Messages body on Bedrock.
 * Returns the first text block: models with extended/adaptive thinking can put a thinking
 * block first, so reading content[0] is not safe.
 */
export async function invokeClaude(
  messages: ClaudeMessage[],
  options: { systemPrompt?: string; maxTokens?: number; modelId?: string } = {}
): Promise<ClaudeResult> {
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: options.maxTokens ?? 1024,
    messages,
    ...(options.systemPrompt && { system: options.systemPrompt }),
  };

  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: options.modelId ?? MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  }));
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const textBlock = (responseBody.content || []).find((block: { type?: string }) => block.type === 'text');

  return {
    text: textBlock?.text ?? '',
    inputTokens: responseBody.usage?.input_tokens ?? 0,
    outputTokens: responseBody.usage?.output_tokens ?? 0,
    stopReason: responseBody.stop_reason,
  };
}

/**
 * Call Claude via Bedrock for text generation
 */
export async function callClaude(
  messages: ClaudeMessage[],
  systemPrompt?: string,
  maxTokens: number = 1024
): Promise<string> {
  // Claude 모델(또는 inference profile)은 invokeClaude로 처리
  if (!MODEL_ID.includes('titan')) {
    return (await invokeClaude(messages, { systemPrompt, maxTokens })).text;
  }

  // Titan 형식
  const userMessage = messages.find(m => m.role === 'user')?.content || '';
  const prompt = systemPrompt ? `${systemPrompt}\n\n${userMessage}` : userMessage;
  const body = {
    inputText: prompt,
    textGenerationConfig: {
      maxTokenCount: maxTokens,
      temperature: 0.7,
      topP: 0.9,
    },
  };

  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body),
  }));
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  return responseBody.results[0].outputText;
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
 * Category Korean names mapping
 */
const CATEGORY_KOREAN: Record<string, string> = {
  'battery': '배터리',
  'motor': '모터',
  'inverter': '인버터',
  'body-chassis-frame': '차체 프레임',
  'body-panel': '바디 패널',
  'body-door': '도어',
  'body-window': '창문/유리',
};

/**
 * Generate relevant keywords from part data
 */
function generateKeywords(part: any): string[] {
  const keywords: string[] = [];

  // Category-based keywords
  if (part.category?.includes('battery')) {
    keywords.push('배터리', '리튬이온', '에너지 저장', 'BMS', '셀');
  } else if (part.category?.includes('motor')) {
    keywords.push('모터', '구동', '전동기', 'PMSM', '토크');
  } else if (part.category?.includes('inverter')) {
    keywords.push('인버터', 'DC-AC', '전력변환', 'IGBT', '컨버터');
  } else if (part.category?.includes('body')) {
    keywords.push('바디', '외장', '차체', '알루미늄', '패널');
  }

  // Manufacturer keywords
  if (part.manufacturer) {
    keywords.push(part.manufacturer);
    if (part.manufacturer.includes('현대')) keywords.push('현대차그룹');
    if (part.manufacturer.includes('LG')) keywords.push('LG에너지솔루션');
    if (part.manufacturer.includes('삼성')) keywords.push('삼성SDI');
  }

  // Condition-based keywords
  if (part.condition === 'excellent') {
    keywords.push('최상급', '프리미엄');
  } else if (part.condition === 'good') {
    keywords.push('양호', '중고');
  }

  return [...new Set(keywords)];
}

/**
 * Format material composition for embedding
 */
function formatMaterial(material: any): string {
  if (!material) return '';

  const parts: string[] = [];
  if (material.primary) parts.push(material.primary);
  if (material.alloyNumber) parts.push(`합금 ${material.alloyNumber}`);
  if (material.tensileStrength) parts.push(`인장강도 ${material.tensileStrength}MPa`);
  if (material.recyclability) parts.push(`재활용률 ${material.recyclability}%`);

  return parts.join(', ');
}

/**
 * Prepare text for embedding (combine part information)
 * Enhanced version with structured sections and keywords for better RAG performance
 */
export function preparePartText(part: any): string {
  const sections: string[] = [];

  // Header section
  sections.push('[부품정보]');
  sections.push(`부품명: ${part.name}`);
  sections.push(`카테고리: ${part.category} - ${CATEGORY_KOREAN[part.category] || part.category}`);
  sections.push(`제조사: ${part.manufacturer}`);
  sections.push(`모델: ${part.model}`);

  // Battery-specific section
  if (part.batteryHealth) {
    sections.push('[배터리 상태]');
    sections.push(`SOH: ${part.batteryHealth.soh}%`);
    if (part.batteryHealth.cathodeType) {
      sections.push(`양극재: ${part.batteryHealth.cathodeType}`);
    }
    if (part.batteryHealth.cycles) {
      sections.push(`충방전 횟수: ${part.batteryHealth.cycles}회`);
    }
    if (part.batteryHealth.predictedRange) {
      sections.push(`예상 주행거리: ${part.batteryHealth.predictedRange}km`);
    }
    // Add reuse recommendation
    if (part.batteryHealth.soh >= 70) {
      sections.push('권장용도: 전기차 재사용 가능');
    } else {
      sections.push('권장용도: ESS 전환 또는 재활용 권장');
    }
  }

  // Specifications section
  if (part.specifications) {
    const spec = part.specifications;

    if (spec.materialComposition) {
      sections.push('[재질]');
      sections.push(formatMaterial(spec.materialComposition));
    }

    if (spec.electricalProps) {
      sections.push('[전기적 특성]');
      sections.push(`전압: ${spec.electricalProps.voltage}V`);
      sections.push(`용량: ${spec.electricalProps.capacity}Ah`);
      if (spec.electricalProps.power) {
        sections.push(`출력: ${spec.electricalProps.power}kW`);
      }
    }

    if (spec.dimensions) {
      sections.push('[치수]');
      const dim = spec.dimensions;
      sections.push(`크기: ${dim.length || 0}x${dim.width || 0}x${dim.height || 0}mm`);
      if (dim.weight) sections.push(`중량: ${dim.weight}kg`);
    }
  }

  // Description section
  sections.push('[설명]');
  sections.push(part.description || '상세 설명 없음');

  // Use cases section for RAG search improvement
  if (part.useCases && Array.isArray(part.useCases) && part.useCases.length > 0) {
    sections.push('[활용 사례]');
    part.useCases.forEach((useCase: any, index: number) => {
      sections.push(`사례 ${index + 1}: ${useCase.industry} - ${useCase.application}`);
      if (useCase.description) {
        // 설명은 처음 100자만 포함 (임베딩 효율성)
        sections.push(useCase.description.substring(0, 100));
      }
      if (useCase.requirements) {
        const reqStr = Object.entries(useCase.requirements)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        sections.push(`요구사항: ${reqStr}`);
      }
    });
  }

  // Keywords section for improved recall
  const keywords = generateKeywords(part);
  if (keywords.length > 0) {
    sections.push('[키워드]');
    sections.push(keywords.join(', '));
  }

  return sections.join('\n');
}
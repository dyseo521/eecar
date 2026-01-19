/**
 * AI 에러 분석 도구
 * Bedrock Claude + KB로 에러 원인 분석 및 해결책 제시
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ErrorAnalysis, MemoryResult } from '../types.js';
import { recallMemory } from './memory.js';
import { ERROR_ANALYSIS_PROMPT } from '../prompts/system.js';

const bedrockClient = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
const kbClient = new BedrockAgentRuntimeClient({ region: 'ap-northeast-2' });
const ssmClient = new SSMClient({ region: 'ap-northeast-2' });

// Bedrock KB ID (SSM에서 가져옴)
let cachedKbId: string | null = null;

async function getKnowledgeBaseId(): Promise<string> {
  if (cachedKbId) return cachedKbId;

  const paramName = process.env.BEDROCK_KB_ID_SSM_PARAM || '/eecar/bedrock/kb-id';
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({ Name: paramName })
    );
    cachedKbId = response.Parameter?.Value || '';
    return cachedKbId;
  } catch (error) {
    console.log('KB ID not configured yet, skipping KB search');
    return '';
  }
}

// 모델 ID (비용 최적화: Haiku 기본)
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

interface AnalyzeErrorInput {
  errorMessage: string;
  functionName: string;
  stackTrace?: string;
}

/**
 * 에러 분석 수행
 */
export async function analyzeError(input: AnalyzeErrorInput): Promise<ErrorAnalysis> {
  const { errorMessage, functionName, stackTrace } = input;

  console.log('Analyzing error:', { errorMessage, functionName });

  // 에러 타입 추출
  const errorType = extractErrorType(errorMessage);

  // 병렬로 컨텍스트 수집
  const [codeContext, pastSolutions] = await Promise.all([
    searchCodebase(errorType, functionName),
    recallMemory({ query: `${errorType} ${functionName}`, topK: 3 }),
  ]);

  // Claude로 분석
  const analysis = await callClaudeForAnalysis({
    errorType,
    functionName,
    errorMessage,
    stackTrace,
    codeContext,
    pastSolutions,
  });

  return {
    errorType,
    functionName,
    cause: analysis.cause,
    solutions: analysis.solutions,
    relatedCode: analysis.relatedCode,
    pastSolutions,
  };
}

/**
 * 에러 타입 추출
 */
function extractErrorType(message: string): string {
  // 일반적인 에러 타입 패턴 매칭
  const patterns = [
    /([A-Za-z]+Exception)/,
    /([A-Za-z]+Error)/,
    /Throttling/i,
    /Timeout/i,
    /AccessDenied/i,
    /ResourceNotFound/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }

  return 'UnknownError';
}

/**
 * Bedrock KB로 관련 코드 검색
 */
async function searchCodebase(
  errorType: string,
  functionName: string
): Promise<string[]> {
  const kbId = await getKnowledgeBaseId();
  if (!kbId) {
    console.log('Knowledge Base ID not configured, skipping code search');
    return [];
  }

  try {
    const result = await kbClient.send(
      new RetrieveCommand({
        knowledgeBaseId: kbId,
        retrievalQuery: {
          text: `${errorType} in ${functionName} Lambda function`,
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 3,
          },
        },
      })
    );

    return (result.retrievalResults || [])
      .map((r) => r.content?.text || '')
      .filter((text) => text.length > 0);
  } catch (error) {
    console.error('Error searching codebase:', error);
    return [];
  }
}

/**
 * Claude로 에러 분석
 */
async function callClaudeForAnalysis(context: {
  errorType: string;
  functionName: string;
  errorMessage: string;
  stackTrace?: string;
  codeContext: string[];
  pastSolutions: MemoryResult[];
}): Promise<{
  cause: string;
  solutions: string[];
  relatedCode?: string[];
}> {
  const prompt = ERROR_ANALYSIS_PROMPT
    .replace('{errorType}', context.errorType)
    .replace('{functionName}', context.functionName)
    .replace('{errorMessage}', context.errorMessage)
    .replace('{stackTrace}', context.stackTrace || '(없음)')
    .replace(
      '{codeContext}',
      context.codeContext.length > 0
        ? context.codeContext.join('\n---\n')
        : '(코드 컨텍스트 없음)'
    )
    .replace(
      '{pastSolutions}',
      context.pastSolutions.length > 0
        ? context.pastSolutions
            .map((p) => `- ${p.memory.errorType}: ${p.memory.resolution}`)
            .join('\n')
        : '(과거 해결 사례 없음)'
    );

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1024,
          temperature: 0.3, // 낮은 temperature로 일관된 분석
        },
      })
    );

    const responseText =
      response.output?.message?.content?.[0]?.text || '';

    // 응답 파싱
    return parseAnalysisResponse(responseText);
  } catch (error) {
    console.error('Error calling Claude:', error);

    // 폴백: 기본 분석
    return getFallbackAnalysis(context.errorType, context.functionName);
  }
}

/**
 * 분석 응답 파싱
 */
function parseAnalysisResponse(text: string): {
  cause: string;
  solutions: string[];
  relatedCode?: string[];
} {
  // 원인 추출
  const causeMatch = text.match(/원인[^:]*:\s*(.+?)(?=\n|$)/i);
  const cause = causeMatch?.[1]?.trim() || '분석 중 원인을 특정하지 못했습니다.';

  // 해결책 추출
  const solutionsMatch = text.match(/해결책[^:]*:?\s*([\s\S]+?)(?=관련|예방|$)/i);
  const solutionsText = solutionsMatch?.[1] || '';
  const solutions = solutionsText
    .split(/\n/)
    .map((s) => s.replace(/^[\d.\-*]+\s*/, '').trim())
    .filter((s) => s.length > 10);

  // 관련 파일 추출
  const codeMatch = text.match(/관련[^:]*:\s*([\s\S]+?)(?=예방|$)/i);
  const relatedCode = codeMatch?.[1]
    ?.split(/\n/)
    .map((s) => s.replace(/^[-*]+\s*/, '').trim())
    .filter((s) => s.length > 0);

  return {
    cause,
    solutions: solutions.length > 0 ? solutions : ['상세 분석이 필요합니다.'],
    relatedCode,
  };
}

/**
 * 폴백 분석 (Claude 호출 실패 시)
 */
function getFallbackAnalysis(
  errorType: string,
  functionName: string
): {
  cause: string;
  solutions: string[];
  relatedCode?: string[];
} {
  // 일반적인 에러 타입별 기본 해결책
  const fallbacks: Record<string, { cause: string; solutions: string[] }> = {
    BedrockThrottlingException: {
      cause: 'Bedrock API 호출 한도 초과',
      solutions: [
        '지수 백오프 재시도 로직 추가',
        '요청 배치 처리 고려',
        'Service Quotas에서 한도 증가 요청',
      ],
    },
    LambdaTimeout: {
      cause: 'Lambda 실행 시간 초과',
      solutions: [
        'Lambda 메모리 증가 (CPU 비례)',
        '코드 최적화 (불필요한 await 제거)',
        '타임아웃 값 증가 (template.yaml)',
      ],
    },
    DynamoDBThrottling: {
      cause: 'DynamoDB 용량 초과',
      solutions: [
        '온디맨드 모드 확인',
        '배치 크기 조절',
        'DAX 캐싱 고려',
      ],
    },
    S3NoSuchKey: {
      cause: 'S3 객체를 찾을 수 없음',
      solutions: [
        '파일 경로/키 확인',
        '버킷 이름 확인',
        '객체 존재 여부 사전 체크',
      ],
    },
    AccessDenied: {
      cause: 'IAM 권한 부족',
      solutions: [
        'Lambda IAM Role 확인',
        'template.yaml Policies 확인',
        '리소스 ARN 패턴 확인',
      ],
    },
  };

  const fallback = fallbacks[errorType] || {
    cause: `${functionName}에서 ${errorType} 발생`,
    solutions: [
      'CloudWatch 로그에서 상세 스택 트레이스 확인',
      'X-Ray 트레이스로 병목 구간 확인',
      '입력값 검증 로직 확인',
    ],
  };

  return fallback;
}

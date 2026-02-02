/**
 * 자동이 2.0 도구 정의 및 라우팅
 */

import { Tool, ToolResult } from '../types.js';
import { analyzeError } from './analyze-error.js';
import { getLambdaStatus, getRecentLogs, getErrorSummary, getAllLambdaStatuses } from './cloudwatch.js';
import { recallMemory, saveMemory } from './memory.js';

/**
 * 사용 가능한 도구 목록
 */
export const TOOLS: Tool[] = [
  {
    name: 'analyze_error',
    description:
      '에러 스택트레이스를 분석하여 원인과 해결책을 제시합니다. Bedrock KB로 관련 코드도 검색합니다.',
    input_schema: {
      type: 'object',
      properties: {
        errorMessage: {
          type: 'string',
          description: '에러 메시지 또는 스택트레이스',
        },
        functionName: {
          type: 'string',
          description: 'Lambda 함수명 (선택)',
        },
      },
      required: ['errorMessage'],
    },
  },
  {
    name: 'get_logs',
    description:
      'CloudWatch에서 최근 에러 로그를 조회합니다.',
    input_schema: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'Lambda 함수명',
        },
        minutes: {
          type: 'number',
          description: '조회 시간 범위 (분, 기본 30분)',
        },
        filter: {
          type: 'string',
          description: '로그 필터',
          enum: ['ERROR', 'WARN', 'INFO', 'ALL'],
        },
      },
      required: ['functionName'],
    },
  },
  {
    name: 'get_function_status',
    description:
      'Lambda 함수의 호출 수, 에러율, 평균 응답시간 등 상태를 조회합니다.',
    input_schema: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'Lambda 함수명 (필수). 모든 함수를 조회하려면 "all"을 입력',
        },
        days: {
          type: 'number',
          description: '조회 기간 (일, 기본 1일, 최대 30일)',
        },
      },
      required: ['functionName'],
    },
  },
  {
    name: 'get_error_summary',
    description:
      '특정 기간 동안의 에러 타입별 요약을 조회합니다.',
    input_schema: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'Lambda 함수명',
        },
        hours: {
          type: 'number',
          description: '조회 기간 (시간, 기본 24시간)',
        },
      },
      required: ['functionName'],
    },
  },
  {
    name: 'recall_memory',
    description:
      '과거 유사한 에러의 해결 사례를 S3 Vectors에서 검색합니다.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색 쿼리 (에러 타입, 키워드 등)',
        },
        functionName: {
          type: 'string',
          description: '특정 함수로 필터 (선택)',
        },
        topK: {
          type: 'number',
          description: '반환할 최대 결과 수 (기본 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'save_memory',
    description:
      '성공적인 에러 해결 사례를 저장합니다. 나중에 유사한 에러에 활용됩니다.',
    input_schema: {
      type: 'object',
      properties: {
        errorType: {
          type: 'string',
          description: '에러 타입 (예: BedrockThrottlingException)',
        },
        functionName: {
          type: 'string',
          description: 'Lambda 함수명',
        },
        resolution: {
          type: 'string',
          description: '해결 방법 설명',
        },
        codeChanges: {
          type: 'string',
          description: '변경된 파일/코드 (선택)',
        },
      },
      required: ['errorType', 'functionName', 'resolution'],
    },
  },
];

/**
 * 도구 실행
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  console.log('Executing tool:', { toolName, input });

  try {
    switch (toolName) {
      case 'analyze_error': {
        const analysis = await analyzeError({
          errorMessage: String(input.errorMessage || ''),
          functionName: String(input.functionName || 'Unknown'),
          stackTrace: input.stackTrace ? String(input.stackTrace) : undefined,
        });
        return { success: true, data: analysis };
      }

      case 'get_logs': {
        const logs = await getRecentLogs(
          String(input.functionName),
          Number(input.minutes) || 30,
          (input.filter as 'ERROR' | 'WARN' | 'INFO' | 'ALL') || 'ERROR'
        );
        return { success: true, data: logs };
      }

      case 'get_function_status': {
        const functionName = String(input.functionName);
        const days = Math.min(Number(input.days) || 1, 30); // 최대 30일 제한

        if (functionName === 'all') {
          // 모든 함수 조회
          const statuses = await getAllLambdaStatuses(days);
          return { success: true, data: statuses };
        } else {
          // 단일 함수 조회
          const status = await getLambdaStatus(functionName, days);
          return { success: true, data: status };
        }
      }

      case 'get_error_summary': {
        const summary = await getErrorSummary(
          String(input.functionName),
          Number(input.hours) || 24
        );
        return { success: true, data: summary };
      }

      case 'recall_memory': {
        const memories = await recallMemory({
          query: String(input.query),
          functionName: input.functionName ? String(input.functionName) : undefined,
          topK: Number(input.topK) || 5,
        });
        return { success: true, data: memories };
      }

      case 'save_memory': {
        const saved = await saveMemory({
          errorType: String(input.errorType),
          functionName: String(input.functionName),
          resolution: String(input.resolution),
          codeChanges: input.codeChanges
            ? String(input.codeChanges).split(',')
            : undefined,
        });
        return { success: saved, data: { saved } };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool ${toolName} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 도구 설명 포맷팅 (ReAct 프롬프트용)
 */
export function formatToolsDescription(): string {
  return TOOLS.map((tool) => {
    const params = Object.entries(tool.input_schema.properties)
      .map(([name, prop]) => `  - ${name}: ${prop.description}`)
      .join('\n');
    return `• ${tool.name}: ${tool.description}\n${params}`;
  }).join('\n\n');
}

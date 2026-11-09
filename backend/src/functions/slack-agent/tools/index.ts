/**
 * 자동이 2.0 도구 정의 및 라우팅
 */

import { Tool, ToolResult } from '../types.js';
import { analyzeError } from './analyze-error.js';
import { getLambdaStatus, getRecentLogs, getErrorSummary, getAllLambdaStatuses } from './cloudwatch.js';
import { recallMemory, saveMemory } from './memory.js';
import { getFunctionConfig, getFunctionPermissions } from './config.js';
import { getProviderStatus, getRecentChanges, getServiceMetrics } from './investigate.js';
import { SUBMIT_DIAGNOSIS_TOOL } from './diagnosis.js';

/**
 * 운영에서 모델에 보여주는 도구. 사전 등록 홀드아웃을 통과한 구성이다 (E-35, A-46).
 * 조회 도구는 모두 읽기 전용이다. 조치는 제안까지만 하고 실행하지 않는다.
 */
export const PRODUCTION_TOOL_NAMES = [
  'analyze_error', 'get_logs', 'get_function_status', 'get_error_summary', 'recall_memory', 'save_memory',
  'get_function_config', 'get_function_permissions', 'get_recent_changes', 'get_service_metrics', 'get_provider_status', 'submit_diagnosis',
];

/**
 * 도구 정의 전체 (평가용 실험 도구 포함)
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
    name: 'get_function_config',
    description:
      'Lambda 함수 설정을 조회합니다: 런타임, 제한 시간, 메모리, 환경 변수(비밀값은 가림), 레이어 버전과 최신 여부, 마지막 배포 시각. 배포 직후 장애, 설정값·환경 변수 문제, 타임아웃·메모리 문제를 확인할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'Lambda 함수명',
        },
      },
      required: ['functionName'],
    },
  },
  {
    name: 'get_function_permissions',
    description:
      'Lambda 실행 역할의 IAM 정책(허용·거부 액션과 리소스)을 조회합니다. AccessDenied 같은 권한 오류의 원인을 확인할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'Lambda 함수명',
        },
      },
      required: ['functionName'],
    },
  },
  {
    name: 'get_recent_changes',
    description:
      '최근 변경 이력을 조회합니다: 스택 배포, 콘솔·스크립트의 함수 설정·코드·IAM·SSM 변경. 장애 대부분은 변경에서 시작하므로 장애 조사에서 먼저 확인합니다.',
    input_schema: {
      type: 'object',
      properties: {
        functionName: { type: 'string', description: '특정 함수로 좁힐 때 (선택)' },
        hours: { type: 'number', description: '조회 기간 (시간, 기본 168시간)' },
      },
      required: [],
    },
  },
  {
    name: 'get_service_metrics',
    description:
      '의존 서비스와 함수 한도 지표를 조회합니다: lambda(함수의 스로틀·지연 p99·최대 동시 실행, functionName 필요), bedrock(모델별 호출·스로틀·서버 오류), dynamodb(스로틀·소비 용량), apigateway(요청·5XX·4XX), canary(검색 합성 검사 실행 수와 벡터 후보 최솟값).',
    input_schema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: '서비스', enum: ['lambda', 'bedrock', 'dynamodb', 'apigateway', 'canary'] },
        functionName: { type: 'string', description: 'service가 lambda일 때 함수명' },
        hours: { type: 'number', description: '조회 기간 (시간, 기본 24시간)' },
      },
      required: ['service'],
    },
  },
  {
    name: 'get_provider_status',
    description:
      '외부 공급자(AWS 서울 리전, Anthropic, Slack)의 공개 상태와 진행 중인 장애를 조회합니다. 원인이 우리 쪽인지 공급자 쪽인지 가릴 때 사용합니다.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  // 평가용 실험 도구 (E-38). PRODUCTION_TOOL_NAMES에 없어 운영에서는 제공되지 않는다
  {
    name: 'get_impact_summary',
    description:
      '장애가 맞는지 판단할 때 쓰는 요약입니다. 최근 24시간 API 요청·5XX·4XX, 함수별 오류, 마지막 오류 시각과 경과 시간, Bedrock·DynamoDB 오류, 합성 검사 결과, CloudWatch 경보 정의(TreatMissingData 포함)를 돌려줍니다. 계산값만 돌려주며 장애 여부는 판단하지 않습니다.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  SUBMIT_DIAGNOSIS_TOOL,
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

      case 'get_recent_changes':
        return { success: true, data: await getRecentChanges(input.functionName ? String(input.functionName) : undefined, Number(input.hours) || 168) };

      case 'get_service_metrics':
        return { success: true, data: await getServiceMetrics(String(input.service), Number(input.hours) || 24, input.functionName ? String(input.functionName) : undefined) };

      case 'get_provider_status':
        return { success: true, data: await getProviderStatus() };

      case 'get_function_config':
        return { success: true, data: await getFunctionConfig(String(input.functionName)) };

      case 'get_function_permissions':
        return { success: true, data: await getFunctionPermissions(String(input.functionName)) };

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

import { createHash } from 'crypto';

export interface ParsedLogEvent {
  functionName: string;
  requestId: string;
  xrayTraceId?: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  timestamp: number;
  isError: boolean;
  errorHash: string;
}

export function parseLogEvent(logEvent: any, logGroup: string): ParsedLogEvent {
  const message = logEvent.message;
  const timestamp = logEvent.timestamp;

  // Lambda 함수명 추출 (로그 그룹에서)
  const functionName = extractFunctionName(logGroup);

  // Request ID 추출
  const requestId = extractRequestId(message);

  // 에러 여부 판단
  const isError = /ERROR|Exception|Timeout|Task timed out/i.test(message);

  // 에러 타입 추출
  const errorType = extractErrorType(message);

  // 에러 메시지 추출
  const errorMessage = extractErrorMessage(message);

  // 스택 추적 추출
  const stackTrace = extractStackTrace(message);

  // X-Ray Trace ID 추출
  const xrayTraceId = extractXRayTraceId(message);

  // 에러 해시 생성 (중복 제거용)
  const errorHash = createHash('md5')
    .update(`${functionName}:${errorType}:${errorMessage.slice(0, 200)}`)
    .digest('hex');

  return {
    functionName,
    requestId,
    xrayTraceId,
    errorType,
    errorMessage,
    stackTrace,
    timestamp,
    isError,
    errorHash,
  };
}

function extractFunctionName(logGroup: string): string {
  // "/aws/lambda/VectorSearchFunction" -> "VectorSearchFunction"
  const match = logGroup.match(/\/aws\/lambda\/([^/]+)/);
  return match ? match[1] : 'Unknown';
}

function extractRequestId(message: string): string {
  // 패턴 1: "RequestId: abc-123" (START/END/REPORT 라인)
  const pattern1Match = message.match(/RequestId: ([\w-]+)/);
  if (pattern1Match) {
    return pattern1Match[1];
  }

  // 패턴 2: "2025-12-16T14:00:25.123Z	abc-123	ERROR	..." (탭으로 구분된 ERROR 라인)
  const pattern2Match = message.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\t([\w-]+)\t/);
  if (pattern2Match) {
    return pattern2Match[1];
  }

  return 'unknown';
}

/** 스택 경로(/var/runtime/index.js, /opt/nodejs/utils/dynamodb.js)가 서비스 판별에 걸리지 않게 뺀다 */
function withoutStack(message: string): string {
  return message.split('\n').filter(line => !/^\s*at\s/.test(line)).join('\n');
}

function throttlingType(fullMessage: string): string {
  const message = withoutStack(fullMessage);
  if (/dynamodb|\btable\b|\bindex\b|throughput exceeds/i.test(message)) return 'DynamoDBThrottling';
  if (/too many (requests|tokens)|bedrock|anthropic|titan|\bmodel\b/i.test(message)) return 'BedrockThrottling';
  return 'Throttling';
}

/** "not authorized to perform: dynamodb:PutItem" 같은 문구의 액션 접두사로 서비스를 정한다 */
function accessDeniedType(fullMessage: string): string {
  const message = withoutStack(fullMessage);
  const action = /perform:?\s+(\w+):/i.exec(message)?.[1]?.toLowerCase();
  const byAction: Record<string, string> = {
    bedrock: 'BedrockAccessDenied', dynamodb: 'DynamoDBAccessDenied', s3vectors: 'S3VectorsAccessDenied', s3: 'S3AccessDenied',
    kms: 'KMSAccessDenied', sns: 'SNSAccessDenied', ssm: 'SSMAccessDenied', lambda: 'LambdaAccessDenied',
  };
  if (action && byAction[action]) return byAction[action];
  if (/ciphertext|customer master key|kms/i.test(message)) return 'KMSAccessDenied';
  if (/\bmodel\b|bedrock|not available for this account/i.test(message)) return 'BedrockAccessDenied';
  return 'AccessDenied';
}

function validationType(fullMessage: string): string {
  const message = withoutStack(fullMessage);
  if (/vector|dimension/i.test(message)) return 'S3VectorsValidation';
  if (/item size|\bkey\b|expression|\btable\b|attribute|parameter values|exclusivestartkey|dynamodb/i.test(message)) return 'DynamoDBValidation';
  return 'ValidationError';
}

function extractErrorType(message: string): string {
  // Bedrock 모델 수명 주기·입력 에러. 예외 이름이 DynamoDB와 같으므로 'model' 문맥으로 먼저 구분한다.
  // (2026-11-04 퇴역 모델 장애가 DynamoDBResourceNotFound로 잘못 분류됐었다)
  if (message.includes('ResourceNotFoundException') && /\bmodel\b/i.test(message)) return 'BedrockModelUnavailable';
  if (message.includes('ValidationException') && /\bmodel\b/i.test(message)) return 'BedrockValidation';

  // 같은 예외 이름을 여러 서비스가 쓴다. 메시지 내용으로 서비스를 가린다 (A-41).
  // 이전에는 모든 스로틀·권한 오류를 Bedrock으로 표시해 DynamoDB 권한 오류도 BedrockAccessDenied로 나갔다
  if (message.includes('ThrottlingException')) return throttlingType(message);
  if (message.includes('ModelNotFoundException')) return 'BedrockModelNotFound';
  if (message.includes('AccessDeniedException')) return accessDeniedType(message);
  if (message.includes('ModelTimeoutException')) return 'BedrockTimeout';

  // DynamoDB 에러
  if (message.includes('ValidationException')) return validationType(message);
  if (message.includes('ProvisionedThroughputExceededException')) return 'DynamoDBThrottling';
  if (message.includes('ResourceNotFoundException')) return 'DynamoDBResourceNotFound';

  // S3 에러
  if (message.includes('NoSuchKey')) return 'S3NoSuchKey';
  if (message.includes('NoSuchBucket')) return 'S3NoSuchBucket';
  if (message.includes('SlowDown')) return 'S3SlowDown';
  if (message.includes('AccessDenied') && message.includes('s3')) return 'S3AccessDenied';

  // Lambda 타임아웃
  if (message.includes('Task timed out')) return 'LambdaTimeout';

  // 일반 에러
  if (message.includes('Error:')) return 'GenericError';
  if (message.includes('Exception')) return 'Exception';

  return 'Unknown';
}

/** Lambda Node.js 런타임이 로그 앞에 붙이는 "시각\t요청 ID\t수준\t" */
const RUNTIME_PREFIX = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\t[\w-]+\t(?:ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\t/;

function extractErrorMessage(message: string): string {
  // "Error: " 또는 "Exception: " 이후 첫 줄 추출
  const errorMatch = message.match(/(?:Error|Exception): (.+?)(?:\n|$)/);
  if (errorMatch) {
    return errorMatch[1].trim();
  }

  // "Task timed out" 패턴
  if (message.includes('Task timed out')) {
    const timeoutMatch = message.match(/Task timed out after ([\d.]+) seconds/);
    return timeoutMatch ? `Lambda timed out after ${timeoutMatch[1]} seconds` : 'Lambda execution timed out';
  }

  // 첫 200자 반환. 시각과 요청 ID를 떼지 않으면 같은 에러도 해시가 매번 달라져 중복 제거가 되지 않는다 (A-49)
  return message.replace(RUNTIME_PREFIX, '').slice(0, 200).trim();
}

function extractStackTrace(message: string): string | undefined {
  // "at " 패턴으로 시작하는 줄들 추출
  const lines = message.split('\n');
  const stackLines = lines.filter(line => line.trim().startsWith('at '));

  if (stackLines.length > 0) {
    // 최대 5줄만 반환
    return stackLines.slice(0, 5).join('\n');
  }

  return undefined;
}

function extractXRayTraceId(message: string): string | undefined {
  // X-Ray Trace ID 패턴: Root=1-xxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
  // 예: Root=1-67890abc-def0123456789abcdef01234
  const match = message.match(/Root=(1-[0-9a-f]{8}-[0-9a-f]{24})/i);
  return match ? match[1] : undefined;
}

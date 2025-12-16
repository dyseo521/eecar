import { createHash } from 'crypto';

export interface ParsedLogEvent {
  functionName: string;
  requestId: string;
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

  // 에러 해시 생성 (중복 제거용)
  const errorHash = createHash('md5')
    .update(`${functionName}:${errorType}:${errorMessage.slice(0, 200)}`)
    .digest('hex');

  return {
    functionName,
    requestId,
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

function extractErrorType(message: string): string {
  // Bedrock 에러
  if (message.includes('ThrottlingException')) return 'BedrockThrottling';
  if (message.includes('ModelNotFoundException')) return 'BedrockModelNotFound';
  if (message.includes('AccessDeniedException')) return 'BedrockAccessDenied';
  if (message.includes('ModelTimeoutException')) return 'BedrockTimeout';

  // DynamoDB 에러
  if (message.includes('ValidationException')) return 'DynamoDBValidation';
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

  // 첫 200자 반환
  return message.slice(0, 200).trim();
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

export type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

const CRITICAL_FUNCTIONS = [
  'VectorSearchFunction',
  'PartRegistrationFunction',
];

const WARNING_FUNCTIONS = [
  'ComplianceCheckFunction',
  'GetPartsFunction',
];

export function classifySeverity(functionName: string, errorType: string): Severity {
  // 타임아웃은 무조건 CRITICAL
  if (errorType === 'LambdaTimeout') {
    return 'CRITICAL';
  }

  // Bedrock 에러는 CRITICAL (AI 기능 중단)
  if (errorType.startsWith('Bedrock')) {
    return 'CRITICAL';
  }

  // DynamoDB 스로틀링은 WARNING (자동 확장으로 복구 가능)
  if (errorType === 'DynamoDBThrottling') {
    return 'WARNING';
  }

  // S3 NoSuchKey는 WARNING (데이터 문제일 수 있음)
  if (errorType === 'S3NoSuchKey') {
    return 'WARNING';
  }

  // 함수별 우선순위
  if (CRITICAL_FUNCTIONS.includes(functionName)) {
    return 'CRITICAL';
  }

  if (WARNING_FUNCTIONS.includes(functionName)) {
    return 'WARNING';
  }

  return 'INFO';
}

export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'CRITICAL':
      return '#ff0000'; // 빨간색
    case 'WARNING':
      return '#ffa500'; // 주황색
    case 'INFO':
      return '#808080'; // 회색
  }
}

export function getSeverityEmoji(severity: Severity): string {
  switch (severity) {
    case 'CRITICAL':
      return '🚨';
    case 'WARNING':
      return '⚠️';
    case 'INFO':
      return 'ℹ️';
  }
}

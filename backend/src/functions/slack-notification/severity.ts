export type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

const CRITICAL_FUNCTIONS = [
  'VectorSearchFunction',
  'PartRegistrationFunction',
];

const WARNING_FUNCTIONS = [
  'ComplianceCheckFunction',
  'GetPartsFunction',
];

/**
 * SAM이 배포한 물리 함수명(예: eecar-stack-VectorSearchFunction-yXyHE1D702wX)을
 * template.yaml의 논리 ID(VectorSearchFunction)로 되돌린다.
 * 패턴에 맞지 않으면 입력을 그대로 반환한다.
 */
export function toLogicalFunctionName(functionName: string): string {
  const match = functionName.match(/(?:^|-)([A-Za-z0-9]+Function)(?:-[A-Za-z0-9]+)?$/);
  return match ? match[1] : functionName;
}

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

  // 함수별 우선순위 (로그 그룹의 물리 이름을 template.yaml 논리 ID로 바꿔 비교)
  const logicalName = toLogicalFunctionName(functionName);

  if (CRITICAL_FUNCTIONS.includes(logicalName)) {
    return 'CRITICAL';
  }

  if (WARNING_FUNCTIONS.includes(logicalName)) {
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

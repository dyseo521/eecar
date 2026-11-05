import { classifySeverity, toLogicalFunctionName } from '../../src/functions/slack-notification/severity.js';
import { parseLogEvent } from '../../src/functions/slack-notification/parser.js';

// SAM이 실제로 만드는 로그 그룹 이름 (포트폴리오 스크린샷의 함수명과 같은 형식)
const VECTOR_SEARCH_LOG_GROUP = '/aws/lambda/eecar-stack-VectorSearchFunction-yXyHE1D702wX';

describe('toLogicalFunctionName', () => {
  it('strips the SAM stack prefix and random suffix', () => {
    expect(toLogicalFunctionName('eecar-stack-VectorSearchFunction-yXyHE1D702wX')).toBe('VectorSearchFunction');
    expect(toLogicalFunctionName('eecar-stack-GetPartsFunction-AbC123')).toBe('GetPartsFunction');
  });

  it('keeps names that are already logical IDs', () => {
    expect(toLogicalFunctionName('VectorSearchFunction')).toBe('VectorSearchFunction');
  });

  it('returns unknown naming schemes unchanged', () => {
    expect(toLogicalFunctionName('my-handler')).toBe('my-handler');
    expect(toLogicalFunctionName('Unknown')).toBe('Unknown');
  });
});

describe('classifySeverity', () => {
  it('applies function rules to deployed (physical) function names', () => {
    // 회귀 테스트: 이전에는 정확히 일치하는지만 비교해서 이 경우가 INFO로 분류됐다
    expect(classifySeverity('eecar-stack-VectorSearchFunction-yXyHE1D702wX', 'GenericError')).toBe('CRITICAL');
    expect(classifySeverity('eecar-stack-PartRegistrationFunction-Q1w2E3', 'GenericError')).toBe('CRITICAL');
    expect(classifySeverity('eecar-stack-GetPartsFunction-Z9y8X7', 'GenericError')).toBe('WARNING');
  });

  it('falls back to INFO for functions without a rule', () => {
    expect(classifySeverity('eecar-stack-WatchPartFunction-AAA111', 'GenericError')).toBe('INFO');
  });

  it('lets error-type rules take precedence over function rules', () => {
    expect(classifySeverity('eecar-stack-WatchPartFunction-AAA111', 'LambdaTimeout')).toBe('CRITICAL');
    expect(classifySeverity('eecar-stack-WatchPartFunction-AAA111', 'BedrockThrottling')).toBe('CRITICAL');
    expect(classifySeverity('eecar-stack-VectorSearchFunction-yXyHE1D702wX', 'DynamoDBThrottling')).toBe('WARNING');
  });
});

describe('parseLogEvent', () => {
  it('extracts request id, error type and message from a Node.js runtime ERROR line', () => {
    const parsed = parseLogEvent(
      {
        timestamp: 1_700_000_000_000,
        message:
          '2026-11-05T01:02:03.456Z\tabc-123-def\tERROR\tThrottlingException: Too many requests\n    at de_ThrottlingExceptionRes (/var/runtime/index.js:1:1)',
      },
      VECTOR_SEARCH_LOG_GROUP
    );

    expect(parsed.functionName).toBe('eecar-stack-VectorSearchFunction-yXyHE1D702wX');
    expect(parsed.requestId).toBe('abc-123-def');
    expect(parsed.errorType).toBe('BedrockThrottling');
    expect(parsed.errorMessage).toBe('Too many requests');
    expect(parsed.stackTrace).toContain('at de_ThrottlingExceptionRes');
    expect(parsed.isError).toBe(true);
  });

  it.each([
    ['ThrottlingException: Rate exceeded', 'BedrockThrottling'],
    ['ModelNotFoundException: no such model', 'BedrockModelNotFound'],
    ['AccessDeniedException: not authorized', 'BedrockAccessDenied'],
    ['ModelTimeoutException: took too long', 'BedrockTimeout'],
    ['ProvisionedThroughputExceededException: slow down', 'DynamoDBThrottling'],
    ['ResourceNotFoundException: table missing', 'DynamoDBResourceNotFound'],
    ['NoSuchKey: The specified key does not exist', 'S3NoSuchKey'],
    ['NoSuchBucket: bucket missing', 'S3NoSuchBucket'],
    ['SlowDown: reduce request rate', 'S3SlowDown'],
    ['AccessDenied when calling s3 GetObject', 'S3AccessDenied'],
    ['Task timed out after 30.03 seconds', 'LambdaTimeout'],
    ['TypeError: Cannot read properties of undefined', 'GenericError'],
    ['UnknownException thrown', 'Exception'],
    ['ERROR something odd happened', 'Unknown'],
  ])('classifies "%s" as %s', (message, expectedType) => {
    expect(parseLogEvent({ timestamp: 1, message }, VECTOR_SEARCH_LOG_GROUP).errorType).toBe(expectedType);
  });

  // 알려진 한계: 부분 문자열로만 분류해서 Bedrock의 ValidationException
  // (예: 퇴역 모델 ID 호출)도 DynamoDB 오류로 분류된다. 알림 재설계(2개월차)에서 다룬다.
  it('documents that ValidationException is attributed to DynamoDB regardless of the service', () => {
    const parsed = parseLogEvent(
      { timestamp: 1, message: 'ValidationException: The provided model identifier is invalid.' },
      VECTOR_SEARCH_LOG_GROUP
    );
    expect(parsed.errorType).toBe('DynamoDBValidation');
  });

  it('summarises Lambda timeouts and reads START/END style request ids', () => {
    const parsed = parseLogEvent(
      { timestamp: 1, message: 'RequestId: 7f1c-aa Task timed out after 60.00 seconds' },
      VECTOR_SEARCH_LOG_GROUP
    );
    expect(parsed.requestId).toBe('7f1c-aa');
    expect(parsed.errorMessage).toBe('Lambda timed out after 60.00 seconds');
  });

  it('extracts X-Ray trace ids and falls back to unknown request ids', () => {
    const parsed = parseLogEvent(
      { timestamp: 1, message: 'Error: failed Root=1-67890abc-def0123456789abcdef01234' },
      'not-a-lambda-log-group'
    );
    expect(parsed.xrayTraceId).toBe('1-67890abc-def0123456789abcdef01234');
    expect(parsed.requestId).toBe('unknown');
    expect(parsed.functionName).toBe('Unknown');
  });

  it('produces the same hash for the same error so duplicates collapse', () => {
    const logEvent = { timestamp: 1, message: 'Error: same failure' };
    const a = parseLogEvent(logEvent, VECTOR_SEARCH_LOG_GROUP);
    const b = parseLogEvent({ ...logEvent, timestamp: 2 }, VECTOR_SEARCH_LOG_GROUP);
    expect(a.errorHash).toBe(b.errorHash);
  });
});

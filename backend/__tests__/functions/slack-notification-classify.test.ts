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
  it('does not read the service from file paths in the stack trace', () => {
    const stack = '\n    at send (/opt/nodejs/utils/dynamodb.js:1:1)\n    at handler (/var/task/index.js:2:2)';
    const type = (message: string) => parseLogEvent({ timestamp: 1, message }, VECTOR_SEARCH_LOG_GROUP).errorType;
    expect(type(`ThrottlingException: Too many tokens per day${stack}`)).toBe('BedrockThrottling');
    expect(type(`ThrottlingException: Rate exceeded${stack}`)).toBe('Throttling');
    expect(type(`ValidationException: Invalid parameter: Subject${stack}`)).toBe('ValidationError');
  });

  it('gives the same hash to the same message logged by different requests', () => {
    // 회귀 테스트: 'Error: '가 없는 줄은 시각과 요청 ID까지 메시지로 삼아 해시가 매번 달라졌고, 중복 제거가 되지 않았다 (A-49)
    const line = (time: string, requestId: string) => `${time}\t${requestId}\tERROR\tRaw response: \n`;
    const first = parseLogEvent({ timestamp: 1, message: line('2026-11-09T12:30:05.874Z', '8e23b68a-9677-41b0-a69c-89c2fe09ee06') }, VECTOR_SEARCH_LOG_GROUP);
    const second = parseLogEvent({ timestamp: 2, message: line('2026-11-09T12:30:09.320Z', '2ff71f58-da29-4bbd-85e2-97540558bb43') }, VECTOR_SEARCH_LOG_GROUP);

    expect(first.errorMessage).toBe('Raw response:');
    expect(first.requestId).toBe('8e23b68a-9677-41b0-a69c-89c2fe09ee06');
    expect(second.errorHash).toBe(first.errorHash);
  });

  it('keeps different messages apart', () => {
    const hash = (text: string) => parseLogEvent({ timestamp: 1, message: `2026-11-09T12:30:05.874Z\tabc-123\tERROR\t${text}` }, VECTOR_SEARCH_LOG_GROUP).errorHash;
    expect(hash('No JSON array found in response: a')).not.toBe(hash('Failed to load index'));
  });

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
    ['ThrottlingException: Too many requests, please wait before trying again.', 'BedrockThrottling'],
    ['ThrottlingException: Too many tokens per day', 'BedrockThrottling'],
    ['ThrottlingException: Throughput exceeds the current capacity of your table or index', 'DynamoDBThrottling'],
    ['ThrottlingException: Rate exceeded', 'Throttling'],
    ['ModelNotFoundException: no such model', 'BedrockModelNotFound'],
    ['AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel on resource', 'BedrockAccessDenied'],
    ['AccessDeniedException: anthropic.claude-haiku-5-5 is not available for this account', 'BedrockAccessDenied'],
    ['AccessDeniedException: User is not authorized to perform: dynamodb:PutItem on resource', 'DynamoDBAccessDenied'],
    ['AccessDeniedException: User is not authorized to perform: s3vectors:QueryVectors', 'S3VectorsAccessDenied'],
    ['AccessDeniedException: The ciphertext refers to a customer master key that does not exist', 'KMSAccessDenied'],
    ['AccessDeniedException: not authorized', 'AccessDenied'],
    ['ValidationException: Invalid vector dimension', 'S3VectorsValidation'],
    ['ValidationException: Item size has exceeded the maximum allowed size', 'DynamoDBValidation'],
    ['ValidationException: Invalid parameter: Subject', 'ValidationError'],
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

  // 회귀 테스트: 2026-11-04 프로덕션 로그의 실제 메시지. 이전에는 DynamoDBResourceNotFound + INFO로 알림됐다.
  it('classifies the legacy-model outage as a Bedrock error and pages it as CRITICAL', () => {
    const parsed = parseLogEvent(
      {
        timestamp: 1,
        message:
          '2026-11-04T12:20:02.258Z\tfb322d49-efd8-4064-bf9e-834d35641926\tERROR\tQuery expansion failed: ResourceNotFoundException: ' +
          'Access denied. This Model is marked by provider as Legacy and you have not been actively using the model in the last 30 days.',
      },
      VECTOR_SEARCH_LOG_GROUP
    );
    expect(parsed.errorType).toBe('BedrockModelUnavailable');
    expect(classifySeverity(parsed.functionName, parsed.errorType)).toBe('CRITICAL');
  });

  it('separates Bedrock and DynamoDB exceptions that share a name', () => {
    const bedrock = parseLogEvent(
      { timestamp: 1, message: 'ValidationException: The provided model identifier is invalid.' },
      VECTOR_SEARCH_LOG_GROUP
    );
    const dynamo = parseLogEvent(
      { timestamp: 1, message: 'ValidationException: One or more parameter values were invalid: Missing the key PK' },
      VECTOR_SEARCH_LOG_GROUP
    );
    const dynamoMissingTable = parseLogEvent(
      { timestamp: 1, message: 'ResourceNotFoundException: Requested resource not found' },
      VECTOR_SEARCH_LOG_GROUP
    );
    expect(bedrock.errorType).toBe('BedrockValidation');
    expect(dynamo.errorType).toBe('DynamoDBValidation');
    expect(dynamoMissingTable.errorType).toBe('DynamoDBResourceNotFound');
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

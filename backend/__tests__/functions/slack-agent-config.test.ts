/**
 * 자동이 설정·권한 조회 도구 (A-38)
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  GetFunctionConfigurationCommand,
  GetLayerVersionByArnCommand,
  LambdaClient,
  ListFunctionsCommand,
  ListLayerVersionsCommand,
} from '@aws-sdk/client-lambda';
import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import {
  flattenPolicy,
  getFunctionConfig,
  getFunctionPermissions,
  maskEnvironment,
} from '../../src/functions/slack-agent/tools/config.js';

const lambdaMock = mockClient(LambdaClient);
const iamMock = mockClient(IAMClient);
const FULL = 'eecar-stack-VectorSearchFunction-AbC123';
const LAYER = 'arn:aws:lambda:ap-northeast-2:123456789012:layer:eecar-utils-layer';

beforeEach(() => {
  lambdaMock.reset();
  iamMock.reset();
  lambdaMock.on(ListFunctionsCommand).resolves({ Functions: [{ FunctionName: FULL }] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('maskEnvironment', () => {
  it('hides secrets by name or by known value formats, keeps references and resource names', () => {
    const masked = maskEnvironment({
      SLACK_SIGNING_SECRET_SSM_PARAM: '/eecar/slack/signing-secret',
      API_TOKEN: 'abc',
      WEBHOOK: 'https://hooks.slack.com/services/T0/B0/xyz',
      BOT: 'xoxb-1234-5678',
      RANDOM: 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5',
      COMPLIANCE_FUNCTION_NAME: 'eecar-stack-ComplianceCheckFunction-P2tMmz9JguDd',
      S3_VECTORS_INDEX: 'parts-vectors',
    });
    expect(masked.SLACK_SIGNING_SECRET_SSM_PARAM).toBe('/eecar/slack/signing-secret');
    expect(masked.COMPLIANCE_FUNCTION_NAME).toBe('eecar-stack-ComplianceCheckFunction-P2tMmz9JguDd');
    expect(masked.S3_VECTORS_INDEX).toBe('parts-vectors');
    for (const key of ['API_TOKEN', 'WEBHOOK', 'BOT', 'RANDOM']) expect(masked[key]).toMatch(/^\*\*\*\*/);
    expect(JSON.stringify(masked)).not.toContain('xoxb');
  });
});

describe('getFunctionConfig', () => {
  it('returns limits, masked environment and whether each layer is the latest version', async () => {
    lambdaMock.on(GetFunctionConfigurationCommand).resolves({
      Runtime: 'nodejs24.x', Handler: 'index.handler', Timeout: 60, MemorySize: 1024, LastModified: '2026-11-06T03:00:00.000+0000',
      Environment: { Variables: { S3_VECTORS_INDEX: 'parts-vectors-v2', SLACK_TOKEN: 'secret' } },
      Layers: [{ Arn: `${LAYER}:26` }],
      Role: 'arn:aws:iam::123456789012:role/eecar-stack-VectorSearchFunctionRole-X',
    });
    lambdaMock.on(GetLayerVersionByArnCommand).resolves({ Version: 26, CreatedDate: '2026-11-01T00:00:00.000+0000' });
    lambdaMock.on(ListLayerVersionsCommand).resolves({ LayerVersions: [{ Version: 27, CreatedDate: '2026-11-06T00:52:52.734+0000' }] });

    const config = await getFunctionConfig('VectorSearch');
    expect(config).toMatchObject({
      found: true, runtime: 'nodejs24.x', timeoutSec: 60, memoryMB: 1024,
      environment: { S3_VECTORS_INDEX: 'parts-vectors-v2', SLACK_TOKEN: '****(가림, 6자)' },
      layers: [{ name: 'eecar-utils-layer', version: 26, latestVersion: 27, isLatest: false }],
      roleName: 'eecar-stack-VectorSearchFunctionRole-X',
    });
    expect(lambdaMock.commandCalls(GetFunctionConfigurationCommand)[0].args[0].input.FunctionName).toBe(FULL);
  });

  it('reports an unknown function instead of calling Lambda', async () => {
    const config = await getFunctionConfig('PaymentFunction');
    expect(config).toMatchObject({ found: false });
    expect(lambdaMock.commandCalls(GetFunctionConfigurationCommand)).toHaveLength(0);
  });
});

describe('getFunctionPermissions', () => {
  it('flattens inline and attached managed policies', async () => {
    lambdaMock.on(GetFunctionConfigurationCommand).resolves({ Role: 'arn:aws:iam::123456789012:role/eecar-stack-VectorSearchFunctionRole-X' });
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: ['RolePolicy0'] });
    iamMock.on(GetRolePolicyCommand).resolves({
      PolicyDocument: encodeURIComponent(JSON.stringify({
        Statement: [{ Effect: 'Allow', Action: 's3vectors:QueryVectors', Resource: ['arn:aws:s3vectors:ap-northeast-2:123456789012:bucket/b/index/parts-vectors'] }],
      })),
    });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [{ PolicyName: 'AWSLambdaBasicExecutionRole', PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole' }] });
    iamMock.on(GetPolicyCommand).resolves({ Policy: { DefaultVersionId: 'v1' } });
    iamMock.on(GetPolicyVersionCommand).resolves({
      PolicyVersion: { Document: encodeURIComponent(JSON.stringify({ Statement: { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:PutLogEvents'], Resource: '*' } })) },
    });

    const perms = await getFunctionPermissions('VectorSearchFunction');
    expect(perms.roleName).toBe('eecar-stack-VectorSearchFunctionRole-X');
    expect(perms.statements).toEqual([
      { policy: 'RolePolicy0', effect: 'Allow', actions: ['s3vectors:QueryVectors'], resources: ['arn:aws:s3vectors:ap-northeast-2:123456789012:bucket/b/index/parts-vectors'] },
      { policy: 'AWSLambdaBasicExecutionRole', effect: 'Allow', actions: ['logs:CreateLogGroup', 'logs:PutLogEvents'], resources: ['*'] },
    ]);
  });

  it('keeps deny statements, NotAction and conditions visible', () => {
    const doc = encodeURIComponent(JSON.stringify({ Statement: [{ Effect: 'Deny', NotAction: 'iam:*', Resource: '*', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }] }));
    expect(flattenPolicy('p', doc)).toEqual([{ policy: 'p', effect: 'Deny', actions: ['NOT iam:*'], resources: ['*'], hasCondition: true }]);
  });
});

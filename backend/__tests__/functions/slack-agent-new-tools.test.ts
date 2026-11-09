/**
 * 정보 접근 도구 (E-41): 코드 조회, 접근 로그 집계, 리소스 정책 조회
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { GetBucketEncryptionCommand, GetBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { DescribeKeyCommand, GetKeyPolicyCommand, KMSClient } from '@aws-sdk/client-kms';
import { searchCode } from '../../src/functions/slack-agent/tools/code-search.js';
import { getRequestBreakdown } from '../../src/functions/slack-agent/tools/request-breakdown.js';
import { getResourcePolicy } from '../../src/functions/slack-agent/tools/resource-policy.js';

const files = {
  'src/utils/a.ts': ['line1', 'const LIMIT = 300;', 'line3', 'line4'].join('\n'),
  'src/functions/b/index.ts': Array.from({ length: 200 }, (_, i) => `row ${i + 1}`).join('\n'),
};

describe('searchCode', () => {
  it('finds matches case-insensitively with surrounding lines', () => {
    const r = searchCode({ query: 'limit' }, files) as any;
    expect(r.totalMatches).toBe(1);
    expect(r.matches[0]).toMatchObject({ path: 'src/utils/a.ts', line: 2 });
    expect(r.matches[0].context).toContain('line1');
  });

  it('reads a file window by full or partial path', () => {
    const r = searchCode({ path: 'b/index.ts', startLine: 10 }, files) as any;
    expect(r).toMatchObject({ found: true, path: 'src/functions/b/index.ts', startLine: 10, endLine: 159, totalLines: 200 });
    expect(r.content.startsWith('row 10')).toBe(true);
  });

  it('never reads outside the snapshot', () => {
    expect(searchCode({ path: '../../.env' }, files)).toMatchObject({ found: false });
    expect(searchCode({ path: '/etc/passwd' }, files)).toMatchObject({ found: false });
  });

  it('asks for input when both are empty', () => {
    expect(searchCode({}, files)).toHaveProperty('error');
  });
});

describe('getRequestBreakdown', () => {
  const row = (key: string, value: string, c: number) => [{ field: key, value }, { field: 'c', value: String(c) }];
  const run = jest.fn(async (query: string) => {
    if (query.includes('by status')) return [row('status', '403', 90), row('status', '200', 10)];
    if (query.includes('by path')) return [row('path', '/.env', 90)];
    if (query.includes('by ip')) return [row('ip', '203.0.113.10', 90)];
    return [row('userAgent', 'curl/8.0', 90)];
  });

  it('summarizes status, path, ip and user agent', async () => {
    const r = await getRequestBreakdown(24, undefined, run);
    expect(r).toMatchObject({ total: 100, byStatus: { 403: 90, 200: 10 }, topPaths: [['/.env', 90]], topIps: [['203.0.113.10', 90]] });
  });

  it('only accepts status classes, so input cannot change the query', async () => {
    run.mockClear();
    await getRequestBreakdown(24, '4xx', run);
    expect(run.mock.calls[0][0]).toContain('filter status like /^4/');
    run.mockClear();
    await getRequestBreakdown(24, '4xx | delete', run);
    expect(run.mock.calls[0][0]).not.toContain('delete');
    expect(run.mock.calls[0][0]).not.toContain('filter');
  });
});

describe('getResourcePolicy', () => {
  const s3Mock = mockClient(S3Client);
  const kmsMock = mockClient(KMSClient);
  beforeEach(() => { s3Mock.reset(); kmsMock.reset(); });

  it('reads the bucket policy and encryption', async () => {
    s3Mock.on(GetBucketPolicyCommand).resolves({ Policy: '{"Statement":[]}' });
    s3Mock.on(GetBucketEncryptionCommand).resolves({ ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: 'alias/x' } }] } });
    expect(await getResourcePolicy('eecar-documents')).toMatchObject({ type: 's3', policy: { Statement: [] }, encryption: { SSEAlgorithm: 'aws:kms' } });
  });

  it('keeps encryption when the bucket has no policy', async () => {
    s3Mock.on(GetBucketPolicyCommand).rejects(Object.assign(new Error('none'), { name: 'NoSuchBucketPolicy' }));
    s3Mock.on(GetBucketEncryptionCommand).resolves({ ServerSideEncryptionConfiguration: { Rules: [] } });
    expect(await getResourcePolicy('eecar-documents')).toMatchObject({ policy: null, policyNote: 'NoSuchBucketPolicy' });
  });

  it('reads the key policy for an alias', async () => {
    kmsMock.on(DescribeKeyCommand).resolves({ KeyMetadata: { KeyId: 'k1', KeyState: 'Enabled', KeyManager: 'CUSTOMER' } as any });
    kmsMock.on(GetKeyPolicyCommand).resolves({ Policy: '{"Statement":[{"Effect":"Deny"}]}' });
    expect(await getResourcePolicy('alias/x')).toMatchObject({ type: 'kms', keyState: 'Enabled', policy: { Statement: [{ Effect: 'Deny' }] } });
  });

  it('reports access failures instead of throwing', async () => {
    kmsMock.on(DescribeKeyCommand).rejects(Object.assign(new Error('no'), { name: 'AccessDeniedException' }));
    expect(await getResourcePolicy('alias/x')).toEqual({ resource: 'alias/x', found: false, note: 'AccessDeniedException' });
  });
});

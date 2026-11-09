/**
 * S3 버킷 정책과 암호화 설정, KMS 키 정책 조회 (DECISION_LOG E-41).
 * 함수 IAM이 정상인데 접근이 거부될 때 리소스 쪽 정책을 확인한다. 읽기 전용이다.
 */
import { GetBucketEncryptionCommand, GetBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { DescribeKeyCommand, GetKeyPolicyCommand, KMSClient } from '@aws-sdk/client-kms';

const s3 = new S3Client({});
const kms = new KMSClient({});

const isKms = (resource: string) => /^alias\//.test(resource) || /^arn:aws:kms:/.test(resource) || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(resource);
const parse = (text: string | undefined) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};
const reason = (error: unknown) => (error as Error).name;

async function kmsPolicy(resource: string): Promise<Record<string, unknown>> {
  const described = await kms.send(new DescribeKeyCommand({ KeyId: resource }));
  const keyId = described.KeyMetadata?.KeyId;
  const policy = await kms.send(new GetKeyPolicyCommand({ KeyId: keyId, PolicyName: 'default' }));
  return { resource, type: 'kms', found: true, keyState: described.KeyMetadata?.KeyState, keyManager: described.KeyMetadata?.KeyManager, policy: parse(policy.Policy) };
}

async function s3Policy(bucket: string): Promise<Record<string, unknown>> {
  const [policy, encryption] = await Promise.allSettled([
    s3.send(new GetBucketPolicyCommand({ Bucket: bucket })),
    s3.send(new GetBucketEncryptionCommand({ Bucket: bucket })),
  ]);
  const rule = encryption.status === 'fulfilled' ? encryption.value.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault : undefined;
  return {
    resource: bucket,
    type: 's3',
    found: true,
    policy: policy.status === 'fulfilled' ? parse(policy.value.Policy) : null,
    ...(policy.status === 'rejected' ? { policyNote: reason(policy.reason) } : {}),
    encryption: rule ?? null,
    ...(encryption.status === 'rejected' ? { encryptionNote: reason(encryption.reason) } : {}),
  };
}

export async function getResourcePolicy(resource: string): Promise<Record<string, unknown>> {
  try {
    return await (isKms(resource) ? kmsPolicy(resource) : s3Policy(resource));
  } catch (error) {
    return { resource, found: false, note: reason(error) };
  }
}

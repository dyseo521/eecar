import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'ap-northeast-2';
process.env.PARTS_TABLE_NAME = 'eecar-parts-table-test';
process.env.VECTORS_BUCKET_NAME = 'eecar-vectors-test';
process.env.DOCUMENTS_BUCKET_NAME = 'eecar-documents-test';
process.env.SNS_TOPIC_ARN = 'arn:aws:sns:ap-northeast-2:123456789012:test-topic';
process.env.BEDROCK_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
process.env.USE_S3_VECTORS = 'false';
process.env.USE_KNOWLEDGE_BASE = 'false';

// Global test timeout
jest.setTimeout(30000);

// Export mock client for use in tests
export { mockClient };

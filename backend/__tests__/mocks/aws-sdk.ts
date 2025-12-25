import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';

// Create mock clients
export const dynamoMock = mockClient(DynamoDBDocumentClient);
export const s3Mock = mockClient(S3Client);
export const bedrockMock = mockClient(BedrockRuntimeClient);
export const snsMock = mockClient(SNSClient);

// Reset all mocks
export function resetAllMocks() {
  dynamoMock.reset();
  s3Mock.reset();
  bedrockMock.reset();
  snsMock.reset();
}

// Sample test data
export const mockParts = [
  {
    partId: 'test-battery-001',
    name: '현대 아이오닉5 배터리 팩',
    category: 'battery',
    manufacturer: 'SK온',
    model: 'NCM811-72kWh',
    price: 8500000,
    quantity: 2,
    condition: 'excellent',
    description: '2023년식 아이오닉5에서 분리된 72kWh 배터리 팩',
    batteryHealth: {
      soh: 92,
      cycles: 350,
      cathodeType: 'NCM Ni 80%',
    },
  },
  {
    partId: 'test-motor-001',
    name: '테슬라 모델3 구동 모터',
    category: 'motor',
    manufacturer: 'Tesla',
    model: 'Model3-RWD',
    price: 4200000,
    quantity: 1,
    condition: 'good',
    description: '테슬라 모델3 RWD 버전의 리어 구동 모터',
  },
];

// Mock vector data
export const mockVector = new Array(1024).fill(0).map(() => Math.random() * 2 - 1);

// Helper to create S3 stream response
export function createS3StreamResponse(data: any) {
  const stream = new Readable();
  stream.push(JSON.stringify(data));
  stream.push(null);
  return sdkStreamMixin(stream);
}

// Setup common mock responses
export function setupDefaultMocks() {
  // DynamoDB GetCommand
  dynamoMock.on(GetCommand).resolves({
    Item: mockParts[0],
  });

  // DynamoDB QueryCommand
  dynamoMock.on(QueryCommand).resolves({
    Items: mockParts,
    Count: mockParts.length,
  });

  // DynamoDB ScanCommand
  dynamoMock.on(ScanCommand).resolves({
    Items: mockParts,
    Count: mockParts.length,
  });

  // DynamoDB BatchGetCommand
  dynamoMock.on(BatchGetCommand).resolves({
    Responses: {
      'eecar-parts-table-test': mockParts,
    },
  });

  // S3 GetObjectCommand (vector)
  s3Mock.on(GetObjectCommand).resolves({
    Body: createS3StreamResponse(mockVector),
  });

  // S3 ListObjectsV2Command
  s3Mock.on(ListObjectsV2Command).resolves({
    Contents: [
      { Key: 'parts/test-battery-001.json' },
      { Key: 'parts/test-motor-001.json' },
    ],
  });

  // Bedrock InvokeModelCommand - Titan Embeddings
  bedrockMock.on(InvokeModelCommand, {
    modelId: 'amazon.titan-embed-text-v2:0',
  }).resolves({
    body: new TextEncoder().encode(JSON.stringify({
      embedding: mockVector,
    })),
  });

  // Bedrock InvokeModelCommand - Claude
  bedrockMock.on(InvokeModelCommand, {
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  }).resolves({
    body: new TextEncoder().encode(JSON.stringify({
      content: [{ type: 'text', text: '["확장된 쿼리1", "확장된 쿼리2", "확장된 쿼리3"]' }],
    })),
  });

  // SNS PublishCommand
  snsMock.on(PublishCommand).resolves({
    MessageId: 'test-message-id',
  });
}

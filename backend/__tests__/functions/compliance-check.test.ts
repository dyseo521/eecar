/**
 * 규정 검사: 모델 실패를 "위반 없음"으로 처리하지 않는다 (A-41)
 */
import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { handler, parseViolations } from '../../src/functions/compliance-check/index.js';

const bedrockMock = mockClient(BedrockRuntimeClient);
const s3Mock = mockClient(S3Client);
const snsMock = mockClient(SNSClient);

const event = { partId: 'p1', partData: { name: '배터리', category: 'battery', manufacturer: '현대' } };

describe('parseViolations', () => {
  it.each([
    ['없음', []],
    ['없음.', []],
    ['위반 사항 없음', []],
    ['위반 사항이 없습니다.', []],
    ['위반사항 없음', []],
    ['1. 안전 인증 누락\n2. 제조사 정보 부족', ['1. 안전 인증 누락', '2. 제조사 정보 부족']],
    ['', []],
  ])('parses %j', (text, expected) => {
    expect(parseViolations(text as string)).toEqual(expected);
  });
});

describe('compliance-check handler', () => {
  let logs: string[];
  let writes: string[];

  beforeEach(() => {
    bedrockMock.reset();
    s3Mock.reset();
    snsMock.reset();
    logs = [];
    writes = [];
    s3Mock.on(GetObjectCommand).rejects(new Error('no rules file'));
    snsMock.on(PublishCommand).resolves({});
    jest.spyOn(console, 'log').mockImplementation(((...a: unknown[]) => { logs.push(a.join(' ')); }) as any);
    jest.spyOn(console, 'error').mockImplementation(((...a: unknown[]) => { logs.push(a.join(' ')); }) as any);
    jest.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => { writes.push(String(chunk)); return true; }) as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reports a failed check instead of claiming no violations', async () => {
    bedrockMock.on(InvokeModelCommand).rejects(new Error('AccessDeniedException'));
    await handler(event);
    expect(logs.join(' ')).not.toContain('No compliance violations found');
    expect(logs.join(' ')).toContain('could not run');
    expect(writes.join('')).toContain('ComplianceCheckFailed');
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('sends an alert when the model finds violations', async () => {
    bedrockMock.on(InvokeModelCommand).resolves({ body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text: '안전 인증 누락' }] })) } as any);
    await handler(event);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
  });

  it('stays quiet when the model says there are none', async () => {
    bedrockMock.on(InvokeModelCommand).resolves({ body: new TextEncoder().encode(JSON.stringify({ content: [{ type: 'text', text: '위반 사항 없음' }] })) } as any);
    await handler(event);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
    expect(logs.join(' ')).toContain('No compliance violations found');
  });
});

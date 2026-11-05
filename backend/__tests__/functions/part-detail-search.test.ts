/**
 * 배터리 SOH 검색과 재질 물성 검색 회귀 테스트.
 *
 * 이전 구현은 Scan 결과에서 SK가 '#METADATA'로 끝나는 항목만 골랐는데, 실제 데이터의 SK는
 * 'METADATA'라서 항상 0건을 반환했다. 재질 정보는 METADATA가 아니라 SPEC 항목에 있어서
 * SK를 고쳐도 재질 검색은 여전히 0건이었다.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { loadPartsWithDetails } from '../../src/utils/parts.js';
import { batchGetItems } from '../../src/utils/dynamodb.js';
import { handler as batteryHandler } from '../../src/functions/battery-health-assessment/index.js';
import { handler as materialHandler } from '../../src/functions/material-property-search/index.js';

const docMock = mockClient(DynamoDBDocumentClient);

const syntheticBattery = {
  PK: 'PART#bat-inline',
  SK: 'METADATA',
  GSI1PK: 'CATEGORY#battery',
  GSI1SK: 'CREATED_AT#2026-01-02',
  name: '아이오닉5 배터리 팩',
  category: 'battery',
  manufacturer: 'SK온',
  year: 2023,
  price: 8_500_000,
  // synthetic-data는 배터리 상태를 METADATA에 함께 저장한다
  batteryHealth: { soh: 90, cathodeType: 'NCM Ni 80%', recommendedUse: 'reuse', suitableApplications: ['ESS'] },
};

const importedBattery = {
  PK: 'PART#bat-detail',
  SK: 'METADATA',
  GSI1PK: 'CATEGORY#battery',
  GSI1SK: 'CREATED_AT#2026-01-01',
  partId: 'bat-detail',
  name: '닛산 리프 배터리 모듈',
  category: 'battery',
  manufacturer: 'AESC',
  year: 2015,
  price: 1_200_000,
};

// import-parts-from-json.js는 배터리 상태를 별도 BATTERY_HEALTH 항목에 저장한다
const importedBatteryHealth = {
  PK: 'PART#bat-detail',
  SK: 'BATTERY_HEALTH',
  soh: 72,
  cathodeType: 'LMO',
  recommendedUse: 'reuse',
  suitableApplications: ['ESS'],
};

const aluminumPanel = {
  PK: 'PART#panel-1',
  SK: 'METADATA',
  GSI2PK: 'ALL#METADATA',
  GSI2SK: 'CREATED_AT#2026-01-03',
  name: '테슬라 모델 S 후드',
  category: 'body-panel',
  manufacturer: 'Tesla',
  year: 2016,
  price: 900_000,
};

const aluminumPanelSpec = {
  PK: 'PART#panel-1',
  SK: 'SPEC',
  materialComposition: { primary: 'Aluminum', alloyNumber: '6061', tensileStrengthMPa: 310 },
};

function apiEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {},
  } as unknown as APIGatewayProxyEvent;
}

async function invoke(
  handler: typeof batteryHandler,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  return (await handler(event, {} as Context, () => undefined)) as APIGatewayProxyResult;
}

beforeEach(() => docMock.reset());

describe('loadPartsWithDetails', () => {
  it('follows GSI pagination and joins detail items', async () => {
    docMock
      .on(QueryCommand)
      .resolvesOnce({ Items: [syntheticBattery], LastEvaluatedKey: { PK: 'PART#bat-inline' } })
      .resolvesOnce({ Items: [importedBattery] });
    docMock.on(BatchGetCommand).resolves({
      Responses: { 'eecar-parts-table-test': [importedBatteryHealth] },
    });

    const parts = await loadPartsWithDetails({ category: 'battery', details: ['BATTERY_HEALTH'] });

    expect(docMock.commandCalls(QueryCommand)).toHaveLength(2);
    expect(docMock.commandCalls(QueryCommand)[1].args[0].input.ExclusiveStartKey).toEqual({ PK: 'PART#bat-inline' });
    expect(parts.map(p => p.partId)).toEqual(['bat-inline', 'bat-detail']);
    expect(parts[0].batteryHealth?.soh).toBe(90); // METADATA에 있는 값 우선
    expect(parts[1].batteryHealth?.soh).toBe(72); // BATTERY_HEALTH 항목에서 결합
    expect(parts[1]).not.toHaveProperty('PK');
  });

  it('queries GSI2 when no category is given', async () => {
    docMock.on(QueryCommand).resolves({ Items: [] });

    await loadPartsWithDetails();

    expect(docMock.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe('GSI2');
  });
});

describe('batchGetItems', () => {
  it('retries keys that DynamoDB returns as unprocessed', async () => {
    docMock
      .on(BatchGetCommand)
      .resolvesOnce({
        Responses: { 'eecar-parts-table-test': [] },
        UnprocessedKeys: { 'eecar-parts-table-test': { Keys: [{ PK: 'PART#panel-1', SK: 'SPEC' }] } },
      })
      .resolvesOnce({ Responses: { 'eecar-parts-table-test': [aluminumPanelSpec] } });

    const items = await batchGetItems([{ pk: 'PART#panel-1', sk: 'SPEC' }]);

    expect(items).toEqual([aluminumPanelSpec]);
    expect(docMock.commandCalls(BatchGetCommand)).toHaveLength(2);
  });

  it('splits requests into chunks of 100 keys', async () => {
    docMock.on(BatchGetCommand).resolves({ Responses: { 'eecar-parts-table-test': [] } });
    const keys = Array.from({ length: 250 }, (_, i) => ({ pk: `PART#${i}`, sk: 'SPEC' }));

    await batchGetItems(keys);

    const sizes = docMock
      .commandCalls(BatchGetCommand)
      .map(call => call.args[0].input.RequestItems?.['eecar-parts-table-test']?.Keys?.length);
    expect(sizes).toEqual([100, 100, 50]);
  });
});

describe('battery-health-assessment handler', () => {
  it('returns batteries stored with real METADATA sort keys', async () => {
    docMock.on(QueryCommand).resolves({ Items: [syntheticBattery, importedBattery] });
    docMock.on(BatchGetCommand).resolves({
      Responses: { 'eecar-parts-table-test': [importedBatteryHealth] },
    });

    const res = await invoke(batteryHandler, apiEvent({ batteryFilters: { soh: { min: 80 } } }));

    expect(res.statusCode).toBe(200);
    const results = JSON.parse(res.body).data.results;
    expect(results.map((r: { partId: string }) => r.partId)).toEqual(['bat-inline']);
    expect(docMock.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues?.[':gsi1pk']).toBe(
      'CATEGORY#battery'
    );
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await invoke(batteryHandler, apiEvent('THIS_IS_NOT_JSON'));
    expect(res.statusCode).toBe(400);
    expect(docMock.calls()).toHaveLength(0);
  });
});

describe('material-property-search handler', () => {
  it('matches material properties stored on the SPEC item', async () => {
    docMock.on(QueryCommand).resolves({ Items: [aluminumPanel] });
    docMock.on(BatchGetCommand).resolves({
      Responses: { 'eecar-parts-table-test': [aluminumPanelSpec] },
    });

    const res = await invoke(materialHandler, apiEvent({ materialFilters: { alloyNumber: '6061' } }));

    expect(res.statusCode).toBe(200);
    const results = JSON.parse(res.body).data.results;
    expect(results).toHaveLength(1);
    expect(results[0].partId).toBe('panel-1');
  });

  it('requires materialFilters', async () => {
    const res = await invoke(materialHandler, apiEvent({}));
    expect(res.statusCode).toBe(400);
  });
});

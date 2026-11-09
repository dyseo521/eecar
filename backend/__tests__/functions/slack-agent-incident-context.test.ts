/**
 * 묶음 조회 도구 (E-40): 범위 선택, 부분 실패 처리, 로그 건수 제한
 */
import { jest } from '@jest/globals';
import { getIncidentContext, IncidentContextDeps } from '../../src/functions/slack-agent/tools/incident-context.js';

function deps(overrides: Partial<IncidentContextDeps> = {}): IncidentContextDeps {
  return {
    status: jest.fn(async () => ({ errors: 1 })),
    allStatuses: jest.fn(async () => [{ functionName: 'A' }]),
    logs: jest.fn(async () => [{ message: 'ERROR' }]),
    errorSummary: jest.fn(async () => [{ errorType: 'X' }]),
    changes: jest.fn(async () => ({ changes: [] })),
    config: jest.fn(async () => ({ timeout: 30 })),
    metrics: jest.fn(async (service: string) => ({ service })),
    ...overrides,
  };
}

describe('getIncidentContext', () => {
  it('collects status, logs, summary, changes, config and service metrics for one function', async () => {
    const data = await getIncidentContext('VectorSearchFunction', 24, deps());
    expect(data).toMatchObject({
      functionName: 'VectorSearchFunction', windowHours: 24,
      status: { errors: 1 }, errorLogs: [{ message: 'ERROR' }], errorSummary: [{ errorType: 'X' }],
      recentChanges: { changes: [] }, config: { timeout: 30 },
      lambda: { service: 'lambda' }, apigateway: { service: 'apigateway' }, bedrock: { service: 'bedrock' },
      dynamodb: { service: 'dynamodb' }, canary: { service: 'canary' },
    });
    expect(data.incomplete).toBeUndefined();
  });

  it('returns every function status and skips function-only lookups without a name', async () => {
    const d = deps();
    const data = await getIncidentContext(undefined, 24, d);
    expect(data.status).toEqual([{ functionName: 'A' }]);
    expect(data.functionName).toBe('all');
    expect(d.logs).not.toHaveBeenCalled();
    expect(d.config).not.toHaveBeenCalled();
  });

  it('keeps the other results and names what failed', async () => {
    const data = await getIncidentContext('A', 24, deps({ changes: jest.fn(async () => { throw new Error('CloudTrail 지연'); }) }));
    expect(data.status).toEqual({ errors: 1 });
    expect(data.recentChanges).toBeUndefined();
    expect(data.incomplete).toEqual(['recentChanges: CloudTrail 지연']);
  });

  it('keeps only the most recent error logs', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ message: `e${i}` }));
    const data = await getIncidentContext('A', 24, deps({ logs: jest.fn(async () => many) }));
    expect(data.errorLogs as unknown[]).toHaveLength(30);
    expect((data.errorLogs as Array<{ message: string }>)[29].message).toBe('e49');
  });
});

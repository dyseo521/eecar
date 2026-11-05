import { consistentBatteryCondition } from '../../src/functions/synthetic-data/data/condition.js';

describe('consistentBatteryCondition', () => {
  it('keeps grades that agree with the battery health', () => {
    expect(consistentBatteryCondition('new', { soh: 99, cycleCount: 3 })).toBe('new');
    expect(consistentBatteryCondition('like-new', { soh: 96, cycleCount: 80 })).toBe('like-new');
    expect(consistentBatteryCondition('excellent', { soh: 95, cycleCount: 479 })).toBe('excellent');
  });

  it('re-grades contradictory records by SOH band', () => {
    expect(consistentBatteryCondition('new', { soh: 60, cycleCount: 843 })).toBe('poor');
    expect(consistentBatteryCondition('like-new', { soh: 87, cycleCount: 517 })).toBe('good');
    expect(consistentBatteryCondition('excellent', { soh: 72 })).toBe('fair');
  });

  it('leaves other grades and records without SOH untouched', () => {
    expect(consistentBatteryCondition('used', { soh: 50 })).toBe('used');
    expect(consistentBatteryCondition('new', undefined)).toBe('new');
    expect(consistentBatteryCondition('new', {})).toBe('new');
  });
});

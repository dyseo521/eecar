/**
 * 배터리 부품의 상태 등급을 SOH·충방전 횟수와 맞춘다 (DECISION_LOG A-26).
 *
 * 합성 데이터 생성기가 상태 등급과 배터리 상태를 따로 뽑아 "신품인데 충방전 843회, SOH 60%" 같은
 * 모순이 생겼다. 등급별 조건(판단, 재검토 조건은 A-26):
 * - new:       SOH 98% 이상, 충방전 10회 이하
 * - like-new:  SOH 95% 이상, 충방전 100회 이하
 * - excellent: SOH 90% 이상
 * 조건에 맞지 않으면 SOH 구간으로 다시 매긴다: 85% 이상 good, 70% 이상 fair, 그 미만 poor.
 * 70%는 차량용 배터리 교체 시점의 하한이다(통상 70~80%, eval/datasets/v2/DEMAND_RESEARCH.md S4).
 */
export interface BatteryHealthLike {
  soh?: number;
  cycleCount?: number;
}

const GRADE_RULES: Record<string, (soh: number, cycles: number) => boolean> = {
  new: (soh, cycles) => soh >= 98 && cycles <= 10,
  'like-new': (soh, cycles) => soh >= 95 && cycles <= 100,
  excellent: soh => soh >= 90,
};

function gradeBySoh(soh: number): string {
  if (soh >= 85) return 'good';
  if (soh >= 70) return 'fair';
  return 'poor';
}

/** 상태 등급이 배터리 상태와 모순이면 고친 등급을, 아니면 원래 등급을 돌려준다 */
export function consistentBatteryCondition(condition: string, health: BatteryHealthLike | undefined): string {
  const rule = GRADE_RULES[condition];
  if (!rule || !health || typeof health.soh !== 'number') return condition;
  const cycles = typeof health.cycleCount === 'number' ? health.cycleCount : 0;
  return rule(health.soh, cycles) ? condition : gradeBySoh(health.soh);
}

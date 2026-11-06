/**
 * 자동이 평가의 기본 세계 상태: 운영 함수 12개의 설정과 실행 역할 권한 스냅숏 (DECISION_LOG A-38)
 *
 *   node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/export-agent-world.ts
 *
 * - 운영 도구(tools/config.ts)를 그대로 호출하므로 비밀값 가림도 운영과 같다.
 * - 시나리오는 이 기본값에서 다른 부분만 덮어쓴다 (eval/agent/README.md).
 * - AWS 자격 증명 필요 (Lambda·IAM 읽기). 결과: eval/agent/world-default.json
 */
import { writeFileSync } from 'fs';

const FUNCTIONS = [
  'VectorSearchFunction', 'PartRegistrationFunction', 'ComplianceCheckFunction', 'GetPartsFunction', 'WatchPartFunction',
  'ProposalFunction', 'SyntheticDataFunction', 'BatteryHealthAssessmentFunction', 'MaterialPropertySearchFunction',
  'ContactInquiryFunction', 'SlackNotificationFunction', 'SlackAgentFunction',
];

async function main(): Promise<void> {
  const { getFunctionConfig, getFunctionPermissions } = await import('../../backend/src/functions/slack-agent/tools/config.js');
  const world: Record<string, unknown> = {};
  for (const fn of FUNCTIONS) {
    const config = await getFunctionConfig(fn);
    const permissions = await getFunctionPermissions(fn);
    world[fn] = { config, permissions };
    console.log(fn, config.runtime, config.timeoutSec, config.memoryMB, `layers=${config.layers?.length}`, `statements=${permissions.statements?.length}`);
  }
  writeFileSync('eval/agent/world-default.json', JSON.stringify({ exportedAt: new Date().toISOString(), functions: world }, null, 2) + '\n', 'utf-8');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

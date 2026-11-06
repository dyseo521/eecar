import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { callClaude } from '/opt/nodejs/utils/bedrock.js';
import { getDocument } from '/opt/nodejs/utils/s3.js';
import { emitMetrics } from '/opt/nodejs/utils/emf.js';

const snsClient = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

/**
 * Compliance Check Lambda Function
 * Invoked automatically when new parts are registered
 * Validates parts against compliance rules and sends notifications
 */
export async function handler(event: any): Promise<void> {
  try {
    const { partId, partData } = event;

    console.log('Running compliance check for part:', partId);

    // Step 1: Load compliance rules from S3
    const complianceRules = await loadComplianceRules();

    // Step 2: Check compliance using Claude
    const violations = await checkCompliance(partData, complianceRules);

    // 검사 자체가 실패하면 "위반 없음"이 아니다. 조용히 넘어가면 규정 검사가 꺼진 줄 모른다 (A-41)
    if (violations === null) {
      console.error('Compliance check could not run for part:', partId);
      emitMetrics('EECAR/Compliance', {}, { ComplianceCheckFailed: { value: 1, unit: 'Count' } }, [[]]);
      return;
    }

    // Step 3: If violations found, send SNS notification
    if (violations.length > 0) {
      console.log(`Found ${violations.length} compliance violations`);
      await sendComplianceAlert(partId, partData, violations);
    } else {
      console.log('No compliance violations found');
    }
  } catch (error) {
    console.error('Error in compliance check:', error);
    // Log but don't throw - compliance check is non-critical
  }
}

/**
 * Load compliance rules from S3
 */
async function loadComplianceRules(): Promise<string> {
  try {
    const rules = await getDocument('compliance-rules.txt');
    if (rules) {
      return rules;
    }
  } catch (error) {
    console.error('Failed to load compliance rules:', error);
  }

  // Default rules if file not found
  return `
전기차 부품 규성 준수 사항:

1. 배터리 관련:
   - 리튬 배터리는 반드시 안전 인증을 거쳐야 함
   - 배터리 용량 및 전압은 실제 측정값을 명시해야 함
   - 폐배터리는 환경부 지침에 따라 처리 이력이 있어야 함

2. 전장 부품:
   - 고전압 부품은 절연 상태 확인 필요
   - 전자파 적합성(EMC) 인증 필요

3. 소재 관련:
   - 유해 물질(RoHS) 검사 결과 필요
   - 재활용 소재 사용 시 품질 보증서 필요

4. 일반 사항:
   - 제조사 및 모델명 정확히 기재
   - 부품 상태를 정직하게 표기
  `.trim();
}

/**
 * Check compliance using Claude
 */
async function checkCompliance(partData: any, rules: string): Promise<string[] | null> {
  const prompt = `다음은 전기차 부품 규성 준수 사항입니다:

${rules}

다음 부품이 규성을 준수하는지 확인해주세요:
- 부품명: ${partData.name}
- 카테고리: ${partData.category}
- 제조사: ${partData.manufacturer}
- 스펙: ${JSON.stringify(partData.specifications || {}, null, 2)}

위반 사항이 있다면 각 위반 항목을 한 줄씩 나열해주세요.
위반 사항이 없다면 "없음"이라고만 답해주세요.`;

  try {
    const response = await callClaude(
      [{ role: 'user', content: prompt }],
      '당신은 전기차 부품 규성 검증 전문가입니다.',
      500
    );

    return parseViolations(response);
  } catch (error) {
    console.error('Failed to check compliance with AI:', error);
    return null;
  }
}

/** "없음", "위반 사항 없음", "위반 사항이 없습니다" 같은 줄은 위반이 아니다 (이전에는 "위반 사항 없음"을 위반으로 셌다) */
export function parseViolations(response: string): string[] {
  return response
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^[-*\d.\s]*(없음|없습니다)[.\s]*$/.test(line) && !/위반\s*(사항|항목)?\s*(이|은|는)?\s*없/.test(line));
}

/**
 * Send compliance alert via SNS
 */
async function sendComplianceAlert(
  partId: string,
  partData: any,
  violations: string[]
): Promise<void> {
  const message = `
[규성 위반 알림]

부품 ID: ${partId}
부품명: ${partData.name}
카테고리: ${partData.category}
제조사: ${partData.manufacturer}

위반 사항:
${violations.map((v, i) => `${i + 1}. ${v}`).join('\n')}

조치가 필요합니다.
  `.trim();

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Subject: `[EECAR] 규성 위반 알림 - ${partData.name}`,
        Message: message,
      })
    );
    console.log('Compliance alert sent');
  } catch (error) {
    console.error('Failed to send compliance alert:', error);
  }
}

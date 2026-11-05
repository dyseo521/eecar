/**
 * 더미 부품 데이터의 모순 정리 (DECISION_LOG A-26). 운영 데이터는 전부 합성·더미 데이터라 값을 고쳐도 된다(사용자 확인).
 *
 *   cd backend
 *   PARTS_TABLE_NAME=eecar-parts-table npx tsx scripts/fix-dummy-data-consistency.ts [--apply]
 *
 * 규칙
 * 1. 배터리 상태 등급: SOH·충방전 횟수와 모순되는 등급을 다시 매기고(consistentBatteryCondition),
 *    설명 문장의 원래 등급 표기와 "새 제품"·"신품" 표현도 함께 고친다.
 * 2. 배터리 상태 정보가 없는 배터리: 설명에 적힌 SOH(예: "잔존 용량은 약 85%")를 쓰고, 없으면 연식으로 추정한다.
 *    추정식: SOH = 100 − 1.8 × 경과 연수 (Geotab 2024, EV 약 5,000대 분석의 연평균 열화율 1.8%).
 *    추정값에는 estimated: true를 남긴다. 양극재·셀 제조사는 E-GMP(아이오닉5·EV6)의 공개 사양(SK온 NCM)을 쓴다.
 * 3. 출시 전 연식: 출시 연도표에 있는 차종만 연식을 출시 연도로 올리고, 설명의 연식 표기도 고친다.
 * 4. polymer 카테고리: 재질 분류가 부품 종류 자리에 들어가 구매자 필터에서 보이지 않던 10개를 부품 종류로 옮긴다.
 *
 * --apply 없이 실행하면 바뀔 내용만 출력한다. 바꾼 뒤에는 reindex-search-documents.ts --apply로 재색인한다.
 */
const APPLY = process.argv.includes('--apply');
const NOW_YEAR = 2026;
const ANNUAL_DEGRADATION = 1.8;

if (!process.env.PARTS_TABLE_NAME) {
  console.error('missing env PARTS_TABLE_NAME');
  process.exit(1);
}

/** 출시 연도 (현대차·기아 공식 발표: 아이오닉5 2021-02, EV6 2021-08) */
const LAUNCH_YEAR: Array<{ pattern: RegExp; year: number }> = [
  { pattern: /IONIQ\s?5|아이오닉\s?5/i, year: 2021 },
  { pattern: /\bEV6\b/i, year: 2021 },
];

/** E-GMP 배터리 공개 사양 */
const E_GMP_BATTERY = { cathodeType: 'NCM Ni 80%', manufacturer: 'SK온' };

/** polymer → 부품 종류 (부품 이름 기준, 재질 정보는 SPEC에 그대로 남는다) */
const POLYMER_CATEGORY: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /휠 아치|언더커버|충전구 커버/, category: 'body-panel' },
  { pattern: /인테리어 트림|에어 덕트/, category: 'interior' },
  { pattern: /커넥터 하우징/, category: 'electronics' },
  { pattern: /./, category: 'other' }, // 배터리 하우징 커버, 냉각수 리저버, 헤드라이트 렌즈 등
];

const NEW_PHRASES: Array<[RegExp, string]> = [
  [/새 제품/g, '중고 제품'],
  [/신품 부품/g, '중고 부품'],
  [/신품/g, '중고품'],
];

function sohFromDescription(description: string): number | undefined {
  // "잔존 용량은 약 85% 수준", "셀 상태는 90% 이상 유지", "여전히 80% 이상"
  const labeled = /(잔존 용량|용량|셀 상태|SOH|건강도|상태)[^%\d]{0,20}(\d{2})\s*%/.exec(description);
  const bare = /(\d{2})\s*%\s*(이상|수준)/.exec(description);
  const value = labeled ? Number(labeled[2]) : bare ? Number(bare[1]) : NaN;
  return value >= 50 && value <= 100 ? value : undefined;
}

function replaceConditionWords(description: string, from: string, to: string): string {
  let text = description.replace(new RegExp(`\\b${from.replace('-', '\\-')}\\b`, 'g'), to);
  for (const [pattern, replacement] of NEW_PHRASES) text = text.replace(pattern, replacement);
  return text;
}

async function main(): Promise<void> {
  const { loadPartsWithDetails } = await import('../src/utils/parts.js');
  const { updateItem } = await import('../src/utils/dynamodb.js');
  const { consistentBatteryCondition } = await import('../src/functions/synthetic-data/data/condition.js');

  const parts = await loadPartsWithDetails({ details: ['BATTERY_HEALTH'] });
  const changes: Array<{ partId: string; name: string; updates: Record<string, unknown>; notes: string[] }> = [];

  for (const part of parts) {
    const updates: Record<string, unknown> = {};
    const notes: string[] = [];
    let description = String(part.description ?? '');
    let year = Number(part.year);

    // 3. 출시 전 연식
    const launch = LAUNCH_YEAR.find(l => l.pattern.test(`${part.name} ${part.model}`));
    if (launch && year < launch.year) {
      description = description.replace(new RegExp(`${year}년`, 'g'), `${launch.year}년`);
      notes.push(`year ${year}→${launch.year}`);
      year = launch.year;
      updates.year = year;
    }

    if (part.category === 'battery') {
      let health = part.batteryHealth as Record<string, unknown> | undefined;
      // 2. 배터리 상태 정보 보충
      if (!health) {
        const fromText = sohFromDescription(description);
        const soh = fromText ?? Math.round(100 - ANNUAL_DEGRADATION * Math.max(0, NOW_YEAR - year));
        const isEgmp = LAUNCH_YEAR.some(l => l.pattern.test(`${part.name} ${part.model}`));
        health = {
          soh,
          ...(isEgmp ? E_GMP_BATTERY : {}),
          recommendedUse: soh >= 70 ? 'reuse' : 'recycle',
          suitableApplications: soh >= 80 ? ['EV 재사용', 'ESS'] : ['ESS'],
          estimated: true,
          estimatedFrom: fromText !== undefined ? 'description' : `age(${ANNUAL_DEGRADATION}%/yr)`,
        };
        updates.batteryHealth = health;
        notes.push(`batteryHealth soh=${soh} (${health.estimatedFrom})`);
      }
      // 1. 상태 등급
      const condition = String(part.condition);
      const fixed = consistentBatteryCondition(condition, health as { soh?: number; cycleCount?: number });
      if (fixed !== condition) {
        description = replaceConditionWords(description, condition, fixed);
        updates.condition = fixed;
        notes.push(`condition ${condition}→${fixed} (soh=${health.soh}, cycles=${health.cycleCount ?? '-'})`);
      }
    }

    // 4. polymer 카테고리
    if (part.category === 'polymer') {
      const category = POLYMER_CATEGORY.find(p => p.pattern.test(String(part.name)))!.category;
      updates.category = category;
      updates.GSI1PK = `CATEGORY#${category}`;
      notes.push(`category polymer→${category}`);
    }

    if (description !== String(part.description ?? '')) updates.description = description;
    if (Object.keys(updates).length > 0) changes.push({ partId: part.partId, name: String(part.name), updates, notes });
  }

  for (const c of changes) console.log(`${c.partId.slice(0, 8)} ${c.name.slice(0, 40)}: ${c.notes.join('; ')}`);
  const count = (prefix: string) => changes.filter(c => c.notes.some(n => n.startsWith(prefix))).length;
  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    parts: parts.length,
    changed: changes.length,
    condition: count('condition'),
    batteryHealth: count('batteryHealth'),
    year: count('year'),
    category: count('category'),
  }, null, 2));

  if (!APPLY) return;
  for (const c of changes) {
    await updateItem(`PART#${c.partId}`, 'METADATA', { ...c.updates, updatedAt: new Date().toISOString() });
  }
  console.log(`updated ${changes.length} METADATA items`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

/**
 * 검색용 정규화 속성: 부품에서 수치 조건을 비교할 값을 뽑는다 (DECISION_LOG A-27).
 *
 * 텍스트 검색은 "60kWh 이상" 같은 부등호 조건을 풀 수 없다. 남은 오답의 38%가 이 경우였다(E-23).
 * 질의 조건(query-understanding.ts)과 비교하려면 부품 쪽에도 같은 단위의 값이 있어야 하는데,
 * 원본은 여러 곳에 흩어져 있다(용량은 이름의 "72kWh" 또는 SPEC의 전압×Ah, SOH는 batteryHealth).
 * 등록·재색인 때 이 함수로 한 번 뽑아 METADATA의 searchAttributes에 저장하고, 검색 시점에는 그 값만 읽는다.
 */

export interface SearchAttributes {
  category?: string;
  /** 배터리 용량 kWh */
  kwh?: number;
  soh?: number;
  /** 정격 출력 kW (모터·인버터·충전기) */
  powerKw?: number;
  voltage?: number;
  torqueNm?: number;
  tensileMPa?: number;
  price?: number;
  year?: number;
  quantity?: number;
  condition?: string;
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function firstMatch(text: string, pattern: RegExp): number | undefined {
  const m = pattern.exec(text);
  return m ? num(m[1]) : undefined;
}

export function extractSearchAttributes(part: any): SearchAttributes {
  const spec = part.specifications ?? {};
  const e = spec.electricalProps ?? {};
  const m = spec.materialComposition ?? {};
  const label = [part.name, part.model].filter(Boolean).join(' ');

  const voltage = num(e.voltage) ?? num(spec.voltage);
  const capacityAh = num(e.capacity);
  // 용량: 이름·모델의 "72.6kWh"가 가장 정확하고, 없으면 전압 × Ah
  let kwh = firstMatch(label, /(\d+(?:\.\d+)?)\s*kWh/i) ?? firstMatch(String(spec.capacity ?? ''), /(\d+(?:\.\d+)?)\s*kWh/i);
  if (kwh === undefined && part.category === 'battery' && voltage && capacityAh) {
    kwh = Math.round((voltage * capacityAh) / 100) / 10;
  }
  const powerKw = num(e.power) ?? firstMatch(String(spec.power ?? ''), /(\d+(?:\.\d+)?)\s*kW(?!h)/i)
    ?? firstMatch(label, /(\d+(?:\.\d+)?)\s*kW(?!h)/i);

  const attrs: SearchAttributes = {
    category: part.category || undefined,
    kwh: part.category === 'battery' ? kwh : undefined,
    soh: num(part.batteryHealth?.soh),
    powerKw: part.category === 'battery' ? undefined : powerKw,
    voltage,
    // 토크는 사양 항목이 없고 설명에만 있는 경우가 많다 ("최대토크 350Nm")
    torqueNm: num(e.torque) ?? firstMatch(String(spec.torque ?? ''), /(\d+(?:\.\d+)?)/)
      ?? firstMatch(String(part.description ?? ''), /(\d+(?:\.\d+)?)\s*(?:Nm|N·m)/i),
    tensileMPa: num(m.tensileStrengthMPa ?? m.tensileStrength),
    price: num(part.price),
    year: num(part.year),
    quantity: num(part.quantity),
    condition: part.condition || undefined,
  };
  return Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined)) as SearchAttributes;
}

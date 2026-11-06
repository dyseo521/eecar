/**
 * 검색 도메인 사전: 같은 대상을 가리키는 표기 변형 묶음.
 *
 * 판매자와 구매자는 같은 차종을 "아이오닉5", "아이오닉 5", "IONIQ 5"처럼 다르게 쓴다. 검색 문서를 만들 때
 * 문서에 나온 표기를 찾아 같은 묶음의 다른 표기를 함께 넣으면(문서 확장) 질의가 어떤 표기를 써도 맞는다.
 * 질의 쪽은 바꾸지 않으므로 검색 시점 비용이 없다.
 *
 * 사전을 바꾸면 검색 결과가 바뀌므로 평가 게이트를 통과해야 한다 (DECISION_LOG A-22).
 * 짧고 뜻이 여럿인 표기(볼트 = 체결 부품)는 단독으로 넣지 않는다.
 */

/** 차종 표기 변형 (국내 유통 전기차 중심) */
export const VEHICLE_ALIASES: readonly (readonly string[])[] = [
  ['아이오닉5', '아이오닉 5', 'IONIQ 5', 'IONIQ5'],
  ['아이오닉6', '아이오닉 6', 'IONIQ 6', 'IONIQ6'],
  ['아이오닉 일렉트릭', '아이오닉EV', '아이오닉 EV', 'IONIQ Electric', 'IONIQ EV'],
  ['코나 일렉트릭', '코나EV', '코나 EV', 'Kona Electric', 'Kona EV'],
  ['EV6', '이브이식스'],
  ['EV9', '이브이나인'],
  ['니로 EV', '니로EV', 'Niro EV', '니로 플러스'],
  ['쏘울 EV', '쏘울EV', 'Soul EV'],
  ['SM3 Z.E.', 'SM3 ZE', 'SM3ZE', '에스엠쓰리 제트이'],
  ['모델S', '모델 S', 'Model S'],
  ['모델3', '모델 3', 'Model 3'],
  ['모델Y', '모델 Y', 'Model Y'],
  ['모델X', '모델 X', 'Model X'],
  ['리프', '닛산 리프', 'Nissan Leaf', 'Leaf'],
  ['i3', 'BMW i3', '아이쓰리'],
  ['볼트 EV', '볼트EV', 'Bolt EV', 'Bolt EUV'],
  ['볼트 PHEV', '볼트(Volt)', 'Chevrolet Volt', 'Volt'],
  ['조에', '르노 조에', 'ZOE', 'Renault Zoe'],
  ['e-골프', '이골프', 'e-Golf', 'eGolf'],
  ['ID.4', 'ID4', '아이디포', 'ID 4'],
  ['e-트론', '이트론', 'e-tron', 'etron'],
  ['타이칸', 'Taycan', '포르쉐 타이칸'],
  ['아토3', '아토 3', 'Atto 3', 'ATTO3'],
  ['아이미브', '아이 미브', 'i-MiEV', 'iMiEV'],
  // 운영 DB의 차종 (2026-11-06, DECISION_LOG A-32). 사전이 운영 부품의 48%만 덮어 차종 조건이 절반에서 판단되지 않았다.
  // 짧고 다른 뜻과 겹치는 표기(한, R3, Air, G6)는 브랜드와 함께만 넣는다. "EV Universal" 같은 범용 표기는 넣지 않는다.
  ['아이오닉9', '아이오닉 9', 'IONIQ 9', 'IONIQ9'],
  ['넥쏘', 'Nexo', 'NEXO'],
  ['GV60', '제네시스 GV60', 'Genesis GV60'],
  ['GV70 전동화', 'GV70 Electric', 'Genesis GV70 Electric'],
  ['G80 전동화', 'G80 Electric', 'Genesis G80 Electric'],
  ['레이 EV', '레이EV', 'Ray EV', 'Kia Ray EV'],
  ['ID.3', 'ID3', '아이디쓰리'],
  ['ID.5', 'ID5', '아이디파이브'],
  ['ID.6', 'ID6'],
  ['e-업', 'e-Up', 'e-Up!', 'VW e-Up'],
  ['포커스 일렉트릭', 'Focus Electric', 'Ford Focus Electric'],
  ['E-트랜짓', '이트랜짓', 'E-Transit'],
  ['F-150 라이트닝', 'F-150 Lightning', 'F150 Lightning'],
  ['블레이저 EV', 'Blazer EV'],
  ['허머 EV', 'Hummer EV', 'GMC Hummer EV'],
  ['iX', 'BMW iX'],
  ['iX2', 'BMW iX2'],
  ['iX3', 'BMW iX3'],
  ['i4', 'BMW i4'],
  ['i7', 'BMW i7'],
  ['BYD Han', '비야디 한'],
  ['BYD Tang', '비야디 탕'],
  ['Seagull', 'BYD Seagull', '비야디 씨걸'],
  ['Song Plus', 'BYD Song Plus'],
  ['Yuan Plus', 'BYD Yuan Plus'],
  ['Qin Plus', 'BYD Qin Plus'],
  ['Destroyer 05', 'BYD Destroyer 05'],
  ['EQA', '벤츠 EQA'],
  ['EQE', '벤츠 EQE'],
  ['EQS', '벤츠 EQS'],
  ['EQV', '벤츠 EQV'],
  ['ES6', 'NIO ES6'],
  ['ES7', 'NIO ES7'],
  ['EC6', 'NIO EC6'],
  ['EC7', 'NIO EC7'],
  ['ET5T', 'NIO ET5T'],
  ['ET7', 'NIO ET7'],
  ['아리아', 'Ariya', 'Nissan Ariya'],
  ['사쿠라', 'Sakura', 'Nissan Sakura'],
  ['타운스타 EV', 'Townstar EV'],
  ['마칸 일렉트릭', '마칸 EV', 'Macan Electric'],
  ['R1S', 'Rivian R1S'],
  ['R1T', 'Rivian R1T'],
  ['Rivian R2', '리비안 R2'],
  ['Rivian R3', '리비안 R3'],
  ['사이버트럭', 'Cybertruck'],
  ['로드스터', 'Roadster', 'Tesla Roadster'],
  ['C40 Recharge', 'C40'],
  ['EX40', '볼보 EX40'],
  ['폴스타2', '폴스타 2', 'Polestar 2'],
  ['폴스타3', '폴스타 3', 'Polestar 3'],
  ['폴스타4', '폴스타 4', 'Polestar 4'],
  ['P7', 'XPeng P7', '샤오펑 P7'],
  ['P7i', 'XPeng P7i'],
  ['XPeng G6', '샤오펑 G6'],
  ['Lucid Air', '루시드 에어', 'Air Pure', 'Air Grand Touring'],
  ['Lucid Gravity', '루시드 그래비티'],
  ['Q4 e-tron', 'Q4 이트론'],
  ['Q6 e-tron', 'Q6 이트론'],
  ['A6 e-tron', 'A6 이트론'],
  ['e-tron GT', '이트론 GT'],
  ['R8 e-tron'],
  ['C-Zero', 'Citroën C-Zero', '시트로엥 C-Zero'],
  ['Peugeot iOn', '푸조 iOn'],
  ['Fortwo ED', 'Smart Fortwo ED', '스마트 포투'],
];

/** 완성차·셀 제조사 표기 변형 */
export const MAKER_ALIASES: readonly (readonly string[])[] = [
  ['현대', '현대자동차', 'Hyundai'],
  ['기아', '기아자동차', 'Kia'],
  ['테슬라', 'Tesla'],
  ['닛산', 'Nissan'],
  ['BMW', '비엠더블유'],
  ['쉐보레', '쉐보래', 'Chevrolet', 'GM'],
  ['르노', '르노코리아', 'Renault'],
  ['르노삼성', 'Renault Samsung'],
  ['폭스바겐', 'Volkswagen', 'VW'],
  ['아우디', 'Audi'],
  ['포르쉐', 'Porsche'],
  ['BYD', '비야디'],
  ['미쓰비시', 'Mitsubishi'],
  ['현대모비스', 'Hyundai Mobis', '모비스'],
  ['SK온', 'SK On', 'SK이노베이션'],
  ['LG에너지솔루션', 'LG엔솔', 'LG Energy Solution', 'LGES', 'LG화학'],
  ['삼성SDI', 'Samsung SDI'],
  ['CATL', '닝더스다이'],
  ['파나소닉', 'Panasonic'],
  ['AESC', '오토모티브 에너지 서플라이'],
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s.\-()·_/]+/g, '');
}

// "IONIQ 5용", "모델3의", "코나EV나 니로EV"처럼 표기 뒤에 붙는 조사·접미사
const TRAILING_PARTICLE = /(용으로|이랑|이나|하고|용|의|에|을|를|은|는|과|와|로|나|랑|도)$/;

function words(text: string): string[] {
  return text.toLowerCase().split(/[\s,()[\]/·:;]+/).filter(Boolean);
}

function variants(token: string): string[] {
  const n = normalize(token);
  const stripped = n.replace(TRAILING_PARTICLE, '');
  return stripped && stripped !== n ? [n, stripped] : [n];
}

/**
 * text에 나온 표기의 묶음을 찾아 묶음 전체를 돌려준다.
 * 1~3개 연속 단어를 이어 붙여 표기와 비교한다("아이오닉 5" = "아이오닉5").
 * 부분 문자열로는 비교하지 않는다("리프트"는 "리프"가 아니다).
 */
export function findAliasGroups(text: string, groups: readonly (readonly string[])[]): (readonly string[])[] {
  const tokens = words(text);
  const windows = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    let prefix = '';
    for (let n = 0; n < 3 && i + n < tokens.length; n++) {
      // 마지막 단어에만 조사가 붙을 수 있으므로 조사를 뗀 형태도 후보로 둔다
      for (const v of variants(tokens[i + n])) windows.add(prefix + v);
      prefix += normalize(tokens[i + n]);
    }
  }
  return groups.filter(group => group.some(alias => windows.has(normalize(alias))));
}

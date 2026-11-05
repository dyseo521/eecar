# EECAR v2 평가 질의 수요 모델·표현 근거

- 작성일: 2026-11-05 / 용도: v2 평가 질의 약 260건 작성의 근거 자료 (질의 자체는 포함하지 않음)
- 표기: **[근거]**는 출처가 있는 사실, **[판단]**은 근거가 얇아 작성자가 추론한 값. 출처 번호 `[S#]`는 (e)절 참조.
- 전제: EECAR는 국내 B2B 중고 EV 부품 거래 플랫폼이다. 실제 거래 로그는 확보하지 못했으므로 가중치는 모두 **추정치**다.

---

## (a) 구매자 세그먼트와 가중치

| 코드 | 세그먼트 (대표 구매자) | 가중치 | 질의 수 | 근거 강도 |
|---|---|---|---|---|
| A | 재사용 ESS 통합·시공사 (충전소 피크저감, 태양광, 건설현장, UPS) | 22% | 57 | 중 |
| B | 소형 재사용 제품 제조사 (전동 이륜차, 지게차·AGV, 농업용 고소작업차, 가로등, 캠핑 파워뱅크) | 9% | 23 | 중-약 |
| C | 재활용·원료 회수 업체 (배터리 블랙매스, 모터 희토류, 알루미늄·구리 스크랩) | 13% | 34 | 중 |
| D | 사고 수리 정비소·보험 수리 연계 (외판, 도어, 유리, 램프, 내장) | 22% | 57 | 중 |
| E | EV 전장·구동계 고장 수리, 재제조 업체 (OBC/ICCU, 인버터, BMS, 모터, 공조) | 20% | 52 | 중 |
| F | 개조·R&D·교육 (컨버전, 벤치마킹, 정비 교육용) | 7% | 18 | 약 |
| G | 탐색형·모호 질의 (브랜드나 카테고리만 입력) | 7% | 19 | 약 (실측 1건) |

**가중치 도출 방법 [판단]**: 아래 네 가지 신호를 정성적으로 합산했다. 정량 공식은 쓰지 않았다.
1. **공급 흐름**: 국내 사용후 배터리 배출량은 2025년 8,321개에서 2030년 107,500개로 늘어날 전망이다 [근거, S2·S3]. 재사용 주 용도는 ESS다 [근거, S6·S4]. 환경공단 SOH 60% 미만 배터리와 거점센터 매각분은 주로 재활용업체와 연구소로 간다 [근거, S5·S7]. 이 신호가 A·C의 가중치를 정한다.
2. **부품 요청 실측(해외)**: 영국 중고부품 중개 사이트의 인기 요청 목록을 보면 Model 3는 도어·휠·범퍼·미러·펜더, Leaf는 도어·배터리·범퍼·미러·헤드램프·OBC 보드 순이다 [근거, S14]. 요청 빈도에서는 외판이 우세하고, EV 전용 부품(배터리, OBC)도 상위에 있다. 이 신호가 D와 E를 비슷한 비중으로 둔 근거다.
3. **EV 수리 대체부품 부족**: 미국 BEV 수리에서 OEM 부품 비중은 85.13%로, ICE의 62.30%보다 높다. 애프터마켓 대체품도 부족하다 [근거, S13]. 국내 수리에서도 93%가 신품을 쓴다(2020년 조사) [근거, S12]. 중고 수요의 잠재력은 있지만 현재 침투율은 낮다는 뜻이다. 그래서 D를 최대치로 두지 않았다.
4. **EECAR 실측**: 프로덕션 질의 3건은 ESS 배터리 1건(A), 도어 내장 수리 1건(D), "기아EV" 1건(G)이었다. v1 질의셋 91건은 배터리 33%, 구동·전장 44%, 차체 19%로 구성돼 있다(저장소 `eval/datasets/v1`).

**권장 운용 [판단]**: 11개 카테고리마다 최소 8건씩 보장한다. 배터리 관련 질의(A+B+C의 상당 부분+F 일부)는 약 40%가 된다.

---

## (b) 세그먼트별 부품·제약·표현 패턴

> 차종별 수치(팩 kWh, 전압, 모터 kW)는 공개 제원 상식을 적은 것으로 이 조사에서 검증하지 않았다. 질의 작성 시 corpus 값과 대조할 것.

### A. 재사용 ESS 통합·시공사 (57건)
- **부품**: 배터리 팩(대부분), 모듈, BMS, HV 정션박스.
- **제약과 범위**
  - 시스템 용량: 질의의 60kWh 이상(실측), 실증 200kWh급 [S4·S3], SK온 실증은 니로 EV 팩 6개로 300kWh급 [S3]. 그래서 "팩 n개"처럼 수량 조건이 붙는다.
  - SOH: 환경공단 재사용 기준은 60% 이상 [S5·S7]. 차량용 교체 시점은 통상 70~80% [S4]. 질의에서는 "70% 이상"이나 "80% 이상"이 자연스럽다 [판단].
  - 화학계: 정치형 저장에서는 LFP가 주류다. 2025년 정치형 팩 가격은 $70/kWh까지 떨어졌다 [S17]. 국내 1세대 EV는 NCM 비중이 커서 LFP를 요구하는 질의는 공급 부족으로 이어진다 [판단].
  - 전압: 400V급과 800V급(E-GMP)으로 나뉜다.
  - 가격: 신품 ESS와 경쟁한다. 재사용 ESS 초기비용은 신품의 64.3~78.9% 수준이다 [S19]. 2019년 전망은 2025년 재사용 배터리가 신품보다 30~70% 쌀 것으로 봤지만 [S18], 이후 신품 가격이 급락해 가격 우위가 줄었다 [S17]. 팩 단가 상한을 거는 질의가 가능하다.
  - 안전: 2023-10-19부터 재사용전지는 안전성검사를 받아야 판매할 수 있다 [S8]. 실증특례에는 옥외 전용공간 설치 조건이 붙었다 [S9].
- **표현 패턴** (문장형 60% / 키워드형 40%, [판단])
  - `{용도}에 사용할 배터리를 찾고 있어요. {N}kWh 이상이면 좋겠습니다.`
  - `{용도}용 {화학계} 배터리 팩 SOH {n}% 이상`
  - `{차종} 배터리 팩 {k}개 이상 구매 가능한가요`
  - `{전압}V급 {용량}kWh 중고 배터리, 셀 제조사 {제조사}`
  - 용도 어휘: ESS, 에너지 저장장치, 피크저감, 충전소, 태양광 연계, UPS, 비상전원

### B. 소형 재사용 제품 제조사 (23건)
- **근거 용도**: 규제특례 실증 과제로 전동 스쿠터(전기 이륜차), 농업용 고소작업차, 태양광 가로등, 가정용 파워박스가 승인됐다 [S9]. 셀 단위 재사용처로 소형 모빌리티, 캠핑용 ESS, 가로등, UPS가 언급된다 [S5]. 지게차는 해외 연구에서 재사용처로 거론된다 [S20].
- **부품**: 모듈(주력), 셀, BMS, 소형 팩(i-MiEV, 리프 24kWh 같은 저용량 팩).
- **제약**: 모듈 전압(12/24/48V 조립 기준), Ah 표기, 크기·무게, 냉각 방식(공랭 선호, [판단]), 화학계(국내 캠핑 시장은 "인산철 200Ah"처럼 한글 화학명과 Ah 단위를 쓴다, [S35]), 수량(수십 개 단위).
- **표현 패턴**
  - `{제품}에 넣을 배터리 모듈 {전압}V {용량}Ah`
  - `{차종} 배터리 모듈 낱개 구매, {n}개`
  - `인산철|삼원계 모듈 {용도}용` (한글 화학명 변이)
  - `전동 {이륜차|지게차|카트}용 중고 배터리`

### C. 재활용·원료 회수 업체 (34건)
- **배터리**: 회수 가치는 니켈·코발트 함량이 좌우한다. 평균 NCM 셀의 금속 가치는 LFP의 4배에 조금 못 미친다. 유럽에서는 LFP를 받을 때 재활용업체가 톤당 €3,000~4,000의 처리비를 받는다 [S15]. 북미에서는 처리비가 $1.5~2/kg이고, 단일 팩은 가치가 음수가 되기도 하므로 대량 물량을 선호한다 [S16].
  - 제약: 화학계(하이니켈 NCM 선호), SOH 60% 미만이거나 for-parts 상태, 수량·중량(톤, kg), 팩/모듈/셀 형태.
- **모터**: EV 모터 1대에는 NdFeB 자석이 약 2~5kg 들어 있다 [S22]. 견인 모터용 자석 회수는 아직 산업화되지 않았다 [S23]. 그래서 "희토류 자석 포함 모터"를 찾는 질의는 PMSM과 유도·권선형(희토류 없음)을 구별하는 시험이 된다.
- **알루미늄·구리**: 6xxx 같은 단조·압연재는 주조재(A356 휠)와 섞이지 않아야 다시 단조재로 쓸 수 있다. 분리된 단조 스크랩의 수요도 늘고 있다 [S24]. 질의에는 합금 번호, 단조/주조 구분, 순도, 중량이 등장한다.
- **표현 패턴** (키워드형 55%, [판단])
  - `폐배터리 {화학계} {수량}톤 매입`
  - `재활용용 {차종} 배터리 SOH {n}% 미만`
  - `희토류 자석 들어간 구동모터 스크랩`
  - `알루미늄 {합금번호} 판재 스크랩 {중량}kg`
  - `블랙매스용 NCM 모듈 대량`

### D. 사고 수리 (57건)
- **부품**: 범퍼, 도어(쉘/트림), 펜더(윙), 후드, 트렁크·테일게이트, 미러, 헤드·테일램프, 유리, 휠, 내장재 [S14]. 코나 EV와 내연 코나를 비교한 수리 견적 약 9.2만 건에서 EV의 후방 범퍼 흡수재 교체 빈도가 1,390% 높았다 [S28].
- **식별 방식**: 영국 요청 데이터의 표기 형식은 `모델 트림 | 연식 | 세대코드 | 부품(위치)`이다. 예를 들어 "Bumper (Front)", "Wing (Passenger Side)", "Door Rear Driver Side" 같은 식이다 [S14]. eBay도 연식·제조사·모델을 기본 호환 키로 쓴다 [S30].
- **제약**: 차종+연식/세대가 필수, 위치(운전석/조수석, 앞/뒤, 좌/우), 상태 허용 범위(실측 질의의 "약간의 스크래치"), 색상, 가격 상한. 보험 친환경부품 특약은 중고부품을 쓰면 신품 수리비의 일부를 돌려준다 [S12].
- **표현 패턴** (키워드형 65%, [판단])
  - `{차종} {연식} {위치} {부품}`
  - `{차종} {부품} 중고, 스크래치 있어도 됨`
  - `{차종} {세대/페이스리프트} {부품} 교체용 중고 부품을 찾아야 한다. {상태 서술}` (실측 질의 형식)
  - `{차종} {부품} {가격}만원 이하`

### E. 전장·구동계 고장 수리, 재제조 (52건)
- **근거**: 현대·기아 ICCU(OBC와 LDC 통합) 결함으로 충전 불가와 12V 방전이 발생해 리콜이 반복됐다. 리콜 후에도 재발했다는 보도가 있다 [S25·S26]. Leaf 인기 요청에 OBC 보드와 배터리가 포함된다 [S14]. 국내 EV 자차 수리비는 비EV보다 30.2% 높으며(2021년 기준), 원인은 고전압 배터리와 전자장치다 [S27]. 국내 폐차장 연계 EV 부품몰 Epart는 EV 부품 3,000여 종을 재고로 두고 있고, 입고 단계에서 상태를 평가한다 [S11].
- **부품**: OBC/ICCU, 인버터, BMS, LDC, VCU, 전동 컴프레서, PTC 히터, 히트펌프, 충전 인렛, 구동 모터, 감속기.
- **제약**: 차종+연식, 품번, 호환 여부, 동작 테스트·보증 여부, 출력(OBC 3.3~11kW 계열), 인렛 규격(CCS1/CCS2/CHAdeMO/NACS). 순정 부품몰도 부품명이나 부품번호로 검색한다 [S31].
- **표현 패턴**
  - `{차종} {부품약어}` (예: OBC, ICCU, LDC 같은 영문 약어가 기본, [판단])
  - `{차종} {연식} {부품} 중고 정상작동품`
  - `{증상} 때문에 {부품} 교체하려는데 {차종}에 맞는 중고 있나요` (증상형)
  - `{품번}` 또는 `{품번} 호환 부품` (품번 질의)
  - `{인렛규격} 충전구 {차종}`

### F. 개조·R&D·교육 (18건)
- **근거**: 고출력 컨버전은 Tesla 드라이브 유닛 중심이고, 저가형은 Leaf 모터(80/110/160kW) 키트를 쓴다 [S32]. 국내 대학의 전환 교육에는 고전압 배터리 셀 분해 실습이 있다 [S33]. 다만 중고부품 구매 근거는 확인하지 못했다.
- **제약**: 모터 kW·Nm, 전압(400/800V), 인버터 소자(SiC/IGBT), 일체형 여부, for-parts 허용.
- **표현 패턴**: `{kW}kW급 PMSM 모터 컨버전용`, `800V SiC 인버터 분석용 샘플`, `교육용 {부품} 작동 불량품도 가능`.

### G. 탐색형·모호 (19건)
- 실측 "기아EV" 같은 형태다. 브랜드만(`{브랜드}EV`), 카테고리만(`배터리`, `인버터`), 차종만(`{차종}`) 입력한다.
- 정답 집합이 크므로 평가 시 recall 지표나 다수 정답(qrels) 설계가 필요하다.

---

## (c) 질의 형태 통계와 권장 구성

### 근거 통계

| 출처 | 지표 | 값 | 비고 |
|---|---|---|---|
| ESCI US 97,345개 질의, **직접 계산** [S36] | 단어 수 | 평균 3.54, 중앙값 3. 1단어 4.9%, 2단어 21.8%, 3단어 28.3%, 4단어 22.6%, 5단어 12.5%, 6단어 이상 9.9%, 10단어 이상 0.4% | "어려운 질의" 위주 표집이라 일반 로그보다 길 수 있음 [S36] |
| 〃 | 숫자 포함 | 15.1% | **4자리 이상 숫자가 0건**이어서 연식·모델번호가 걸러진 것으로 보임. 하한값으로만 사용 |
| 〃 | 가격 표현(under $, cheap 등) | 0.34% | 일반 소비재 기준 |
| 〃 | 부정(without/not/no) | 3.7% | 부정 질의를 일부러 표집해 과대 가능 |
| ESCI JP 18,127개 (CJK 비교용) | 글자 수 | 평균 10.0, 중앙값 9. 5자 이하 17.8%, 6~10자 45.2%, 11~15자 26.5%, 16자 이상 10.5% | 한국어 음절 길이의 대략적 참고치 [판단] |
| DEJAN, Amazon 3,960만 개 고유 질의 [S37] | 볼륨별 평균 | 고빈도 2.6단어/16자, 저빈도 3.9단어/23자 | 꼬리 질의일수록 길어짐 |
| SLI Systems, 15억 건 (2013~2017) [S38] | 1단어 비율 | 56%, 3단어 이상 18% | 개별 쇼핑몰 사이트 검색, 오래된 자료 |
| KuaiSearch (중국어) [S39] | 글자 수 | 5~8자가 44.68% | 길수록 카테고리 모호성이 줄어듦 |
| Papenmeier 외 2020 [S40] | 자연어 서술 vs 실제 입력 | 서술 24~29단어, 입력 질의 2.2~2.8단어 (88~92% 짧음) | 같은 사람도 검색창에는 짧게 입력함 |
| 네이버 AI 쇼핑 에이전트 (2026-07) [S41] | 롱테일 | 이용자의 70% 이상이 15자 이상 질의 입력, 가격·기능 복합 질의 증가 | 대화형 인터페이스 기준 |
| Google AI Mode [S42] | 질의 길이 | 기존 검색 대비 약 2배(2025), 약 3배(2026) | 2차 보도 |
| EECAR 프로덕션 3건 | 형태 | 문장형 2건(약 30~60자), 단어형 1건(4자) | 표본이 매우 작음 |
| EECAR v1 91건 | 형태 | 평균 13.3자, keyword 58% / semantic 23% / mixed 19% | 저장소 내부 자료 |

**해석 [판단]**: 키워드 검색창의 로그는 3단어 안팎의 짧은 질의가 압도적이다. 반면 대화형·AI 검색에서는 15자 이상 복합 조건 질의가 다수다. EECAR는 LLM 기반 시맨틱 검색이고 프로덕션 3건 중 2건이 문장형이었다. 그래서 일반 로그보다 문장형 비중을 높게 잡되, 짧은 질의도 4분의 1을 유지한다.

### 권장 구성 (260건, [판단])

| 축 | 구분 | 비율 | 건수 |
|---|---|---|---|
| 길이·형태 | 단문 키워드 (2어절 이하, 약 10자 이하) | 25% | 65 |
| | 속성 결합 키워드 (3~6어절, 서술어 없음) | 40% | 104 |
| | 자연어 문장·요청형 (서술어 포함, 대개 26자 이상) | 35% | 91 |
| 내용 제약 (중복 허용) | 차종 명시 | 55% | 143 |
| | 연식·세대 명시 | 15% | 39 |
| | 위치 한정 (운전석/조수석/앞/뒤) | 8% | 21 |
| | 수치 속성 (kWh, SOH, V, kW, Nm, Ah, MPa, 합금번호) | 35% | 91 |
| | 범위·임계 (이상/이하/~) | 20% | 52 |
| | 가격 상한·예산 | 8% | 21 |
| | 수량·대량 (n개, 톤) | 5% | 13 |
| | 상태 조건 (중고/재제조/부품용/스크래치 허용) | 12% | 31 |
| | 용도 서술 (ESS용, 지게차용, 교육용) | 15% | 39 |
| | 증상형 (부품명 없이 고장 증상) | 4% | 10 |
| | 부정·제외 (~말고, ~제외) | 3% | 8 |
| | 품번 질의 | 3% | 8 |
| 표면 변이 (중복 허용) | 띄어쓰기 변이 (아이오닉5/아이오닉 5, 기아EV) | 20% | 52 |
| | 영문·한영 혼용 (IONIQ 5, OBC, SOH, kWh) | 35% | 91 |
| | 별칭·약칭 (코나EV/코나 일렉트릭, 모델3) | 10% | 26 |
| | 한글 화학명·단위 (인산철, 삼원계, 킬로와트) | 화학·단위 언급 질의의 30% | - |
| | 오타·자모 오류 | 4% | 10 |
| 존댓말 | 요청형 종결 (~찾고 있어요, ~있나요, ~구합니다) | 문장형의 70% | 약 64 |

세그먼트별로 형태를 다르게 배분한다. A는 문장형이 많고, C·D는 키워드형이 많고, G는 전부 단문이다.

---

## (d) 스키마가 담지 못하는 제약 (설계상 답할 수 없는 질의)

현재 `Part`, `BatteryHealthInfo`, `SearchFilters` 기준이다(`shared/types/index.ts`). 아래 제약이 들어간 질의는 **부분 일치나 정답 없음을 기대값으로 태깅**할 것을 권한다. 전체의 8~10%가 적당하다 [판단].

| 제약 | 구매자 근거 | 현재 스키마 |
|---|---|---|
| 재사용전지 안전성검사 합격 여부, 성능평가 등급 | 2023-10 검사 의무화 [S8], 2027-05 탈거 전 성능평가 [S1·S2], UL 1974 [S21] | 필드 없음 |
| 배터리 이력, 식별번호, 사고·침수 이력 | 배터리 식별번호 등록제 2025-02 [S10], EU 배터리 여권 SOH 항목 2027-02 [S29] | 없음 (`cycleCount`만 있음) |
| BMS 원시 데이터 제공 여부 | 업계가 BMS 기반 이력관리를 요구 [S6] | 없음 |
| 보증·품질보증 기간 | 보험 연계 중고부품에 품질보증 1년 [S34] | 없음 |
| 품번(OEM P/N), 호환 차종 목록, 대체 품번 | 순정몰은 품번으로 검색 [S31], eBay 호환표 [S30] | 없음 (`model`과 `year` 하나씩만) |
| 위치·좌우·트림, 색상 코드 | 요청 데이터의 기본 단위 [S14] | `name`/`description` 텍스트에만 있음 |
| 손상 정도 (스크래치 등급) | 실측 질의 | `condition` 4값뿐 |
| 셀 폼팩터, 냉각 방식, 모듈 수 | B 세그먼트 조립성 | 없음 |
| 충전 인렛 규격, OBC kW | E 세그먼트 | 구조화 필드 없음 (`power`는 W 단위 범용 필드) |
| 금속 함량 (Ni/Co/Li %), 블랙매스 등급, 자석 중량 | C 세그먼트 [S15·S22] | `materialComposition`이 일부만 커버 |
| 판매자 위치, 운송 조건 (위험물), 직접 수령 | 배터리 운송·보관 기준이 하위법령으로 정해질 예정 [S2] | 없음 |
| 대량 단가, 세금계산서, 견적 | B2B 일반 | `quantity`만 있음 |

---

## (e) 출처

검증 수준: **원문 확인** = 본문을 직접 열람, **요약 기반** = 검색엔진이 여러 페이지를 요약한 결과, **스니펫 기반** = 단일 검색 스니펫. 날짜를 알 수 없으면 "-"로 적었다.

| # | 출처 (발행처) | 날짜 | URL | 검증 |
|---|---|---|---|---|
| S1 | 사용후 배터리법 국무회의 의결 (산업통상부) | 2026-05-21 | https://www.motir.go.kr/kor/article/ATCL3f49a5a8c/171852/view | 원문 확인 |
| S2 | 사용후 배터리 10만개 전망 (비건뉴스) | 2026-08-22 | https://www.vegannews.co.kr/mobile/article.html?no=384861 | 원문 확인 |
| S3 | Retired EV Batteries Find New Jobs in ESS (아시아경제) | 2026-10-04 | https://view.asiae.co.kr/en/article/2026100215402810412 | 원문 확인 |
| S4 | 현대차그룹 UBESS 실증 (스마트투데이) | 2026-09-10 | https://www.smarttoday.co.kr/ko-kr/articles/111455 | 원문 확인 |
| S5 | 돈되는 배터리 어떻게 돌아오나 (머니투데이) | 2024-05-05 | https://www.mt.co.kr/economy/2024/05/05/2024043009265085175 | 원문 확인 |
| S6 | 모듈단위 검사 도입해야 (헤럴드경제) | 2025-12-15 | https://www.heraldk.com/article/2025121518184456247 | 원문 확인 |
| S7 | 거점수거센터 현장 (비즈워치) | 2022-08-09 | https://news.bizwatch.co.kr/article/industry/2022/08/08/0025 | 원문 확인 |
| S8 | 재사용전지 안전성검사기관 지정 (뉴스서울) / KC 10031 통보 (WTO TBT) | 2023-12-21 / 2023 | https://newsseoul.co.kr/news/view/1065585617613826 , https://members.wto.org/crnattachments/2023/TBT/KOR/23_8950_00_x.pdf | 요약 기반 |
| S9 | 사용후 배터리 실증특례 8건 (스마트투데이) | 2021-11-16 | https://www.smarttoday.co.kr/ko-kr/articles/21873 | 원문 확인 |
| S10 | 배터리 안전성 인증제·이력관리제 시행 (뉴스서울) | 2025-02-16 | https://newsseoul.co.kr/news/view/1065600619094224 | 스니펫 기반 |
| S11 | Epart 플랫폼 확장, EV 부품 3,000여 종 (스마트투데이) | 2025-01-21 | https://www.smarttoday.co.kr/ko-kr/articles/70635 | 원문 확인 |
| S12 | 한국소비자원 친환경부품 조사 (경기일보) | 2020-10-21 | https://kyeonggi.com/article/202010211142413 | 원문 확인 |
| S13 | EV Collision Repairs Q3 2025, Mitchell (InsideEVs) | 2025-12-12 | https://insideevs.com/news/781599/ev-collision-repair-costs-q3-2025-usa/ | 원문 확인 |
| S14 | Breakerlink 인기 요청 부품 (Model 3 / Leaf / Niro) | 2026-11-05 열람 | https://www.breakerlink.com/cars/tesla/model-3/ , https://www.breakerlink.com/cars/nissan/leaf/ , https://www.breakerlink.com/cars/kia/niro/ | 원문 확인 (수시로 갱신되는 페이지) |
| S15 | European LFP recycling economic barriers (Fastmarkets) | 2024-09-26 | https://www.fastmarkets.com/insights/european-lfp-recycling-vital-for-future-but-facing-economic-barriers-lme-week/ | 원문 확인 |
| S16 | What's the Value of an Old Battery Pack? (Battery Design) | 2026 (정확한 날짜 불명) | https://www.batterydesign.net/whats-the-value-of-an-old-battery-pack/ | 원문 확인 |
| S17 | Battery pack prices fall to $108/kWh (BloombergNEF) | 2025-12-09 | https://about.bnef.com/insights/clean-transport/lithium-ion-battery-pack-prices-fall-to-108-per-kilowatt-hour-despite-rising-metal-prices-bloombergnef/ | 요약 기반 |
| S18 | Second-life EV batteries (McKinsey, 2019년 전망) | 2019-04 | https://www.mckinsey.com/industries/electric-power-and-natural-gas/our-insights/second-life-ev-batteries-the-newest-value-pool-in-energy-storage | 요약 기반 |
| S19 | Challenges and Opportunities for Second-life Batteries (arXiv 2308.06786) | 2023 | https://arxiv.org/pdf/2308.06786 | 스니펫 기반 |
| S20 | Hassini 외, 재사용 대상(지게차 등) (MDPI Batteries) | 2024 | https://www.mdpi.com/2313-0105/10/5/153/html | 스니펫 기반 |
| S21 | UL 1974 (UL Solutions) | - | https://www.ul.com/resources/ul-1974-creating-safe-second-life-electric-vehicle-batteries | 요약 기반 |
| S22 | EV 모터 NdFeB 2~5kg (MDPI Processes) | 2025 | https://mdpi.com/2227-9717/13/6/1729 | 스니펫 기반 |
| S23 | 희토류 회수 미산업화 (FAU) | 2024 | https://cris.fau.de/publications/325583910 | 스니펫 기반 |
| S24 | 단조 알루미늄 스크랩 등급 Vesper (Recycling Today) | 2025 | https://www.recyclingtoday.com/news/rema-2025-recycled-aluminum-scrap-grade-made-from-twitch-debuts | 스니펫 기반 |
| S25 | ICCU 리콜 14.5만 대 (Automotive Dive) | 2024 | https://automotivedive.com/news/hyundai-recalls-ioniq5-genesis-models-145k-iccu-intergrated-charging-control-unit-nhtsa-evs/733963 | 스니펫 기반 |
| S26 | ICCU 리콜 후 재발 (보배드림 뉴스) | - | https://m.bobaedream.co.kr/board/bbs_view/cnews/2426/2/44 | 스니펫 기반 |
| S27 | 금감원, EV 수리비 30.2% 높음 (세계일보) | 2022-06-07 | https://www.segye.com/newsView/20220607518416 | 스니펫 기반 |
| S28 | Solera, EV 수리비 29% 높음, 코나 EV 비교 (BusinessWire 보도자료 / Counterman) | 2023-11-15 | https://businesswire.com/news/home/20231115820568/en/Groundbreaking-Global-EV-Repair-Cost-Research-Unveils-29-Higher-Overall-EV-vs.-ICE-Repair-Costs-in-Side-by-side-Model-Comparison , https://www.counterman.com/study-ev-repairs-costs-are-29-higher-than-ice/ | 요약 기반 |
| S29 | EU 배터리 여권 2027-02 (Automotive IQ) | - | https://www.automotive-iq.com/electrics-electronics/articles/eu-battery-passport-explained-requirements-timeline-and-compliance-steps-to-2027 | 스니펫 기반 |
| S30 | eBay Parts Compatibility FAQ | - | https://pages.motors.ebay.com/compatibility_faq | 스니펫 기반 |
| S31 | 현대모비스 부품몰 현기스토어 앱 소개 (App Store) | - | https://apps.apple.com/kr/app/%ED%98%84%EB%8C%80%EB%AA%A8%EB%B9%84%EC%8A%A4%EB%B6%80%ED%92%88%EB%AA%B0-%ED%98%84%EA%B8%B0%EC%8A%A4%ED%86%A0%EC%96%B4/id6465131484 | 스니펫 기반 |
| S32 | Leaf 기반 컨버전 키트 (EVShop), Tesla 유닛 스왑 (InsideEVs) | - | https://evshop.eu/en/conversion-kits/288-conversion-kit-based-on-leaf-motor-controller.html , https://insideevs.com/news/587822/electric-classic-cars-tesla-land-rover-defender/ | 스니펫 기반 |
| S33 | 영남이공대 미래차 전환교육 (대학뉴스) | 2023 | https://dhnews.co.kr/news/view/1065575154898667 | 스니펫 기반 |
| S34 | 현대해상 중고부품 할인 (시사경제) | 2026-08 | https://www.sateconomy.co.kr/news/view/179589447115436 | 스니펫 기반 |
| S35 | 캠핑카 매물의 "인산철 Ah" 표기 (보배드림) | - | https://m.bobaedream.co.kr/mycar/mlist/K/11 | 스니펫 기반 |
| S36 | Shopping Queries Dataset (Reddy 외, arXiv 2206.06588) 및 원본 데이터 | 2022 | https://arxiv.org/abs/2206.06588 , https://github.com/amazon-science/esci-data | 원문 확인 + 직접 계산 |
| S37 | Is Query Length a Reliable Predictor of Search Volume? (DEJAN) | 2026-03-12 | https://dejan.ai/blog/query-length-vs-volume/ | 원문 확인 |
| S38 | SLI Systems 질의 길이 연구 (Website Magazine) | 2017 | https://www.websitemagazine.com/ecommerce/online-shoppers-average-search-length-on-retail-websites | 요약 기반 |
| S39 | KuaiSearch (arXiv 2602.11518) | 2026-02 (v4 2026-10) | https://arxiv.org/abs/2602.11518 | 원문 확인 |
| S40 | Papenmeier 외, "A Modern Up-To-Date Laptop" (DIS 2020) | 2020 | https://arxiv.org/abs/2008.02114 | 원문 확인 |
| S41 | '검색보다 대화', 네이버 AI 쇼핑 에이전트 정식 출시 (바이라인네트워크) | 2026-07-01 | https://byline.network/2026/07/0701-2/ | 원문 확인 |
| S42 | Google AI Mode 출시 (TechCrunch) 및 1주년 보도 | 2025-03-05 / 2026 | https://techcrunch.com/2025/03/05/google-searchs-new-ai-mode-lets-users-ask-complex-multi-part-questions/ | 스니펫 기반 |

**주요 한계**
1. 국내 EV 부품 거래 로그와 한국어 쇼핑 질의 길이·오타 비율에 대한 공개 통계는 찾지 못했다. 표면 변이 비율은 모두 [판단]이다.
2. ESCI는 어려운 질의 위주로 표집됐고 4자리 숫자가 제거된 것으로 보인다. 숫자 포함 비율은 하한값으로만 써야 한다.
3. 해외 부품 요청 데이터(S14)는 영국 B2C 중개 사이트 자료라서 국내 B2B 수요와 다를 수 있다.
4. 사용후 배터리법(2027-05-27 시행)의 하위법령이 아직 확정되지 않았다 [S2]. 성능평가 등급 체계가 정해지면 A·C 세그먼트 질의 어휘가 바뀔 수 있다.

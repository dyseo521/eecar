# 새로운 기능 테스트 가이드

이 문서는 EECAR 개선 프로젝트의 HIGH Priority 기능들을 로컬에서 테스트하는 방법을 설명합니다.

## 구현된 기능 (HIGH Priority)

1. **차체 카테고리 세분화** - `body-chassis-frame`, `body-panel`, `body-door`, `body-window`
2. **재질 물성 기반 검색** - 알루미늄 합금 번호, 인장강도, 재활용성 등으로 검색
3. **배터리 SOH 평가 시스템** - SOH%, 양극재 타입, 재사용 권장사항 기반 검색

---

## 로컬 서버 시작

```bash
# 루트 디렉토리에서
cd backend/local-server
npm install
node index.js
```

서버가 시작되면 다음과 같은 출력이 표시됩니다:

```
[INIT] Loaded 7 dummy parts
  - Batteries: 3
  - Body parts: 4

🚀 EECAR Local Server running on http://localhost:3001
📊 Health check: http://localhost:3001/health
📦 Parts loaded: 7

Available endpoints:
  POST /api/auth/signup
  POST /api/auth/login
  POST /api/search
  POST /api/material-search (NEW)
  POST /api/battery-assessment (NEW)
  GET  /api/parts
  POST /api/parts
  GET  /api/parts/:id
```

---

## 테스트 시나리오

### 1. Health Check

```bash
curl http://localhost:3001/health
```

**예상 결과:**
```json
{
  "status": "ok",
  "service": "EECAR Local API",
  "timestamp": "2025-11-26T12:00:00.000Z",
  "partsCount": 7
}
```

---

### 2. 배터리 SOH 평가 시스템 테스트

#### 2.1 SOH 70% ~ 95% 범위의 배터리 검색

```bash
curl -X POST http://localhost:3001/api/battery-assessment \
  -H "Content-Type: application/json" \
  -d '{
    "batteryFilters": {
      "soh": { "min": 70, "max": 95 }
    },
    "topK": 5
  }'
```

**예상 결과:** SOH 92%, 88%, 75%인 3개의 배터리가 점수 순으로 반환됩니다.

#### 2.2 양극재 타입으로 필터링

```bash
curl -X POST http://localhost:3001/api/battery-assessment \
  -H "Content-Type: application/json" \
  -d '{
    "batteryFilters": {
      "cathodeType": ["NCM Ni 80%"]
    },
    "topK": 5
  }'
```

**예상 결과:** NCM Ni 80% 양극재를 사용하는 배터리만 반환됩니다.

#### 2.3 재사용 권장 배터리만 검색

```bash
curl -X POST http://localhost:3001/api/battery-assessment \
  -H "Content-Type: application/json" \
  -d '{
    "batteryFilters": {
      "recommendedUse": ["reuse"]
    },
    "topK": 5
  }'
```

**예상 결과:** `recommendedUse: "reuse"`인 배터리만 반환됩니다.

---

### 3. 재질 물성 기반 검색 테스트

#### 3.1 알루미늄 6061 합금 검색

```bash
curl -X POST http://localhost:3001/api/material-search \
  -H "Content-Type: application/json" \
  -d '{
    "materialFilters": {
      "alloyNumber": "6061"
    },
    "topK": 5
  }'
```

**예상 결과:** 알루미늄 6061 합금 후드 패널이 반환됩니다.

#### 3.2 인장강도 300 MPa 이상인 재질 검색

```bash
curl -X POST http://localhost:3001/api/material-search \
  -H "Content-Type: application/json" \
  -d '{
    "materialFilters": {
      "tensileStrengthMPa": { "min": 300 }
    },
    "topK": 5
  }'
```

**예상 결과:** 인장강도가 300 MPa 이상인 부품들이 반환됩니다 (6061 후드, 7075 루프, CFRP 프레임 등).

#### 3.3 재활용성 90% 이상 + 알루미늄 카테고리

```bash
curl -X POST http://localhost:3001/api/material-search \
  -H "Content-Type: application/json" \
  -d '{
    "materialFilters": {
      "recyclability": { "min": 90 }
    },
    "category": "body-panel",
    "topK": 5
  }'
```

**예상 결과:** `body-panel` 카테고리에서 재활용성 90% 이상인 부품들이 반환됩니다.

---

### 4. 세분화된 차체 카테고리 검색

#### 4.1 섀시/프레임 부품 조회

```bash
curl "http://localhost:3001/api/parts?category=body-chassis-frame"
```

**예상 결과:** BMW i3 CFRP 카본 프레임이 반환됩니다.

#### 4.2 도어 부품 조회

```bash
curl "http://localhost:3001/api/parts?category=body-door"
```

**예상 결과:** 아우디 e-tron 알루미늄 도어가 반환됩니다.

#### 4.3 패널 부품 조회

```bash
curl "http://localhost:3001/api/parts?category=body-panel"
```

**예상 결과:** 테슬라 Model S 후드, 포르쉐 Taycan 루프가 반환됩니다.

---

## 더미 데이터 상세

### 배터리 부품 (3개)

| ID | 이름 | SOH | 양극재 | 권장용도 | 활용가능 |
|----|------|-----|--------|----------|----------|
| battery-001 | 현대 아이오닉5 | 92% | NCM Ni 80% | 재사용 | EV 재사용, ESS, 전동킥보드 |
| battery-002 | 테슬라 Model 3 | 75% | NCA | 재사용 | ESS, 전동킥보드, 소형 전동기기 |
| battery-003 | 기아 EV6 | 88% | NCM Ni 80% | 재사용 | EV 재사용, ESS |

### 차체 부품 (4개)

| ID | 이름 | 카테고리 | 재질 | 합금번호 | 인장강도 | 재활용성 |
|----|------|----------|------|----------|----------|----------|
| body-chassis-001 | BMW i3 카본 프레임 | body-chassis-frame | CFRP | - | 3500 MPa | 40% |
| body-panel-001 | 테슬라 Model S 후드 | body-panel | Al 6061 | 6061 | 310 MPa | 95% |
| body-door-001 | 아우디 e-tron 도어 | body-door | Al 5754 | 5754 | 220 MPa | 93% |
| body-panel-002 | 포르쉐 Taycan 루프 | body-panel | Al 7075 | 7075 | 572 MPa | 90% |

---

## TypeScript 타입 변경사항

### 새로운 타입

```typescript
// shared/types/index.ts

// 세분화된 차체 카테고리
export type PartCategory =
  | 'battery'
  | 'motor'
  | 'inverter'
  | 'charger'
  | 'electronics'
  | 'body-chassis-frame'    // NEW: 샤시 및 프레임
  | 'body-panel'            // NEW: 외판, 패널
  | 'body-door'             // NEW: 도어 및 주변 연결부
  | 'body-window'           // NEW: 창 및 유리 구조
  | 'interior'
  | 'other';

// 배터리 건강 정보
export interface BatteryHealthInfo {
  soh: number;                          // State of Health (%)
  soc?: number;                         // State of Charge (%)
  cycleCount?: number;
  estimatedMileageKm?: number;          // 예상 주행거리
  cathodeType: CathodeType;
  manufacturer: string;
  model: string;
  year: number;
  recommendedUse: 'reuse' | 'recycle' | 'dispose';
  suitableApplications?: string[];      // ["ESS", "전동킥보드", etc.]
  degradationRate?: number;             // % per year
  recyclingMethod?: RecyclingMethod[];
  vendorRecommendations?: string[];     // 추천 재활용 업체
}

// 고급 재질 필터
export interface AdvancedMaterialFilters {
  tensileStrengthMPa?: { min?: number; max?: number };
  yieldStrengthMPa?: { min?: number; max?: number };
  elasticModulusGPa?: { min?: number; max?: number };
  elongationPercent?: { min?: number; max?: number };
  purity?: { min?: number };
  alloyNumber?: string;
  composition?: Array<{
    element: string;
    percentage?: { min?: number; max?: number };
  }>;
  recyclability?: { min?: number };
}

// 배터리 필터
export interface BatteryFilters {
  soh?: { min?: number; max?: number };
  cathodeType?: CathodeType[];
  recommendedUse?: Array<'reuse' | 'recycle' | 'dispose'>;
  suitableApplications?: string[];
  estimatedMileageKm?: { min?: number; max?: number };
}
```

---

## Lambda 함수 구현

새로운 Lambda 함수들이 `backend/src/functions/`에 구현되었습니다:

- **material-property-search/index.ts** - 재질 물성 기반 검색
- **battery-health-assessment/index.ts** - 배터리 SOH 평가

이 함수들은 AWS에 배포될 준비가 완료되었으며, 로컬 서버에서는 동일한 로직이 `/api/material-search`와 `/api/battery-assessment` 엔드포인트로 구현되어 있습니다.

---

## 다음 단계

1. ✅ **HIGH Priority 기능 구현 완료**
   - 차체 카테고리 세분화
   - 재질 물성 기반 검색
   - 배터리 SOH 평가 시스템

2. 🔄 **MEDIUM Priority (진행 예정)**
   - 알루미늄 합금 성분 DB 확장
   - 재활용 업체 매칭 시스템
   - 고분자 재질 사양 확장

3. 📋 **Frontend UI 구현 필요**
   - 배터리 SOH 필터 UI
   - 재질 물성 검색 UI
   - 세분화된 카테고리 선택 UI

---

## 문제 해결

### 포트가 이미 사용 중인 경우

```bash
# 포트 3001을 사용하는 프로세스 확인
lsof -ti:3001

# 프로세스 종료
kill $(lsof -ti:3001)
```

### Shared 타입 변경 후 빌드

Shared types를 변경한 경우, 반드시 빌드해야 합니다:

```bash
cd shared
npm run build
```

---

## 참고 문서

- [CLAUDE.md](/CLAUDE.md) - 전체 프로젝트 개요
- [EECAR 개선방향 종합분석](/ref/EECAR_개선방향_종합분석_v1.0.md) - 상세 분석 문서
- [LOCAL_DEVELOPMENT.md](/docs/LOCAL_DEVELOPMENT.md) - 로컬 개발 가이드

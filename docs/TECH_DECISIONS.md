# EECAR 기술 선택 기록

> EECAR 프로젝트의 주요 기술 결정과 그 배경을 정리한 문서입니다.
> 상태 관리, 데이터 검증, RAG 평가 시스템, DevOps 에이전트 아키텍처를 다룹니다.

---

## 1. React Query (TanStack Query)

### 왜 React Query인가?

EECAR는 **서버 상태(Server State)가 앱의 핵심**인 B2B 플랫폼이다. 부품 목록, 검색 결과, 제안서 등 거의 모든 데이터가 API에서 온다. 이런 구조에서 `useState` + `useEffect`로 서버 상태를 관리하면 다음 문제가 발생한다:

- 로딩/에러/성공 상태를 매번 수동 관리
- 동일 데이터를 여러 컴포넌트에서 중복 호출
- 캐시 없이 페이지 전환마다 재요청
- 무한 스크롤 같은 복잡한 페이지네이션 직접 구현

React Query는 이 문제들을 **선언적으로** 해결한다.

### 활용 패턴

#### 1.1 QueryClient 전역 설정

```typescript
// frontend/src/main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,  // 탭 전환 시 불필요한 재호출 방지
      retry: 1,                     // 1회만 재시도 (과도한 재시도 방지)
      staleTime: 5 * 60 * 1000,    // 5분간 캐시 유지
    },
  },
});
```

**결정 배경**: B2B 플랫폼 특성상 데이터가 초 단위로 변하지 않는다. 5분 staleTime으로 API 호출을 줄이면서도 합리적인 신선도를 유지했다.

#### 1.2 멀티 모드 검색 (AI / 배터리 / 소재)

```typescript
// frontend/src/hooks/usePartsSearch.ts
// 3개의 검색 모드가 각각 독립된 useQuery를 가짐
const aiSearch = useQuery({
  queryKey: ['search', searchParams],
  queryFn: () => fetch(getApiUrl('search'), { ... }),
  enabled: !!searchParams && searchMode === 'ai',
});

const batterySearch = useQuery({
  queryKey: ['battery-assessment', batterySohMin, batterySohMax, selectedCathodeTypes],
  queryFn: () => fetch(getApiUrl('battery-assessment'), { ... }),
  enabled: searchMode === 'battery' && (!!batterySohMin || !!batterySohMax),
});

const materialSearch = useQuery({
  queryKey: ['material-search', alloyNumber, tensileStrengthMin, ...],
  queryFn: () => fetch(getApiUrl('material-search'), { ... }),
  enabled: searchMode === 'material' && (!!alloyNumber || !!tensileStrengthMin),
});
```

**해결한 문제**: 3가지 검색 모드 간 전환 시 각 모드의 결과가 독립적으로 캐시된다. AI 검색 후 소재 검색으로 전환했다가 다시 AI 검색으로 돌아오면, 캐시된 결과가 즉시 표시된다.

#### 1.3 무한 스크롤

```typescript
// frontend/src/hooks/useInfiniteParts.ts
const {
  data, fetchNextPage, hasNextPage, isFetchingNextPage
} = useInfiniteQuery({
  queryKey: ['parts', selectedCategory],
  queryFn: async ({ pageParam }) => {
    try {
      const response = await fetch(getApiUrl(`parts?category=${selectedCategory}&cursor=${pageParam}`));
      return response.json();
    } catch {
      // API 실패 시 mock 데이터로 폴백
      return { parts: mockParts, count: mockParts.length, nextCursor: null };
    }
  },
  getNextPageParam: (lastPage) => lastPage.nextCursor,
  initialPageParam: undefined,
});
```

**해결한 문제**:
- 커서 기반 페이지네이션 상태를 React Query가 관리
- Intersection Observer와 연동하여 자동 다음 페이지 로드
- API 실패 시 mock 데이터 폴백으로 정적 호스팅에서도 동작

#### 1.4 Mutation + 캐시 무효화

```typescript
// frontend/src/pages/SellerDashboard.tsx
const queryClient = useQueryClient();

const registerPartMutation = useMutation({
  mutationFn: async (partData) => {
    const response = await fetch(getApiUrl('parts'), {
      method: 'POST',
      body: JSON.stringify(partData),
    });
    return response.json();
  },
  onSuccess: () => {
    // 부품 등록 성공 시 → 부품 목록 캐시 무효화 → 구매자 페이지 자동 갱신
    queryClient.invalidateQueries({ queryKey: ['parts'] });
  },
});
```

**해결한 문제**: 판매자가 부품을 등록하면, 구매자 페이지의 부품 목록이 자동으로 갱신된다. 수동으로 refetch 로직을 작성할 필요가 없다.

#### 1.5 Query Key 설계

| Query Key | 용도 |
|-----------|------|
| `['search', searchParams]` | AI RAG 검색 결과 |
| `['battery-assessment', ...filters]` | 배터리 SOH 기반 검색 |
| `['material-search', ...filters]` | 소재 물성 기반 검색 |
| `['parts', category]` | 카테고리별 부품 목록 (무한 스크롤) |
| `['part', id]` | 개별 부품 상세 |

파라미터가 Query Key에 포함되어 있어, 필터 변경 시 자동으로 새 데이터를 가져온다.

---

## 2. Zod

### 왜 Zod인가?

EECAR는 **모노레포 구조**(frontend + backend + shared)에서 TypeScript 타입과 런타임 검증, API 문서를 동시에 관리해야 한다. 기존에는 `shared/types/index.ts`에 TypeScript 인터페이스를 수동으로 관리했는데, 다음 문제가 있었다:

- TypeScript 타입은 컴파일 타임에만 존재하고, 런타임에서는 사라짐
- API 요청 body의 실제 값이 타입과 일치하는지 보장할 수 없음
- OpenAPI 문서를 별도로 관리하면 코드와 문서가 어긋남
- 같은 구조를 타입/스키마/문서에서 3번 중복 정의

Zod는 **하나의 스키마 정의로 3가지를 동시에 해결**한다.

### 활용 패턴

#### 2.1 스키마 → 타입 → OpenAPI (단일 소스)

```typescript
// shared/schemas/index.ts

// 1. Zod 스키마 정의 (런타임 검증 + OpenAPI 메타데이터)
export const PartSchema = z.object({
  partId: z.string().openapi({ example: 'battery-001' }),
  name: z.string().min(1).openapi({ example: 'Tesla Model 3 Battery Pack' }),
  category: PartCategorySchema,
  price: z.number().positive().openapi({ example: 4500000 }),
  year: z.number().int().min(2010).max(2030),
  specifications: PartSpecificationsSchema.optional(),
  batteryHealth: BatteryHealthInfoSchema.optional(),
  // ...
}).openapi('Part');

// 2. 타입 자동 추론 (z.infer)
export type Part = z.infer<typeof PartSchema>;
// → TypeScript 타입이 스키마에서 자동 생성됨

// 3. OpenAPI 자동 생성 (scripts/generate-openapi.ts)
// → docs/openapi.yaml이 스키마에서 자동 생성됨
```

**해결한 문제**: 하나의 스키마를 수정하면 타입과 API 문서가 동시에 업데이트된다.

#### 2.2 enum 검증

```typescript
// shared/schemas/index.ts
export const PartCategorySchema = z.enum([
  'battery', 'motor', 'inverter', 'charger', 'electronics',
  'body-chassis-frame', 'body-panel', 'body-door', 'body-window',
  'interior', 'other'
]).openapi({ description: '부품 카테고리' });

export const CathodeTypeSchema = z.enum([
  'NCM Ni 33%', 'NCM Ni 60%', 'NCM Ni 80%', 'NCA', 'LMO', 'LFP', 'Other'
]);
```

**해결한 문제**: 프론트엔드 드롭다운, 백엔드 검증, API 문서가 모두 같은 enum 값을 참조한다. 새 카테고리 추가 시 한 곳만 수정하면 된다.

#### 2.3 범위 제약 조건

```typescript
export const BatteryHealthInfoSchema = z.object({
  soh: z.number().min(0).max(100),           // 0~100% 강제
  year: z.number().int().min(2010).max(2030), // 합리적 연도 범위
  recyclability: z.number().min(0).max(100),  // 재활용률 퍼센트
  recommendedUse: z.enum(['reuse', 'recycle', 'dispose']),
});
```

**해결한 문제**: SOH가 -10%이거나 200%인 데이터가 시스템에 들어오는 것을 방지한다.

#### 2.4 스키마 조합과 재사용

```typescript
// 기존 Part 스키마에서 등록용 스키마 파생
export const PartRegistrationRequestSchema = PartSchema.omit({
  partId: true,    // 서버에서 생성
  createdAt: true, // 서버에서 생성
  updatedAt: true, // 서버에서 생성
});

// 범위 필터 재사용
export const RangeFilterSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export const BatteryFiltersSchema = z.object({
  soh: RangeFilterSchema.optional(),
  cathodeType: z.array(CathodeTypeSchema).optional(),
});

export const AdvancedMaterialFiltersSchema = z.object({
  tensileStrengthMPa: RangeFilterSchema.optional(),
  yieldStrengthMPa: RangeFilterSchema.optional(),
  recyclability: z.object({ min: z.number().optional() }).optional(),
});
```

**해결한 문제**: `RangeFilterSchema` 같은 공통 패턴을 한 번 정의하고 여러 필터에서 재사용한다.

#### 2.5 OpenAPI 자동 생성

```typescript
// scripts/generate-openapi.ts
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

const registry = new OpenAPIRegistry();
registry.register('Part', PartSchema);
registry.register('SearchRequest', SearchRequestSchema);

registry.registerPath({
  method: 'post',
  path: '/api/search',
  request: { body: { content: { 'application/json': { schema: SearchRequestSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: SearchResponseSchema } } },
  },
});
// → docs/openapi.yaml 자동 생성
```

**해결한 문제**: API 문서가 코드와 항상 동기화된다. Swagger UI에서 실시간 확인 가능.

#### 2.6 외부 API 대응 (.passthrough())

```typescript
export const SlackEventRequestSchema = z.object({
  type: z.string(),
  challenge: z.string().optional(),
  event: z.object({
    type: z.string(),
    user: z.string().optional(),
    text: z.string().optional(),
    channel: z.string().optional(),
  }).optional(),
}).passthrough(); // Slack이 보내는 추가 필드 허용
```

**해결한 문제**: Slack API는 문서에 없는 필드를 추가로 보내는 경우가 있다. `.passthrough()`로 알려진 필드만 검증하고 나머지는 통과시킨다.

#### 2.7 현재 한계: 백엔드 런타임 검증 미적용

```typescript
// backend/src/functions/part-registration/index.ts
// 현재: 수동 검증
if (!name || !category || !manufacturer || !price) {
  return errorResponse('Missing required fields', undefined, 400, event);
}

// 이상적: Zod 스키마 검증
// const result = PartRegistrationRequestSchema.safeParse(body);
// if (!result.success) return errorResponse(result.error.message, ...);
```

Lambda 함수에서 Zod 런타임 검증을 아직 적용하지 않았다. 현재는 `z.infer`로 타입만 활용하고, 검증은 수동으로 하고 있다. Lambda cold start 시간에 미치는 영향이 미미하므로, 향후 `schema.safeParse()`를 도입하면 검증 로직을 대폭 단순화할 수 있다.

---

## 3. Zustand: 설치했지만 사용하지 않은 이유

### 현황

`frontend/package.json`에 `"zustand": "^4.5.0"`이 설치되어 있지만, **소스 코드 어디에서도 import하지 않는다**. `create`, `useStore` 등 Zustand API 호출이 전혀 없다.

### 안 쓴 이유: 클라이언트 상태가 거의 없다

EECAR의 상태를 분류하면:

| 상태 종류 | 관리 방식 | 예시 |
|-----------|-----------|------|
| **서버 상태** | React Query | 부품 목록, 검색 결과, 제안서 |
| **인증 상태** | React Context (AuthContext) | 로그인 유저, 토큰 |
| **UI 상태** | useState (컴포넌트 로컬) | 모달 열림/닫힘, 폼 입력값 |

전역으로 관리할 **클라이언트 상태**가 사실상 인증 하나뿐이다. 이를 위해 Zustand 스토어를 만드는 것은 과잉이다.

### 왜 React Context로 충분했는가

```typescript
// frontend/src/context/AuthContext.tsx
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // useMemo로 불필요한 리렌더링 방지
  const value = useMemo(() => ({
    user, token, login, signup, logout,
    isAuthenticated: !!user,
    isLoading,
  }), [user, token, login, signup, logout, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- 인증 상태는 **변경 빈도가 극히 낮다** (로그인/로그아웃 시에만)
- Context의 단점인 "리렌더링 문제"가 `useMemo`로 충분히 해결됨
- `useAuth()` 훅으로 소비 측 인터페이스도 깔끔함

### Zustand가 필요했을 상황 (현재는 해당 없음)

- 실시간 알림 카운트 등 **자주 변하는 전역 UI 상태**가 생기는 경우
- 여러 컴포넌트가 독립적으로 **같은 상태의 다른 조각**을 구독해야 하는 경우
- Context의 리렌더링이 성능 병목이 되는 경우

---

## 4. 기술 선택 요약

```
┌─────────────────────────────────────────────────────────────┐
│                    EECAR 상태 관리 전략                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  서버 상태 (95%)              클라이언트 상태 (5%)            │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │   React Query    │        │  React Context   │          │
│  │                  │        │  (AuthContext)    │          │
│  │  - 부품 목록      │        │                  │          │
│  │  - AI 검색 결과   │        │  - 로그인 유저    │          │
│  │  - 배터리 검색    │        │  - 인증 토큰      │          │
│  │  - 소재 검색      │        │                  │          │
│  │  - 무한 스크롤    │        │                  │          │
│  │  - 부품 등록      │        │  UI 상태          │          │
│  │  - 제안서 전송    │        │  ┌──────────────┐│          │
│  └──────────────────┘        │  │  useState    ││          │
│                              │  │ (컴포넌트별)  ││          │
│  데이터 검증                  │  └──────────────┘│          │
│  ┌──────────────────┐        └──────────────────┘          │
│  │      Zod         │                                       │
│  │                  │        사용하지 않음                    │
│  │  - 스키마 정의    │        ┌──────────────────┐          │
│  │  - 타입 추론      │        │    Zustand       │          │
│  │  - OpenAPI 생성   │        │  (설치만 됨)     │          │
│  └──────────────────┘        └──────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

| 기술 | 역할 | 선택 이유 |
|------|------|-----------|
| **React Query** | 서버 상태 관리 | 캐싱, 자동 갱신, 무한 스크롤, 로딩/에러 상태 선언적 처리 |
| **Zod** | 스키마 정의 + 타입 추론 + OpenAPI | 하나의 정의로 타입/검증/문서 3가지 동시 해결 |
| **React Context** | 인증 상태 | 변경 빈도 낮은 전역 상태에 적합, 추가 라이브러리 불필요 |
| **useState** | UI 로컬 상태 | 모달, 폼 등 컴포넌트 내부 상태 |
| ~~Zustand~~ | 미사용 | 전역 클라이언트 상태가 거의 없어 필요성 부재 |

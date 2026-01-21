---
name: sync-api-docs
description: |
  백엔드 API 변경 시 OpenAPI 문서를 자동으로 갱신합니다.
  다음 상황에서 사용:
  - Lambda 함수 추가/수정 시
  - Zod 스키마 변경 시
  - API 엔드포인트 변경 시
  - "API 문서 갱신", "OpenAPI 동기화" 요청 시
---

# OpenAPI 문서 동기화

백엔드 API 변경 사항을 OpenAPI 3.0 명세에 반영합니다.

## 프로젝트 구조

```
shared/schemas/index.ts      # Zod 스키마 정의 (source of truth)
scripts/generate-openapi.ts  # Path 등록 + OpenAPI 생성
docs/openapi.yaml            # 생성된 문서 (직접 수정 금지)
```

## 작업 순서

### 1. 변경 사항 분석

먼저 다음 파일들의 변경 사항을 확인합니다:
- `backend/src/functions/` - 새로운/변경된 Lambda 함수
- `shared/schemas/index.ts` - Zod 스키마 변경
- `infrastructure/template.yaml` - API Gateway 경로

### 2. 스키마 업데이트 (새 엔드포인트인 경우)

`shared/schemas/index.ts`에 새 스키마를 추가합니다:

```typescript
// Request 스키마
export const NewFeatureRequestSchema = z.object({
  field1: z.string().openapi({ description: '필드 설명', example: '예시' }),
  field2: z.number().optional()
}).openapi('NewFeatureRequest');

// Response 스키마
export const NewFeatureResponseSchema = z.object({
  result: z.string(),
  success: z.boolean()
}).openapi('NewFeatureResponse');

// Type export
export type NewFeatureRequest = z.infer<typeof NewFeatureRequestSchema>;
```

### 3. Path 등록 (새 엔드포인트인 경우)

`scripts/generate-openapi.ts`에 path를 등록합니다:

```typescript
// Import 추가
import {
  NewFeatureRequestSchema,
  NewFeatureResponseSchema,
  // ... 기존 imports
} from '../shared/schemas/index.js';

// Path 등록
registry.registerPath({
  method: 'post',  // get, post, put, delete
  path: '/api/new-feature',
  tags: ['NewFeature'],  // tags 배열에도 추가 필요
  summary: '새 기능 요약',
  description: `상세 설명
- 기능 1
- 기능 2`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: NewFeatureRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '성공',
      content: {
        'application/json': {
          schema: NewFeatureResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// tags 배열에 추가 (generateDocument 내부)
tags: [
  // ... 기존 tags
  { name: 'NewFeature', description: '새 기능 API' },
]
```

### 4. OpenAPI 생성

```bash
cd shared && npm run build && cd .. && npx ts-node scripts/generate-openapi.ts
```

### 5. 검증

생성된 `docs/openapi.yaml`을 확인합니다:
- 새 path가 추가되었는지
- 스키마가 components/schemas에 등록되었는지
- 타입 정보가 올바른지

## 주의사항

1. **스키마는 항상 `shared/schemas/index.ts`에만 정의**
   - `generate-openapi.ts`에서 inline 스키마 정의 금지

2. **`.openapi()` 메타데이터 필수**
   - description, example 포함 권장
   - 스키마 이름은 PascalCase

3. **`docs/openapi.yaml` 직접 수정 금지**
   - 항상 스크립트로 생성

4. **Query 파라미터는 `request.query`로**
   ```typescript
   request: {
     query: SomeSchema.pick({ field1: true, field2: true })
   }
   ```

5. **Path 파라미터는 `request.params`로**
   ```typescript
   request: {
     params: z.object({ id: z.string() })
   }
   ```

## 현재 엔드포인트 확인 방법

새 엔드포인트 추가 전에 기존 등록된 API를 확인하려면:

```bash
# scripts/generate-openapi.ts에서 등록된 path 확인
grep -E "path: '/api" scripts/generate-openapi.ts
```

또는 생성된 문서에서 확인:

```bash
# docs/openapi.yaml에서 paths 섹션 확인
grep -E "^  /api" docs/openapi.yaml
```

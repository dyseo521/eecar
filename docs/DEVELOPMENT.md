# 개발 가이드

## 새 Lambda 함수 추가

### 1. 함수 디렉토리 생성

```bash
mkdir -p backend/src/functions/my-function
```

### 2. Lambda 핸들러 작성

`backend/src/functions/my-function/index.ts`:

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // 비즈니스 로직
    return successResponse({ message: 'Success' });
  } catch (error) {
    console.error('Error:', error);
    return errorResponse('Internal server error', 500);
  }
};
```

### 3. SAM 템플릿에 함수 정의 추가

`infrastructure/template.yaml`:

```yaml
MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: ../backend/dist/functions/my-function/
    Handler: index.handler
    Runtime: nodejs20.x
    MemorySize: 512
    Timeout: 30
    Layers:
      - !Ref EECARUtilsLayer
    Environment:
      Variables:
        PARTS_TABLE_NAME: !Ref PartsTable
    Events:
      Api:
        Type: Api
        Properties:
          RestApiId: !Ref EECARApi
          Path: /api/my-endpoint
          Method: POST
```

### 4. 빌드 및 배포

```bash
cd backend && npm run build
cd ../infrastructure
sam build
sam deploy
```

## 공유 타입 수정

공유 타입은 프론트엔드와 백엔드가 공유하는 TypeScript 타입 정의입니다.

**타입 파일 위치**: `shared/types/index.ts`

**타입 수정 시**:

```bash
# 1. shared/types/index.ts 수정
vim shared/types/index.ts

# 2. 타입 빌드 (dist/ 폴더에 컴파일)
cd shared
npm run build

# 3. 프론트엔드/백엔드 재시작 (자동 반영)
```

프론트엔드와 백엔드는 `package.json`에서 `"shared": "workspace:*"`로 참조하므로 자동으로 반영됩니다.

## 코드 스타일 가이드

### 언어 및 도구

- **언어**: TypeScript (strict mode)
- **린팅**: ESLint
- **포매팅**: Prettier (설정 파일 추가 권장)

### 커밋 메시지 규칙

Conventional Commits 형식을 따릅니다:

| 타입 | 설명 |
|------|------|
| `feat:` | 새 기능 추가 |
| `fix:` | 버그 수정 |
| `docs:` | 문서 변경 |
| `refactor:` | 코드 리팩토링 |
| `test:` | 테스트 추가/수정 |
| `chore:` | 빌드/설정 변경 |

**예시**:
```
feat: 배터리 SOH 평가 API 추가
fix: DynamoDB 스캔 한도 문제 해결
docs: README CI/CD 섹션 업데이트
```

## 테스트

### 백엔드 테스트 (Jest)

```bash
cd backend
npm test              # 모든 테스트 실행
npm run test:watch    # Watch 모드
npm run test:coverage # 커버리지 리포트
```

### 프론트엔드 테스트 (Vitest)

```bash
cd frontend
npm test              # 모든 테스트 실행
npm run test:watch    # Watch 모드
npm run test:coverage # 커버리지 리포트
```

### E2E 테스트 (Playwright)

```bash
npm run test:e2e          # Headless 실행
npm run test:e2e:ui       # Playwright UI
npm run test:e2e:headed   # Headed 브라우저
```

### 타입 체크

```bash
cd frontend && npm run type-check
cd backend && npm run lint
```

## Lambda Layer 유틸리티

`backend/src/utils/`에 있는 공통 유틸리티들:

### dynamodb.ts

```typescript
import { getItem, putItem, queryTable, scanTable } from '/opt/nodejs/utils/dynamodb.js';

// 단일 아이템 조회
const item = await getItem('PART#123', 'METADATA');

// 아이템 저장
await putItem({ PK: 'PART#123', SK: 'METADATA', ... });

// GSI 쿼리
const parts = await queryTable({
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: { ':pk': 'CATEGORY#battery' }
});
```

### bedrock.ts

```typescript
import { generateEmbedding, callClaude, findTopKSimilar } from '/opt/nodejs/utils/bedrock.js';

// 텍스트 임베딩 생성
const embedding = await generateEmbedding('검색 쿼리');

// Claude 호출 (기본: Haiku)
const response = await callClaude('프롬프트', { model: 'haiku' });

// Top-K 유사도 검색
const results = findTopKSimilar(queryVector, partVectors, 10);
```

### s3.ts

```typescript
import { uploadVector, getVector, updateVectorsManifest } from '/opt/nodejs/utils/s3.js';

// 벡터 업로드
await uploadVector(partId, embedding);

// 벡터 다운로드
const vector = await getVector(partId);

// 매니페스트 업데이트
await updateVectorsManifest(partId);
```

### response.ts

```typescript
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

// 성공 응답 (CORS 헤더 포함)
return successResponse({ data: result });

// 에러 응답
return errorResponse('Not found', 404);
```

## ESM 모듈 주의사항

Lambda (Node.js 20)는 ESM 모듈을 사용합니다:

- 모든 로컬 import에 `.js` 확장자 필수:
  ```typescript
  // ✅ 올바른 방법
  import { helper } from './utils.js';

  // ❌ 잘못된 방법
  import { helper } from './utils';
  ```

- `package.json`에 `"type": "module"` 설정 확인

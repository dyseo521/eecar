# EECAR - 전기차 중고 부품 B2B 거래 플랫폼

AI 기반 RAG 검색을 활용한 전기차 부품 재활용 및 재사용 플랫폼

## 프로젝트 개요

EECAR는 1세대 전기차(2010년대 초반)의 수명 종료에 따라 증가하는 중고 부품의 효율적인 거래와 재활용을 지원하는 B2B 플랫폼입니다.

### 주요 기능

- 🤖 **AI 기반 검색**: RAG(Retrieval-Augmented Generation)를 활용한 자연어 부품 검색
- 📊 **물성 데이터베이스**: 모델별, 부품별 검증된 물성 데이터 통합 관리
- 🔔 **스마트 알림**: 원하는 부품 등록 시 자동 알림
- 🤝 **B2B 매칭**: 기업 간 계약 제안 및 협상 지원
- ✅ **자동 규성 검증**: 부품 등록 시 규성 준수 여부 자동 확인
- 🔧 **합성 데이터 생성**: MCP 스타일 도구를 활용한 테스트 데이터 생성

## 기술 스택

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- TanStack Query (React Query)
- Zustand (상태 관리)

### Backend
- Node.js 20
- AWS Lambda (서버리스)
- TypeScript

### Infrastructure (AWS)
- **API Gateway**: REST API 엔드포인트
- **Lambda**: 서버리스 함수 (벡터 검색, 부품 등록, 규성 검증 등)
- **DynamoDB**: NoSQL 데이터베이스 (싱글 테이블 디자인)
- **S3**: 벡터 임베딩 및 문서 저장
- **Bedrock Claude**: AI 텍스트 생성 (Haiku/Sonnet)
- **Bedrock Titan**: 텍스트 임베딩
- **SNS**: 알림 시스템
- **CloudFront**: CDN (프론트엔드 배포)

### AI/ML
- Amazon Bedrock Claude (Haiku for cost optimization)
- Amazon Titan Embeddings
- RAG (Retrieval-Augmented Generation)
- Vector similarity search (cosine similarity)

## 프로젝트 구조

```
eecar/
├── frontend/              # React 프론트엔드
│   ├── src/
│   │   ├── pages/        # 페이지 컴포넌트
│   │   ├── components/   # 재사용 컴포넌트
│   │   ├── hooks/        # Custom hooks
│   │   └── utils/        # 유틸리티 함수
│   ├── package.json
│   └── vite.config.ts
│
├── backend/              # Lambda 함수들
│   ├── src/
│   │   ├── functions/   # Lambda 함수별 디렉토리
│   │   │   ├── vector-search/
│   │   │   ├── part-registration/
│   │   │   ├── compliance-check/
│   │   │   ├── get-parts/
│   │   │   ├── watch-part/
│   │   │   ├── proposal/
│   │   │   └── synthetic-data/
│   │   ├── utils/       # 공통 유틸리티
│   │   │   ├── dynamodb.ts
│   │   │   ├── s3.ts
│   │   │   └── bedrock.ts
│   │   └── types/       # 타입 정의
│   ├── package.json
│   └── tsconfig.json
│
├── infrastructure/       # AWS SAM 템플릿
│   └── template.yaml
│
├── shared/              # 공유 타입
│   ├── types/
│   │   └── index.ts
│   └── package.json
│
└── docs/                # 문서
    ├── DYNAMODB_SCHEMA.md
    └── API.md
```

## 시작하기

### 사전 요구사항

- Node.js 20+
- AWS CLI 설정
- AWS SAM CLI
- AWS 계정 및 Bedrock 접근 권한

### 설치

1. **의존성 설치**
```bash
npm run install:all
```

2. **환경 변수 설정**

프론트엔드 `.env`:
```env
VITE_API_URL=https://your-api-gateway-url.amazonaws.com/prod
```

3. **TypeScript 컴파일**
```bash
cd backend && npm run build
cd ../shared && npm run build
```

### 로컬 개발

#### 프론트엔드 실행
```bash
npm run dev:frontend
# http://localhost:3000
```

#### 백엔드 로컬 테스트 (SAM Local)
```bash
cd infrastructure
sam build
sam local start-api --port 3001
```

### AWS 배포

1. **백엔드 배포 (Lambda + API Gateway + DynamoDB)**
```bash
cd infrastructure
sam build
sam deploy --guided
```

첫 배포 시 다음 정보를 입력:
- Stack Name: `eecar-stack`
- AWS Region: `us-east-1` (Bedrock 사용 가능 리전)
- Confirm changes: Y
- Allow SAM CLI IAM role creation: Y
- Save arguments to configuration file: Y

2. **프론트엔드 배포 (S3 + CloudFront)**
```bash
cd frontend
npm run build

# S3 버킷에 업로드
aws s3 sync dist/ s3://your-frontend-bucket/
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### 초기 데이터 생성

합성 데이터를 생성하여 테스트:

```bash
curl -X POST https://your-api-url/api/synthetic \
  -H "Content-Type: application/json" \
  -d '{
    "category": "battery",
    "count": 10
  }'
```

## 비용 최적화 전략

### 현재 구현된 최적화

1. **서버리스 아키텍처**: 사용량 기반 과금
2. **Lambda 메모리 최적화**: 512MB (필요시만 1024MB)
3. **DynamoDB 온디맨드 모드**: 저트래픽에 유리
4. **결과 캐싱**: 검색 결과 7일 TTL 캐싱
5. **Claude Haiku 우선 사용**: Sonnet 대비 1/12 비용
6. **S3 기반 벡터 저장**: OpenSearch Serverless 대비 저렴
7. **CloudWatch 로그 보존 기간 단축**: 7일

### 예상 월 비용 (초기 트래픽)

- Lambda: $5 (월 500만 요청)
- DynamoDB: $3 (읽기/쓰기 소량)
- Bedrock: $10-20 (월 1000 AI 쿼리)
- S3: $1
- CloudFront: $1
- SNS: $0.5

**총 예상: $20-30/월**

## API 문서

자세한 API 문서는 [docs/API.md](./docs/API.md)를 참고하세요.

### 주요 엔드포인트

- `POST /api/search` - AI 기반 부품 검색
- `POST /api/parts` - 부품 등록
- `GET /api/parts/{id}` - 부품 상세 조회
- `POST /api/watch` - 알림 등록
- `POST /api/proposals` - 계약 제안 생성

## 아키텍처

### 데이터 플로우

```
사용자 → CloudFront → S3 (Frontend)
         ↓
    API Gateway
         ↓
    Lambda Functions
    ├── Vector Search: S3 Vectors + DynamoDB + Bedrock
    ├── Part Registration: DynamoDB + S3 + Bedrock → Compliance Check
    └── Compliance Check: Bedrock + SNS
```

### RAG 검색 플로우

1. 사용자가 자연어로 쿼리 입력
2. 쿼리를 Titan으로 임베딩 생성
3. S3에서 부품 벡터들 로드
4. Cosine similarity로 Top-K 부품 검색
5. DynamoDB에서 부품 메타데이터 조회
6. Claude로 각 매칭 이유 생성
7. 결과 캐싱 (DynamoDB TTL)

## DynamoDB 스키마

싱글 테이블 디자인으로 비용 최적화. 자세한 내용은 [docs/DYNAMODB_SCHEMA.md](./docs/DYNAMODB_SCHEMA.md) 참고.

### 주요 엔티티

- Parts (부품)
- Company Needs (회사 니즈)
- Matches (매칭 결과 캐싱)
- Watch List (알림 등록)
- Proposals (계약 제안)
- Notifications (알림 히스토리)

## 개발 가이드

### 새 Lambda 함수 추가

1. `backend/src/functions/` 에 폴더 생성
2. `index.ts` 파일 작성
3. `infrastructure/template.yaml` 에 함수 정의 추가
4. `sam build && sam deploy`

### 타입 수정

공유 타입 수정 시:
```bash
cd shared
npm run build
```

프론트엔드와 백엔드에서 자동으로 반영됩니다.

## 테스트

```bash
# 백엔드 테스트 (TODO: 구현 필요)
cd backend
npm test

# 프론트엔드 타입 체크
cd frontend
npm run type-check
```

## 트러블슈팅

### Bedrock 권한 오류
```bash
aws bedrock list-foundation-models --region us-east-1
```

Bedrock 모델 접근 권한 확인 필요. AWS Console에서 Bedrock 모델 액세스 요청.

### Lambda 타임아웃
`template.yaml`에서 `Timeout` 값 증가 (최대 900초).

### DynamoDB 용량 부족
온디맨드 모드에서는 자동 스케일링. 프로비저닝 모드로 전환 시 용량 조정 필요.

## 로드맵

- [ ] 사용자 인증 (Cognito)
- [ ] 이미지 업로드 (S3 pre-signed URLs)
- [ ] 실시간 알림 (WebSocket API)
- [ ] 관리자 대시보드
- [ ] 부품 상태 추적
- [ ] 결제 통합
- [ ] 다국어 지원

## 라이선스

MIT

## 기여

이슈와 PR을 환영합니다!

## 문의

프로젝트 관련 문의: [이메일]

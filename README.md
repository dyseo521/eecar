# EECAR - 전기차 중고 부품 B2B 거래 플랫폼

AI 기반 RAG 검색을 활용한 전기차 부품 재활용 및 재사용 플랫폼

## 프로젝트 개요

EECAR는 1세대 전기차(2010년대 초반)의 수명 종료에 따라 증가하는 중고 부품의 효율적인 거래와 재활용을 지원하는 B2B 플랫폼입니다.

### 프로젝트 통계

- **코드베이스**: 10,000+ LOC
- **Lambda 함수**: 12개 (서버리스 아키텍처)
- **부품 카테고리**: 11개 (배터리, 모터, 인버터, 차체 부품 등)
- **로컬 테스트 데이터**: 35개 부품
- **배포 리전**: AWS ap-northeast-2 (서울)
- **성능 개선**: 검색 속도 67% 향상 (20-30초 → 5-10초)
- **비용 절감**: API 호출 90% 감소 (이중 캐싱 전략)

### 주요 기능

- **AI 기반 검색**: RAG(Retrieval-Augmented Generation)를 활용한 자연어 부품 검색
  - AI/기본 검색 모드 토글로 전환 가능
  - 병렬 처리 최적화로 **검색 속도 67% 향상** (20-30초 → 5-10초)
  - 이중 캐싱 전략으로 **API 비용 90% 절감** (백엔드 7일 + 프론트엔드 30분)
  - 팝업 로딩 오버레이, 정확도 기반 시각적 하이라이팅 (골든/그린 그라데이션)
- **배터리 SOH 평가**: 70% 기준 재사용/재활용 자동 판단
  - 17개 차종 데이터 기반 (현대 아이오닉, 테슬라 Model S, BMW i3 등)
  - 6가지 양극재 타입 지원 (NCM Ni 33/60/80%, NCA, LFP, LMO)
- **재질 물성 검색**: 알루미늄 합금 기반 고급 검색
  - 합금 번호 검색 (6061, 7075, 5754)
  - 인장 강도, 재활용률 등 물성 필터링
- **세분화된 차체 카테고리**:
  - 샤시/프레임, 외판/패널, 도어, 창/유리로 구분
  - 재질별 상세 스펙 제공
- **일반 문의**: SNS 기반 이메일 알림 시스템
  - 로그인 없이 부품 문의 가능
  - 자동으로 관리자 이메일(inha2025vip@gmail.com)로 전송
- **B2B 매칭**: 기업 간 계약 제안 (로그인 불필요)
- **스마트 알림**: 원하는 부품 등록 시 자동 알림
- **자동 규성 검증**: 부품 등록 시 규성 준수 여부 자동 확인
- **합성 데이터 생성**: 카테고리별 현실적인 가격 범위로 테스트 데이터 생성
  - 배터리: 300만원~1,500만원
  - 모터: 200만원~800만원
  - 인버터: 150만원~500만원
  - 차체 부품: 5만원~150만원
- **실시간 에러 모니터링**: Lambda 에러 발생 시 Slack 자동 알림
  - CloudWatch Logs → Lambda → Slack 연동
  - Request ID, 함수명, 에러 메시지 자동 추출
  - 5분 중복 제거 (DynamoDB TTL)
- **자동이 2.0 AI DevOps 어시스턴트**: Slack 기반 운영 지원 봇
  - `/자동이 상태` - Lambda 함수 상태/에러율 실시간 조회
  - `/자동이 분석 <에러>` - AI 기반 에러 원인 분석 및 해결책 제시
  - `@자동이 멘션` - 자연어 대화로 운영 질문 (ReAct 패턴)
  - S3 Vectors 장기 기억으로 해결 사례 학습
- **분산 추적 및 모니터링**: X-Ray + CloudWatch Dashboard
  - Lambda/API Gateway 전 구간 X-Ray 추적
  - 통합 CloudWatch Dashboard (에러율, 지연시간, 호출수)

## 기술 스택

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- TanStack Query (React Query) - 서버 상태 관리
- React Context API - 전역 상태 관리 (인증)

### Backend
- Node.js 20
- AWS Lambda (서버리스)
- TypeScript

### Infrastructure (AWS)
**배포 리전**: ap-northeast-2 (서울)

- **API Gateway**: REST API 엔드포인트 (https://6o4futufni.execute-api.ap-northeast-2.amazonaws.com/prod)
- **Lambda**: 11개 서버리스 함수 (Node.js 20.x)
  - 기본 메모리: 512MB (비용 최적화)
  - 임베딩 생성: 1024MB (성능 최적화)
  - 타임아웃: 30초 (검색), 180초 (데이터 생성)
- **DynamoDB**: NoSQL 데이터베이스 (온디맨드 모드, 싱글 테이블 디자인)
- **S3**: 벡터 임베딩 및 문서 저장
  - 프론트엔드 버킷: `dyseo521-eecar-demo-web-service-12234628`
  - SAM 빌드 버킷: `dyseo521-eecar-aws-sam-12234628`
- **Bedrock Claude**: AI 텍스트 생성 (Haiku/Sonnet) - ap-northeast-2 지원
- **Bedrock Titan**: 텍스트 임베딩 G2 v2 - ap-northeast-2 지원
- **SNS**: 알림 시스템 (이메일: inha2025vip@gmail.com)
- **CloudFront**: CDN (프론트엔드 배포)
- **CloudWatch Logs**: Lambda 로그 및 에러 모니터링 (7일 보관)
- **X-Ray**: 분산 추적 (Lambda, API Gateway 전 구간)
- **CloudWatch Dashboard**: 통합 모니터링 대시보드
- **S3 Vectors**: 벡터 저장소 (parts-vectors, jadong-memories, eecar-codebase)
- **Bedrock Knowledge Base**: 코드베이스 RAG 검색 (자동이 2.0용)

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
│   │   ├── functions/   # Lambda 함수별 디렉토리 (11개)
│   │   │   ├── vector-search/              # AI 기반 의미 검색
│   │   │   ├── part-registration/          # 부품 등록 및 임베딩 생성
│   │   │   ├── compliance-check/           # 규정 준수 검증
│   │   │   ├── get-parts/                  # 부품 조회 (카테고리/판매자)
│   │   │   ├── watch-part/                 # 부품 알림 등록
│   │   │   ├── proposal/                   # B2B 계약 제안
│   │   │   ├── synthetic-data/             # 테스트 데이터 생성
│   │   │   ├── battery-health-assessment/  # 배터리 SOH 평가
│   │   │   ├── material-property-search/   # 재질 물성 검색
│   │   │   ├── contact-inquiry/            # 일반 문의 처리
│   │   │   ├── hybrid-search/              # 벡터+재질 복합 검색
│   │   │   ├── slack-notification/         # Lambda 에러 모니터링 (v1)
│   │   │   └── slack-agent/                # 자동이 2.0 AI DevOps 어시스턴트
│   │   ├── utils/       # Lambda Layer 공통 유틸리티
│   │   │   ├── dynamodb.ts  # DynamoDB CRUD
│   │   │   ├── s3.ts        # S3 벡터/문서 관리
│   │   │   ├── bedrock.ts   # Claude/Titan API
│   │   │   └── response.ts  # CORS 응답 헬퍼
│   │   ├── local-server/    # 로컬 개발용 Express 서버
│   │   └── types/           # 타입 정의
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

#### 모든 서비스 통합 실행 (권장)
```bash
# Docker + 백엔드 + 프론트엔드 동시 실행
npm run dev:all
```

이 명령은 다음을 자동으로 실행합니다:
- **Docker Compose**: DynamoDB Local (포트 8000), LocalStack (포트 4566)
- **로컬 백엔드 서버**: Express 서버 (포트 3001)
  - 35개 사전 로드된 부품 데이터 (배터리 10개, 모터 6개, 인버터 6개, 차체 13개)
  - 배터리 SOH 평가 및 재질 물성 검색 API 지원
  - 인증 엔드포인트 (`/api/auth/signup`, `/api/auth/login`)
- **프론트엔드 개발 서버**: Vite (포트 3000)

#### 개별 서비스 실행
```bash
npm run docker:up         # Docker 서비스만 시작
npm run dev:local         # 백엔드 로컬 서버만 실행
npm run dev:frontend      # 프론트엔드만 실행
```

#### SAM Local 테스트 (선택사항)
```bash
cd infrastructure
sam build
sam local start-api --port 3001
```

### AWS 배포

**상세 배포 가이드는 로컬 파일 참조**: `DEPLOY_LOCAL.md`

기본 배포 절차:

```bash
# 1. Shared 타입 빌드
cd shared && npm run build

# 2. Backend TypeScript 컴파일
cd ../backend && npm run build

# 3. SAM 배포
cd ../infrastructure
sam build
sam deploy
```

**⚠️ 주의**:
- IAM 권한 설정 필요 (`DEPLOY_LOCAL.md` 참조)
- 배포 후 Bedrock 모델 활성화 필수
- 프론트엔드 `.env` 파일 설정 필요

## CI/CD 파이프라인

EECAR는 GitHub Actions를 활용한 완전 자동화된 CI/CD 파이프라인을 지원합니다.

### 워크플로우 개요

#### 1. **Test and Lint** (`test-and-lint.yml`)
- **트리거**: PR 생성, master/develop 브랜치 Push
- **역할**: 코드 품질 자동 검증
- **실행 내용**:
  - TypeScript 타입 체크 (Frontend, Backend, Shared)
  - 빌드 검증
- **참고**: ESLint/Jest는 설정 파일 미존재로 현재 비활성화

#### 2. **Build Frontend** (`build-frontend.yml`)
- **트리거**: PR 생성, master/develop 브랜치 Push (frontend/** 또는 shared/** 변경 시)
- **역할**: 프론트엔드 빌드 검증
- **실행 내용**:
  - Shared 타입 빌드
  - Frontend 빌드 (Production API URL 주입)
  - Artifact 업로드 (7일 보관)

#### 3. **Deploy Frontend** (`deploy-frontend.yml`)
- **트리거**: master 브랜치 Push (frontend/** 또는 shared/** 변경 시)
- **역할**: S3 + CloudFront 자동 배포
- **실행 내용**:
  - **Build Job**: 프론트엔드 빌드 및 Artifact 업로드 (1일 보관)
  - **Deploy Job**: Artifact 다운로드 및 배포
    - S3 버킷 동기화 (캐시 전략: assets 1년, index.html no-cache)
    - CloudFront 캐시 무효화
    - Slack 알림 (배포 시작/성공/실패)
- **인증**: AWS OIDC (v3)

#### 4. **Deploy Backend** (`deploy-backend.yml`)
- **트리거**: Release 태그 생성 (`v*.*.*`)
- **역할**: Lambda 함수 및 CloudWatch Logs 구독 자동 배포
- **실행 내용**:
  - Shared + Backend 빌드
  - SAM 빌드 및 배포
  - CloudFormation 스택 업데이트
  - Lambda 함수 업데이트
  - CloudWatch Logs Subscription Filters 자동 설정
  - API Gateway 엔드포인트 출력
  - Slack 알림 (배포 시작/성공/실패)
- **인증**: AWS OIDC (v3)

### 배포 워크플로우

#### 일반 개발 프로세스
```bash
# 1. Feature 브랜치에서 작업
git checkout -b feature/new-feature

# 2. 코드 작성 및 커밋
git add .
git commit -m "feat: Add new feature"

# 3. PR 생성
git push origin feature/new-feature
# → GitHub에서 PR 생성
# → test-and-lint.yml 자동 실행

# 4. Master에 Merge
# → deploy-frontend.yml 자동 실행 (프론트엔드 배포)
# → Slack #eecar-alerts 채널에 알림 전송
```

#### 프로덕션 릴리스 (백엔드)
```bash
# 1. Master 브랜치에서 릴리스 태그 생성
git checkout master
git pull origin master

# 2. 버전 태그 생성 및 Push
git tag v1.0.0
git push origin v1.0.0

# 3. 자동 배포 시작
# → deploy-backend.yml 자동 실행
# → SAM 빌드 및 배포 (~3-5분)
# → Lambda 함수 업데이트
# → CloudWatch Logs 구독 필터 설정
# → API Gateway 엔드포인트 갱신
# → Slack #eecar-alerts 채널에 알림 전송
```

### AWS OIDC 설정

CI/CD 파이프라인은 AWS OIDC (OpenID Connect)를 사용하여 보안을 강화합니다. AWS Access Key를 GitHub Secrets에 저장하지 않고, GitHub Actions에서 AWS 리소스에 안전하게 접근할 수 있습니다.

**설정 가이드**: [`.github/AWS_OIDC_SETUP.md`](.github/AWS_OIDC_SETUP.md)

**OIDC Provider 설정**:
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com` (⚠️ 주의: `http://` 없이, 끝에 `/` 없이)
- Actions 버전: `aws-actions/configure-aws-credentials@v3`

**필수 GitHub Secrets**:
```
AWS_ROLE_ARN                    # IAM Role ARN (OIDC)
AWS_REGION                      # ap-northeast-2 (서울)
S3_FRONTEND_BUCKET              # 프론트엔드 S3 버킷 (예: dyseo521-eecar-demo-web-service-12234628)
SAM_S3_BUCKET                   # SAM 빌드 아티팩트 S3 버킷 (예: dyseo521-eecar-aws-sam-12234628)
CLOUDFRONT_DISTRIBUTION_ID      # CloudFront Distribution ID
CLOUDFRONT_DISTRIBUTION_DOMAIN  # CloudFront 도메인
SLACK_WEBHOOK_URL               # Slack Incoming Webhook URL (배포/에러 알림)
```

**IAM 권한 요구사항**:
- Lambda 함수 생성/업데이트/삭제
- DynamoDB 테이블 생성/업데이트
- S3 버킷 접근 (프론트엔드, SAM 빌드, 벡터, 문서)
- CloudFormation 스택 관리
- CloudFront 캐시 무효화
- CloudWatch Logs 구독 필터 설정
- IAM 역할 생성 (CAPABILITY_IAM)

### 주요 이점

- ✅ **자동화된 테스트**: PR마다 자동으로 품질 검증
- ✅ **빠른 배포**: master 브랜치 merge 시 즉시 프론트엔드 배포 (~2-3분)
- ✅ **안전한 릴리스**: 태그 기반으로 백엔드 배포 제어
- ✅ **보안 강화**: OIDC 사용으로 AWS Access Key 관리 불필요
- ✅ **가시성**: GitHub Actions UI에서 배포 상태 실시간 확인
- ✅ **실시간 알림**: Slack 채널에서 배포 성공/실패, Lambda 에러 즉시 확인
- ✅ **효율성**: Build 아티팩트 재사용으로 중복 빌드 방지

### 정적 호스팅 (백엔드 불필요)

프론트엔드만으로 완전한 기능 테스트가 가능합니다. 백엔드 없이도 35개 부품 데이터로 플랫폼의 모든 UI/UX를 체험할 수 있습니다.

```bash
cd frontend
npm run build
# dist/ 폴더를 Vercel, Netlify, GitHub Pages, Cloudflare Pages에 배포
```

**지원 기능**:
- 35개 부품 브라우징 (배터리 10개, 모터 6개, 인버터 6개, 차체 13개)
- 부품 상세 페이지 (배터리 SOH, 재질 물성 포함)
- 카테고리 및 가격 필터링
- AI/기본 검색 모드 전환
- 세분화된 차체 카테고리 (샤시/프레임, 외판/패널, 도어, 창/유리)

**제한 사항**:
- AI 기반 벡터 검색 (Bedrock 필요)
- 실시간 알림 (SNS 필요)
- 계약 제안 생성

**배포 예시 (Vercel)**:
```bash
cd frontend
npm install -g vercel
vercel
```

### 초기 데이터 생성

**로컬 개발**: 35개 부품 데이터가 사전 로드되어 있어 즉시 테스트 가능합니다.
- 배터리 10개 (다양한 SOH, 양극재 타입)
- 모터 6개
- 인버터 6개
- 차체 부품 13개 (샤시, 패널, 도어, 윈도우)

**AWS 배포 환경**: 합성 데이터 생성 API를 통해 추가 데이터 생성:

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

1. **서버리스 아키텍처**: 사용량 기반 과금, 유휴 시간 비용 없음
2. **Lambda 메모리 최적화**:
   - 기본 512MB (검색, 조회 함수)
   - 1024MB (임베딩 생성만)
3. **DynamoDB 온디맨드 모드**: 저/가변 트래픽에 유리
4. **이중 캐싱 전략**:
   - 백엔드: 검색 결과 7일 TTL (DynamoDB)
   - 프론트엔드: 30분 캐싱 (TanStack Query)
   - **효과**: API 호출 90% 감소
5. **Claude Haiku 우선 사용**: Sonnet 대비 1/12 비용
6. **S3 기반 벡터 저장**: OpenSearch Serverless ($700+/월) 대신 S3 ($1/월)
7. **Manifest 파일 사용**: S3 LIST API 호출 최소화
8. **CloudWatch 로그 보존 기간 단축**: 7일 (비용 절감)
9. **단일 리전 배포**: 교차 리전 데이터 전송 비용 없음
10. **병렬 처리**: S3 벡터 로딩 및 Claude API 호출 병렬화 (67% 속도 향상)

### 예상 월 비용 (초기 트래픽)

**트래픽 가정**: 일 100명 방문, 사용자당 5회 검색

- **Lambda**: $3-5
  - 월 15,000 요청 × 평균 512MB × 1초 실행
- **DynamoDB**: $2-3
  - 읽기: 월 30,000건
  - 쓰기: 월 10,000건
  - 온디맨드 모드
- **Bedrock**: $8-15
  - Claude Haiku: 월 15,000 호출 (캐싱으로 실제 1,500 호출)
  - Titan Embeddings: 월 500 호출
- **S3**: $1-2
  - 스토리지: 1GB (벡터 + 문서)
  - 요청: 월 10,000건
- **CloudFront**: $1
  - 데이터 전송: 월 10GB
- **CloudWatch Logs**: $1
  - 로그 수집 및 저장 (7일)
- **SNS**: $0.5
  - 이메일/Lambda 알림

**총 예상: $17-28/월**

**비용 절감 효과**:
- OpenSearch 사용 시: $700+/월 → S3 사용: $1/월 (99.8% 절감)
- 캐싱 미사용 시 Bedrock: $150/월 → 캐싱 사용: $15/월 (90% 절감)

## API 문서

자세한 API 문서는 [docs/API.md](./docs/API.md)를 참고하세요.

### 주요 엔드포인트

**Base URL**: `https://6o4futufni.execute-api.ap-northeast-2.amazonaws.com/prod`

- `POST /api/search` - AI 기반 의미 검색 (RAG)
- `POST /api/parts` - 부품 등록 (임베딩 생성, 규정 검증 트리거)
- `GET /api/parts` - 부품 목록 조회 (카테고리, 판매자 필터)
- `GET /api/parts/{id}` - 부품 상세 조회
- `POST /api/watch` - 알림 등록
- `POST /api/proposals` - 계약 제안 생성
- `POST /api/synthetic` - 합성 데이터 생성
- `POST /api/battery-assessment` - 배터리 SOH 평가 검색
- `POST /api/material-search` - 재질 물성 검색
- `POST /api/hybrid-search` - 벡터 + 재질 복합 검색
- `POST /api/contact` - 일반 문의 (SNS 이메일 발송)
- `POST /api/slack/events` - Slack 이벤트 (자동이 2.0)

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

싱글 테이블 디자인으로 비용 최적화 및 조인 쿼리 최소화. 자세한 내용은 [docs/DYNAMODB_SCHEMA.md](./docs/DYNAMODB_SCHEMA.md) 참고.

### 주요 엔티티 및 액세스 패턴

**테이블명**: `eecar-parts-table` (온디맨드 모드)

1. **Parts (부품)**
   - `PK: PART#{partId}`, `SK: METADATA` - 부품 메타데이터
   - `PK: PART#{partId}`, `SK: SPEC` - 재질/물성 상세 스펙
   - `PK: PART#{partId}`, `SK: VECTOR` - S3 벡터 파일 참조
   - GSI1: `GSI1PK: CATEGORY#{category}`, `GSI1SK: CREATED_AT#{timestamp}` - 카테고리별 조회

2. **Search Cache (매칭 결과 캐싱)**
   - `PK: MATCH#{queryHash}`, `SK: RESULT`
   - TTL: 7일 (자동 삭제)
   - 속성: matchedParts, hitCount, modelUsed

3. **Watch List (알림 등록)**
   - `PK: WATCH#{userId}`, `SK: WATCH_ITEM#{watchId}`

4. **Proposals (계약 제안)**
   - `PK: PROPOSAL#{proposalId}`, `SK: METADATA`

5. **Notifications (알림 히스토리)**
   - `PK: NOTIFICATION#{userId}`, `SK: NOTIF#{timestamp}`

6. **Error Deduplication (Slack 중복 방지)**
   - `PK: ERROR#{errorHash}`, `SK: DEDUP`
   - TTL: 5분 (자동 삭제)

### 인덱스 구성

- **Primary Key**: PK (Partition Key), SK (Sort Key)
- **GSI1**: 카테고리별 부품 조회 (GSI1PK, GSI1SK)
- **스트림**: 비활성화 (비용 최적화)

## 개발 가이드

### 새 Lambda 함수 추가

1. **함수 디렉토리 생성**
```bash
mkdir -p backend/src/functions/my-function
```

2. **Lambda 핸들러 작성** (`backend/src/functions/my-function/index.ts`)
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

3. **SAM 템플릿에 함수 정의 추가** (`infrastructure/template.yaml`)
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

4. **빌드 및 배포**
```bash
cd backend && npm run build
cd ../infrastructure
sam build
sam deploy
```

### 타입 수정

공유 타입은 프론트엔드와 백엔드가 공유하는 TypeScript 타입 정의입니다.

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

### 로컬 개발 데이터 수정

로컬 개발 환경의 35개 부품 데이터는 두 곳에서 관리됩니다:
- **백엔드**: `backend/local-server/index.js` (Express 서버)
- **프론트엔드**: `frontend/src/data/mockParts.ts` (정적 호스팅용)

**데이터 일관성 유지**: 두 파일을 동시에 수정하거나, 변환 스크립트 작성 권장

### Slack Webhook URL 변경

**개발 환경**:
```bash
# backend/local-server/index.js 수정
SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/YOUR/NEW/WEBHOOK'
```

**프로덕션 환경**:
```bash
# Parameter Store 업데이트
aws ssm put-parameter \
  --name /eecar/slack/webhook-url \
  --value "https://hooks.slack.com/services/YOUR/NEW/WEBHOOK" \
  --type SecureString \
  --overwrite \
  --region ap-northeast-2

# GitHub Secrets 업데이트
# Settings → Secrets → SLACK_WEBHOOK_URL 수정
```

### 코드 스타일 가이드

- **언어**: TypeScript (strict mode)
- **린팅**: ESLint (설정 파일 추가 권장)
- **포매팅**: Prettier (설정 파일 추가 권장)
- **커밋 메시지**: Conventional Commits
  - `feat:` - 새 기능
  - `fix:` - 버그 수정
  - `docs:` - 문서 변경
  - `refactor:` - 리팩토링
  - `test:` - 테스트 추가
  - `chore:` - 빌드/설정 변경

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
**증상**: `AccessDeniedException: Could not access bedrock model`

**해결 방법**:
```bash
# 서울 리전(ap-northeast-2)에서 모델 목록 확인
aws bedrock list-foundation-models --region ap-northeast-2

# Claude 모델 확인
aws bedrock list-foundation-models --region ap-northeast-2 \
  --query "modelSummaries[?contains(modelId,'anthropic.claude')].modelId"
```

AWS Console → Bedrock → Model access에서 다음 모델 접근 요청:
- Claude 3 Haiku (기본 모델)
- Claude 3.5 Sonnet (선택적)
- Titan Embeddings G2 - Text v2

### Lambda 타임아웃
**증상**: `Task timed out after 30.00 seconds`

**해결 방법**: `infrastructure/template.yaml`에서 함수별 `Timeout` 값 증가:
```yaml
VectorSearchFunction:
  Type: AWS::Serverless::Function
  Properties:
    Timeout: 60  # 기본 30초 → 60초
```

최대 900초까지 설정 가능.

### DynamoDB 용량 부족
**증상**: `ProvisionedThroughputExceededException`

**해결 방법**:
- 온디맨드 모드에서는 자동 스케일링 (현재 설정)
- 프로비저닝 모드로 전환 시 Read/Write Capacity Units 조정

### OIDC 인증 실패
**증상**: `Error: Could not assume role with OIDC: Incorrect token audience`

**해결 방법**:
1. OIDC Provider 삭제 후 재생성:
```bash
aws iam delete-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"

aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

2. IAM Role Trust Policy 확인:
```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    }
  }
}
```

⚠️ 주의: Audience는 `sts.amazonaws.com` (http:// 없음, 끝에 / 없음)

### CloudFormation Stack UPDATE_ROLLBACK_FAILED
**증상**: SAM 배포 중 스택이 롤백 실패 상태

**해결 방법**:
1. 필요한 IAM 권한 추가 (CloudWatch Logs 구독 필터 등)
2. 스택 복구:
```bash
aws cloudformation continue-update-rollback \
  --stack-name eecar-stack \
  --region ap-northeast-2
```

### Port already in use (로컬 개발)
**증상**: `Error: listen EADDRINUSE: address already in use :::3000`

**해결 방법**:
```bash
# 포트 사용 프로세스 종료
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:8000 | xargs kill -9

# 또는 Docker 서비스 재시작
npm run docker:down && npm run docker:up
```

### Slack 알림이 오지 않음
**증상**: 배포 성공했지만 Slack 알림 미수신

**해결 방법**:
1. GitHub Secrets의 `SLACK_WEBHOOK_URL` 확인
2. Slack 앱의 Incoming Webhook URL이 유효한지 확인
3. Webhook URL 테스트:
```bash
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'
```

### Lambda 에러 모니터링 미동작
**증상**: Lambda 에러 발생했지만 Slack 알림 미수신

**해결 방법**:
1. CloudWatch Logs 구독 필터 확인:
```bash
aws logs describe-subscription-filters \
  --log-group-name /aws/lambda/eecar-stack-VectorSearchFunction-xxx \
  --region ap-northeast-2
```

2. SNS 주제 구독 확인 (Lambda 함수 연결)
3. Parameter Store에 Slack Webhook URL 저장 확인:
```bash
aws ssm get-parameter \
  --name /eecar/slack/webhook-url \
  --region ap-northeast-2
```


## 라이선스

MIT License - 자유롭게 사용, 수정, 배포할 수 있습니다.

## 기여 및 문의

### 문의
- 프로젝트 관련 문의: dyseo521@gmail.com

이 프로젝트는 다음 기술들을 활용하여 개발되었습니다:
- **AWS Serverless 서비스**: Lambda, DynamoDB, S3, API Gateway, CloudFront
- **Amazon Bedrock**: Claude 3 Haiku, Titan Embeddings G2 v2
- **React**: React 18, TanStack Query, React Router
- **TypeScript**: 타입 안전성 및 개발 생산성
- **AWS SAM**: Infrastructure as Code
- **GitHub Actions**: CI/CD 자동화

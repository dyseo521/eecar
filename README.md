# EECAR - 전기차 중고 부품 B2B 거래 플랫폼

AI 기반 Hybrid RAG 검색을 활용한 전기차 부품 재활용 및 재사용 플랫폼

## 프로젝트 개요

EECAR는 1세대 전기차(2010년대 초반)의 수명 종료에 따라 증가하는 중고 부품의 효율적인 거래와 재활용을 지원하는 B2B 플랫폼입니다.

### 프로젝트 통계

| 항목 | 값 |
|------|-----|
| 코드베이스 | 10,000+ LOC |
| Lambda 함수 | 13개 (서버리스 마이크로서비스) |
| 부품 카테고리 | 11개 (배터리, 모터, 인버터, 차체 부품 등) |
| 배포 리전 | AWS ap-northeast-2 (서울) |

### 주요 성과

- **검색 성능 67% 향상**: 20-30초 → 5-10초 (병렬 처리)
- **API 비용 90% 절감**: 이중 캐싱 전략 (백엔드 7일 + 프론트엔드 30분)
- **인프라 비용 99.8% 절감**: OpenSearch ($700/월) → S3 Vectors ($1/월)
- **5000개 벡터 검색 50ms 이내 응답**

## 주요 기능

### AI 기반 검색
- **Hybrid RAG**: 벡터 검색 70% + BM25 키워드 30% 가중치 결합
- AI/기본 검색 모드 토글로 전환 가능
- 정확도 기반 시각적 하이라이팅 (85%+ 골든, 80%+ 그린)

### 배터리 SOH 평가
- 70% 기준 재사용/재활용 자동 판단
- 17개 차종 데이터 기반 (현대 아이오닉, 테슬라 Model S, BMW i3 등)
- 6가지 양극재 타입 지원 (NCM Ni 33/60/80%, NCA, LFP, LMO)

### 재질 물성 검색
- 알루미늄 합금 기반 고급 검색 (6061, 7075, 5754)
- 인장 강도, 재활용률 등 물성 필터링

### 자동이 2.0 AI DevOps 어시스턴트
- `@멘션` 자연어 질의 → CloudWatch 조회 → 원인 분석 → 해결책 제안 (ReAct 패턴)
- Bedrock Knowledge Base + S3 Vectors 기반 장기 기억 시스템
- 14가지 에러 타입 자동 분류, 3단계 심각도 알림
- 11개 Lambda 함수 통합 모니터링

### 모니터링
- AWS X-Ray 분산 추적 (Lambda, API Gateway 전 구간)
- CloudWatch Dashboard 통합 모니터링

## 기술 스택

### Frontend
- React 18 + TypeScript + Vite
- TanStack Query (서버 상태 관리)
- React Context API (인증)

### Backend
- AWS Lambda (Node.js 20) - 13개 서버리스 함수
- Lambda Layer 공통 유틸리티

### AI/ML
- Amazon Bedrock Claude Haiku (비용 최적화)
- Amazon Titan Embeddings G2 v2
- Hybrid RAG (Vector 70% + BM25 30%)
- S3 Vectors 벡터 저장소

### Infrastructure
- DynamoDB (싱글 테이블 디자인, 온디맨드 모드)
- S3 (벡터, 문서, 프론트엔드 호스팅)
- API Gateway + CloudFront (CDN)
- CloudWatch + X-Ray (모니터링)
- AWS SAM (IaC)

### DevOps
- GitHub Actions (6개 워크플로우)
- AWS OIDC (무-키 인증)
- Slack 알림 (배포, 에러 모니터링)
- Playwright E2E 테스트

## 프로젝트 구조

```
eecar/
├── frontend/              # React 프론트엔드
│   ├── src/
│   │   ├── pages/         # 페이지 컴포넌트
│   │   ├── components/    # 재사용 컴포넌트
│   │   └── data/          # Mock 데이터
│   └── vite.config.ts
├── backend/               # Lambda 함수들
│   ├── src/
│   │   ├── functions/     # Lambda 함수별 디렉토리 (13개)
│   │   ├── utils/         # Lambda Layer 공통 유틸리티
│   │   └── local-server/  # 로컬 개발용 Express 서버
│   └── package.json
├── shared/                # 공유 TypeScript 타입
├── infrastructure/        # AWS SAM 템플릿
├── e2e/                   # Playwright E2E 테스트
└── docs/                  # 문서
```

### Lambda 함수 목록 (13개)

| 함수 | 설명 |
|------|------|
| vector-search | AI 기반 Hybrid RAG 검색 |
| part-registration | 부품 등록 및 임베딩 생성 |
| compliance-check | 규정 준수 검증 |
| get-parts | 부품 조회 (카테고리/판매자 필터) |
| watch-part | 부품 알림 등록 |
| proposal | B2B 계약 제안 |
| synthetic-data | 테스트 데이터 생성 |
| battery-health-assessment | 배터리 SOH 평가 |
| material-property-search | 재질 물성 검색 |
| hybrid-search | 벡터 + 재질 복합 검색 |
| contact-inquiry | 일반 문의 처리 (SNS) |
| slack-notification | Lambda 에러 모니터링 (v1: push) |
| slack-agent | 자동이 2.0 AI DevOps 어시스턴트 (v2: ReAct) |

## 빠른 시작

### 사전 요구사항

- Node.js 20+
- Docker Desktop
- AWS CLI (배포 시)

### 설치 및 실행

```bash
# 1. 의존성 설치
npm run install:all

# 2. 전체 개발 환경 실행 (Docker + 백엔드 + 프론트엔드)
npm run dev:all
```

**접속 URL**:
- 프론트엔드: http://localhost:3000
- 백엔드 API: http://localhost:3001
- DynamoDB Admin: http://localhost:8001

### 빌드 및 배포

```bash
# 빌드
npm run build:all

# AWS 배포
npm run deploy
```

자세한 내용은 [로컬 개발 가이드](docs/LOCAL_DEVELOPMENT.md) 참조.

## CI/CD 파이프라인

### 워크플로우

| 워크플로우 | 트리거 | 역할 |
|-----------|--------|------|
| test-pipeline | PR, master/develop push | 유닛 테스트, 타입 체크, ESLint, E2E 테스트 |
| build-frontend | PR, frontend/** 변경 | 프론트엔드 빌드 검증 |
| deploy-frontend | master push | S3 + CloudFront 배포 |
| deploy-backend | v*.*.* 태그 | SAM 배포, Lambda 업데이트 |
| deploy-api-docs | schemas/types 변경 | OpenAPI 자동 생성 + GitHub Pages 배포 |
| security-scan | PR + 주간 스케줄 | 의존성 취약점 검사 |

### 배포 프로세스

```bash
# 프론트엔드 (자동 배포)
git push origin master

# 백엔드 (태그 기반)
git tag v1.0.0
git push origin v1.0.0
```

## API 엔드포인트

**Base URL**: `https://6o4futufni.execute-api.ap-northeast-2.amazonaws.com/prod`

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| /api/search | POST | AI 기반 Hybrid RAG 검색 |
| /api/parts | GET/POST | 부품 목록 조회/등록 |
| /api/parts/{id} | GET | 부품 상세 조회 |
| /api/battery-assessment | POST | 배터리 SOH 평가 |
| /api/material-search | POST | 재질 물성 검색 |
| /api/proposals | POST | 계약 제안 생성 |
| /api/contact | POST | 일반 문의 |
| /api/slack/events | POST | Slack 이벤트 (자동이 2.0) |

**API 문서 (Swagger UI)**: https://dyseo521.github.io/inha-vip-project2025/

## 아키텍처

### RAG 검색 플로우

```
사용자 쿼리 → Titan 임베딩 생성
            ↓
    Hybrid Search (Vector 70% + BM25 30%)
            ↓
    S3 Vectors에서 Top-K 검색
            ↓
    DynamoDB 메타데이터 조회
            ↓
    Claude Haiku 매칭 이유 생성
            ↓
    결과 캐싱 (7일 TTL)
```

### 자동이 2.0 아키텍처

```
CloudWatch Logs → Subscription Filter → Lambda (v1: push)
                                              ↓
                                        Slack 알림
                                              ↓
@멘션 질문 → Lambda (v2: ReAct) → CloudWatch/Metrics 조회
                              → S3 Vectors 장기 기억 검색
                              → Claude 분석 및 응답
```

## 문서

| 문서 | 설명 |
|------|------|
| [API 문서 (Swagger UI)](https://dyseo521.github.io/inha-vip-project2025/) | API 엔드포인트 상세 (자동 생성) |
| [DYNAMODB_SCHEMA.md](docs/DYNAMODB_SCHEMA.md) | DynamoDB 스키마 설계 |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | 개발 가이드 (Lambda 추가, 타입 수정) |
| [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | 로컬 개발 환경 설정 |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | 환경 변수, AWS, Slack 설정 |
| [COST_OPTIMIZATION.md](docs/COST_OPTIMIZATION.md) | 비용 최적화 전략 |
| [JADONG_SETUP.md](docs/JADONG_SETUP.md) | 자동이 Slack 봇 설정 |

## 트러블슈팅

### Bedrock 권한 오류

```bash
# 모델 접근 확인
aws bedrock list-foundation-models --region ap-northeast-2 \
  --query "modelSummaries[?contains(modelId,'anthropic.claude')].modelId"
```

AWS Console → Bedrock → Model access에서 모델 접근 요청 필요.

### 포트 충돌

```bash
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
```

### DynamoDB 테이블 미발견

```bash
npm run docker:up  # Docker 서비스 시작
```

### ESM 모듈 오류

모든 로컬 import에 `.js` 확장자 필수:
```typescript
import { helper } from './utils.js';  // 올바름
import { helper } from './utils';      // 오류
```

자세한 트러블슈팅은 [DEVELOPMENT.md](docs/DEVELOPMENT.md) 참조.

## 라이선스

MIT License

## 문의

- 프로젝트 관련 문의: dyseo521@gmail.com

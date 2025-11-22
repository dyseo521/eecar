# CI/CD 파이프라인 가이드

이 문서는 EECAR 프로젝트의 GitHub Actions CI/CD 파이프라인 사용 가이드입니다.

## 📚 목차

1. [개요](#개요)
2. [워크플로우 설명](#워크플로우-설명)
3. [배포 프로세스](#배포-프로세스)
4. [트러블슈팅](#트러블슈팅)
5. [모범 사례](#모범-사례)

---

## 개요

### 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Repository                     │
└─────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     ┌────────┐      ┌──────────┐    ┌──────────┐
     │   CI   │      │  CD-Dev  │    │CD-Staging│
     │ (PR)   │      │(develop) │    │  (main)  │
     └────────┘      └──────────┘    └──────────┘
                                            │
                                            ▼
                                      ┌──────────┐
                                      │ CD-Prod  │
                                      │ (manual) │
                                      └──────────┘
```

### 환경별 배포 전략

| 환경 | 브랜치 | 트리거 | 승인 | 목적 |
|------|--------|--------|------|------|
| **Development** | `develop` | 자동 (Push) | 불필요 | 개발 및 테스트 |
| **Staging** | `main` | 자동 (Push) | 불필요 | QA 및 통합 테스트 |
| **Production** | `release/*` | 수동 | 필수 | 프로덕션 서비스 |

---

## 워크플로우 설명

### 1️⃣ CI - Pull Request 검증

**파일**: `.github/workflows/ci.yml`

**트리거**:
- PR 생성 시 (`main`, `develop` 대상)
- PR 업데이트 시

**실행 단계**:

```yaml
1. Frontend 검증
   - ESLint 실행
   - TypeScript 타입 체크
   - 프로덕션 빌드

2. Backend 검증
   - ESLint 실행
   - TypeScript 빌드
   - 유닛 테스트

3. SAM Template 검증
   - sam validate --lint

4. E2E 테스트 (선택적)
   - Playwright 테스트
   - Docker Compose로 로컬 서비스 실행

5. 보안 스캔
   - npm audit (high level)
```

**성공 조건**:
- 모든 Lint 검사 통과
- TypeScript 컴파일 오류 없음
- 빌드 성공
- SAM 템플릿 유효성 검증 통과

**실패 시**:
- PR 머지 불가
- 에러 로그 확인 후 수정 필요

---

### 2️⃣ CD-Dev - 개발 환경 배포

**파일**: `.github/workflows/cd-dev.yml`

**트리거**:
- `develop` 브랜치에 Push

**배포 프로세스**:

```bash
1. Frontend 배포
   ├── npm ci && npm run build
   ├── S3 업로드 (캐시 설정 포함)
   └── CloudFront 캐시 무효화 (선택적)

2. Backend 배포
   ├── npm ci && npm run build
   ├── sam build
   └── sam deploy (스택: eecar-dev)

3. 헬스 체크
   └── API 엔드포인트 스모크 테스트
```

**환경 변수**:
- `VITE_API_ENDPOINT_DEV`: Frontend API URL
- `ENVIRONMENT`: `dev`
- `BedrockModelId`: `claude-3-haiku` (비용 최적화)

**배포 시간**: 약 5-7분

---

### 3️⃣ CD-Staging - 스테이징 배포

**파일**: `.github/workflows/cd-staging.yml`

**트리거**:
- `main` 브랜치에 Push

**배포 프로세스**:
- Dev와 동일하지만 다른 AWS 리소스 사용
- 통합 테스트 추가 실행

**차이점**:
- 스택 이름: `eecar-staging`
- 더 엄격한 테스트 실행
- 배포 후 통합 테스트

**배포 시간**: 약 7-10분

---

### 4️⃣ CD-Prod - 프로덕션 배포

**파일**: `.github/workflows/cd-prod.yml`

**트리거**:
- 수동 실행 (`workflow_dispatch`)
- Release 태그 생성 시

**배포 프로세스**:

```bash
1. Pre-deployment 검증
   ├── 전체 테스트 스위트 실행
   ├── SAM 템플릿 검증
   └── 빌드 검증

2. Production 배포 (수동 승인 후)
   ├── Frontend → S3 + CloudFront
   ├── Backend → Lambda (eecar-prod)
   └── 프로덕션 스모크 테스트

3. Rollback (실패 시)
   └── 이전 CloudFormation 스택으로 롤백 안내
```

**특별 보호**:
- GitHub Environment `production` 사용
- 최소 1명의 승인 필요
- 배포 전 대기 시간 (선택적)

**배포 시간**: 약 10-15분 (승인 시간 제외)

---

## 배포 프로세스

### 🔄 일반적인 개발 플로우

```bash
# 1. Feature 브랜치 생성
git checkout -b feature/new-feature

# 2. 개발 및 커밋
git add .
git commit -m "feat: add new feature"

# 3. PR 생성
git push origin feature/new-feature
# GitHub에서 PR 생성 → CI 자동 실행

# 4. CI 통과 후 develop에 머지
# → CD-Dev 자동 실행 (개발 환경 배포)

# 5. QA 완료 후 main에 머지
# → CD-Staging 자동 실행 (스테이징 환경 배포)

# 6. Production 배포 (수동)
# GitHub Actions → CD-Prod → Run workflow
```

### 🚀 Production 배포 상세 절차

1. **Staging 검증**
   ```bash
   # Staging 환경에서 충분한 테스트 완료
   - 기능 테스트
   - 성능 테스트
   - 보안 테스트
   ```

2. **Release 태그 생성** (선택적)
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

3. **수동 배포 실행**
   - GitHub → Actions → CD - Deploy to Production
   - "Run workflow" 클릭
   - 확인 문구 입력: `DEPLOY`
   - "Run workflow" 실행

4. **승인 프로세스**
   - 지정된 승인자가 배포 검토
   - 승인 후 배포 진행

5. **모니터링**
   - CloudWatch 로그 확인
   - API 엔드포인트 모니터링
   - 에러 모니터링

---

## 트러블슈팅

### ❌ CI 실패

#### Lint 에러
```bash
# 로컬에서 확인
cd frontend && npm run lint
cd backend && npm run lint

# 자동 수정
npm run lint -- --fix
```

#### TypeScript 에러
```bash
# 타입 체크
npm run type-check

# shared 패키지 빌드 확인
cd shared && npm run build
```

#### 빌드 실패
```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

### ❌ CD 배포 실패

#### AWS 인증 실패
```
Error: Credentials could not be loaded
```

**해결책**:
1. GitHub Secrets 확인
   - `AWS_ACCESS_KEY_ID_*`
   - `AWS_SECRET_ACCESS_KEY_*`
2. IAM 사용자 권한 확인
3. Access Key 만료 확인

#### SAM 배포 실패
```
Error: Stack already exists
```

**해결책**:
```bash
# CloudFormation 콘솔에서 스택 상태 확인
# 필요 시 수동 삭제 후 재배포
aws cloudformation delete-stack --stack-name eecar-dev
```

#### S3 업로드 실패
```
Error: Access Denied
```

**해결책**:
1. S3 버킷 존재 확인
2. IAM 권한 확인 (s3:PutObject, s3:DeleteObject)
3. 버킷 이름 확인 (Secrets)

#### CloudFront 캐시 무효화 실패

**해결책**:
- `CLOUDFRONT_DISTRIBUTION_ID_*` Secret 확인
- CloudFront 분배 ID 올바른지 확인
- 해당 Secret이 없으면 이 단계는 건너뜀 (continue-on-error: true)

---

### ⚠️ 프로덕션 배포 후 문제

#### 롤백 필요 시

```bash
# CloudFormation 콘솔 사용
1. AWS Console → CloudFormation
2. eecar-prod 스택 선택
3. "Update" → "Replace current template"
4. 이전 템플릿으로 복원

# 또는 CLI 사용
aws cloudformation update-stack \
  --stack-name eecar-prod \
  --use-previous-template
```

#### API 엔드포인트 응답 없음

```bash
# Lambda 로그 확인
aws logs tail /aws/lambda/eecar-prod-VectorSearchFunction --follow

# API Gateway 로그 확인
# CloudWatch → Log groups → API Gateway execution logs
```

---

## 모범 사례

### ✅ 커밋 메시지

```bash
# Conventional Commits 사용
feat: 새로운 기능
fix: 버그 수정
docs: 문서 수정
style: 코드 포맷팅
refactor: 리팩토링
test: 테스트 추가
chore: 빌드/설정 변경

# 예시
git commit -m "feat: add vector search caching"
git commit -m "fix: resolve DynamoDB timeout issue"
```

### ✅ PR 생성

1. **작은 단위로 분리**
   - 한 PR에 하나의 기능/버그 수정
   - 500줄 이하 권장

2. **명확한 설명**
   ```markdown
   ## 변경 사항
   - 벡터 검색 결과 캐싱 추가

   ## 테스트
   - 단위 테스트 추가
   - 로컬에서 검증 완료

   ## 스크린샷
   (필요 시)
   ```

3. **리뷰어 지정**
   - 최소 1명의 리뷰어

### ✅ 환경 관리

1. **환경 변수 분리**
   - `.env` 파일 절대 커밋 금지
   - `.env.example` 최신 상태 유지

2. **Secrets 관리**
   - 주기적으로 Access Key 교체
   - 최소 권한 원칙 준수

3. **비용 모니터링**
   - AWS Cost Explorer 확인
   - Bedrock 사용량 모니터링

### ✅ 배포 체크리스트

#### Production 배포 전
- [ ] Staging 환경 테스트 완료
- [ ] 데이터베이스 마이그레이션 필요 여부 확인
- [ ] 환경 변수 변경 사항 확인
- [ ] 배포 영향도 분석
- [ ] 롤백 계획 수립
- [ ] 팀원에게 배포 공지

#### Production 배포 후
- [ ] 헬스 체크 확인
- [ ] 주요 기능 동작 확인
- [ ] CloudWatch 메트릭 모니터링 (10분)
- [ ] 에러 로그 확인
- [ ] 사용자 피드백 모니터링

---

## 📊 모니터링

### CloudWatch 대시보드

주요 메트릭:
- Lambda 실행 시간
- Lambda 에러율
- DynamoDB 읽기/쓰기 용량
- API Gateway 요청 수
- Bedrock 호출 횟수

### 알림 설정 (권장)

```bash
# SNS 토픽 생성
aws sns create-topic --name eecar-prod-alerts

# Lambda 에러 알림
aws cloudwatch put-metric-alarm \
  --alarm-name eecar-prod-lambda-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

---

## 🔗 관련 문서

- [GitHub Secrets 설정 가이드](.github/SECRETS.md)
- [README](../README.md)
- [API 문서](../docs/API.md)
- [DynamoDB 스키마](../docs/DYNAMODB_SCHEMA.md)

---

## 🆘 도움이 필요하신가요?

- GitHub Issues에서 질문하기
- 팀 Slack 채널: #eecar-devops
- 프로젝트 관리자: dyseo521@gmail.com

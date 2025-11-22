# GitHub Secrets 설정 가이드

이 프로젝트의 CI/CD 파이프라인을 실행하기 위해 필요한 GitHub Secrets입니다.

## 📋 필수 Secrets 목록

### 🔐 AWS Credentials

#### Development 환경
```
AWS_ACCESS_KEY_ID_DEV
AWS_SECRET_ACCESS_KEY_DEV
```

#### Staging 환경
```
AWS_ACCESS_KEY_ID_STAGING
AWS_SECRET_ACCESS_KEY_STAGING
```

#### Production 환경
```
AWS_ACCESS_KEY_ID_PROD
AWS_SECRET_ACCESS_KEY_PROD
```

---

### 🪣 S3 Buckets (Frontend 배포)

#### Development
```
S3_BUCKET_DEV=eecar-frontend-dev
```

#### Staging
```
S3_BUCKET_STAGING=eecar-frontend-staging
```

#### Production
```
S3_BUCKET_PROD=eecar-frontend-prod
```

---

### 📦 SAM Deployment Buckets (Backend 배포)

#### Development
```
SAM_DEPLOYMENT_BUCKET_DEV=eecar-sam-deployments-dev
```

#### Staging
```
SAM_DEPLOYMENT_BUCKET_STAGING=eecar-sam-deployments-staging
```

#### Production
```
SAM_DEPLOYMENT_BUCKET_PROD=eecar-sam-deployments-prod
```

---

### 🌐 CloudFront Distribution IDs (선택적)

#### Development
```
CLOUDFRONT_DISTRIBUTION_ID_DEV=E1234567890ABC
```

#### Staging
```
CLOUDFRONT_DISTRIBUTION_ID_STAGING=E1234567890DEF
```

#### Production
```
CLOUDFRONT_DISTRIBUTION_ID_PROD=E1234567890GHI
```

---

### 🔗 API Endpoints (Frontend 빌드용)

#### Development
```
VITE_API_ENDPOINT_DEV=https://dev-api.eecar.com
```

#### Staging
```
VITE_API_ENDPOINT_STAGING=https://staging-api.eecar.com
```

#### Production
```
VITE_API_ENDPOINT_PROD=https://api.eecar.com
```

---

## 🚀 Secrets 설정 방법

### 1. GitHub Repository 설정

1. GitHub 저장소로 이동
2. **Settings** → **Secrets and variables** → **Actions** 클릭
3. **New repository secret** 버튼 클릭
4. 위의 목록에서 필요한 Secret을 하나씩 추가

### 2. Environment 설정 (권장)

더 나은 보안을 위해 Environment별 Secrets 사용:

1. **Settings** → **Environments** 클릭
2. 환경 생성: `development`, `staging`, `production`
3. 각 환경에 해당하는 Secrets 추가

#### Production 환경 보호 규칙 설정 (중요!)

1. `production` 환경 클릭
2. **Protection rules** 설정:
   - ✅ **Required reviewers**: 최소 1명의 리뷰어 필요
   - ✅ **Wait timer**: 10분 대기 (선택적)
   - ✅ **Deployment branches**: `main` 브랜치만 허용

---

## 📝 AWS 리소스 준비

### S3 Buckets 생성

```bash
# Development
aws s3 mb s3://eecar-frontend-dev
aws s3 mb s3://eecar-sam-deployments-dev

# Staging
aws s3 mb s3://eecar-frontend-staging
aws s3 mb s3://eecar-sam-deployments-staging

# Production
aws s3 mb s3://eecar-frontend-prod
aws s3 mb s3://eecar-sam-deployments-prod
```

### S3 Bucket Policy (Frontend용)

Frontend 버킷에 퍼블릭 읽기 권한 설정:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::eecar-frontend-prod/*"
    }
  ]
}
```

또는 CloudFront를 사용하는 경우 OAI(Origin Access Identity) 설정.

### IAM 사용자 생성 및 권한 설정

각 환경별로 IAM 사용자 생성 (또는 OIDC 사용 권장):

```bash
# Development 사용자 생성
aws iam create-user --user-name github-actions-dev

# 필요한 권한 부여
aws iam attach-user-policy \
  --user-name github-actions-dev \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

**권장**: GitHub Actions OIDC 사용 (Access Key 대신)

---

## 🔒 보안 권장사항

1. **최소 권한 원칙**: 각 환경별로 필요한 최소한의 권한만 부여
2. **Access Key 정기 교체**: 3개월마다 교체 권장
3. **Production 보호**: Environment Protection Rules 활성화
4. **Secrets 암호화**: GitHub가 자동으로 암호화하지만, 민감한 정보는 AWS Secrets Manager 사용 고려
5. **감사 로그**: CloudTrail 활성화하여 배포 활동 모니터링

---

## ✅ 설정 확인

모든 Secrets가 올바르게 설정되었는지 확인:

```bash
# GitHub CLI 사용
gh secret list

# 또는 GitHub Actions 탭에서 워크플로우 실행 시 에러 확인
```

---

## 🆘 문제 해결

### "Error: Credentials could not be loaded"
- AWS Access Key ID와 Secret Access Key가 올바른지 확인
- IAM 사용자에게 필요한 권한이 있는지 확인

### "Error: Access Denied"
- S3 버킷 권한 확인
- CloudFormation 스택 생성 권한 확인
- IAM 정책 검토

### "Error: Stack already exists"
- 스택 이름이 중복되지 않도록 확인
- 기존 스택 삭제 또는 다른 이름 사용

---

## 📚 참고 자료

- [GitHub Actions Secrets 문서](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [AWS SAM CLI 문서](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [GitHub OIDC 설정 가이드](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)

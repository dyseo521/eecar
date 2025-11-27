# EECAR AWS 배포 가이드

> 최종 업데이트: 2024-11-27
> 배포 리전: ap-northeast-2 (서울)

## 📋 목차

1. [배포 전 체크리스트](#배포-전-체크리스트)
2. [AWS 계정 확인](#aws-계정-확인)
3. [배포할 Lambda 함수 목록](#배포할-lambda-함수-목록)
4. [프론트엔드-백엔드 호환성](#프론트엔드-백엔드-호환성)
5. [배포 절차](#배포-절차)
6. [배포 후 설정](#배포-후-설정)
7. [비용 예측](#비용-예측)
8. [GitHub 보안](#github-보안)
9. [트러블슈팅](#트러블슈팅)

---

## 배포 전 체크리스트

### ✅ 필수 도구 설치 확인

```bash
# Node.js 20+
node --version  # v20.x.x 이상

# AWS CLI v2
aws --version  # aws-cli/2.x.x 이상

# SAM CLI
sam --version  # SAM CLI, version 1.x.x 이상

# TypeScript
tsc --version  # Version 5.x.x 이상
```

### ✅ 빌드 상태 확인

```bash
# Shared 타입 빌드 완료
ls shared/dist/types/index.d.ts  # 파일 존재 확인

# Backend TypeScript 컴파일 완료
ls backend/dist/functions/  # 9개 함수 디렉토리 존재 확인

# SAM 빌드 완료
ls infrastructure/.aws-sam/build/template.yaml  # 파일 존재 확인
```

---

## AWS 계정 확인

### 현재 설정된 AWS 계정 확인

```bash
aws sts get-caller-identity
```

**출력 예시**:
```json
{
    "UserId": "AIDAXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

**⚠️ 주의사항**:
- 배포는 위 계정의 `ap-northeast-2` (서울) 리전에 이루어집니다
- IAM 사용자는 다음 권한이 필요합니다 (**2가지 옵션 중 선택**):

#### Option 1: AWS Managed Policies (권장 - 간편)

AWS Console → IAM → Users → [사용자 선택] → Permissions → Add permissions에서 다음 **8개 Managed Policies** 연결:

```
1. AWSCloudFormationFullAccess
2. IAMFullAccess
3. AWSLambda_FullAccess
4. AmazonAPIGatewayAdministrator
5. AmazonS3FullAccess
6. AmazonDynamoDBFullAccess
7. AmazonSNSFullAccess
8. CloudWatchLogsFullAccess
```

#### Option 2: Custom IAM Policy (최소 권한 원칙)

보안을 위해 IAM 정책 파일(`docs/IAM_POLICY_SAM_DEPLOY.json`)은 로컬에만 보관되며 GitHub에 업로드되지 않습니다.

**직접 생성 방법**:
1. AWS Console → IAM → Policies → Create policy
2. JSON 탭 선택
3. `docs/IAM_POLICY_SAM_DEPLOY.json` 파일 내용 복사/붙여넣기
4. 정책 이름: `EECARSAMDeployPolicy`
5. 생성 후 IAM 사용자에게 연결

**⚠️ 중요**:
- Bedrock 권한은 **배포 시 불필요**합니다
- Bedrock은 Lambda 함수 **실행 시**에만 필요하며, template.yaml에 이미 Lambda 실행 역할 정의가 포함되어 있습니다
- IAM 정책 JSON 파일은 보안상 `.gitignore`에 추가되어 있습니다

### AWS Credentials 재설정 (필요 시)

```bash
aws configure
```

입력값:
```
AWS Access Key ID [****************ZKM5]: <새 Access Key>
AWS Secret Access Key [****************BtgH]: <새 Secret Key>
Default region name [ap-northeast-2]: ap-northeast-2
Default output format [None]: json
```

---

## 배포할 Lambda 함수 목록

총 **9개의 Lambda 함수**가 배포됩니다:

### 1순위: 핵심 검색 기능 (프론트엔드에서 사용)

| 함수명 | 엔드포인트 | 설명 | 프론트엔드 사용 |
|--------|------------|------|----------------|
| **VectorSearchFunction** | `POST /api/search` | AI 벡터 검색 (Bedrock Claude + Titan) | ✅ BuyerSearch.tsx:109 |
| **GetPartsFunction** | `GET /api/parts` | 부품 목록 조회 | ✅ BuyerSearch.tsx:195 |
| **GetPartsFunction** | `GET /api/parts/{id}` | 부품 상세 조회 | ✅ PartDetail.tsx:91 |
| **BatteryHealthAssessmentFunction** | `POST /api/battery-health` | 배터리 SOH 기반 검색 | ✅ BuyerSearch.tsx:136 |
| **MaterialPropertySearchFunction** | `POST /api/material-search` | 재질 물성 기반 검색 | ✅ BuyerSearch.tsx:173 |

### 2순위: 부품 등록 및 알림

| 함수명 | 엔드포인트 | 설명 | 프론트엔드 사용 |
|--------|------------|------|----------------|
| **PartRegistrationFunction** | `POST /api/parts` | 부품 등록 + 벡터 생성 | ✅ SellerDashboard.tsx:108 |
| **WatchPartFunction** | `POST /api/watch` | 알림 등록 | ✅ BuyerSearch.tsx:238 |
| **ProposalFunction** | `POST /api/proposals` | 계약 제안 생성 | ✅ PartDetail.tsx:112 |

### 3순위: 내부 함수 (자동 호출)

| 함수명 | 엔드포인트 | 설명 | 호출 방식 |
|--------|------------|------|-----------|
| **ComplianceCheckFunction** | (없음) | 규성 검증 | PartRegistrationFunction에서 Lambda 호출 |

### 4순위: 유틸리티

| 함수명 | 엔드포인트 | 설명 | 사용 용도 |
|--------|------------|------|-----------|
| **SyntheticDataFunction** | `POST /api/synthetic` | 합성 데이터 생성 | 테스트용 (선택사항) |

---

## 프론트엔드-백엔드 호환성

### ✅ 호환성 검증 완료 (2024-11-27)

모든 프론트엔드 API 호출이 Lambda 함수 엔드포인트와 **100% 일치**합니다:

| 프론트엔드 호출 | Lambda 함수 | 상태 |
|----------------|------------|------|
| `POST /api/search` | VectorSearchFunction | ✅ 일치 |
| `GET /api/parts` | GetPartsFunction | ✅ 일치 |
| `GET /api/parts/{id}` | GetPartsFunction | ✅ 일치 |
| `POST /api/parts` | PartRegistrationFunction | ✅ 일치 |
| `POST /api/battery-health` | BatteryHealthAssessmentFunction | ✅ 일치 |
| `POST /api/material-search` | MaterialPropertySearchFunction | ✅ 일치 |
| `POST /api/watch` | WatchPartFunction | ✅ 일치 |
| `POST /api/proposals` | ProposalFunction | ✅ 일치 |

### 데이터 스키마 호환성

**Shared Types** (`shared/types/index.ts`)가 프론트엔드와 백엔드에서 동일하게 사용되므로 타입 안정성 보장됨:

- `Part`, `PartCategory`, `PartCondition`
- `SearchRequest`, `SearchResponse`, `MatchResult`
- `BatteryHealthInfo`, `BatteryFilters`
- `AdvancedMaterialFilters`, `MaterialComposition`
- `Proposal`, `WatchRequest`, `Notification`

---

## 배포 절차

### 1단계: 사전 빌드

```bash
# 프로젝트 루트로 이동
cd ~/eecar

# Shared 타입 빌드
cd shared
npm run build

# Backend TypeScript 컴파일
cd ../backend
npm run build

# 빌드 결과 확인
ls -la dist/functions/
# 출력: battery-health-assessment, compliance-check, get-parts,
#       material-property-search, part-registration, proposal,
#       synthetic-data, vector-search, watch-part
```

### 2단계: SAM 빌드

```bash
cd ../infrastructure
sam build
```

**예상 출력**:
```
Build Succeeded

Built Artifacts  : .aws-sam/build
Built Template   : .aws-sam/build/template.yaml
```

**경고 무시**: `package.json file not found` 경고는 무시해도 됩니다. Lambda 함수들이 이미 컴파일된 JavaScript이고, AWS SDK는 Lambda 런타임에 포함되어 있습니다.

### 3단계: SAM 배포

```bash
# 첫 배포 (guided mode)
sam deploy --guided
```

#### 배포 설정 입력

```
Stack Name [eecar-stack]: eecar-stack
AWS Region [us-east-1]: ap-northeast-2
Confirm changes before deploy [Y/n]: Y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
Save arguments to samconfig.toml [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default
```

#### 배포 승인

CloudFormation 변경사항이 표시됩니다. 다음과 같은 리소스가 생성됩니다:

```
CloudFormation stack changeset
-----------------------------------------------------------------
Operation   LogicalResourceId                 ResourceType
-----------------------------------------------------------------
+ Add       VectorSearchFunction              AWS::Lambda::Function
+ Add       BatteryHealthAssessmentFunction   AWS::Lambda::Function
+ Add       MaterialPropertySearchFunction    AWS::Lambda::Function
+ Add       GetPartsFunction                  AWS::Lambda::Function
+ Add       PartRegistrationFunction          AWS::Lambda::Function
+ Add       WatchPartFunction                 AWS::Lambda::Function
+ Add       ProposalFunction                  AWS::Lambda::Function
+ Add       ComplianceCheckFunction           AWS::Lambda::Function
+ Add       SyntheticDataFunction             AWS::Lambda::Function
+ Add       EECARApi                          AWS::ApiGateway::RestApi
+ Add       PartsTable                        AWS::DynamoDB::Table
+ Add       VectorsBucket                     AWS::S3::Bucket
+ Add       DocumentsBucket                   AWS::S3::Bucket
+ Add       NotificationTopic                 AWS::SNS::Topic
+ Add       (CloudWatch LogGroups 9개)
-----------------------------------------------------------------
```

프롬프트가 나타나면 **y** 입력:
```
Deploy this changeset? [y/N]: y
```

배포 소요 시간: **5-10분**

### 4단계: 배포 완료 확인

배포가 완료되면 다음과 같은 출력이 표시됩니다:

```
CloudFormation outputs from deployed stack
------------------------------------------------------------
Outputs
------------------------------------------------------------
Key                 ApiEndpoint
Description         API Gateway endpoint URL
Value               https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/prod

Key                 PartsTableName
Description         DynamoDB table name
Value               eecar-parts-table

Key                 VectorsBucketName
Description         S3 bucket for vector embeddings
Value               eecar-vectors-123456789012

Key                 DocumentsBucketName
Description         S3 bucket for compliance documents
Value               eecar-documents-123456789012

Key                 NotificationTopicArn
Description         SNS topic ARN for notifications
Value               arn:aws:sns:ap-northeast-2:123456789012:eecar-notifications
------------------------------------------------------------
```

**API Endpoint URL을 복사**하세요! 프론트엔드 설정에 필요합니다.

---

## 배포 후 설정

### 1. Bedrock 모델 접근 권한 활성화 (필수)

AWS Console에서 수동으로 활성화해야 합니다:

1. **AWS Console 접속**: https://console.aws.amazon.com/bedrock/
2. **리전 변경**: 우측 상단에서 **서울(ap-northeast-2)** 선택
3. **Model access** 메뉴 클릭 (좌측 사이드바)
4. **Enable specific models** 클릭
5. **다음 모델 체크**:
   - ✅ **Claude 3 Haiku** (anthropic.claude-3-haiku-20240307-v1:0)
   - ✅ **Titan Embeddings V2** (amazon.titan-embed-text-v2:0)
6. **Request model access** 클릭
7. 승인 대기 (일반적으로 즉시 승인됨)

**확인 방법**:
```bash
aws bedrock list-foundation-models --region ap-northeast-2 --query 'modelSummaries[?contains(modelId, `claude-3-haiku`)].modelId'
```

### 2. 프론트엔드 환경 변수 설정

`frontend/.env` 파일 생성:

```bash
cd ~/eecar/frontend
```

`.env` 파일 내용:
```env
VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/prod
```

**⚠️ 중요**: `xxxxxxxxxx` 부분을 실제 API Gateway 엔드포인트로 교체하세요.

### 3. 프론트엔드 재빌드 및 배포

```bash
npm run build
```

빌드된 `dist/` 폴더를 정적 호스팅 서비스에 배포:

#### Vercel 배포

```bash
npm install -g vercel
vercel
```

#### Netlify 배포

```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

#### S3 + CloudFront 배포

```bash
# S3 버킷 생성 (한 번만)
aws s3 mb s3://eecar-frontend-$(aws sts get-caller-identity --query Account --output text)

# 정적 웹호스팅 활성화
aws s3 website s3://eecar-frontend-$(aws sts get-caller-identity --query Account --output text) \
  --index-document index.html \
  --error-document index.html

# 빌드 파일 업로드
aws s3 sync dist/ s3://eecar-frontend-$(aws sts get-caller-identity --query Account --output text)/ \
  --delete \
  --acl public-read
```

### 4. 초기 데이터 생성 (선택사항)

배포된 API로 테스트 데이터 생성:

```bash
API_ENDPOINT="https://xxxxxxxxxx.execute-api.ap-northeast-2.amazonaws.com/prod"

# 배터리 10개 생성
curl -X POST ${API_ENDPOINT}/api/synthetic \
  -H "Content-Type: application/json" \
  -d '{
    "category": "battery",
    "count": 10
  }'

# 모터 5개 생성
curl -X POST ${API_ENDPOINT}/api/synthetic \
  -H "Content-Type: application/json" \
  -d '{
    "category": "motor",
    "count": 5
  }'
```

---

## 비용 예측

### 월 예상 비용 (저트래픽 시나리오)

| 서비스 | 사용량 | 월 비용 (USD) |
|--------|--------|---------------|
| **Lambda** | 100만 요청/월 (512MB, 5초 평균) | $3-5 |
| **API Gateway** | 100만 요청/월 | $3.50 |
| **DynamoDB** | 10만 읽기, 1만 쓰기 (On-Demand) | $2-4 |
| **S3** | 10GB 저장, 1만 GET 요청 | $0.50 |
| **Bedrock Claude Haiku** | 500 AI 쿼리/월 (2K 입력, 1K 출력) | $5-10 |
| **Bedrock Titan Embeddings** | 1,000 임베딩/월 | $0.10 |
| **SNS** | 1,000 알림/월 | $0.50 |
| **CloudWatch Logs** | 1GB 로그 (7일 보존) | $0.50 |
| **CloudFront** (프론트엔드) | 10GB 전송 | $1 |

**총 예상 비용**: **$16-25/월**

### 비용 최적화 팁

1. **Claude Haiku 우선 사용**: Sonnet 대비 1/12 비용
2. **결과 캐싱**: DynamoDB TTL로 7일간 캐싱하여 중복 AI 호출 방지
3. **Lambda 메모리 조정**: 512MB로 설정 (필요시만 1024MB)
4. **CloudWatch Logs 보존 기간**: 7일로 제한
5. **S3 벡터 저장**: OpenSearch Serverless ($700+/월) 대신 사용

---

## GitHub 보안

### ✅ 안전하게 커밋 가능한 파일

다음 파일들은 **민감한 정보가 없으므로** GitHub에 안전하게 푸시할 수 있습니다:

- ✅ `infrastructure/template.yaml` - IAM 역할 정의만 있고 credentials 없음
- ✅ `backend/src/**/*.ts` - Lambda 함수 소스 (환경 변수만 참조)
- ✅ `shared/types/index.ts` - 타입 정의만
- ✅ `.env.example` - 예시 파일 (실제 값 없음)
- ✅ `README.md`, `docs/**/*.md` - 문서
- ✅ `package.json`, `tsconfig.json` - 설정 파일

### ❌ 절대 커밋하면 안 되는 파일

`.gitignore`가 다음을 자동으로 제외합니다:

- ❌ `.env`, `.env.local`, `.env.production` - 실제 API 키/엔드포인트
- ❌ `samconfig.toml` - AWS 배포 설정 (계정 정보)
- ❌ `.aws/` - AWS credentials
- ❌ `node_modules/` - 의존성
- ❌ `dist/`, `build/`, `.aws-sam/` - 빌드 아티팩트

### .gitignore 확인

```bash
cat .gitignore
```

**핵심 내용**:
```gitignore
# Environment variables
.env
.env.local
.env.production

# AWS
.aws-sam/
samconfig.toml

# Build outputs
dist/
build/
```

### Git 푸시 전 최종 확인

```bash
# 커밋될 파일 확인
git status

# 민감한 정보 검색
git grep -i "secret\|password\|api_key" -- ':(exclude).env.example'

# 실제 값 검색 (AKIA로 시작하는 AWS Access Key)
git grep -i "AKIA"
```

**출력이 없으면** 안전합니다!

---

## 트러블슈팅

### 문제 1: Bedrock 권한 오류

**에러**:
```
AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel
```

**해결**:
1. AWS Console → Bedrock → Model access에서 모델 활성화
2. IAM 사용자에 Bedrock 권한 추가:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": "*"
        }
    ]
}
```

### 문제 2: Lambda 타임아웃

**에러**:
```
Task timed out after 30.00 seconds
```

**해결**:

`infrastructure/template.yaml`에서 타임아웃 증가:
```yaml
VectorSearchFunction:
  Type: AWS::Serverless::Function
  Properties:
    Timeout: 60  # 30 → 60으로 증가
```

재배포:
```bash
sam build && sam deploy
```

### 문제 3: DynamoDB 용량 부족

**에러**:
```
ProvisionedThroughputExceededException
```

**해결**:

On-Demand 모드에서는 자동 스케일링되므로 발생하지 않아야 합니다. 만약 발생한다면:

1. CloudWatch에서 실제 읽기/쓰기 용량 확인
2. 필요시 Provisioned 모드로 전환

### 문제 4: CORS 에러

**에러**:
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

**해결**:

`template.yaml`의 CORS 설정 확인:
```yaml
Globals:
  Api:
    Cors:
      AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
      AllowHeaders: "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
      AllowOrigin: "'*'"  # 프로덕션에서는 실제 도메인으로 제한
```

### 문제 5: 배포 중 CloudFormation 롤백

**에러**:
```
CREATE_FAILED: Resource creation cancelled
```

**해결**:

1. CloudFormation 콘솔에서 스택 이벤트 확인
2. 실패 원인 확인 (주로 권한 문제)
3. 스택 삭제 후 재배포:
```bash
aws cloudformation delete-stack --stack-name eecar-stack --region ap-northeast-2
# 삭제 완료 후 (5-10분)
sam deploy --guided
```

### 문제 6: AWS CLI 인증 실패

**에러**:
```
IncompleteSignatureException: Invalid key=value pair
```

**해결**:

Credentials 재설정:
```bash
aws configure
```

또는 `~/.aws/credentials` 파일 확인:
```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
```

---

## 재배포 (업데이트)

코드 변경 후 재배포:

```bash
# 1. Backend 재빌드
cd ~/eecar/backend
npm run build

# 2. SAM 재빌드 및 배포
cd ../infrastructure
sam build
sam deploy  # --guided 없이 실행 (samconfig.toml 사용)
```

**변경사항만 배포**되며, 소요 시간은 **2-5분**입니다.

---

## 배포 삭제 (Cleanup)

모든 AWS 리소스 삭제:

```bash
# CloudFormation 스택 삭제
aws cloudformation delete-stack --stack-name eecar-stack --region ap-northeast-2

# S3 버킷 비우기 및 삭제 (수동)
aws s3 rm s3://eecar-vectors-YOUR_ACCOUNT_ID --recursive
aws s3 rb s3://eecar-vectors-YOUR_ACCOUNT_ID

aws s3 rm s3://eecar-documents-YOUR_ACCOUNT_ID --recursive
aws s3 rb s3://eecar-documents-YOUR_ACCOUNT_ID
```

**⚠️ 주의**: 삭제 후 복구 불가능합니다!

---

## 지원

문제가 발생하면:

1. **CloudWatch Logs** 확인: AWS Console → CloudWatch → Log groups → `/aws/lambda/eecar-*`
2. **CloudFormation Events** 확인: AWS Console → CloudFormation → eecar-stack → Events
3. **GitHub Issues**: https://github.com/your-repo/eecar/issues
4. **이메일**: dyseo521@gmail.com

---

**배포 성공을 기원합니다! 🚀**

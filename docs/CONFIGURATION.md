# 설정 가이드

## 환경 변수

### 프론트엔드 (.env)

| 변수 | 설명 | 예시 |
|------|------|------|
| `VITE_API_URL` | API Gateway URL | `https://xxx.execute-api.ap-northeast-2.amazonaws.com/prod` |

**로컬 개발**:
```env
VITE_API_URL=http://localhost:3001
```

**프로덕션**:
```env
VITE_API_URL=https://6o4futufni.execute-api.ap-northeast-2.amazonaws.com/prod
```

### 백엔드 (SAM template.yaml)

Lambda 함수의 환경 변수는 `infrastructure/template.yaml`의 Globals 섹션에서 설정:

```yaml
Globals:
  Function:
    Environment:
      Variables:
        PARTS_TABLE_NAME: !Ref PartsTable
        VECTORS_BUCKET_NAME: !Ref VectorsBucket
        DOCUMENTS_BUCKET_NAME: !Ref DocumentsBucket
        SNS_TOPIC_ARN: !Ref NotificationTopic
        BEDROCK_MODEL_ID: anthropic.claude-3-haiku-20240307-v1:0
```

## Slack 설정

### Webhook URL 변경

**로컬 개발**:

`backend/local-server/index.js` 수정:
```javascript
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/YOUR/NEW/WEBHOOK';
```

**프로덕션**:

1. AWS Parameter Store 업데이트:
```bash
aws ssm put-parameter \
  --name /eecar/slack/webhook-url \
  --value "https://hooks.slack.com/services/YOUR/NEW/WEBHOOK" \
  --type SecureString \
  --overwrite \
  --region ap-northeast-2
```

2. GitHub Secrets 업데이트:
   - Settings → Secrets → `SLACK_WEBHOOK_URL` 수정

### Webhook URL 테스트

```bash
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'
```

### 자동이 2.0 Slack App 설정

1. **Slack App 생성**: https://api.slack.com/apps
2. **Event Subscriptions 활성화**:
   - Request URL: `https://{API_GATEWAY}/prod/api/slack/events`
   - Subscribe to: `app_mention`, `message.channels`
3. **OAuth & Permissions**:
   - `chat:write`, `app_mentions:read`, `channels:history`
4. **Slash Commands**:
   - `/자동이 상태` - Lambda 상태 조회
   - `/자동이 분석 <에러>` - 에러 분석

## AWS 설정

### 리전

**배포 리전**: `ap-northeast-2` (서울)

모든 AWS 서비스가 단일 리전에 배포되어 교차 리전 비용 없음.

### Bedrock 모델 활성화

AWS Console → Bedrock → Model access에서 다음 모델 접근 요청:

- Claude 3 Haiku (기본)
- Claude 3.5 Sonnet (선택)
- Titan Embeddings G2 - Text v2

**확인 명령**:
```bash
aws bedrock list-foundation-models --region ap-northeast-2 \
  --query "modelSummaries[?contains(modelId,'anthropic.claude')].modelId"
```

### S3 버킷

| 버킷 | 용도 |
|------|------|
| `dyseo521-eecar-demo-web-service-12234628` | 프론트엔드 정적 파일 |
| `dyseo521-eecar-aws-sam-12234628` | SAM 빌드 아티팩트 |
| `eecar-vectors-index-12234628` | 벡터 저장소 (S3 Vectors) |
| `eecar-documents-xxx` | 규정 문서 저장 |

### CloudWatch 설정

**로그 보존 기간**: 7일 (비용 최적화)

**X-Ray 추적**: Lambda, API Gateway 전 구간 활성화

## GitHub Secrets (CI/CD)

| Secret | 설명 |
|--------|------|
| `AWS_ROLE_ARN` | IAM Role ARN (OIDC 인증) |
| `AWS_REGION` | `ap-northeast-2` |
| `S3_FRONTEND_BUCKET` | 프론트엔드 S3 버킷 이름 |
| `SAM_S3_BUCKET` | SAM 빌드 아티팩트 버킷 |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront Distribution ID |
| `CLOUDFRONT_DISTRIBUTION_DOMAIN` | CloudFront 도메인 |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |

## OIDC 설정

GitHub Actions에서 AWS 리소스 접근을 위한 OIDC 설정.

### OIDC Provider 생성

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

⚠️ **주의**: Audience는 `sts.amazonaws.com` (`http://` 없음, 끝에 `/` 없음)

### IAM Role Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/eecar:*"
        }
      }
    }
  ]
}
```

### 필요한 IAM 권한

- Lambda 함수 생성/업데이트/삭제
- DynamoDB 테이블 관리
- S3 버킷 접근 (프론트엔드, SAM, 벡터, 문서)
- CloudFormation 스택 관리
- CloudFront 캐시 무효화
- CloudWatch Logs 구독 필터 설정
- IAM 역할 생성 (CAPABILITY_IAM)

상세 IAM 정책은 `docs/IAM_POLICY_*.json` 참조.

## SNS 알림 설정

**알림 수신 이메일**: `inha2025vip@gmail.com`

**구독 변경**:
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-2:ACCOUNT_ID:eecar-notifications \
  --protocol email \
  --notification-endpoint your-email@example.com
```

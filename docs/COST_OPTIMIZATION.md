# 비용 최적화 전략

## 현재 구현된 최적화

### 1. 서버리스 아키텍처

- 사용량 기반 과금
- 유휴 시간 비용 없음
- 자동 스케일링

### 2. Lambda 메모리 최적화

| 함수 유형 | 메모리 | 이유 |
|----------|--------|------|
| 검색/조회 | 512MB | 비용 최적화 |
| 임베딩 생성 | 1024MB | 성능 요구 |

### 3. DynamoDB 온디맨드 모드

- 저/가변 트래픽에 유리
- 사전 용량 예측 불필요
- 자동 스케일링

### 4. 이중 캐싱 전략

| 레이어 | TTL | 저장소 |
|--------|-----|--------|
| 백엔드 | 7일 | DynamoDB |
| 프론트엔드 | 30분 | TanStack Query |

**효과**: API 호출 90% 감소

### 5. Claude Haiku 우선 사용

| 모델 | 비용 | 용도 |
|------|------|------|
| Haiku | 1x (기준) | 기본 검색, 매칭 이유 생성 |
| Sonnet | 12x | 복잡한 추론 필요 시만 |

### 6. S3 기반 벡터 저장

| 솔루션 | 월 비용 | 절감률 |
|--------|---------|--------|
| OpenSearch Serverless | $700+ | - |
| S3 Vectors | $1 | **99.8%** |

### 7. Manifest 파일 사용

`vectors-manifest.json`으로 S3 LIST API 호출 최소화.

### 8. CloudWatch 로그 보존 단축

**보존 기간**: 7일

### 9. 단일 리전 배포

모든 서비스 `ap-northeast-2`에 배포하여 교차 리전 데이터 전송 비용 없음.

### 10. 병렬 처리

S3 벡터 로딩 및 Claude API 호출 병렬화로 **67% 속도 향상**.

## 예상 월 비용

### 트래픽 가정

- 일 100명 방문
- 사용자당 5회 검색

### 비용 상세

| 서비스 | 월 비용 | 내역 |
|--------|---------|------|
| Lambda | $3-5 | 월 15,000 요청 × 512MB × 1초 |
| DynamoDB | $2-3 | 읽기 30,000건, 쓰기 10,000건 |
| Bedrock | $8-15 | Haiku 15,000 호출 (캐싱 후 1,500 실제) |
| S3 | $1-2 | 1GB 저장, 월 10,000 요청 |
| CloudFront | $1 | 월 10GB 전송 |
| CloudWatch | $1 | 로그 수집/저장 (7일) |
| SNS | $0.5 | 이메일/Lambda 알림 |

### 총 예상 비용

**$17-28/월** (초기 트래픽 기준)

## 비용 절감 효과

### OpenSearch → S3 Vectors

- **절감**: $700/월 → $1/월
- **절감률**: 99.8%

### 캐싱 전략

- **절감**: $150/월 → $15/월 (Bedrock)
- **절감률**: 90%

## 추가 최적화 옵션

### 1. Reserved Capacity (트래픽 증가 시)

DynamoDB 예약 용량으로 일정 트래픽 이상에서 비용 절감.

### 2. Lambda SnapStart (Java/Python)

Cold start 시간 단축 (Node.js는 미지원).

### 3. CloudFront 캐시 최적화

정적 자산 장기 캐싱:
- `assets/`: 1년 (파일 해시 기반)
- `index.html`: no-cache

### 4. S3 Intelligent Tiering

자주 접근하지 않는 벡터 파일 자동 비용 최적화.

## 모니터링

### 비용 알림 설정

```bash
aws ce put-anomaly-subscription \
  --anomaly-subscription '{
    "SubscriptionName": "EECAR-Cost-Alert",
    "Threshold": 50,
    "Frequency": "DAILY",
    "MonitorArnList": ["arn:aws:ce::ACCOUNT_ID:anomalymonitor/..."],
    "Subscribers": [{"Type": "EMAIL", "Address": "your-email@example.com"}]
  }'
```

### CloudWatch Dashboard

통합 대시보드에서 다음 지표 모니터링:
- Lambda 호출 수, 에러율, 지연시간
- DynamoDB 읽기/쓰기 용량
- Bedrock API 호출 수
- S3 요청 수

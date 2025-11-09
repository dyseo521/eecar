# DynamoDB Schema Design

## Overview

EECAR uses a **single-table design** to minimize costs and improve query performance. All entities are stored in one table with different partition key (PK) and sort key (SK) patterns.

## Table: `eecar-parts-table`

### Primary Keys
- **PK** (Partition Key): Entity type + ID
- **SK** (Sort Key): Entity metadata or relationship

### Global Secondary Index (GSI1)
- **GSI1PK**: Category or query pattern
- **GSI1SK**: Timestamp or sort field

### TTL Attribute
- **TTL**: Unix timestamp for automatic item expiration (used for cache and temporary data)

---

## Entity Patterns

### 1. Parts (부품)

#### Metadata
```
PK: PART#{partId}
SK: METADATA
Attributes:
  - name: string (부품명)
  - category: string (카테고리: 배터리, 모터, 전장부품 등)
  - manufacturer: string (제조사: 현대, 기아, 테슬라 등)
  - model: string (차량 모델)
  - year: number (연식)
  - condition: string (상태: 신품, 중고, 재생)
  - price: number (가격)
  - quantity: number (수량)
  - sellerId: string (판매자 ID)
  - description: string (설명)
  - images: string[] (이미지 URLs)
  - createdAt: string (ISO timestamp)
  - updatedAt: string (ISO timestamp)

GSI1PK: CATEGORY#{category}
GSI1SK: CREATED_AT#{timestamp}
```

#### Specifications (물성 데이터)
```
PK: PART#{partId}
SK: SPEC
Attributes:
  - materialComposition: object (소재 구성)
    - primary: string (주 소재)
    - secondary: string[] (부 소재)
  - dimensions: object (치수)
    - length: number
    - width: number
    - height: number
    - unit: string (mm, cm)
  - weight: number (kg)
  - electricalProps: object (전기적 특성)
    - voltage: number
    - capacity: number (배터리 용량)
    - power: number (출력)
  - chemicalProps: object (화학적 특성)
  - thermalProps: object (열적 특성)
  - recyclingInfo: object (재활용 정보)
```

#### Vector Reference
```
PK: PART#{partId}
SK: VECTOR
Attributes:
  - s3Key: string (S3 벡터 파일 경로)
  - embeddingModel: string (사용한 임베딩 모델)
  - dimension: number (벡터 차원)
  - createdAt: string
```

#### Use Cases (활용 사례)
```
PK: PART#{partId}
SK: USAGE#{usageId}
Attributes:
  - industry: string (산업: 재생에너지, ESS, 건설 등)
  - application: string (활용처: 에너지 저장, 전동 공구 등)
  - requirements: object (필요 조건)
  - successCase: boolean (실제 적용 사례 여부)
  - description: string
```

---

### 2. Company Needs (회사 니즈)

```
PK: COMPANY#{companyId}
SK: NEED#{needId}
Attributes:
  - companyName: string
  - industry: string (산업 분야)
  - requiredSpecs: object (필요한 스펙)
    - category: string
    - minQuantity: number
    - maxPrice: number
    - materialPreferences: string[]
  - productionProcess: string (생산 공정 설명)
  - targetApplication: string (목표 활용처)
  - priority: string (high, medium, low)
  - status: string (active, fulfilled, cancelled)
  - createdAt: string
  - expiresAt: string

GSI1PK: NEED#{status}
GSI1SK: PRIORITY#{priority}#CREATED#{timestamp}
```

---

### 3. AI Match Results (매칭 결과 - 캐시)

```
PK: MATCH#{queryHash}
SK: RESULT
Attributes:
  - query: string (원본 쿼리)
  - queryEmbedding: string (S3 key)
  - matchedParts: object[] (매칭된 부품들)
    - partId: string
    - score: number (유사도 점수)
    - reason: string (추천 이유 - AI 생성)
  - modelUsed: string (사용한 Claude 모델)
  - createdAt: string
  - hitCount: number (재사용 횟수)
  - TTL: number (7일 후 자동 삭제)

GSI1PK: CACHE
GSI1SK: HIT_COUNT#{hitCount}
```

---

### 4. Watch List (알림 등록)

```
PK: WATCH#{watchId}
SK: METADATA
Attributes:
  - buyerId: string
  - email: string
  - phone: string
  - criteria: object (알림 조건)
    - category: string
    - minSpecs: object
    - maxPrice: number
  - status: string (active, triggered, cancelled)
  - createdAt: string
  - triggeredAt: string (알림 발송 시각)

GSI1PK: BUYER#{buyerId}
GSI1SK: STATUS#{status}#CREATED#{timestamp}
```

#### Watch Triggers (매칭된 부품)
```
PK: WATCH#{watchId}
SK: TRIGGER#{partId}
Attributes:
  - partId: string
  - matchScore: number
  - notifiedAt: string
```

---

### 5. Proposals (계약 제안)

```
PK: PROPOSAL#{proposalId}
SK: METADATA
Attributes:
  - fromCompanyId: string (제안자)
  - toCompanyId: string (수신자)
  - partIds: string[] (관련 부품들)
  - proposalType: string (buy, sell)
  - message: string (제안 내용)
  - quantity: number
  - priceOffer: number
  - terms: object (계약 조건)
  - status: string (pending, accepted, rejected, negotiating)
  - createdAt: string
  - respondedAt: string

GSI1PK: COMPANY#{toCompanyId}
GSI1SK: STATUS#{status}#CREATED#{timestamp}
```

---

### 6. Notifications (알림 히스토리)

```
PK: NOTIFICATION#{notificationId}
SK: METADATA
Attributes:
  - recipientId: string
  - type: string (part_available, proposal_received, compliance_violation)
  - title: string
  - message: string
  - data: object (관련 데이터)
  - read: boolean
  - sentAt: string
  - TTL: number (30일 후 자동 삭제)

GSI1PK: RECIPIENT#{recipientId}
GSI1SK: SENT#{timestamp}
```

---

## Access Patterns

### Query Examples

1. **Get all parts in a category**
   ```
   GSI1: GSI1PK = "CATEGORY#battery", GSI1SK begins_with "CREATED_AT#"
   ```

2. **Get company's active needs**
   ```
   Query: PK = "COMPANY#{companyId}", SK begins_with "NEED#"
   Filter: status = "active"
   ```

3. **Get buyer's pending proposals**
   ```
   GSI1: GSI1PK = "COMPANY#{buyerId}", GSI1SK begins_with "STATUS#pending#"
   ```

4. **Find cached similar queries (most frequently hit)**
   ```
   GSI1: GSI1PK = "CACHE", GSI1SK begins_with "HIT_COUNT#"
   (descending sort)
   ```

5. **Get buyer's active watches**
   ```
   GSI1: GSI1PK = "BUYER#{buyerId}", GSI1SK begins_with "STATUS#active#"
   ```

---

## Cost Optimization Strategies

1. **Single-table design**: Reduces table count and simplifies queries
2. **On-demand billing**: Pay only for actual reads/writes (better for low traffic)
3. **TTL for cache and notifications**: Automatic cleanup saves storage costs
4. **Efficient indexing**: Only one GSI to minimize index costs
5. **Sparse indexes**: GSI1 only populated when needed for queries
6. **Batch operations**: Use BatchGetItem and BatchWriteItem when possible

---

## Data Size Estimates

- Average part record: ~5-10KB
- Vector reference: ~1KB (actual vectors in S3)
- 1000 parts = ~10MB in DynamoDB
- Expected monthly costs: **$1-3 for 1000 parts, 10K reads, 1K writes**

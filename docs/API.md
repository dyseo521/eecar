# EECAR API Documentation

Base URL: `https://api.eecar.com/prod` (replace with your API Gateway endpoint)

## Authentication

Currently, no authentication is required (demo mode). In production, implement API keys or JWT tokens.

---

## Endpoints

### 1. AI-Powered Search

Search for parts using natural language queries with AI-powered semantic matching.

**Endpoint:** `POST /api/search`

**Request Body:**
```json
{
  "query": "ESS 에너지 저장 시스템에 사용할 수 있는 60kWh 이상 배터리",
  "filters": {
    "category": "battery",
    "maxPrice": 5000000,
    "minQuantity": 1
  },
  "topK": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "partId": "uuid",
      "score": 0.92,
      "part": {
        "name": "Tesla Model S 배터리 팩",
        "category": "battery",
        "manufacturer": "Tesla",
        "model": "Model S",
        "price": 3500000,
        "quantity": 2,
        "images": []
      },
      "reason": "60kWh 용량으로 ESS 시스템에 적합하며, 검증된 품질의 리튬이온 배터리입니다."
    }
  ],
  "cached": false,
  "count": 5
}
```

---

### 2. Register Part

Register a new part with automatic embedding generation and compliance check.

**Endpoint:** `POST /api/parts`

**Request Body:**
```json
{
  "name": "Tesla Model S 배터리 팩",
  "category": "battery",
  "manufacturer": "Tesla",
  "model": "Model S",
  "year": 2015,
  "condition": "used",
  "price": 3500000,
  "quantity": 2,
  "sellerId": "seller-123",
  "description": "2015년식 Model S에서 추출한 배터리 팩. 용량 확인 완료.",
  "images": ["https://..."],
  "specifications": {
    "materialComposition": {
      "primary": "리튬이온",
      "secondary": ["니켈", "코발트"]
    },
    "dimensions": {
      "length": 2100,
      "width": 1200,
      "height": 150,
      "unit": "mm"
    },
    "weight": 540,
    "electricalProps": {
      "voltage": 375,
      "capacity": 60,
      "power": 22500
    }
  },
  "useCases": [
    {
      "industry": "재생에너지",
      "application": "ESS (에너지 저장 시스템)",
      "description": "태양광 발전소의 잉여 전력 저장용"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Part registered successfully",
  "partId": "uuid",
  "metadata": { ... }
}
```

---

### 3. Get Part Details

Retrieve detailed information about a specific part.

**Endpoint:** `GET /api/parts/{id}`

**Response:**
```json
{
  "partId": "uuid",
  "name": "Tesla Model S 배터리 팩",
  "category": "battery",
  "manufacturer": "Tesla",
  "model": "Model S",
  "year": 2015,
  "condition": "used",
  "price": 3500000,
  "quantity": 2,
  "sellerId": "seller-123",
  "description": "...",
  "images": [],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "specifications": { ... },
  "useCases": [ ... ],
  "vector": {
    "s3Key": "parts/uuid.json",
    "embeddingModel": "amazon.titan-embed-text-v1",
    "dimension": 1536
  }
}
```

---

### 4. List Parts by Category

List parts filtered by category.

**Endpoint:** `GET /api/parts?category={category}&limit={limit}`

**Query Parameters:**
- `category` (required): Part category (battery, motor, etc.)
- `limit` (optional): Max number of results (default: 20)

**Response:**
```json
{
  "parts": [
    {
      "partId": "uuid",
      "name": "...",
      "category": "battery",
      "manufacturer": "Tesla",
      "price": 3500000,
      "quantity": 2,
      "createdAt": "..."
    }
  ],
  "count": 15
}
```

---

### 5. Create Watch Alert

Register to be notified when parts matching criteria become available.

**Endpoint:** `POST /api/watch`

**Request Body:**
```json
{
  "buyerId": "buyer-123",
  "email": "buyer@company.com",
  "phone": "+821012345678",
  "criteria": {
    "category": "battery",
    "maxPrice": 5000000,
    "minSpecs": {
      "electricalProps": {
        "capacity": 60
      }
    }
  }
}
```

**Response:**
```json
{
  "message": "Watch created successfully",
  "watchId": "uuid"
}
```

---

### 6. Create Proposal

Create a B2B contract proposal.

**Endpoint:** `POST /api/proposals`

**Request Body:**
```json
{
  "fromCompanyId": "company-123",
  "toCompanyId": "company-456",
  "partIds": ["part-uuid-1", "part-uuid-2"],
  "proposalType": "buy",
  "message": "귀사의 배터리 재고에 관심이 있습니다. 협의 가능하실까요?",
  "quantity": 5,
  "priceOffer": 15000000,
  "terms": {
    "deliveryDate": "2024-02-28",
    "paymentTerms": "선금 30%, 잔금 70%",
    "warranty": "3개월"
  }
}
```

**Response:**
```json
{
  "message": "Proposal created successfully",
  "proposalId": "uuid"
}
```

---

### 7. Get Proposals

Get proposals for a company.

**Endpoint:** `GET /api/proposals?companyId={companyId}&status={status}`

**Query Parameters:**
- `companyId` (required): Company ID
- `status` (optional): Filter by status (pending, accepted, rejected, negotiating)

**Response:**
```json
{
  "proposals": [
    {
      "proposalId": "uuid",
      "fromCompanyId": "company-123",
      "toCompanyId": "company-456",
      "partIds": ["..."],
      "proposalType": "buy",
      "message": "...",
      "quantity": 5,
      "priceOffer": 15000000,
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 3
}
```

---

### 8. Generate Synthetic Data

Generate synthetic part data for testing (MCP-style).

**Endpoint:** `POST /api/synthetic`

**Request Body:**
```json
{
  "category": "battery",
  "count": 5,
  "template": {
    "manufacturer": "Hyundai",
    "condition": "refurbished"
  }
}
```

**Response:**
```json
{
  "message": "Successfully generated 5 synthetic parts",
  "parts": [
    {
      "partId": "uuid",
      "name": "...",
      "category": "battery",
      ...
    }
  ]
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

**HTTP Status Codes:**
- `400` Bad Request - Invalid input
- `404` Not Found - Resource not found
- `500` Internal Server Error - Server error

---

## Rate Limiting

Currently no rate limiting. In production, implement:
- 100 requests per minute per IP
- 1000 requests per hour per API key

---

## Cost Optimization Notes

1. **Caching**: Search results are cached for 7 days with TTL
2. **Batch Operations**: Use batch endpoints when available
3. **Filters**: Apply filters to reduce AI processing costs
4. **Embeddings**: Generated once per part, reused for all searches
5. **Model Selection**: Haiku (cheap) for most operations, Sonnet for complex queries

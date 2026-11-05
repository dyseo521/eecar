#!/usr/bin/env npx ts-node

/**
 * OpenAPI Spec Generator
 *
 * Generates OpenAPI 3.0.3 specification from Zod schemas
 * Run: npx ts-node scripts/generate-openapi.ts
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// Import all schemas
import {
  // Request/Response schemas
  SearchRequestSchema,
  SearchResponseSchema,
  SearchExplainRequestSchema,
  SearchExplainResponseSchema,
  PartSchema,
  PartsListResponseSchema,
  PartRegistrationRequestSchema,
  PartRegistrationResponseSchema,
  BatteryHealthRequestSchema,
  BatteryHealthResponseSchema,
  MaterialSearchRequestSchema,
  WatchRequestSchema,
  WatchResponseSchema,
  ProposalRequestSchema,
  ProposalResponseSchema,
  ProposalsListResponseSchema,
  ContactRequestSchema,
  ContactResponseSchema,
  SyntheticDataRequestSchema,
  SyntheticDataResponseSchema,
  ErrorResponseSchema,
  SlackEventRequestSchema,
  SlackEventResponseSchema,
  // Component schemas
  PartCategorySchema,
  PartConditionSchema,
  CathodeTypeSchema,
  BatteryHealthInfoSchema,
  MaterialCompositionSchema,
  PartSpecificationsSchema,
  SearchFiltersSchema,
  BatteryFiltersSchema,
  AdvancedMaterialFiltersSchema,
  ProposalSchema,
  ProposalStatusSchema,
} from '../shared/schemas/index.js';

const registry = new OpenAPIRegistry();

// ==================== Register Component Schemas ====================

registry.register('PartCategory', PartCategorySchema);
registry.register('PartCondition', PartConditionSchema);
registry.register('CathodeType', CathodeTypeSchema);
registry.register('Part', PartSchema);
registry.register('BatteryHealthInfo', BatteryHealthInfoSchema);
registry.register('MaterialComposition', MaterialCompositionSchema);
registry.register('PartSpecifications', PartSpecificationsSchema);
registry.register('SearchFilters', SearchFiltersSchema);
registry.register('BatteryFilters', BatteryFiltersSchema);
registry.register('AdvancedMaterialFilters', AdvancedMaterialFiltersSchema);
registry.register('Proposal', ProposalSchema);
registry.register('ProposalStatus', ProposalStatusSchema);
registry.register('ErrorResponse', ErrorResponseSchema);

// ==================== Register API Paths ====================

// POST /api/search - AI RAG Search
registry.registerPath({
  method: 'post',
  path: '/api/search',
  tags: ['Search'],
  summary: 'AI 하이브리드 검색',
  description: `벡터(Titan v2, S3 Vectors)와 BM25를 각각 상위 100개씩 독립 검색해 결합하고, 질의에서 뽑은
카테고리·수치 조건(용량·SOH·가격·연식 등) 위반을 감점해 정렬한다.
- 결과에는 규칙으로 확인한 조건 일치·불일치(conditions)가 들어 있다
- explain=false면 LLM 설명 없이 바로 응답한다 (설명은 POST /api/search/explain)
- 결과 캐싱 (7일 TTL, 키에 필터·topK·explain·파이프라인 버전 포함)`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: SearchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '검색 결과',
      content: {
        'application/json': {
          schema: SearchResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/search/explain - 검색 결과 설명 (응답 경로에서 분리)
registry.registerPath({
  method: 'post',
  path: '/api/search/explain',
  tags: ['Search'],
  summary: '검색 결과 설명',
  description: `검색 결과 부품의 매칭 설명을 Claude로 만든다. 규칙으로 확인한 조건 일치·불일치를 근거로 주며,
조건에 맞지 않는 부품은 맞지 않는다고 쓴다. 같은 질의·부품 조합은 7일 캐시한다.`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: SearchExplainRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '부품별 설명',
      content: {
        'application/json': {
          schema: SearchExplainResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /api/parts - List Parts
registry.registerPath({
  method: 'get',
  path: '/api/parts',
  tags: ['Parts'],
  summary: '부품 목록 조회',
  description: '커서 기반 페이지네이션으로 부품 목록 조회',
  request: {
    query: SearchFiltersSchema.pick({ category: true }).extend({
      limit: PartSchema.shape.quantity.optional().openapi({
        description: '조회 개수 (기본값 20, 최대 100)',
        example: 20,
      }),
      cursor: PartSchema.shape.partId.optional().openapi({
        description: '페이지네이션 커서',
      }),
    }),
  },
  responses: {
    200: {
      description: '부품 목록',
      content: {
        'application/json': {
          schema: PartsListResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/parts - Register Part
registry.registerPath({
  method: 'post',
  path: '/api/parts',
  tags: ['Parts'],
  summary: '부품 등록',
  description: `새 부품 등록
- Titan Embeddings로 자동 임베딩 생성
- S3에 벡터 저장
- 비동기 규정 검사 트리거`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: PartRegistrationRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: '등록 완료',
      content: {
        'application/json': {
          schema: PartRegistrationResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /api/parts/{id} - Get Part by ID
registry.registerPath({
  method: 'get',
  path: '/api/parts/{id}',
  tags: ['Parts'],
  summary: '단일 부품 조회',
  description: '부품 ID로 상세 정보 조회 (메타데이터, 스펙, 사용사례 포함)',
  request: {
    params: PartSchema.pick({ partId: true }).transform((val) => ({
      id: val.partId,
    })),
  },
  responses: {
    200: {
      description: '부품 상세 정보',
      content: {
        'application/json': {
          schema: PartSchema,
        },
      },
    },
    404: {
      description: '부품을 찾을 수 없음',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/battery-health - Battery Health Assessment
registry.registerPath({
  method: 'post',
  path: '/api/battery-health',
  tags: ['Battery'],
  summary: '배터리 건강도 기반 검색',
  description: `배터리 SOH(State of Health) 기반 고급 검색
- 재사용/재활용/폐기 판단
- 양극재 타입별 필터링
- 적합 용도 추천 (ESS, 전동킥보드 등)`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: BatteryHealthRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '배터리 검색 결과',
      content: {
        'application/json': {
          schema: BatteryHealthResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/material-search - Material Property Search
registry.registerPath({
  method: 'post',
  path: '/api/material-search',
  tags: ['Material'],
  summary: '소재 특성 기반 검색',
  description: `알루미늄 합금 등 소재 물성 기반 검색
- 인장강도, 항복강도, 탄성계수 범위 필터
- 합금 번호 (6061, 7075 등) 검색
- 재활용률 필터링`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: MaterialSearchRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '소재 검색 결과',
      content: {
        'application/json': {
          schema: SearchResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/watch - Register Watch
registry.registerPath({
  method: 'post',
  path: '/api/watch',
  tags: ['Watch'],
  summary: '알림 등록',
  description: `원하는 부품 조건에 대한 알림 등록
- 조건 매칭 시 SNS로 알림 발송
- 이메일/전화번호로 알림 수신`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: WatchRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: '알림 등록 완료',
      content: {
        'application/json': {
          schema: WatchResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/proposals - Create Proposal
registry.registerPath({
  method: 'post',
  path: '/api/proposals',
  tags: ['Proposals'],
  summary: '거래 제안 생성',
  description: 'B2B 거래 제안서 생성',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ProposalRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: '제안 생성 완료',
      content: {
        'application/json': {
          schema: ProposalResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /api/proposals - List Proposals
registry.registerPath({
  method: 'get',
  path: '/api/proposals',
  tags: ['Proposals'],
  summary: '거래 제안 조회',
  description: '회사별 거래 제안 목록 조회',
  request: {
    query: ProposalSchema.pick({ status: true }).extend({
      companyId: ProposalSchema.shape.fromCompanyId.openapi({
        description: '조회할 회사 ID',
      }),
    }),
  },
  responses: {
    200: {
      description: '제안 목록',
      content: {
        'application/json': {
          schema: ProposalsListResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/contact - Contact Inquiry
registry.registerPath({
  method: 'post',
  path: '/api/contact',
  tags: ['Contact'],
  summary: '문의 접수',
  description: '일반 문의 접수 (SNS로 알림 발송)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ContactRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '문의 접수 완료',
      content: {
        'application/json': {
          schema: ContactResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/synthetic - Generate Synthetic Data
registry.registerPath({
  method: 'post',
  path: '/api/synthetic',
  tags: ['Synthetic'],
  summary: '합성 데이터 생성',
  description: `테스트용 합성 부품 데이터 생성
- 카테고리별 현실적인 가격 범위 적용
- 배터리의 경우 SOH, 양극재 타입 등 자동 생성`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: SyntheticDataRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '생성 완료',
      content: {
        'application/json': {
          schema: SyntheticDataResponseSchema,
        },
      },
    },
    400: {
      description: '잘못된 요청',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// POST /api/slack/events - Slack Events (자동이 2.0)
registry.registerPath({
  method: 'post',
  path: '/api/slack/events',
  tags: ['Slack'],
  summary: 'Slack 이벤트 수신 (자동이 2.0)',
  description: `자동이 2.0 AI DevOps 어시스턴트
- @멘션으로 자연어 질의
- Slash Command (/jadong)
- URL 검증 (challenge)
- ReAct 패턴 기반 에러 분석 및 해결책 제안`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: SlackEventRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '이벤트 처리 완료',
      content: {
        'application/json': {
          schema: SlackEventResponseSchema,
        },
      },
    },
    401: {
      description: 'Slack 서명 검증 실패',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: '서버 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ==================== Generate OpenAPI Document ====================

const generator = new OpenApiGeneratorV3(registry.definitions);

const openApiDocument = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'EECAR API',
    version: '1.0.0',
    description: `EECAR - 1세대 전기차 중고 부품 거래 플랫폼 API

## 주요 기능
- **AI 검색**: Amazon Bedrock 기반 RAG 검색 (Titan Embeddings + Claude Haiku)
- **부품 관리**: 등록, 조회, 필터링
- **배터리 건강도**: SOH 기반 재사용/재활용 판단
- **소재 특성**: 알루미늄 합금 등 소재 기반 검색
- **B2B 거래**: 제안서 생성 및 관리

## 기술 스택
- AWS Lambda (Node.js 20)
- DynamoDB (Single-Table Design)
- Amazon Bedrock (Claude, Titan Embeddings)
- S3 Vectors`,
    contact: {
      name: 'EECAR Team',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: 'https://6o4futufni.execute-api.ap-northeast-2.amazonaws.com/prod',
      description: 'Production (AWS API Gateway)',
    },
    {
      url: 'http://localhost:3001',
      description: 'Local Development',
    },
  ],
  tags: [
    { name: 'Search', description: 'AI 기반 검색 API' },
    { name: 'Parts', description: '부품 관리 API' },
    { name: 'Battery', description: '배터리 건강도 평가 API' },
    { name: 'Material', description: '소재 특성 검색 API' },
    { name: 'Watch', description: '알림 등록 API' },
    { name: 'Proposals', description: 'B2B 거래 제안 API' },
    { name: 'Contact', description: '문의 API' },
    { name: 'Synthetic', description: '테스트 데이터 생성 API' },
    { name: 'Slack', description: '자동이 2.0 Slack 봇 API' },
  ],
});

// ==================== Write to File ====================

const outputPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
const yamlContent = yaml.stringify(openApiDocument, {
  indent: 2,
  lineWidth: 0,
});

fs.writeFileSync(outputPath, yamlContent, 'utf8');

console.log(`✅ OpenAPI spec generated: ${outputPath}`);
console.log(`   - ${Object.keys(registry.definitions).length} schemas registered`);
console.log(`   - ${openApiDocument.paths ? Object.keys(openApiDocument.paths).length : 0} paths defined`);

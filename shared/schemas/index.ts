/**
 * Zod Schemas for EECAR API
 *
 * These schemas provide:
 * 1. Runtime validation
 * 2. TypeScript type inference
 * 3. OpenAPI spec generation
 */

import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ==================== Enums ====================

export const PartCategorySchema = z.enum([
  'battery',
  'motor',
  'inverter',
  'charger',
  'electronics',
  'body-chassis-frame',
  'body-panel',
  'body-door',
  'body-window',
  'interior',
  'other'
]).openapi({
  description: '부품 카테고리',
  example: 'battery'
});

export const PartConditionSchema = z.enum([
  'new',
  'used',
  'refurbished',
  'for-parts'
]).openapi({
  description: '부품 상태',
  example: 'used'
});

export const CathodeTypeSchema = z.enum([
  'NCM Ni 33%',
  'NCM Ni 60%',
  'NCM Ni 80%',
  'NCA',
  'LMO',
  'LFP',
  'Other'
]).openapi({
  description: '양극재 타입',
  example: 'NCM Ni 80%'
});

export const RecyclingMethodSchema = z.enum([
  'wet_metallurgy',
  'dry_smelting',
  'direct_recycling',
  'mechanical_separation',
  'thermal_treatment'
]).openapi({
  description: '재활용 방법'
});

export const ProposalStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'negotiating',
  'cancelled'
]).openapi({
  description: '제안 상태',
  example: 'pending'
});

export const WatchStatusSchema = z.enum([
  'active',
  'triggered',
  'cancelled'
]).openapi({
  description: '알림 상태'
});

export const NotificationTypeSchema = z.enum([
  'part_available',
  'proposal_received',
  'proposal_accepted',
  'proposal_rejected',
  'compliance_violation',
  'watch_triggered'
]).openapi({
  description: '알림 유형'
});

// ==================== Specifications ====================

export const DimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['mm', 'cm', 'm'])
}).openapi('Dimensions');

export const ElectricalPropertiesSchema = z.object({
  voltage: z.number().optional().openapi({ description: '전압 (V)' }),
  capacity: z.number().optional().openapi({ description: '용량 (Ah)' }),
  power: z.number().optional().openapi({ description: '출력 (W)' }),
  current: z.number().optional().openapi({ description: '전류 (A)' }),
  resistance: z.number().optional().openapi({ description: '저항 (Ω)' })
}).openapi('ElectricalProperties');

export const MaterialCompositionSchema = z.object({
  primary: z.string().openapi({ example: 'Aluminum' }),
  secondary: z.array(z.string()).optional(),
  percentage: z.record(z.string(), z.number()).optional(),
  tensileStrengthMPa: z.number().optional().openapi({ description: '인장강도 (MPa)' }),
  yieldStrengthMPa: z.number().optional().openapi({ description: '항복강도 (MPa)' }),
  elasticModulusGPa: z.number().optional().openapi({ description: '탄성계수 (GPa)' }),
  elongationPercent: z.number().optional().openapi({ description: '연신율 (%)' }),
  hardness: z.string().optional(),
  density: z.number().optional().openapi({ description: '밀도 (g/cm³)' }),
  meltingPoint: z.number().optional().openapi({ description: '녹는점 (°C)' }),
  alloyNumber: z.string().optional().openapi({ description: '합금 번호', example: '6061' }),
  recyclability: z.number().min(0).max(100).optional().openapi({ description: '재활용률 (0-100%)' })
}).openapi('MaterialComposition');

export const PartSpecificationsSchema = z.object({
  materialComposition: MaterialCompositionSchema.optional(),
  dimensions: DimensionsSchema.optional(),
  weight: z.number().optional().openapi({ description: '무게 (kg)' }),
  electricalProps: ElectricalPropertiesSchema.optional(),
  chemicalProps: z.record(z.string(), z.any()).optional(),
  thermalProps: z.record(z.string(), z.any()).optional(),
  recyclingInfo: z.record(z.string(), z.any()).optional()
}).openapi('PartSpecifications');

// ==================== Battery ====================

export const BatteryHealthInfoSchema = z.object({
  soh: z.number().min(0).max(100).openapi({ description: 'State of Health (%)', example: 85 }),
  soc: z.number().min(0).max(100).optional().openapi({ description: 'State of Charge (%)' }),
  cycleCount: z.number().int().nonnegative().optional(),
  estimatedMileageKm: z.number().optional().openapi({ description: '예상 잔여 주행거리 (km)' }),
  cathodeType: CathodeTypeSchema,
  manufacturer: z.string(),
  model: z.string(),
  year: z.number().int().min(2010).max(2030),
  recommendedUse: z.enum(['reuse', 'recycle', 'dispose']).openapi({
    description: '권장 용도: reuse(SOH>=70%), recycle(30-70%), dispose(<30%)'
  }),
  suitableApplications: z.array(z.string()).optional().openapi({
    description: '적합 용도 (ESS, 전동킥보드 등)'
  }),
  degradationRate: z.number().optional().openapi({ description: '연간 열화율 (%)' }),
  recyclingMethod: z.array(RecyclingMethodSchema).optional(),
  vendorRecommendations: z.array(z.string()).optional()
}).openapi('BatteryHealthInfo');

// ==================== Use Case ====================

export const UseCaseSchema = z.object({
  industry: z.string(),
  application: z.string(),
  requirements: z.record(z.string(), z.any()).optional(),
  successCase: z.boolean().optional(),
  description: z.string()
}).openapi('UseCase');

// ==================== Part ====================

export const PartSchema = z.object({
  partId: z.string().openapi({ example: 'battery-001' }),
  name: z.string().min(1).openapi({ example: 'Tesla Model 3 Battery Pack' }),
  category: PartCategorySchema,
  manufacturer: z.string().openapi({ example: 'Tesla' }),
  model: z.string().openapi({ example: 'Model 3 LR' }),
  year: z.number().int().min(2010).max(2030).openapi({ example: 2023 }),
  condition: PartConditionSchema,
  price: z.number().positive().openapi({ example: 4500000 }),
  quantity: z.number().int().positive().openapi({ example: 1 }),
  sellerId: z.string(),
  description: z.string(),
  images: z.array(z.string().url()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  specifications: PartSpecificationsSchema.optional(),
  useCases: z.array(UseCaseSchema).optional(),
  batteryHealth: BatteryHealthInfoSchema.optional()
}).openapi('Part');

// ==================== Search ====================

export const RangeFilterSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional()
}).openapi('RangeFilter');

export const AdvancedMaterialFiltersSchema = z.object({
  tensileStrengthMPa: RangeFilterSchema.optional(),
  yieldStrengthMPa: RangeFilterSchema.optional(),
  elasticModulusGPa: RangeFilterSchema.optional(),
  elongationPercent: RangeFilterSchema.optional(),
  purity: z.object({ min: z.number().optional() }).optional(),
  alloyNumber: z.string().optional().openapi({ example: '6061' }),
  composition: z.array(z.object({
    element: z.string(),
    percentage: RangeFilterSchema.optional()
  })).optional(),
  recyclability: z.object({ min: z.number().optional() }).optional()
}).openapi('AdvancedMaterialFilters');

export const BatteryFiltersSchema = z.object({
  soh: RangeFilterSchema.optional(),
  cathodeType: z.array(CathodeTypeSchema).optional(),
  recommendedUse: z.array(z.enum(['reuse', 'recycle', 'dispose'])).optional(),
  suitableApplications: z.array(z.string()).optional(),
  estimatedMileageKm: RangeFilterSchema.optional()
}).openapi('BatteryFilters');

export const SearchFiltersSchema = z.object({
  category: PartCategorySchema.optional(),
  manufacturer: z.string().optional(),
  maxPrice: z.number().positive().optional(),
  minQuantity: z.number().int().positive().optional(),
  yearRange: z.tuple([z.number(), z.number()]).optional(),
  condition: z.array(PartConditionSchema).optional(),
  materialFilters: AdvancedMaterialFiltersSchema.optional(),
  batteryFilters: BatteryFiltersSchema.optional()
}).openapi('SearchFilters');

export const SearchRequestSchema = z.object({
  query: z.string().min(1).openapi({
    description: '검색 쿼리',
    example: '테슬라 모델3 배터리 80% 이상'
  }),
  filters: SearchFiltersSchema.optional(),
  topK: z.number().int().positive().max(50).default(10).openapi({
    description: '반환할 결과 수 (최대 50)'
  }),
  explain: z.boolean().default(true).openapi({
    description: 'false면 LLM 설명 없이 바로 응답하고, reason에는 조건 확인 요약을 넣는다. 설명은 /api/search/explain으로 받는다'
  })
}).openapi('SearchRequest');

export const SearchConditionsSchema = z.object({
  matched: z.array(z.string()).openapi({ example: ['카테고리', '용량 72kWh'] }),
  mismatched: z.array(z.string()).openapi({ example: [] })
}).openapi('SearchConditions');

export const SearchResultSchema = z.object({
  partId: z.string(),
  score: z.number().min(0).max(1).openapi({ description: '상대 순위 점수 (0-1). 일치도가 아니다' }),
  part: PartSchema.partial(),
  reason: z.string().openapi({ description: '매칭 설명 (reasonSource가 ai면 Claude, rules면 조건 확인 요약)' }),
  reasonSource: z.enum(['ai', 'rules']).optional(),
  conditions: SearchConditionsSchema.optional().openapi({ description: '질의에서 뽑은 조건의 일치·불일치 (규칙 기반)' })
}).openapi('SearchResult');

export const SearchExplainRequestSchema = z.object({
  query: z.string().min(1).openapi({ example: 'ESS용 60kWh 이상 배터리' }),
  partIds: z.array(z.string()).min(1).max(20).openapi({ description: '설명할 부품 ID (최대 20개)' })
}).openapi('SearchExplainRequest');

export const SearchExplainResponseSchema = z.object({
  explanations: z.record(z.string(), z.string()).openapi({ description: '부품 ID별 설명' }),
  cached: z.boolean()
}).openapi('SearchExplainResponse');

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  cached: z.boolean().openapi({ description: '캐시된 결과 여부' }),
  count: z.number().int()
}).openapi('SearchResponse');

// ==================== Parts List ====================

export const PartsListResponseSchema = z.object({
  parts: z.array(PartSchema),
  count: z.number().int(),
  nextCursor: z.string().optional().openapi({ description: '다음 페이지 커서' })
}).openapi('PartsListResponse');

// ==================== Battery Health Assessment ====================

export const BatteryHealthRequestSchema = z.object({
  batteryFilters: BatteryFiltersSchema.optional(),
  topK: z.number().int().positive().default(10)
}).openapi('BatteryHealthRequest');

export const BatteryHealthResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  count: z.number().int()
}).openapi('BatteryHealthResponse');

// ==================== Material Search ====================

export const MaterialSearchRequestSchema = z.object({
  materialFilters: AdvancedMaterialFiltersSchema.optional(),
  category: PartCategorySchema.optional(),
  topK: z.number().int().positive().default(10)
}).openapi('MaterialSearchRequest');

// ==================== Watch ====================

export const WatchCriteriaSchema = z.object({
  category: PartCategorySchema.optional(),
  maxPrice: z.number().positive().optional(),
  minSpecs: PartSpecificationsSchema.partial().optional(),
  manufacturer: z.string().optional(),
  keywords: z.array(z.string()).optional()
}).openapi('WatchCriteria');

export const WatchRequestSchema = z.object({
  buyerId: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  criteria: WatchCriteriaSchema
}).openapi('WatchRequest');

export const WatchResponseSchema = z.object({
  message: z.string(),
  watchId: z.string()
}).openapi('WatchResponse');

// ==================== Proposal ====================

export const ProposalTermsSchema = z.object({
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  warranty: z.string().optional(),
  notes: z.string().optional()
}).passthrough().openapi('ProposalTerms');

export const ProposalRequestSchema = z.object({
  fromCompanyId: z.string(),
  toCompanyId: z.string(),
  partIds: z.array(z.string()).min(1),
  proposalType: z.enum(['buy', 'sell']),
  message: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  priceOffer: z.number().positive().optional(),
  terms: ProposalTermsSchema.optional()
}).openapi('ProposalRequest');

export const ProposalSchema = z.object({
  proposalId: z.string(),
  fromCompanyId: z.string(),
  toCompanyId: z.string(),
  partIds: z.array(z.string()),
  proposalType: z.enum(['buy', 'sell']),
  message: z.string(),
  quantity: z.number().int(),
  priceOffer: z.number(),
  terms: ProposalTermsSchema,
  status: ProposalStatusSchema,
  createdAt: z.string().datetime(),
  respondedAt: z.string().datetime().optional()
}).openapi('Proposal');

export const ProposalResponseSchema = z.object({
  message: z.string(),
  proposalId: z.string()
}).openapi('ProposalResponse');

export const ProposalsListResponseSchema = z.object({
  proposals: z.array(ProposalSchema),
  count: z.number().int()
}).openapi('ProposalsListResponse');

// ==================== Contact ====================

export const ContactRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
  partId: z.string().optional(),
  partName: z.string().optional()
}).openapi('ContactRequest');

export const ContactResponseSchema = z.object({
  message: z.string(),
  success: z.boolean()
}).openapi('ContactResponse');

// ==================== Synthetic Data ====================

export const SyntheticDataRequestSchema = z.object({
  category: PartCategorySchema,
  count: z.number().int().min(1).max(100).default(10)
}).openapi('SyntheticDataRequest');

export const SyntheticDataResponseSchema = z.object({
  message: z.string(),
  parts: z.array(PartSchema)
}).openapi('SyntheticDataResponse');

// ==================== Part Registration ====================

export const PartRegistrationRequestSchema = PartSchema.omit({
  partId: true,
  createdAt: true,
  updatedAt: true
}).openapi('PartRegistrationRequest');

export const PartRegistrationResponseSchema = z.object({
  message: z.string(),
  partId: z.string()
}).openapi('PartRegistrationResponse');

// ==================== Error ====================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  statusCode: z.number().int().optional()
}).openapi('ErrorResponse');

// ==================== Slack Events ====================

export const SlackEventRequestSchema = z.object({
  type: z.string().openapi({ description: '이벤트 타입', example: 'event_callback' }),
  challenge: z.string().optional().openapi({ description: 'URL 검증용 챌린지' }),
  event: z.object({
    type: z.string().openapi({ example: 'app_mention' }),
    user: z.string().optional(),
    text: z.string().optional(),
    channel: z.string().optional(),
    ts: z.string().optional()
  }).optional().openapi({ description: 'Slack 이벤트 데이터' })
}).passthrough().openapi('SlackEventRequest');

export const SlackEventResponseSchema = z.object({
  ok: z.boolean(),
  challenge: z.string().optional(),
  message: z.string().optional()
}).openapi('SlackEventResponse');

// ==================== Type Exports ====================

export type PartCategory = z.infer<typeof PartCategorySchema>;
export type PartCondition = z.infer<typeof PartConditionSchema>;
export type CathodeType = z.infer<typeof CathodeTypeSchema>;
export type Part = z.infer<typeof PartSchema>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type BatteryHealthInfo = z.infer<typeof BatteryHealthInfoSchema>;
export type BatteryFilters = z.infer<typeof BatteryFiltersSchema>;
export type MaterialComposition = z.infer<typeof MaterialCompositionSchema>;
export type AdvancedMaterialFilters = z.infer<typeof AdvancedMaterialFiltersSchema>;
export type WatchRequest = z.infer<typeof WatchRequestSchema>;
export type ProposalRequest = z.infer<typeof ProposalRequestSchema>;
export type Proposal = z.infer<typeof ProposalSchema>;
export type ContactRequest = z.infer<typeof ContactRequestSchema>;
export type SyntheticDataRequest = z.infer<typeof SyntheticDataRequestSchema>;

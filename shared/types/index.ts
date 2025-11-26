/**
 * Shared TypeScript types for EECAR platform
 * Used by both frontend and backend
 */

// ==================== Part Types ====================

export interface Part {
  partId: string;
  name: string;
  category: PartCategory;
  manufacturer: string;
  model: string;
  year: number;
  condition: PartCondition;
  price: number;
  quantity: number;
  sellerId: string;
  description: string;
  images: string[];
  createdAt: string;
  updatedAt: string;
  specifications?: PartSpecifications;
  useCases?: UseCase[];
  batteryHealth?: BatteryHealthInfo;  // For battery category parts
}

export type PartCategory =
  | 'battery'
  | 'motor'
  | 'inverter'
  | 'charger'
  | 'electronics'
  | 'body-chassis-frame'    // 샤시 및 프레임
  | 'body-panel'            // 외판, 패널
  | 'body-door'             // 도어 및 주변 연결부
  | 'body-window'           // 창 및 유리 구조
  | 'interior'
  | 'other';

export type PartCondition = 'new' | 'used' | 'refurbished' | 'for-parts';

export interface PartSpecifications {
  materialComposition?: MaterialComposition;
  dimensions?: Dimensions;
  weight?: number; // kg
  electricalProps?: ElectricalProperties;
  chemicalProps?: Record<string, any>;
  thermalProps?: Record<string, any>;
  recyclingInfo?: Record<string, any>;
}

export interface MaterialComposition {
  primary: string;
  secondary?: string[];
  percentage?: Record<string, number>;
  // Extended material properties
  tensileStrengthMPa?: number;
  yieldStrengthMPa?: number;
  elasticModulusGPa?: number;
  elongationPercent?: number;
  hardness?: string;
  density?: number; // g/cm³
  meltingPoint?: number; // °C
  alloyNumber?: string; // e.g., "2024", "6061", "7075"
  recyclability?: number; // 0-100%
}

export interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: 'mm' | 'cm' | 'm';
}

export interface ElectricalProperties {
  voltage?: number; // V
  capacity?: number; // Ah
  power?: number; // W
  current?: number; // A
  resistance?: number; // Ω
}

// ==================== Battery Types ====================

export type CathodeType =
  | 'NCM Ni 33%'
  | 'NCM Ni 60%'
  | 'NCM Ni 80%'
  | 'NCA'
  | 'LMO'
  | 'LFP'
  | 'Other';

export type RecyclingMethod =
  | 'wet_metallurgy'        // 습식 제련
  | 'dry_smelting'          // 건식 제련
  | 'direct_recycling'      // 직접 재활용
  | 'mechanical_separation' // 기계적 분리
  | 'thermal_treatment';    // 열처리

export interface BatteryHealthInfo {
  soh: number;                          // State of Health (%)
  soc?: number;                         // State of Charge (%)
  cycleCount?: number;
  estimatedMileageKm?: number;          // 예상 주행거리
  cathodeType: CathodeType;
  manufacturer: string;
  model: string;
  year: number;
  recommendedUse: 'reuse' | 'recycle' | 'dispose';
  suitableApplications?: string[];      // ["ESS", "전동킥보드", etc.]
  degradationRate?: number;             // % per year
  recyclingMethod?: RecyclingMethod[];
  vendorRecommendations?: string[];     // 추천 재활용 업체
}

export interface UseCase {
  industry: string;
  application: string;
  requirements?: Record<string, any>;
  successCase?: boolean;
  description: string;
}

// ==================== Search Types ====================

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  topK?: number;
}

export interface SearchFilters {
  category?: PartCategory;
  manufacturer?: string;
  maxPrice?: number;
  minQuantity?: number;
  yearRange?: [number, number];
  condition?: PartCondition[];
  // Advanced material filters
  materialFilters?: AdvancedMaterialFilters;
  // Battery-specific filters
  batteryFilters?: BatteryFilters;
}

export interface AdvancedMaterialFilters {
  tensileStrengthMPa?: { min?: number; max?: number };
  yieldStrengthMPa?: { min?: number; max?: number };
  elasticModulusGPa?: { min?: number; max?: number };
  elongationPercent?: { min?: number; max?: number };
  purity?: { min?: number };
  alloyNumber?: string;
  composition?: Array<{
    element: string;
    percentage?: { min?: number; max?: number };
  }>;
  recyclability?: { min?: number };
}

export interface BatteryFilters {
  soh?: { min?: number; max?: number };
  cathodeType?: CathodeType[];
  recommendedUse?: Array<'reuse' | 'recycle' | 'dispose'>;
  suitableApplications?: string[];
  estimatedMileageKm?: { min?: number; max?: number };
}

export interface SearchResult {
  partId: string;
  score: number;
  part: Partial<Part>;
  reason: string;
}

export interface SearchResponse {
  results: SearchResult[];
  cached: boolean;
  count: number;
}

// ==================== Watch Types ====================

export interface Watch {
  watchId: string;
  buyerId: string;
  email?: string;
  phone?: string;
  criteria: WatchCriteria;
  status: WatchStatus;
  createdAt: string;
  triggeredAt?: string;
}

export interface WatchCriteria {
  category?: PartCategory;
  maxPrice?: number;
  minSpecs?: Partial<PartSpecifications>;
  manufacturer?: string;
  keywords?: string[];
}

export type WatchStatus = 'active' | 'triggered' | 'cancelled';

// ==================== Proposal Types ====================

export interface Proposal {
  proposalId: string;
  fromCompanyId: string;
  toCompanyId: string;
  partIds: string[];
  proposalType: 'buy' | 'sell';
  message: string;
  quantity: number;
  priceOffer: number;
  terms: ProposalTerms;
  status: ProposalStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface ProposalTerms {
  deliveryDate?: string;
  paymentTerms?: string;
  warranty?: string;
  notes?: string;
  [key: string]: any;
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'negotiating' | 'cancelled';

// ==================== Company Types ====================

export interface CompanyNeed {
  needId: string;
  companyId: string;
  companyName: string;
  industry: string;
  requiredSpecs: Partial<PartSpecifications>;
  productionProcess: string;
  targetApplication: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'fulfilled' | 'cancelled';
  createdAt: string;
  expiresAt?: string;
}

// ==================== Notification Types ====================

export interface Notification {
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  sentAt: string;
}

export type NotificationType =
  | 'part_available'
  | 'proposal_received'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'compliance_violation'
  | 'watch_triggered';

// ==================== API Response Types ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ListResponse<T = any> {
  items: T[];
  count: number;
  nextToken?: string;
}

// ==================== Synthetic Data Types ====================

export interface SyntheticDataRequest {
  category: PartCategory;
  count?: number;
  template?: Partial<Part>;
}

export interface SyntheticDataResponse {
  message: string;
  parts: Part[];
}

// ==================== Validation Types ====================

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ComplianceViolation {
  rule: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

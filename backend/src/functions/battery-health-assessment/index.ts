import { APIGatewayProxyHandler } from 'aws-lambda';
import type {
  Part,
  BatteryHealthInfo,
  BatteryFilters,
  SearchResponse,
  SearchResult,
} from 'eecar-shared';
import { successResponse, errorResponse, parseJsonBody } from '/opt/nodejs/utils/response.js';
import { loadPartsWithDetails } from '/opt/nodejs/utils/parts.js';

/**
 * Lambda handler for battery health assessment
 * Searches and evaluates batteries based on SOH and other health metrics
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const parsed = parseJsonBody<{ batteryFilters?: BatteryFilters; topK?: number }>(event);
  if (!parsed.ok) {
    return parsed.response;
  }
  const { batteryFilters, topK = 10 } = parsed.body;

  try {
    // Battery METADATA via GSI1 (all pages), joined with BATTERY_HEALTH detail items
    const parts = await loadPartsWithDetails({ category: 'battery', details: ['BATTERY_HEALTH'] });

    const batteryParts = parts
      .filter((item) => {
        // Apply battery filters if provided
        if (batteryFilters) {
          return checkBatteryFilters((item as unknown as Part).batteryHealth, batteryFilters);
        }

        return true;
      })
      .map((item) => {
        const part = item as unknown as Part;
        const batteryHealth = part.batteryHealth;

        // If no battery health info, generate basic assessment
        const healthInfo = batteryHealth || generateBasicAssessment(part);

        // Calculate match score
        const score = calculateBatteryScore(healthInfo, batteryFilters);

        return {
          partId: part.partId,
          score,
          part: {
            ...part,
            batteryHealth: healthInfo,
          },
          reason: generateAssessmentReason(healthInfo),
        } as SearchResult;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const searchResponse: SearchResponse = {
      results: batteryParts,
      cached: false,
      count: batteryParts.length,
    };

    return successResponse({ success: true, data: searchResponse }, 200, event);
  } catch (error) {
    console.error('Battery health assessment error:', error);
    return errorResponse(
      'Failed to assess battery health',
      error instanceof Error ? error.message : 'Unknown error',
      500,
      event
    );
  }
};

/**
 * Check if battery health matches the filters
 */
function checkBatteryFilters(
  batteryHealth: BatteryHealthInfo | undefined,
  filters: BatteryFilters
): boolean {
  if (!batteryHealth) return false;

  // Check SOH range
  if (filters.soh) {
    const soh = batteryHealth.soh;
    if (filters.soh.min && soh < filters.soh.min) return false;
    if (filters.soh.max && soh > filters.soh.max) return false;
  }

  // Check cathode type
  if (filters.cathodeType && filters.cathodeType.length > 0) {
    if (!filters.cathodeType.includes(batteryHealth.cathodeType)) return false;
  }

  // Check recommended use
  if (filters.recommendedUse && filters.recommendedUse.length > 0) {
    if (!filters.recommendedUse.includes(batteryHealth.recommendedUse)) return false;
  }

  // Check suitable applications
  if (filters.suitableApplications && filters.suitableApplications.length > 0) {
    const applications = batteryHealth.suitableApplications || [];
    const hasMatch = filters.suitableApplications.some((app) =>
      applications.includes(app)
    );
    if (!hasMatch) return false;
  }

  // Check estimated mileage
  if (filters.estimatedMileageKm) {
    const mileage = batteryHealth.estimatedMileageKm;
    if (!mileage) return false;
    if (filters.estimatedMileageKm.min && mileage < filters.estimatedMileageKm.min) return false;
    if (filters.estimatedMileageKm.max && mileage > filters.estimatedMileageKm.max) return false;
  }

  return true;
}

/**
 * Generate basic battery assessment if health info is not available
 */
function generateBasicAssessment(part: Part): BatteryHealthInfo {
  // Estimate SOH based on year (rough estimation)
  const currentYear = new Date().getFullYear();
  const age = currentYear - part.year;
  const estimatedSOH = Math.max(50, 100 - age * 5); // Assume 5% degradation per year

  let recommendedUse: 'reuse' | 'recycle' | 'dispose';
  let suitableApplications: string[] = [];

  if (estimatedSOH >= 80) {
    recommendedUse = 'reuse';
    suitableApplications = ['EV 재사용', 'ESS', '전동킥보드', '지게차'];
  } else if (estimatedSOH >= 70) {
    recommendedUse = 'reuse';
    suitableApplications = ['ESS', '전동킥보드', '소형 전동기기'];
  } else if (estimatedSOH >= 50) {
    recommendedUse = 'recycle';
    suitableApplications = ['습식 제련', '건식 제련'];
  } else {
    recommendedUse = 'dispose';
    suitableApplications = [];
  }

  return {
    soh: estimatedSOH,
    cathodeType: 'Other',
    manufacturer: part.manufacturer,
    model: part.model,
    year: part.year,
    recommendedUse,
    suitableApplications,
  };
}

/**
 * Calculate battery match score (0-100)
 */
function calculateBatteryScore(
  batteryHealth: BatteryHealthInfo,
  filters?: BatteryFilters
): number {
  let score = batteryHealth.soh; // Base score is SOH

  // Bonus for reuse recommendation
  if (batteryHealth.recommendedUse === 'reuse') {
    score += 10;
  }

  // Bonus for high mileage potential
  if (batteryHealth.estimatedMileageKm && batteryHealth.estimatedMileageKm > 50000) {
    score += 5;
  }

  // If filters provided, adjust score based on match
  if (filters) {
    // Exact cathode type match
    if (
      filters.cathodeType &&
      filters.cathodeType.includes(batteryHealth.cathodeType)
    ) {
      score += 15;
    }

    // Suitable application match
    if (filters.suitableApplications && batteryHealth.suitableApplications) {
      const matchCount = filters.suitableApplications.filter((app) =>
        batteryHealth.suitableApplications?.includes(app)
      ).length;
      score += matchCount * 5;
    }
  }

  return Math.min(100, score);
}

/**
 * Generate human-readable assessment reason
 */
function generateAssessmentReason(batteryHealth: BatteryHealthInfo): string {
  const reasons: string[] = [];

  reasons.push(`SOH ${batteryHealth.soh}%`);

  if (batteryHealth.recommendedUse === 'reuse') {
    reasons.push('재사용 추천');
  } else if (batteryHealth.recommendedUse === 'recycle') {
    reasons.push('재활용 권장');
  } else {
    reasons.push('폐기 필요');
  }

  if (batteryHealth.cathodeType && batteryHealth.cathodeType !== 'Other') {
    reasons.push(`양극재: ${batteryHealth.cathodeType}`);
  }

  if (batteryHealth.suitableApplications && batteryHealth.suitableApplications.length > 0) {
    const apps = batteryHealth.suitableApplications.slice(0, 2).join(', ');
    reasons.push(`활용 가능: ${apps}`);
  }

  if (batteryHealth.estimatedMileageKm) {
    reasons.push(`예상 주행거리: ${batteryHealth.estimatedMileageKm.toLocaleString()} km`);
  }

  if (batteryHealth.vendorRecommendations && batteryHealth.vendorRecommendations.length > 0) {
    reasons.push(`추천 업체: ${batteryHealth.vendorRecommendations[0]}`);
  }

  return reasons.join(' | ');
}

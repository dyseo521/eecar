import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  Part,
  SearchResponse,
  SearchResult,
  AdvancedMaterialFilters,
  ApiResponse,
} from 'eecar-shared';

const dynamodb = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT,
  }),
});

const PARTS_TABLE = process.env.PARTS_TABLE_NAME || 'eecar-parts-table-local';

/**
 * Lambda handler for material property-based search
 * Searches parts based on advanced material specifications
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { materialFilters, category, topK = 10 } = body as {
      materialFilters?: AdvancedMaterialFilters;
      category?: string;
      topK?: number;
    };

    if (!materialFilters) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'materialFilters is required',
        } as ApiResponse),
      };
    }

    // Scan DynamoDB for parts with material specifications
    const scanCommand = new ScanCommand({
      TableName: PARTS_TABLE,
    });

    const response = await dynamodb.send(scanCommand);
    const allItems = response.Items?.map((item) => unmarshall(item)) || [];

    // Filter parts based on material properties
    const matchedParts = allItems
      .filter((item) => {
        // Only process PART#*#METADATA items
        if (!item.PK?.startsWith('PART#') || !item.SK?.endsWith('#METADATA')) {
          return false;
        }

        const part = item as Part;

        // Apply category filter if provided
        if (category && part.category !== category) {
          return false;
        }

        // Check if part has material specifications
        const materialComp = part.specifications?.materialComposition;
        if (!materialComp) {
          return false;
        }

        // Apply material filters
        return checkMaterialFilters(materialComp, materialFilters);
      })
      .map((item) => {
        const part = item as Part;
        const materialComp = part.specifications?.materialComposition;

        // Calculate match score based on how well it matches filters
        const score = calculateMatchScore(materialComp!, materialFilters);

        return {
          partId: part.partId,
          score,
          part,
          reason: generateMatchReason(materialComp!, materialFilters),
        } as SearchResult;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const searchResponse: SearchResponse = {
      results: matchedParts,
      cached: false,
      count: matchedParts.length,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: searchResponse,
      } as ApiResponse<SearchResponse>),
    };
  } catch (error) {
    console.error('Material property search error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Failed to search by material properties',
        message: error instanceof Error ? error.message : 'Unknown error',
      } as ApiResponse),
    };
  }
};

/**
 * Check if material composition matches the filters
 */
function checkMaterialFilters(
  material: any,
  filters: AdvancedMaterialFilters
): boolean {
  // Check tensile strength
  if (filters.tensileStrengthMPa) {
    const value = material.tensileStrengthMPa;
    if (value === undefined) return false;
    if (filters.tensileStrengthMPa.min && value < filters.tensileStrengthMPa.min) return false;
    if (filters.tensileStrengthMPa.max && value > filters.tensileStrengthMPa.max) return false;
  }

  // Check yield strength
  if (filters.yieldStrengthMPa) {
    const value = material.yieldStrengthMPa;
    if (value === undefined) return false;
    if (filters.yieldStrengthMPa.min && value < filters.yieldStrengthMPa.min) return false;
    if (filters.yieldStrengthMPa.max && value > filters.yieldStrengthMPa.max) return false;
  }

  // Check elastic modulus
  if (filters.elasticModulusGPa) {
    const value = material.elasticModulusGPa;
    if (value === undefined) return false;
    if (filters.elasticModulusGPa.min && value < filters.elasticModulusGPa.min) return false;
    if (filters.elasticModulusGPa.max && value > filters.elasticModulusGPa.max) return false;
  }

  // Check elongation
  if (filters.elongationPercent) {
    const value = material.elongationPercent;
    if (value === undefined) return false;
    if (filters.elongationPercent.min && value < filters.elongationPercent.min) return false;
    if (filters.elongationPercent.max && value > filters.elongationPercent.max) return false;
  }

  // Check alloy number
  if (filters.alloyNumber) {
    if (material.alloyNumber !== filters.alloyNumber) return false;
  }

  // Check recyclability
  if (filters.recyclability?.min) {
    const value = material.recyclability;
    if (value === undefined || value < filters.recyclability.min) return false;
  }

  // Check composition percentages
  if (filters.composition && filters.composition.length > 0) {
    const percentages = material.percentage || {};

    for (const comp of filters.composition) {
      const value = percentages[comp.element];
      if (value === undefined) return false;

      if (comp.percentage?.min && value < comp.percentage.min) return false;
      if (comp.percentage?.max && value > comp.percentage.max) return false;
    }
  }

  return true;
}

/**
 * Calculate match score (0-100)
 */
function calculateMatchScore(
  material: any,
  filters: AdvancedMaterialFilters
): number {
  let score = 100;
  let criteriaCount = 0;

  // Exact alloy match gets high score
  if (filters.alloyNumber && material.alloyNumber === filters.alloyNumber) {
    return 100;
  }

  // Calculate score based on how close to ideal range
  if (filters.tensileStrengthMPa) {
    criteriaCount++;
    const value = material.tensileStrengthMPa;
    const ideal = ((filters.tensileStrengthMPa.min || 0) + (filters.tensileStrengthMPa.max || value)) / 2;
    const deviation = Math.abs(value - ideal) / ideal;
    score -= deviation * 20;
  }

  if (filters.yieldStrengthMPa) {
    criteriaCount++;
    const value = material.yieldStrengthMPa;
    const ideal = ((filters.yieldStrengthMPa.min || 0) + (filters.yieldStrengthMPa.max || value)) / 2;
    const deviation = Math.abs(value - ideal) / ideal;
    score -= deviation * 20;
  }

  if (filters.elasticModulusGPa) {
    criteriaCount++;
    const value = material.elasticModulusGPa;
    const ideal = ((filters.elasticModulusGPa.min || 0) + (filters.elasticModulusGPa.max || value)) / 2;
    const deviation = Math.abs(value - ideal) / ideal;
    score -= deviation * 15;
  }

  // Recyclability bonus
  if (filters.recyclability?.min && material.recyclability >= filters.recyclability.min) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate human-readable match reason
 */
function generateMatchReason(
  material: any,
  filters: AdvancedMaterialFilters
): string {
  const reasons: string[] = [];

  if (filters.alloyNumber && material.alloyNumber === filters.alloyNumber) {
    reasons.push(`합금 번호 ${material.alloyNumber} 정확히 일치`);
  }

  if (filters.tensileStrengthMPa && material.tensileStrengthMPa) {
    reasons.push(`인장강도 ${material.tensileStrengthMPa} MPa`);
  }

  if (filters.yieldStrengthMPa && material.yieldStrengthMPa) {
    reasons.push(`항복강도 ${material.yieldStrengthMPa} MPa`);
  }

  if (filters.elasticModulusGPa && material.elasticModulusGPa) {
    reasons.push(`탄성계수 ${material.elasticModulusGPa} GPa`);
  }

  if (material.recyclability) {
    reasons.push(`재활용성 ${material.recyclability}%`);
  }

  if (reasons.length === 0) {
    return '재질 물성 정보 일치';
  }

  return reasons.join(', ');
}

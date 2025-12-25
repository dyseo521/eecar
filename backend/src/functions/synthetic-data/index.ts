import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { callClaude, generateEmbedding, preparePartText } from '/opt/nodejs/utils/bedrock.js';
import { uploadVector, updateVectorsManifest } from '/opt/nodejs/utils/s3.js';
import { putItem } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';
import {
  MANUFACTURERS,
  VEHICLE_MODELS,
  CONDITIONS,
  MATERIALS,
  CATHODE_TYPES,
  randomChoice,
  randomInt,
  weightedRandomChoice,
  getRandomImages,
  getRandomManufacturer,
  getRandomVehicleModel,
  getRandomYear,
  getRandomCondition,
  getRandomMaterial,
  generateBatteryHealth
} from './data/manufacturers.js';
import { generateUseCases } from './data/useCaseTemplates.js';

// S3 Vectors 환경변수
const USE_S3_VECTORS = process.env.USE_S3_VECTORS === 'true';
const S3_VECTORS_BUCKET = process.env.S3_VECTORS_BUCKET;
const S3_VECTORS_INDEX = process.env.S3_VECTORS_INDEX || 'parts-vectors';

// 최대 배치 크기 (Lambda 타임아웃 고려)
const MAX_BATCH_SIZE = 100;

/**
 * S3 Vectors에 벡터 업로드
 */
async function uploadToS3Vectors(
  partId: string,
  embedding: number[],
  metadata: {
    name: string;
    category: string;
    manufacturer: string;
    price: number;
    condition?: string;
  }
): Promise<void> {
  try {
    const { S3VectorsClient, PutVectorsCommand } = await import('@aws-sdk/client-s3vectors');
    const client = new S3VectorsClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

    const command = new PutVectorsCommand({
      vectorBucketName: S3_VECTORS_BUCKET,
      indexName: S3_VECTORS_INDEX,
      vectors: [{
        key: partId,
        data: { float32: embedding },
        metadata: {
          name: metadata.name,
          category: metadata.category,
          manufacturer: metadata.manufacturer,
          price: String(metadata.price),
          condition: metadata.condition || 'used'
        }
      }]
    });

    await client.send(command);
    console.log(`Successfully uploaded vector to S3 Vectors: ${partId}`);
  } catch (error) {
    console.warn(`Failed to upload to S3 Vectors (non-blocking): ${error}`);
    // S3 Vectors 실패는 치명적이지 않음 - 레거시 S3 백업이 있음
  }
}

/**
 * Synthetic Data Lambda Function
 * Generate diverse synthetic part data using data pools and Claude
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { category, count = 1, template, useClaudeEnhancement = true } = body;

    if (!category) {
      return errorResponse('Category is required', undefined, 400, event);
    }

    const actualCount = Math.min(count, MAX_BATCH_SIZE);
    if (count > MAX_BATCH_SIZE) {
      console.warn(`Requested ${count} parts, limiting to ${MAX_BATCH_SIZE}`);
    }

    console.log(`Generating ${actualCount} synthetic parts for category: ${category}`);

    const generatedParts = [];
    const startTime = Date.now();

    for (let i = 0; i < actualCount; i++) {
      try {
        const part = await generateSyntheticPart(category, template, useClaudeEnhancement);
        const partId = await savePart(part);
        generatedParts.push({ partId, ...part });

        console.log(`Generated part ${i + 1}/${actualCount}: ${partId} (${Date.now() - startTime}ms)`);
      } catch (partError) {
        console.error(`Failed to generate part ${i + 1}:`, partError);
        // 개별 부품 실패는 전체 실패로 이어지지 않음
      }
    }

    return successResponse({
      message: `Successfully generated ${generatedParts.length} synthetic parts`,
      requestedCount: count,
      actualCount: generatedParts.length,
      category,
      parts: generatedParts,
      processingTime: `${Date.now() - startTime}ms`
    }, 201, event);
  } catch (error: any) {
    console.error('Error in synthetic-data:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * 카테고리별 가격 범위
 */
const PRICE_RANGES: Record<string, { min: number; max: number }> = {
  'battery': { min: 3000000, max: 15000000 },
  'motor': { min: 2000000, max: 8000000 },
  'inverter': { min: 1500000, max: 5000000 },
  'body-chassis-frame': { min: 200000, max: 1500000 },
  'body-panel': { min: 100000, max: 800000 },
  'body-door': { min: 150000, max: 1000000 },
  'body-window': { min: 50000, max: 500000 },
  'default': { min: 100000, max: 1000000 }
};

/**
 * Generate a synthetic part using data pools and optional Claude enhancement
 */
async function generateSyntheticPart(
  category: string,
  template?: any,
  useClaudeEnhancement: boolean = true
): Promise<any> {
  const priceRange = PRICE_RANGES[category] || PRICE_RANGES['default'];

  // 기본 데이터 풀에서 랜덤 선택
  const vehicleInfo = getRandomVehicleModel();
  const manufacturer = getRandomManufacturer(category);
  const year = getRandomYear();
  const { condition, priceMultiplier } = getRandomCondition();
  const material = getRandomMaterial(category);

  // 가격 계산 (상태에 따른 가격 조정)
  const basePrice = randomInt(priceRange.min, priceRange.max);
  const finalPrice = Math.round(basePrice * priceMultiplier);

  // 기본 부품 데이터 생성
  const partData: any = {
    name: generatePartName(category, vehicleInfo, manufacturer),
    category,
    manufacturer,
    model: vehicleInfo.model,
    vehicleBrand: vehicleInfo.brand,
    year,
    condition,
    price: finalPrice,
    quantity: randomInt(1, 5),
    description: '',
    specifications: generateSpecifications(category, material),
    useCases: generateUseCases(category, randomInt(3, 5)),
    images: getRandomImages(category, 1, 3)
  };

  // 배터리 카테고리인 경우 batteryHealth 추가
  if (category === 'battery') {
    partData.batteryHealth = generateBatteryHealth();
    // 배터리 상태에 따른 가격 추가 조정
    if (partData.batteryHealth.soh < 70) {
      partData.price = Math.round(partData.price * 0.6);
    } else if (partData.batteryHealth.soh < 80) {
      partData.price = Math.round(partData.price * 0.8);
    }
  }

  // Claude로 설명 생성 (선택적)
  if (useClaudeEnhancement) {
    try {
      partData.description = await generateDescription(partData);
    } catch (error) {
      console.warn('Claude description generation failed, using fallback:', error);
      partData.description = generateFallbackDescription(partData);
    }
  } else {
    partData.description = generateFallbackDescription(partData);
  }

  // 템플릿 오버라이드 적용
  if (template) {
    return { ...partData, ...template };
  }

  return partData;
}

/**
 * 부품명 생성
 */
function generatePartName(
  category: string,
  vehicleInfo: { brand: string; model: string },
  manufacturer: string
): string {
  const categoryNames: Record<string, string[]> = {
    'battery': ['배터리팩', '배터리 모듈', '고전압 배터리', '리튬이온 배터리'],
    'motor': ['구동모터', '전기모터', '영구자석 동기모터', 'PMSM 모터'],
    'inverter': ['인버터', '전력변환장치', 'DC-AC 인버터', 'OBC 인버터'],
    'body-chassis-frame': ['섀시 프레임', '차체 구조물', '언더바디', '서브프레임'],
    'body-panel': ['외판 패널', '펜더', '후드', '트렁크 리드', '루프 패널'],
    'body-door': ['도어 어셈블리', '운전석 도어', '조수석 도어', '후방 도어'],
    'body-window': ['윈드실드', '사이드 윈도우', '리어 윈도우', '선루프 유리']
  };

  const categoryName = randomChoice(categoryNames[category] || ['부품']);

  // 다양한 이름 패턴
  const patterns = [
    `${vehicleInfo.brand} ${vehicleInfo.model} ${categoryName}`,
    `${manufacturer} ${categoryName} (${vehicleInfo.model} 호환)`,
    `${vehicleInfo.model} ${categoryName} - ${manufacturer}`,
    `${vehicleInfo.brand} ${categoryName} 어셈블리`
  ];

  return randomChoice(patterns);
}

/**
 * 스펙 생성
 */
function generateSpecifications(
  category: string,
  material: { primary: string; secondary: string[] }
): any {
  const specs: any = {
    materialComposition: {
      primary: material.primary,
      secondary: material.secondary
    },
    weight: randomInt(5, 500),
    dimensions: {
      length: randomInt(100, 2000),
      width: randomInt(50, 1500),
      height: randomInt(20, 800),
      unit: 'mm'
    }
  };

  // 카테고리별 추가 스펙
  if (category === 'battery') {
    specs.electricalProps = {
      voltage: randomChoice([400, 450, 500, 600, 800]),
      capacity: randomInt(40, 120),
      power: randomInt(100, 300)
    };
    specs.energyDensity = `${randomInt(150, 280)} Wh/kg`;
    specs.chargingRate = `${randomChoice(['1C', '1.5C', '2C', '2.5C', '3C'])}`;
  } else if (category === 'motor') {
    specs.electricalProps = {
      voltage: randomChoice([400, 450, 500, 600, 800]),
      maxPower: randomInt(100, 500),
      maxTorque: randomInt(200, 700),
      rpm: randomInt(10000, 20000)
    };
    specs.efficiency = `${randomInt(92, 97)}%`;
    specs.coolingType = randomChoice(['수냉식', '공냉식', '유냉식']);
  } else if (category === 'inverter') {
    specs.electricalProps = {
      inputVoltage: randomChoice([400, 450, 500, 600, 800]),
      outputVoltage: 220,
      maxPower: randomInt(50, 300),
      efficiency: `${randomInt(95, 99)}%`
    };
    specs.switchingFrequency = `${randomInt(8, 20)} kHz`;
    specs.coolingType = randomChoice(['수냉식', '공냉식']);
  }

  return specs;
}

/**
 * Claude로 상세 설명 생성
 */
async function generateDescription(partData: any): Promise<string> {
  const prompt = `다음 전기차 부품에 대한 상세 설명을 작성하세요. 100-200자 정도의 현실적이고 구체적인 설명을 작성하세요.

부품 정보:
- 이름: ${partData.name}
- 카테고리: ${partData.category}
- 제조사: ${partData.manufacturer}
- 차량 모델: ${partData.model}
- 연식: ${partData.year}년
- 상태: ${partData.condition}
${partData.batteryHealth ? `- 배터리 SOH: ${partData.batteryHealth.soh}%
- 양극재: ${partData.batteryHealth.cathodeType}
- 사이클 수: ${partData.batteryHealth.cycleCount}회` : ''}

설명에 포함할 내용:
1. 부품의 출처 (어떤 차량에서 분리되었는지)
2. 현재 상태 및 사용 이력
3. 구매자에게 도움이 될 정보

설명만 출력하세요. 다른 내용은 포함하지 마세요.`;

  const response = await callClaude(
    [{ role: 'user', content: prompt }],
    '당신은 전기차 중고 부품 판매 전문가입니다. 구매자에게 신뢰감을 주는 상세하고 정직한 설명을 작성합니다.',
    500
  );

  return response.trim();
}

/**
 * 폴백 설명 생성 (Claude 없이)
 */
function generateFallbackDescription(partData: any): string {
  const descriptions: string[] = [
    `${partData.year}년식 ${partData.vehicleBrand || ''} ${partData.model}에서 분리한 ${partData.category} 부품입니다. ${partData.manufacturer}에서 제조하였으며, 현재 상태는 ${partData.condition}입니다.`,
    `정상 작동 확인된 ${partData.manufacturer} 제조 ${partData.category}입니다. ${partData.model} 모델과 호환되며, ${partData.condition} 상태로 판매합니다.`,
    `${partData.model} 호환 ${partData.category}. ${partData.year}년 생산 부품으로, ${partData.manufacturer}의 고품질 제품입니다. 상태: ${partData.condition}`,
  ];

  let description = randomChoice(descriptions);

  // 배터리 추가 정보
  if (partData.batteryHealth) {
    description += ` 배터리 건강 상태(SOH): ${partData.batteryHealth.soh}%, ${partData.batteryHealth.cathodeType} 양극재 사용, 충방전 ${partData.batteryHealth.cycleCount}회.`;
    if (partData.batteryHealth.recommendedUse === 'reuse') {
      description += ' 차량 재사용 가능한 상태입니다.';
    } else if (partData.batteryHealth.recommendedUse === 'refurbish') {
      description += ' 리퍼브 후 ESS 등으로 활용 가능합니다.';
    } else {
      description += ' 재활용 공정을 통한 원료 회수에 적합합니다.';
    }
  }

  return description;
}

/**
 * Save generated part to database
 */
async function savePart(partData: any): Promise<string> {
  const partId = uuidv4();
  const timestamp = new Date().toISOString();

  // Save metadata
  const metadata: any = {
    PK: `PART#${partId}`,
    SK: 'METADATA',
    name: partData.name,
    category: partData.category,
    manufacturer: partData.manufacturer,
    model: partData.model || '',
    vehicleBrand: partData.vehicleBrand || '',
    year: partData.year || 2020,
    condition: partData.condition || 'used',
    price: partData.price,
    quantity: partData.quantity || 1,
    sellerId: 'synthetic',
    description: partData.description || '',
    images: partData.images || [],
    createdAt: timestamp,
    updatedAt: timestamp,
    GSI1PK: `CATEGORY#${partData.category}`,
    GSI1SK: `CREATED_AT#${timestamp}`,
  };

  // 배터리 건강 정보 추가
  if (partData.batteryHealth) {
    metadata.batteryHealth = partData.batteryHealth;
  }

  await putItem(metadata);

  // Save specifications
  if (partData.specifications) {
    await putItem({
      PK: `PART#${partId}`,
      SK: 'SPEC',
      ...partData.specifications,
    });
  }

  // Save use cases
  if (partData.useCases && Array.isArray(partData.useCases)) {
    for (let i = 0; i < partData.useCases.length; i++) {
      const usageId = `${i + 1}`.padStart(3, '0');
      await putItem({
        PK: `PART#${partId}`,
        SK: `USAGE#${usageId}`,
        ...partData.useCases[i],
      });
    }
  }

  // Generate and save embedding
  const partText = preparePartText(partData);
  const embedding = await generateEmbedding(partText);

  // 레거시 S3 JSON 저장 (백업)
  const vectorKey = `parts/${partId}.json`;
  await uploadVector(vectorKey, embedding);
  await updateVectorsManifest([vectorKey]);

  // S3 Vectors 저장 (활성화된 경우)
  if (USE_S3_VECTORS && S3_VECTORS_BUCKET) {
    await uploadToS3Vectors(partId, embedding, {
      name: partData.name,
      category: partData.category,
      manufacturer: partData.manufacturer,
      price: partData.price,
      condition: partData.condition
    });
  }

  await putItem({
    PK: `PART#${partId}`,
    SK: 'VECTOR',
    s3Key: vectorKey,
    s3VectorsEnabled: USE_S3_VECTORS && S3_VECTORS_BUCKET ? true : false,
    embeddingModel: 'amazon.titan-embed-text-v2:0',
    dimension: embedding.length,
    createdAt: timestamp,
  });

  return partId;
}

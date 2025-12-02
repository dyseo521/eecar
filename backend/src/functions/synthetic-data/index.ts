import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { callClaude, generateEmbedding, preparePartText } from '/opt/nodejs/utils/bedrock.js';
import { uploadVector, updateVectorsManifest } from '/opt/nodejs/utils/s3.js';
import { putItem } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

/**
 * Synthetic Data Lambda Function
 * Generate synthetic part data using MCP-style tools with Claude
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { category, count = 1, template } = body;

    if (!category) {
      return errorResponse('Category is required', undefined, 400, event);
    }

    if (count > 10) {
      return errorResponse('Maximum 10 parts per request', undefined, 400, event);
    }

    console.log(`Generating ${count} synthetic parts for category: ${category}`);

    const generatedParts = [];

    for (let i = 0; i < count; i++) {
      const part = await generateSyntheticPart(category, template);
      const partId = await savePart(part);
      generatedParts.push({ partId, ...part });

      console.log(`Generated part ${i + 1}/${count}: ${partId}`);
    }

    return successResponse({
      message: `Successfully generated ${count} synthetic parts`,
      parts: generatedParts,
    }, 201, event);
  } catch (error: any) {
    console.error('Error in synthetic-data:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * Generate a synthetic part using Claude
 */
async function generateSyntheticPart(category: string, template?: any): Promise<any> {
  // 카테고리별 현실적인 가격 범위 설정
  const priceRanges: Record<string, { min: number; max: number }> = {
    'battery': { min: 3000000, max: 15000000 },  // 배터리: 300만원 ~ 1500만원
    'motor': { min: 2000000, max: 8000000 },     // 모터: 200만원 ~ 800만원
    'inverter': { min: 1500000, max: 5000000 },  // 인버터: 150만원 ~ 500만원
    'body-chassis-frame': { min: 200000, max: 1500000 },  // 차체 프레임: 20만원 ~ 150만원
    'body-panel': { min: 100000, max: 800000 },  // 외판 패널: 10만원 ~ 80만원
    'body-door': { min: 150000, max: 1000000 },  // 도어: 15만원 ~ 100만원
    'body-window': { min: 50000, max: 500000 },  // 윈도우: 5만원 ~ 50만원
    'default': { min: 100000, max: 1000000 }     // 기타: 10만원 ~ 100만원
  };

  const priceRange = priceRanges[category] || priceRanges['default'];

  const prompt = `전기차 중고 부품 데이터베이스를 위한 샘플 데이터를 생성해주세요.

카테고리: ${category}

**중요**: 가격은 반드시 ${priceRange.min.toLocaleString()}원 ~ ${priceRange.max.toLocaleString()}원 범위 내에서 현실적으로 설정하세요.
- 카테고리가 "${category}"인 실제 중고 전기차 부품의 시장 가격을 고려하세요.
- 제조사, 연식, 상태에 따라 가격이 달라져야 합니다.

다음 형식으로 JSON을 생성해주세요:
{
  "name": "부품명 (구체적으로, 예: 현대 IONIQ 5 배터리팩 72kWh)",
  "category": "${category}",
  "manufacturer": "제조사 (예: 현대, 기아, 테슬라, LG에너지솔루션 등)",
  "model": "차량 모델 (예: IONIQ 5, EV6, Model 3 등)",
  "year": 2018,
  "condition": "used",
  "price": ${Math.floor((priceRange.min + priceRange.max) / 2)},
  "quantity": 1,
  "description": "상세하고 현실적인 설명 (부품 상태, 주행거리, 특이사항 등)",
  "specifications": {
    "materialComposition": {
      "primary": "주 소재 (알루미늄, 강철, 리튬이온 등)",
      "secondary": ["부 소재들"]
    },
    "dimensions": {
      "length": 100,
      "width": 50,
      "height": 30,
      "unit": "mm"
    },
    "weight": 5,
    "electricalProps": {
      "voltage": 12,
      "capacity": 60,
      "power": 100
    }
  },
  "useCases": [
    {
      "industry": "산업 분야 (예: 자동차 수리, ESS 전환, 재활용 등)",
      "application": "활용처",
      "description": "구체적인 설명"
    }
  ]
}

현실적이고 구체적인 데이터를 생성해주세요. 특히 가격은 위에 명시된 범위 내에서 설정하세요.
JSON만 출력하고 다른 설명은 하지 마세요.`;

  try {
    const response = await callClaude(
      [{ role: 'user', content: prompt }],
      '당신은 전기차 부품 데이터 생성 전문가입니다.',
      2000
    );

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const partData = JSON.parse(jsonMatch[0]);

    // Apply template overrides if provided
    if (template) {
      return { ...partData, ...template };
    }

    return partData;
  } catch (error) {
    console.error('Failed to generate synthetic part:', error);
    throw error;
  }
}

/**
 * Save generated part to database
 */
async function savePart(partData: any): Promise<string> {
  const partId = uuidv4();
  const timestamp = new Date().toISOString();

  // Save metadata
  const metadata = {
    PK: `PART#${partId}`,
    SK: 'METADATA',
    name: partData.name,
    category: partData.category,
    manufacturer: partData.manufacturer,
    model: partData.model || '',
    year: partData.year || 2015,
    condition: partData.condition || 'used',
    price: partData.price,
    quantity: partData.quantity || 1,
    sellerId: 'synthetic',
    description: partData.description || '',
    images: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    GSI1PK: `CATEGORY#${partData.category}`,
    GSI1SK: `CREATED_AT#${timestamp}`,
  };

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

  const vectorKey = `parts/${partId}.json`;
  await uploadVector(vectorKey, embedding);
  await updateVectorsManifest([vectorKey]);

  await putItem({
    PK: `PART#${partId}`,
    SK: 'VECTOR',
    s3Key: vectorKey,
    embeddingModel: 'amazon.titan-embed-text-v2:0',
    dimension: embedding.length,
    createdAt: timestamp,
  });

  return partId;
}

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
  const prompt = `전기차 중고 부품 데이터베이스를 위한 샘플 데이터를 생성해주세요.

카테고리: ${category}

다음 형식으로 JSON을 생성해주세요:
{
  "name": "부품명",
  "category": "${category}",
  "manufacturer": "제조사",
  "model": "차량 모델",
  "year": 2015,
  "condition": "used",
  "price": 100000,
  "quantity": 1,
  "description": "상세 설명",
  "specifications": {
    "materialComposition": {
      "primary": "주 소재",
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
      "industry": "산업 분야",
      "application": "활용처",
      "description": "설명"
    }
  ]
}

현실적이고 구체적인 데이터를 생성해주세요. JSON만 출력하고 다른 설명은 하지 마세요.`;

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
    embeddingModel: 'amazon.titan-embed-text-v1',
    dimension: embedding.length,
    createdAt: timestamp,
  });

  return partId;
}

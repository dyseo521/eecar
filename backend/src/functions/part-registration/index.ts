import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding, preparePartText } from '../../utils/bedrock';
import { uploadVector, updateVectorsManifest } from '../../utils/s3';
import { putItem } from '../../utils/dynamodb';

const lambdaClient = new LambdaClient({});

/**
 * Part Registration Lambda Function
 * Register new parts, generate embeddings, and invoke compliance check
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const {
      name,
      category,
      manufacturer,
      model,
      year,
      condition,
      price,
      quantity,
      sellerId,
      description,
      images,
      specifications,
      useCases,
    } = body;

    // Validation
    if (!name || !category || !manufacturer || !price) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: name, category, manufacturer, price' }),
      };
    }

    const partId = uuidv4();
    const timestamp = new Date().toISOString();

    console.log('Registering new part:', partId);

    // Step 1: Store part metadata
    const partMetadata = {
      PK: `PART#${partId}`,
      SK: 'METADATA',
      name,
      category,
      manufacturer,
      model: model || '',
      year: year || new Date().getFullYear(),
      condition: condition || 'used',
      price,
      quantity: quantity || 1,
      sellerId: sellerId || 'system',
      description: description || '',
      images: images || [],
      createdAt: timestamp,
      updatedAt: timestamp,
      GSI1PK: `CATEGORY#${category}`,
      GSI1SK: `CREATED_AT#${timestamp}`,
    };

    await putItem(partMetadata);
    console.log('Part metadata stored');

    // Step 2: Store specifications if provided
    if (specifications) {
      await putItem({
        PK: `PART#${partId}`,
        SK: 'SPEC',
        ...specifications,
      });
      console.log('Part specifications stored');
    }

    // Step 3: Store use cases if provided
    if (useCases && Array.isArray(useCases)) {
      for (let i = 0; i < useCases.length; i++) {
        const usageId = `${i + 1}`.padStart(3, '0');
        await putItem({
          PK: `PART#${partId}`,
          SK: `USAGE#${usageId}`,
          ...useCases[i],
        });
      }
      console.log(`Stored ${useCases.length} use cases`);
    }

    // Step 4: Generate embedding
    console.log('Generating embedding...');
    const partText = preparePartText({
      name,
      category,
      manufacturer,
      model,
      description,
      specifications,
    });

    const embedding = await generateEmbedding(partText);

    // Step 5: Upload vector to S3
    const vectorKey = `parts/${partId}.json`;
    await uploadVector(vectorKey, embedding);
    await updateVectorsManifest([vectorKey]);
    console.log('Vector uploaded to S3');

    // Step 6: Store vector reference
    await putItem({
      PK: `PART#${partId}`,
      SK: 'VECTOR',
      s3Key: vectorKey,
      embeddingModel: 'amazon.titan-embed-text-v1',
      dimension: embedding.length,
      createdAt: timestamp,
    });

    // Step 7: Invoke compliance check (async)
    console.log('Invoking compliance check...');
    try {
      const compliancePayload = {
        partId,
        partData: {
          name,
          category,
          manufacturer,
          specifications,
        },
      };

      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.COMPLIANCE_FUNCTION_NAME,
          InvocationType: 'Event', // Async invocation
          Payload: JSON.stringify(compliancePayload),
        })
      );
      console.log('Compliance check invoked');
    } catch (error) {
      console.error('Failed to invoke compliance check:', error);
      // Don't fail the registration if compliance check fails
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Part registered successfully',
        partId,
        metadata: partMetadata,
      }),
    };
  } catch (error: any) {
    console.error('Error in part registration:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
}

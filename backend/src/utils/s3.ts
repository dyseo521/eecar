import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

const VECTORS_BUCKET = process.env.VECTORS_BUCKET_NAME!;
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME!;

/**
 * Upload vector to S3
 */
export async function uploadVector(key: string, vector: number[]): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: VECTORS_BUCKET,
    Key: key,
    Body: JSON.stringify(vector),
    ContentType: 'application/json',
  });

  await s3Client.send(command);
}

/**
 * Get vector from S3
 */
export async function getVector(key: string): Promise<number[] | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: key,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    return body ? JSON.parse(body) : null;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Get document from S3
 */
export async function getDocument(key: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
    });

    const response = await s3Client.send(command);
    return await response.Body?.transformToString() || null;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Upload document to S3
 */
export async function uploadDocument(key: string, content: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: key,
    Body: content,
    ContentType: 'text/plain',
  });

  await s3Client.send(command);
}

/**
 * List all vector keys (for batch operations)
 */
export async function listVectorKeys(prefix?: string): Promise<string[]> {
  // For simplicity, we'll load a manifest file instead of listing
  // This is more cost-effective than LIST operations
  try {
    const manifestKey = 'vectors-manifest.json';
    const command = new GetObjectCommand({
      Bucket: VECTORS_BUCKET,
      Key: manifestKey,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    const manifest: string[] = body ? JSON.parse(body) : [];

    if (prefix) {
      return manifest.filter(key => key.startsWith(prefix));
    }
    return manifest;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return [];
    }
    throw error;
  }
}

/**
 * Update vectors manifest (call after uploading new vectors)
 */
export async function updateVectorsManifest(newKeys: string[]): Promise<void> {
  const manifestKey = 'vectors-manifest.json';
  const existingKeys = await listVectorKeys();
  const updatedKeys = Array.from(new Set([...existingKeys, ...newKeys]));

  const command = new PutObjectCommand({
    Bucket: VECTORS_BUCKET,
    Key: manifestKey,
    Body: JSON.stringify(updatedKeys, null, 2),
    ContentType: 'application/json',
  });

  await s3Client.send(command);
}

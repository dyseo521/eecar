/**
 * Part read model helpers.
 *
 * A part is stored as several items under PK=PART#{id}: METADATA (indexed by GSI1 per
 * category and GSI2 for all parts), SPEC, BATTERY_HEALTH, VECTOR, USAGE#... Readers that
 * need specifications or battery health must join those items; reading METADATA alone
 * silently misses them.
 */

import {
  batchGetItems,
  queryAllMetadataWithPagination,
  queryGSI1WithPagination,
  DynamoDBItem,
} from './dynamodb.js';

const PAGE_SIZE = 100;
const INDEX_KEY_ATTRIBUTES = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'];

export type PartDetailKind = 'SPEC' | 'BATTERY_HEALTH';

export interface PartRecord {
  partId: string;
  specifications?: Record<string, unknown>;
  batteryHealth?: Record<string, unknown>;
  [key: string]: unknown;
}

function stripIndexKeys(item: DynamoDBItem): Record<string, unknown> {
  const data: Record<string, unknown> = { ...item };
  for (const key of INDEX_KEY_ATTRIBUTES) {
    delete data[key];
  }
  return data;
}

/**
 * Load every METADATA item of a category (GSI1) or of all parts (GSI2),
 * following pagination so results are never cut off at the 1MB page boundary.
 */
export async function listPartMetadata(category?: string): Promise<DynamoDBItem[]> {
  const items: DynamoDBItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const page = category
      ? await queryGSI1WithPagination(`CATEGORY#${category}`, 'CREATED_AT#', PAGE_SIZE, lastKey)
      : await queryAllMetadataWithPagination(PAGE_SIZE, lastKey);
    items.push(...page.items);
    lastKey = page.lastKey ?? undefined;
  } while (lastKey);

  return items;
}

/**
 * Load parts with the requested detail items joined in.
 * Inline values on METADATA (written by some importers) take precedence over detail items.
 */
export async function loadPartsWithDetails(
  options: { category?: string; details?: PartDetailKind[] } = {}
): Promise<PartRecord[]> {
  const { category, details = [] } = options;
  const metadataItems = await listPartMetadata(category);

  const detailItems = details.length > 0
    ? await batchGetItems(metadataItems.flatMap(m => details.map(sk => ({ pk: m.PK, sk }))))
    : [];
  const detailsByKey = new Map(detailItems.map(d => [`${d.PK}|${d.SK}`, stripIndexKeys(d)]));

  return metadataItems.map(metadata => {
    const part: PartRecord = {
      ...stripIndexKeys(metadata),
      partId: metadata.PK.slice('PART#'.length),
    };

    const spec = detailsByKey.get(`${metadata.PK}|SPEC`);
    if (!part.specifications && spec) {
      part.specifications = spec;
    }

    const batteryHealth = detailsByKey.get(`${metadata.PK}|BATTERY_HEALTH`);
    if (!part.batteryHealth && batteryHealth) {
      part.batteryHealth = batteryHealth;
    }

    return part;
  });
}

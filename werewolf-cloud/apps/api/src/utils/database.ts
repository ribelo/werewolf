import type { D1Database } from '@cloudflare/workers-types';

export type Database = D1Database;

/**
 * Execute a parameterized query with proper error handling.
 *
 * The row type stays loose on purpose: callers across apps/api read columns
 * straight off the returned rows, and tightening the default to
 * Record<string, unknown> breaks roughly 190 property reads in files owned by
 * other changes. Callers that type their query pass an explicit generic.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export async function executeQuery<T = any>(
  db: Database,
  sql: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  try {
    const result = await db.prepare(sql).bind(...params).all();
    return result.results as T[];
  } catch (error) {
    console.error('Database query error:', sql, params, error);
    throw error;
  }
}

/**
 * Execute a query that returns a single row (see executeQuery for the loose
 * default row type).
 */
// oxlint-disable-next-line typescript/no-explicit-any
export async function executeQueryOne<T = any>(
  db: Database,
  sql: string,
  params: readonly unknown[] = []
): Promise<T | null> {
  try {
    const result = await db.prepare(sql).bind(...params).first();
    return (result as T | null) ?? null;
  } catch (error) {
    console.error('Database query error:', sql, params, error);
    throw error;
  }
}

/**
 * Execute a mutation query (INSERT, UPDATE, DELETE)
 */
export async function executeMutation(
  db: Database,
  sql: string,
  params: readonly unknown[] = []
): Promise<{ success: boolean; changes: number }> {
  try {
    const result = await db.prepare(sql).bind(...params).run();
    return {
      success: result.success,
      changes: result.meta?.changes || 0,
    };
  } catch (error) {
    console.error('Database mutation error:', sql, params, error);
    throw error;
  }
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Convert snake_case string to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Recursively convert object keys from snake_case to camelCase
 */
export function convertKeysToCamelCase<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertKeysToCamelCase(item)) as unknown as T;
  }

  const source = value as Record<string, unknown>;
  const converted: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    converted[snakeToCamel(key)] = convertKeysToCamelCase(source[key]);
  }

  return converted as unknown as T;
}

import type { D1Database } from '@cloudflare/workers-types';

export type Database = D1Database;

/**
 * Execute a parameterized query with proper error handling
 */
export async function executeQuery<T = any>(
  db: Database,
  sql: string,
  params: any[] = []
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
 * Execute a query that returns a single row
 */
export async function executeQueryOne<T = any>(
  db: Database,
  sql: string,
  params: any[] = []
): Promise<T | null> {
  try {
    const result = await db.prepare(sql).bind(...params).first();
    return result as T | null;
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
  params: any[] = []
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
export function convertKeysToCamelCase(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase);
  }

  const converted: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      converted[snakeToCamel(key)] = convertKeysToCamelCase(obj[key]);
    }
  }
  return converted;
}
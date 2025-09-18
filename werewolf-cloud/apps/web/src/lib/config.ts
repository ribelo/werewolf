export function getApiBase(): string {
  // Check for environment variable first
  const envBase = import.meta.env['PUBLIC_API_BASE'];
  if (envBase) return envBase;

  // Default to local development
  return 'http://127.0.0.1:8787';
}
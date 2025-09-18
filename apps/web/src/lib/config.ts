import { PUBLIC_API_BASE } from '$env/static/public';

const DEFAULT_API_BASE = 'http://127.0.0.1:8787';

export function getApiBase(): string {
  return PUBLIC_API_BASE || DEFAULT_API_BASE;
}

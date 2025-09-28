export function getApiBase(): string {
  const envBase = import.meta.env['PUBLIC_API_BASE'];
  if (envBase) return envBase;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://127.0.0.1:8787';
    }
  }

  return 'https://werewolf.r-krzywaznia-2c4.workers.dev';
}

import { getApiBase } from './config';

export interface ApiResponse<T> {
  data: T;
  error: string | null;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(public override message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  public baseUrl: string;

  constructor() {
    this.baseUrl = getApiBase();
  }

  private async request<T>(endpoint: string, options: RequestInit & { fetch?: typeof fetch } = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers(options.headers ?? {});
    if (options.body !== undefined && options.body !== null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const fetchFn = options.fetch ?? fetch;
    const { fetch: _, ...fetchOptions } = options;

    try {
      const response = await fetchFn(url, {
        ...fetchOptions,
        headers,
      });

      if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status);
      }

      const json = await response.json();
      return json as ApiResponse<T>;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Network or other error
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        0
      );
    }
  }

  // GET request
  async get<T>(endpoint: string, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, fetch ? { method: 'GET', fetch } : { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    const init: RequestInit & { fetch?: typeof globalThis.fetch } = { method: 'POST' };
    if (data !== undefined) {
      init.body = JSON.stringify(data);
    }
    if (fetch) {
      init.fetch = fetch;
    }
    return this.request<T>(endpoint, init);
  }

  // PUT request
  async put<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    const init: RequestInit & { fetch?: typeof globalThis.fetch } = { method: 'PUT' };
    if (data !== undefined) {
      init.body = JSON.stringify(data);
    }
    if (fetch) {
      init.fetch = fetch;
    }
    return this.request<T>(endpoint, init);
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    const init: RequestInit & { fetch?: typeof globalThis.fetch } = { method: 'PATCH' };
    if (data !== undefined) {
      init.body = JSON.stringify(data);
    }
    if (fetch) {
      init.fetch = fetch;
    }
    return this.request<T>(endpoint, init);
  }

  // DELETE request
  async delete<T>(endpoint: string, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, fetch ? { method: 'DELETE', fetch } : { method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export types
export type { ApiClient };

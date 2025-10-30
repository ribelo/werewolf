import { getApiBase } from './config';
import { enqueueMutation, registerMutationExecutor } from '$lib/offline/mutation-queue';

export interface ApiResponse<T> {
  data: T;
  error: string | null;
  requestId?: string;
  queued?: boolean;
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

  public async request<T>(endpoint: string, options: RequestInit & { fetch?: typeof fetch } = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers(options.headers ?? {});
    if (options.body !== undefined && options.body !== null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const fetchFn = options.fetch ?? fetch;
    const { fetch: _, ...fetchOptions } = options;

    try {
      const requestInit: RequestInit = {
        ...fetchOptions,
        headers,
        credentials: 'include',
      };

      const response = await fetchFn(url, requestInit);

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

  private headersToObject(headers: HeadersInit | undefined): Record<string, string> {
    const record: Record<string, string> = {};
    if (!headers) return record;
    const iterable = headers instanceof Headers ? headers : new Headers(headers);
    iterable.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  private async sendMutation<T>(
    method: HttpMethod,
    endpoint: string,
    data?: unknown,
    fetch?: typeof globalThis.fetch,
  ): Promise<ApiResponse<T>> {
    const init: RequestInit & { fetch?: typeof globalThis.fetch } = { method };
    const headers = new Headers();
    const bodyString = data !== undefined ? JSON.stringify(data) : null;
    if (bodyString !== null) {
      init.body = bodyString;
      headers.set('Content-Type', 'application/json');
    }
    init.headers = headers;

    if (fetch || typeof window === 'undefined') {
      if (fetch) init.fetch = fetch;
      return this.request<T>(endpoint, init);
    }

    if (!navigator.onLine) {
      return enqueueMutation<T>({
        method,
        endpoint,
        body: bodyString,
        headers: this.headersToObject(headers),
      });
    }

    try {
      return await this.request<T>(endpoint, init);
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        throw error;
      }
      return enqueueMutation<T>({
        method,
        endpoint,
        body: bodyString,
        headers: this.headersToObject(headers),
      });
    }
  }

  // POST request
  async post<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    return this.sendMutation<T>('POST', endpoint, data, fetch);
  }

  // PUT request
  async put<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    return this.sendMutation<T>('PUT', endpoint, data, fetch);
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    return this.sendMutation<T>('PATCH', endpoint, data, fetch);
  }

  // DELETE request
  async delete<T>(endpoint: string, fetch?: typeof globalThis.fetch): Promise<ApiResponse<T>> {
    if (fetch || typeof window === 'undefined') {
      return this.request<T>(endpoint, fetch ? { method: 'DELETE', fetch } : { method: 'DELETE' });
    }

    if (!navigator.onLine) {
      return enqueueMutation<T>({
        method: 'DELETE',
        endpoint,
        body: null,
        headers: {},
      });
    }

    try {
      return await this.request<T>(endpoint, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof ApiError && error.status !== 0) {
        throw error;
      }
      return enqueueMutation<T>({
        method: 'DELETE',
        endpoint,
        body: null,
        headers: {},
      });
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

registerMutationExecutor(async mutation => {
  const headers = new Headers(mutation.headers);
  const options: RequestInit = {
    method: mutation.method,
    headers,
  };
  if (mutation.body !== null) {
    options.body = mutation.body;
  }
  return apiClient.request(mutation.endpoint, options);
});

// Export types
export type { ApiClient };

type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

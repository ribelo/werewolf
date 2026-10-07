import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { getApiBase } from './config';
import {
  enqueueMutation,
  registerMutationExecutor,
  type QueuedMutationReceipt,
} from '$lib/offline/mutation-queue';

export interface ApiResponse<T> {
  data: T;
  error: string | null;
  requestId?: string;
  /** Set to `false` on responses that were actually sent to the API. */
  queued?: false;
}

/**
 * Result of a mutation: either the API response or a receipt proving the
 * mutation was written to the offline queue and has not reached the server yet.
 * A queued receipt carries no data, so callers must check `queued` before
 * using the response as a server confirmation.
 */
export type MutationOutcome<T> = ApiResponse<T> | QueuedMutationReceipt;
export type { QueuedMutationReceipt };

export type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiErrorKind = 'http' | 'decode' | 'network' | 'offline';

export class ApiError extends Error {
  public readonly kind: ApiErrorKind;
  public readonly requestId: string | null;

  constructor(
    public override message: string,
    public status: number,
    options: { kind?: ApiErrorKind; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = options.kind ?? 'http';
    this.requestId = options.requestId ?? null;
  }
}

type DecodedBody = { ok: true; value: unknown } | { ok: false };

function decodeJsonBody(text: string): DecodedBody {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function readEnvelopeField(value: unknown, field: 'error' | 'requestId'): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === 'string' && candidate !== '' ? candidate : null;
}

function translate(key: string): string {
  return get(_)(key);
}

/**
 * Meet-day edits that are safe to replay from the offline queue: attempt
 * weight/result updates, registration edits and competitor edits.
 *
 * Everything else (auth, settings, backups, database resets, deletes and
 * creates) fails fast while offline instead of being replayed later - replaying
 * a login, a reset or a restore after reconnecting is never the operator's
 * intent, and the password must not be persisted in IndexedDB.
 */
const QUEUEABLE_MUTATIONS: ReadonlyArray<{ method: HttpMethod; pattern: RegExp }> = [
  { method: 'POST', pattern: /^\/contests\/[^/]+\/registrations\/[^/]+\/attempts$/ },
  { method: 'PATCH', pattern: /^\/attempts\/[^/]+\/result$/ },
  { method: 'PATCH', pattern: /^\/registrations\/[^/]+$/ },
  { method: 'PATCH', pattern: /^\/registrations\/[^/]+\/labels$/ },
  { method: 'POST', pattern: /^\/contests\/[^/]+\/registrations\/bulk-flight$/ },
  { method: 'PATCH', pattern: /^\/competitors\/[^/]+$/ },
];

export function isQueueableMutation(method: HttpMethod, endpoint: string): boolean {
  const [path = endpoint] = endpoint.split('?');
  return QUEUEABLE_MUTATIONS.some(entry => entry.method === method && entry.pattern.test(path));
}

class ApiClient {
  public baseUrl: string;

  constructor() {
    this.baseUrl = getApiBase();
  }

  public async request<T>(
    endpoint: string,
    options: RequestInit & { fetch?: typeof fetch } = {},
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers(options.headers ?? {});
    if (options.body !== undefined && options.body !== null && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const { fetch: fetchOverride, ...fetchOptions } = options;
    const fetchFn = fetchOverride ?? fetch;

    let response: Response;
    try {
      response = await fetchFn(url, { ...fetchOptions, headers, credentials: 'include' });
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : translate('api.error.network'),
        0,
        { kind: 'network' },
      );
    }

    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      // The response arrived, so the server may already have applied the
      // mutation: this is not a queueable transport failure.
      throw new ApiError(
        error instanceof Error ? error.message : translate('api.error.malformed_response'),
        response.status,
        { kind: 'decode' },
      );
    }

    const body = decodeJsonBody(bodyText);

    if (!response.ok) {
      const envelope = body.ok ? body.value : null;
      const requestId =
        readEnvelopeField(envelope, 'requestId') ?? response.headers.get('x-request-id');
      const message = readEnvelopeField(envelope, 'error');
      throw new ApiError(message ?? `HTTP ${response.status}: ${response.statusText}`, response.status, {
        kind: 'http',
        requestId,
      });
    }

    if (bodyText.trim() === '') {
      return { data: undefined as T, error: null };
    }

    if (!body.ok) {
      throw new ApiError(translate('api.error.malformed_response'), response.status, {
        kind: 'decode',
      });
    }

    return body.value as ApiResponse<T>;
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
  ): Promise<MutationOutcome<T>> {
    const init: RequestInit & { fetch?: typeof globalThis.fetch } = { method };
    const headers = new Headers();
    const bodyString = data !== undefined ? JSON.stringify(data) : null;
    if (bodyString !== null) {
      init.body = bodyString;
      headers.set('Content-Type', 'application/json');
    }
    init.headers = headers;

    // Requests made with an explicit fetch implementation (tests, SSR) are
    // never queued: there is no browser to replay them in.
    if (fetch || typeof window === 'undefined') {
      if (fetch) init.fetch = fetch;
      return this.request<T>(endpoint, init);
    }

    if (!navigator.onLine) {
      return this.enqueueOrFail<T>(method, endpoint, bodyString, headers);
    }

    try {
      return await this.request<T>(endpoint, init);
    } catch (error) {
      // Only a transport failure may be queued. An HTTP error means the server
      // rejected the mutation, and a decode error means it already committed it
      // and only the response body was unusable - replaying either would be wrong.
      if (!(error instanceof ApiError) || error.kind !== 'network') {
        throw error;
      }
      return this.enqueueOrFail<T>(method, endpoint, bodyString, headers);
    }
  }

  private async enqueueOrFail<T>(
    method: HttpMethod,
    endpoint: string,
    body: string | null,
    headers: Headers,
  ): Promise<MutationOutcome<T>> {
    if (!isQueueableMutation(method, endpoint)) {
      throw new ApiError(translate('api.offline.not_queueable'), 0, { kind: 'offline' });
    }
    return enqueueMutation({
      method,
      endpoint,
      body,
      headers: this.headersToObject(headers),
    });
  }

  // POST request
  async post<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<MutationOutcome<T>> {
    return this.sendMutation<T>('POST', endpoint, data, fetch);
  }

  // PUT request
  async put<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<MutationOutcome<T>> {
    return this.sendMutation<T>('PUT', endpoint, data, fetch);
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: unknown, fetch?: typeof globalThis.fetch): Promise<MutationOutcome<T>> {
    return this.sendMutation<T>('PATCH', endpoint, data, fetch);
  }

  // DELETE request
  async delete<T>(endpoint: string, fetch?: typeof globalThis.fetch): Promise<MutationOutcome<T>> {
    return this.sendMutation<T>('DELETE', endpoint, undefined, fetch);
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

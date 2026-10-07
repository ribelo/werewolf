import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load } from '../login/+page';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('$lib/api', () => ({
  apiClient: {
    baseUrl: 'http://127.0.0.1:8787',
    get: (...args: unknown[]) => getMock(...args),
  },
}));

type LoginLoadEvent = Parameters<typeof load>[0];

function loadEvent(): LoginLoadEvent {
  return { fetch: vi.fn() } as unknown as LoginLoadEvent;
}

describe('login page loader', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('redirects an authenticated session to the dashboard', async () => {
    getMock.mockResolvedValue({ data: { authenticated: true }, error: null });

    const thrown: unknown = await load(loadEvent()).then(
      () => null,
      (error: unknown) => error,
    );

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ status: 302, location: '/' });
  });

  it('renders the login form for an unauthenticated session', async () => {
    getMock.mockResolvedValue({ data: { authenticated: false }, error: null });

    await expect(load(loadEvent())).resolves.toEqual({});
  });

  it('renders the login form when the session probe fails', async () => {
    getMock.mockRejectedValue(new Error('network down'));

    await expect(load(loadEvent())).resolves.toEqual({});
  });
});

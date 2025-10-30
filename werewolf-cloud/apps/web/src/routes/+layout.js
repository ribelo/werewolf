import { setupI18n } from '$lib/i18n';
import { apiClient } from '$lib/api';
import { redirect } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

const isPublicPath = (pathname) => {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/display')) return true;
  return false;
};

/** @type {import('./$types').LayoutLoad} */
export async function load(event) {
  await setupI18n();
  const existingData = event.data ?? {};

  try {
    const sessionResponse = await apiClient.get('/auth/session', event.fetch);
    const session = {
      authenticated: sessionResponse.data?.authenticated ?? false,
      checked: true,
    };

    if (!session.authenticated && !isPublicPath(event.url.pathname)) {
      throw redirect(302, '/login');
    }

    return {
      ...existingData,
      session,
    };
  } catch {
    if (!isPublicPath(event.url.pathname)) {
      throw redirect(302, '/login');
    }

    return {
      ...existingData,
      session: { authenticated: false, checked: true },
    };
  }
}

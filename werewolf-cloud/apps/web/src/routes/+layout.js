import { setupI18n } from '$lib/i18n';
import { apiClient } from '$lib/api';
import { redirect } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

/**
 * @typedef {{ authenticated: boolean, checked: boolean }} SessionInfo
 * @typedef {{ session: SessionInfo }} RootLayoutData
 */

/** @param {string} pathname */
const isPublicPath = (pathname) => {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/display')) return true;
  if (pathname.startsWith('/results')) return true;
  return false;
};

/**
 * @param {import('./$types').LayoutLoadEvent} event
 * @returns {Promise<RootLayoutData>}
 */
export async function load(event) {
  await setupI18n();

  const existingData = event.data ?? {};
  const isPublic = isPublicPath(event.url.pathname);
  let authenticated = false;

  try {
    const sessionResponse = await apiClient.get('/auth/session', event.fetch);
    authenticated = sessionResponse.data?.authenticated ?? false;
  } catch {
    // An unreachable session endpoint is treated as "not authenticated".
    authenticated = false;
  }

  if (!authenticated && !isPublic) {
    throw redirect(302, '/login');
  }

  return {
    ...existingData,
    session: { authenticated, checked: true },
  };
}

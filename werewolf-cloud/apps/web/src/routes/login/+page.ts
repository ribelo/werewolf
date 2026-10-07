import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ fetch }) => {
  let authenticated = false;

  try {
    const response = await apiClient.get<{ authenticated: boolean }>('/auth/session', fetch);
    authenticated = response.data?.authenticated ?? false;
  } catch {
    // A failed session probe must never block the login form.
    authenticated = false;
  }

  // Thrown outside the try/catch: a redirect is control flow, not a failure.
  if (authenticated) {
    throw redirect(302, '/');
  }

  return {};
};

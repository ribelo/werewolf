import type { PageLoad } from './$types';
import { apiClient } from '$lib/api';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await apiClient.get<{ authenticated: boolean }>('/auth/session', fetch);

    if (response.data?.authenticated) {
      throw redirect(302, '/');
    }
  } catch {
    // Ignore errors and allow the login page to render.
  }

  return {};
};

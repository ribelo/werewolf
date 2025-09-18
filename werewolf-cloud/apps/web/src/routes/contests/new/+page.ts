import { apiClient } from '$lib/api';

export const load = async () => {
  return {
    apiBase: apiClient.baseUrl,
  };
};

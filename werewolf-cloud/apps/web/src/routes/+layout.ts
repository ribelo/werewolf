import type { LayoutLoad } from './$types';
import { setupI18n } from '$lib/i18n';

export const load: LayoutLoad = async (event) => {
  await setupI18n();
  return event.data;
};

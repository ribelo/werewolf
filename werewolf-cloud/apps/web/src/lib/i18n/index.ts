import { register, init, locale, waitLocale } from 'svelte-i18n';
import { browser } from '$app/environment';
import { apiClient } from '$lib/api';

const FALLBACK_LOCALE = 'en';
const DEFAULT_LOCALE = 'pl';
let initialized = false;

register('en', () => import('./locales/en.json'));
register('pl', () => import('./locales/pl.json'));

export const availableLocales = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];

export function setupI18n(initialLocale?: string) {
  if (!initialized) {
    init({
      fallbackLocale: FALLBACK_LOCALE,
      initialLocale: initialLocale ?? DEFAULT_LOCALE,
    });
    initialized = true;
  } else if (initialLocale) {
    locale.set(initialLocale);
  }
  return waitLocale();
}

export async function changeLanguage(code: string) {
  locale.set(code);
  if (browser) {
    localStorage.setItem('werewolf.locale', code);
  }
  try {
    await apiClient.put('/settings/language', { language: code });
  } catch (error) {
    console.error('Failed to persist language preference:', error);
  }
}

export { locale };

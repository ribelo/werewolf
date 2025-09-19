import { register, init, locale, waitLocale, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { apiClient } from '$lib/api';

const FALLBACK_LOCALE = 'en';
const DEFAULT_LOCALE = 'pl';
const STORAGE_KEY = 'werewolf.locale';

let initialized = false;
let initializationPromise: Promise<void> | null = null;

register('en', () => import('./locales/en.json'));
register('pl', () => import('./locales/pl.json'));

export const availableLocales = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
];

function resolveInitialLocale(explicit?: string): string {
  if (explicit) return explicit;
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const navigatorLocale = getLocaleFromNavigator();
    if (navigatorLocale) return navigatorLocale;
  }
  return DEFAULT_LOCALE;
}

export function setupI18n(initialLocale?: string) {
  const targetLocale = resolveInitialLocale(initialLocale);

  if (!initialized) {
    const config: any = {
      fallbackLocale: FALLBACK_LOCALE,
      initialLocale: targetLocale,
    };
    
    // Suppress ICU parser errors on server side
    if (!browser) {
      config.handleMissingMessage = () => '';
    }
    
    init(config);
    initialized = true;
    initializationPromise = waitLocale();
  } else if (targetLocale && targetLocale !== get(locale)) {
    locale.set(targetLocale);
    initializationPromise = waitLocale();
  }

  return initializationPromise ?? waitLocale();
}

export async function changeLanguage(code: string) {
  const previousLocale = browser ? localStorage.getItem(STORAGE_KEY) ?? get(locale) : get(locale);

  try {
    locale.set(code);
    if (browser) {
      localStorage.setItem(STORAGE_KEY, code);
    }
    await waitLocale();
    await apiClient.put('/settings/language', { language: code });
  } catch (error) {
    console.error('Failed to persist language preference:', error);
    locale.set(previousLocale);
    if (browser) {
      if (previousLocale) {
        localStorage.setItem(STORAGE_KEY, previousLocale);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    throw error;
  }
}

export function getStoredLocale(): string | null {
  if (!browser) return null;
  return localStorage.getItem(STORAGE_KEY);
}

export { locale };

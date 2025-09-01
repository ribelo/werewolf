import { register, init, getLocaleFromNavigator, locale, waitLocale } from 'svelte-i18n';
import { invoke } from '@tauri-apps/api/core';

// Register translation files
register('pl', () => import('./locales/pl.json'));
register('en', () => import('./locales/en.json'));

// Initialize i18n with Polish as default - will be updated by components later
init({
  fallbackLocale: 'pl',
  initialLocale: 'pl',
});

// Export a promise that resolves when i18n is ready
export const i18nReady = waitLocale();

// Helper function to get available locales
export const availableLocales = [
  { code: 'pl', name: 'Polski', nativeName: 'Polski' },
  { code: 'en', name: 'English', nativeName: 'English' }
];

// Helper function to change language and save to backend
export async function changeLanguage(newLanguage: string) {
  try {
    // Update backend settings
    await invoke('settings_set_language', { language: newLanguage });
    // Update i18n locale
    locale.set(newLanguage);
    console.log('✅ Language changed to:', newLanguage);
  } catch (error) {
    console.error('❌ Failed to change language:', error);
    throw error;
  }
}
import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

// Register translation files
register('pl', () => import('./locales/pl.json'));
register('en', () => import('./locales/en.json'));

// Initialize i18n with Polish as default
init({
  fallbackLocale: 'pl',
  initialLocale: getLocaleFromNavigator() || 'pl',
});

// Helper function to get available locales
export const availableLocales = [
  { code: 'pl', name: 'Polski', nativeName: 'Polski' },
  { code: 'en', name: 'English', nativeName: 'English' }
];
import { writable } from 'svelte/store';

export type AppView = 'mainMenu' | 'contestWizard' | 'contestView' | 'settings' | 'systemStatus' | 'displayScreen';

export const appView = writable<AppView>('mainMenu');

// Store for system health warnings
export const showHealthWarning = writable<boolean>(false);
export const systemHealth = writable<any>(null);

import { writable } from 'svelte/store';

export type AppView = 'mainMenu' | 'contestWizard';

export const appView = writable<AppView>('mainMenu');

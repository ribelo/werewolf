import { writable } from 'svelte/store';

export type AppView = 'mainMenu' | 'contestWizard' | 'contestView';

export const appView = writable<AppView>('mainMenu');

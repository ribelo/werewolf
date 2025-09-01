import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

export interface UiSettings {
  language: string;
  theme: string;
  window_maximized: boolean;
  window_width?: number;
  window_height?: number;
}

export interface CompetitionSettings {
  default_federation: string;
  default_discipline: string;
  auto_save_interval_minutes: number;
  backup_enabled: boolean;
  max_backup_files: number;
}

export interface DatabaseSettings {
  connection_timeout_seconds: number;
  max_connections: number;
  enable_wal_mode: boolean;
}

export interface AppSettings {
  ui: UiSettings;
  competition: CompetitionSettings;
  database: DatabaseSettings;
}

// Settings stores
export const uiSettings = writable<UiSettings>({
  language: 'pl',
  theme: 'dark',
  window_maximized: false,
  window_width: 1200,
  window_height: 800
});

export const competitionSettings = writable<CompetitionSettings>({
  default_federation: 'PZKFiTS',
  default_discipline: 'Powerlifting',
  auto_save_interval_minutes: 5,
  backup_enabled: true,
  max_backup_files: 10
});

export const databaseSettings = writable<DatabaseSettings>({
  connection_timeout_seconds: 30,
  max_connections: 20,
  enable_wal_mode: true
});

export const allSettings = writable<AppSettings>({
  ui: {
    language: 'pl',
    theme: 'dark',
    window_maximized: false,
    window_width: 1200,
    window_height: 800
  },
  competition: {
    default_federation: 'PZKFiTS',
    default_discipline: 'Powerlifting',
    auto_save_interval_minutes: 5,
    backup_enabled: true,
    max_backup_files: 10
  },
  database: {
    connection_timeout_seconds: 30,
    max_connections: 20,
    enable_wal_mode: true
  }
});

// Settings API functions
export const settingsApi = {
  // Get all settings
  async getAll(): Promise<AppSettings> {
    try {
      const settings = await invoke<AppSettings>('settings_get_all');
      allSettings.set(settings);
      uiSettings.set(settings.ui);
      competitionSettings.set(settings.competition);
      databaseSettings.set(settings.database);
      return settings;
    } catch (error) {
      console.error('Failed to get settings:', error);
      throw error;
    }
  },

  // Get UI settings only
  async getUi(): Promise<UiSettings> {
    try {
      const ui = await invoke<UiSettings>('settings_get_ui');
      uiSettings.set(ui);
      return ui;
    } catch (error) {
      console.error('Failed to get UI settings:', error);
      throw error;
    }
  },

  // Get current language
  async getLanguage(): Promise<string> {
    try {
      return await invoke<string>('settings_get_language');
    } catch (error) {
      console.error('Failed to get language setting:', error);
      throw error;
    }
  },

  // Update all settings
  async updateAll(settings: AppSettings): Promise<void> {
    try {
      await invoke('settings_update_all', { settings });
      allSettings.set(settings);
      uiSettings.set(settings.ui);
      competitionSettings.set(settings.competition);
      databaseSettings.set(settings.database);
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  },

  // Update UI settings only
  async updateUi(ui: UiSettings): Promise<void> {
    try {
      await invoke('settings_update_ui', { uiSettings: ui });
      uiSettings.set(ui);
      // Update the ui part of allSettings
      allSettings.update(settings => ({ ...settings, ui }));
    } catch (error) {
      console.error('Failed to update UI settings:', error);
      throw error;
    }
  },

  // Set language
  async setLanguage(language: string): Promise<void> {
    try {
      await invoke('settings_set_language', { language });
      // Update the language in the UI settings store
      uiSettings.update(ui => ({ ...ui, language }));
      allSettings.update(settings => ({
        ...settings,
        ui: { ...settings.ui, language }
      }));
    } catch (error) {
      console.error('Failed to set language:', error);
      throw error;
    }
  },

  // Update competition settings
  async updateCompetition(competition: CompetitionSettings): Promise<void> {
    try {
      await invoke('settings_update_competition', { competitionSettings: competition });
      competitionSettings.set(competition);
      allSettings.update(settings => ({ ...settings, competition }));
    } catch (error) {
      console.error('Failed to update competition settings:', error);
      throw error;
    }
  },

  // Update database settings
  async updateDatabase(database: DatabaseSettings): Promise<void> {
    try {
      await invoke('settings_update_database', { databaseSettings: database });
      databaseSettings.set(database);
      allSettings.update(settings => ({ ...settings, database }));
    } catch (error) {
      console.error('Failed to update database settings:', error);
      throw error;
    }
  },

  // Reset to defaults
  async resetToDefaults(): Promise<void> {
    try {
      await invoke('settings_reset_to_defaults');
      // Reload all settings after reset
      await this.getAll();
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw error;
    }
  },

  // Get config path for debugging
  async getConfigPath(): Promise<string> {
    try {
      return await invoke<string>('settings_get_config_path');
    } catch (error) {
      console.error('Failed to get config path:', error);
      throw error;
    }
  }
};

// Initialize settings on app start
export async function initializeSettings(): Promise<void> {
  try {
    await settingsApi.getAll();
    console.log('✅ Settings initialized from backend');
  } catch (error) {
    console.error('❌ Failed to initialize settings:', error);
    // Fall back to default settings if backend fails
  }
}
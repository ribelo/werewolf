use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("TOML serialization error: {0}")]
    TomlSer(#[from] toml::ser::Error),
    #[error("TOML deserialization error: {0}")]
    TomlDe(#[from] toml::de::Error),
    #[error("Failed to determine config directory")]
    NoConfigDir,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub ui: UiSettings,
    pub competition: CompetitionSettings,
    pub database: DatabaseSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    pub language: String,
    pub theme: String,
    pub window_maximized: bool,
    pub window_width: Option<u32>,
    pub window_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompetitionSettings {
    pub default_federation: String,
    pub default_discipline: String,
    pub auto_save_interval_minutes: u32,
    pub backup_enabled: bool,
    pub max_backup_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSettings {
    pub connection_timeout_seconds: u32,
    pub max_connections: u32,
    pub enable_wal_mode: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ui: UiSettings::default(),
            competition: CompetitionSettings::default(),
            database: DatabaseSettings::default(),
        }
    }
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            language: "pl".to_string(),
            theme: "dark".to_string(),
            window_maximized: false,
            window_width: Some(1200),
            window_height: Some(800),
        }
    }
}

impl Default for CompetitionSettings {
    fn default() -> Self {
        Self {
            default_federation: "PZKFiTS".to_string(),
            default_discipline: "Powerlifting".to_string(),
            auto_save_interval_minutes: 5,
            backup_enabled: true,
            max_backup_files: 10,
        }
    }
}

impl Default for DatabaseSettings {
    fn default() -> Self {
        Self {
            connection_timeout_seconds: 30,
            max_connections: 20,
            enable_wal_mode: true,
        }
    }
}

pub struct SettingsManager {
    config_path: PathBuf,
    settings: AppSettings,
}

impl SettingsManager {
    /// Create new settings manager and load existing config or create default
    pub fn new() -> Result<Self, SettingsError> {
        let config_path = Self::get_config_path()?;
        
        // Ensure config directory exists
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let settings = if config_path.exists() {
            Self::load_from_file(&config_path)?
        } else {
            let default_settings = AppSettings::default();
            Self::save_to_file(&config_path, &default_settings)?;
            default_settings
        };

        Ok(Self { config_path, settings })
    }

    /// Get the XDG config path for the settings file
    fn get_config_path() -> Result<PathBuf, SettingsError> {
        ProjectDirs::from("com", "ribelo", "werewolf")
            .map(|dirs| dirs.config_dir().join("settings.toml"))
            .ok_or(SettingsError::NoConfigDir)
    }

    /// Load settings from TOML file
    fn load_from_file(path: &PathBuf) -> Result<AppSettings, SettingsError> {
        let content = fs::read_to_string(path)?;
        let settings: AppSettings = toml::from_str(&content)?;
        Ok(settings)
    }

    /// Save settings to TOML file
    fn save_to_file(path: &PathBuf, settings: &AppSettings) -> Result<(), SettingsError> {
        let content = toml::to_string_pretty(settings)?;
        fs::write(path, content)?;
        Ok(())
    }

    /// Get current settings
    pub fn get_settings(&self) -> &AppSettings {
        &self.settings
    }

    /// Update settings and save to file
    pub fn update_settings(&mut self, new_settings: AppSettings) -> Result<(), SettingsError> {
        self.settings = new_settings;
        self.save()?;
        Ok(())
    }

    /// Update only UI settings
    pub fn update_ui_settings(&mut self, ui_settings: UiSettings) -> Result<(), SettingsError> {
        self.settings.ui = ui_settings;
        self.save()?;
        Ok(())
    }

    /// Update only language setting
    pub fn set_language(&mut self, language: String) -> Result<(), SettingsError> {
        self.settings.ui.language = language;
        self.save()?;
        Ok(())
    }

    /// Get current language setting
    pub fn get_language(&self) -> &str {
        &self.settings.ui.language
    }

    /// Update only competition settings
    pub fn update_competition_settings(&mut self, competition_settings: CompetitionSettings) -> Result<(), SettingsError> {
        self.settings.competition = competition_settings;
        self.save()?;
        Ok(())
    }

    /// Update only database settings
    pub fn update_database_settings(&mut self, database_settings: DatabaseSettings) -> Result<(), SettingsError> {
        self.settings.database = database_settings;
        self.save()?;
        Ok(())
    }

    /// Save current settings to file
    pub fn save(&self) -> Result<(), SettingsError> {
        Self::save_to_file(&self.config_path, &self.settings)
    }

    /// Reset settings to defaults
    pub fn reset_to_defaults(&mut self) -> Result<(), SettingsError> {
        self.settings = AppSettings::default();
        self.save()?;
        Ok(())
    }

    /// Get config file path for debugging
    pub fn get_config_file_path(&self) -> &PathBuf {
        &self.config_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::env;

    #[test]
    fn test_settings_serialization() {
        let settings = AppSettings::default();
        let toml_str = toml::to_string_pretty(&settings).expect("Failed to serialize");
        let parsed: AppSettings = toml::from_str(&toml_str).expect("Failed to deserialize");
        
        assert_eq!(settings.ui.language, parsed.ui.language);
        assert_eq!(settings.ui.theme, parsed.ui.theme);
    }

    #[test]
    fn test_settings_file_operations() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let config_path = temp_dir.path().join("test_settings.toml");
        
        let settings = AppSettings::default();
        SettingsManager::save_to_file(&config_path, &settings).expect("Failed to save");
        
        let loaded = SettingsManager::load_from_file(&config_path).expect("Failed to load");
        assert_eq!(settings.ui.language, loaded.ui.language);
    }

    #[test]
    fn test_language_setting() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let config_path = temp_dir.path().join("test_settings.toml");
        
        // Mock config path for testing
        let mut settings = AppSettings::default();
        settings.ui.language = "en".to_string();
        
        SettingsManager::save_to_file(&config_path, &settings).expect("Failed to save");
        let loaded = SettingsManager::load_from_file(&config_path).expect("Failed to load");
        
        assert_eq!(loaded.ui.language, "en");
    }
}
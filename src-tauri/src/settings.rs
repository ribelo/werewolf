use crate::system_health::ConfigHealth;
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn default_plate_colors() -> HashMap<String, String> {
    let mut colors = HashMap::new();
    colors.insert("25".to_string(), "#DC2626".to_string()); // Red - 25kg
    colors.insert("20".to_string(), "#2563EB".to_string()); // Blue - 20kg
    colors.insert("15".to_string(), "#EAB308".to_string()); // Yellow - 15kg
    colors.insert("10".to_string(), "#16A34A".to_string()); // Green - 10kg
    colors.insert("5".to_string(), "#F8FAFC".to_string()); // White - 5kg
    colors.insert("2.5".to_string(), "#DC2626".to_string()); // Red - 2.5kg
    colors.insert("2".to_string(), "#2563EB".to_string()); // Blue - 2kg
    colors.insert("1.5".to_string(), "#EAB308".to_string()); // Yellow - 1.5kg
    colors.insert("1.25".to_string(), "#16A34A".to_string()); // Green - 1.25kg
    colors.insert("1".to_string(), "#F8FAFC".to_string()); // White - 1kg
    colors.insert("0.5".to_string(), "#6B7280".to_string()); // Gray - 0.5kg
    colors
}

fn default_language() -> String {
    "pl".to_string()
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_federation() -> String {
    "PZKFiTS".to_string()
}

fn default_discipline() -> String {
    "Powerlifting".to_string()
}

fn default_auto_save_interval() -> u32 {
    5
}

fn default_backup_enabled() -> bool {
    true
}

fn default_max_backup_files() -> u32 {
    10
}

fn default_connection_timeout() -> u32 {
    30
}

fn default_max_connections() -> u32 {
    20
}

fn default_enable_wal_mode() -> bool {
    true
}

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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub ui: UiSettings,
    pub competition: CompetitionSettings,
    pub database: DatabaseSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub window_maximized: bool,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompetitionSettings {
    #[serde(default = "default_federation")]
    pub default_federation: String,
    #[serde(default = "default_discipline")]
    pub default_discipline: String,
    #[serde(default = "default_auto_save_interval")]
    pub auto_save_interval_minutes: u32,
    #[serde(default = "default_backup_enabled")]
    pub backup_enabled: bool,
    #[serde(default = "default_max_backup_files")]
    pub max_backup_files: u32,
    #[serde(default = "default_plate_colors")]
    pub default_plate_colors: HashMap<String, String>, // weight -> hex color
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlateColorMapping {
    pub weight: f64,
    pub color: String, // Hex color code
    pub name: String,  // Human readable name (e.g. "Red", "Blue")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseSettings {
    #[serde(default = "default_connection_timeout")]
    pub connection_timeout_seconds: u32,
    #[serde(default = "default_max_connections")]
    pub max_connections: u32,
    #[serde(default = "default_enable_wal_mode")]
    pub enable_wal_mode: bool,
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
            default_plate_colors: default_plate_colors(),
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
    config_health: ConfigHealth,
}

impl Default for SettingsManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SettingsManager {
    /// Create new settings manager and load existing config or create default
    /// This method is infallible - it always returns a valid SettingsManager
    pub fn new() -> Self {
        use std::time::SystemTime;

        let config_path = match Self::get_config_path() {
            Ok(path) => path,
            Err(_) => {
                // Fallback to current directory if config path determination fails
                tracing::error!("Failed to determine config directory, using current directory");
                PathBuf::from("settings.toml")
            }
        };

        // Ensure config directory exists
        if let Some(parent) = config_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                tracing::error!("Failed to create config directory: {}", e);
            }
        }

        let (settings, config_health) = if config_path.exists() {
            match Self::load_from_file(&config_path) {
                Ok(settings) => {
                    tracing::info!("Successfully loaded settings from {:?}", config_path);
                    (settings, ConfigHealth::Ok)
                }
                Err(e) => {
                    tracing::error!("Failed to load settings from {:?}: {}", config_path, e);

                    // Create backup with timestamp
                    let timestamp = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let backup_path =
                        config_path.with_extension(format!("toml.corrupted.{}", timestamp));

                    // Attempt to backup corrupted config
                    match fs::copy(&config_path, &backup_path) {
                        Ok(_) => {
                            tracing::info!("Backed up corrupted config to {:?}", backup_path);
                        }
                        Err(backup_err) => {
                            tracing::error!("Failed to backup corrupted config: {}", backup_err);
                        }
                    }

                    // Create default settings and save them
                    let default_settings = AppSettings::default();
                    if let Err(save_err) = Self::save_to_file(&config_path, &default_settings) {
                        tracing::error!("Failed to save default settings: {}", save_err);
                    }

                    let health = ConfigHealth::Error {
                        backup_path: Some(backup_path),
                        message: e.to_string(),
                    };

                    (default_settings, health)
                }
            }
        } else {
            // Config file doesn't exist, create default
            tracing::info!("Config file doesn't exist, creating default settings");
            let default_settings = AppSettings::default();

            if let Err(e) = Self::save_to_file(&config_path, &default_settings) {
                tracing::error!("Failed to save default settings: {}", e);
            }

            (default_settings, ConfigHealth::Ok) // Missing config replaced with defaults
        };

        Self {
            config_path,
            settings,
            config_health,
        }
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
    pub fn update_competition_settings(
        &mut self,
        competition_settings: CompetitionSettings,
    ) -> Result<(), SettingsError> {
        self.settings.competition = competition_settings;
        self.save()?;
        Ok(())
    }

    /// Update only database settings
    pub fn update_database_settings(
        &mut self,
        database_settings: DatabaseSettings,
    ) -> Result<(), SettingsError> {
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

    /// Get the current config health status
    pub fn get_config_health(&self) -> &ConfigHealth {
        &self.config_health
    }

    /// Get suggested color for a plate weight
    /// Returns the default color from configuration, or finds closest match from config
    pub fn suggest_plate_color(&self, weight: f64) -> String {
        let weight_key = if weight.fract() == 0.0 {
            format!("{}", weight as i32)
        } else {
            format!("{}", weight)
        };

        // Try exact match first
        if let Some(color) = self
            .settings
            .competition
            .default_plate_colors
            .get(&weight_key)
        {
            return color.clone();
        }

        // Find closest weight from the configuration defaults
        let closest_color = self
            .settings
            .competition
            .default_plate_colors
            .iter()
            .filter_map(|(weight_str, color)| weight_str.parse::<f64>().ok().map(|w| (w, color)))
            .min_by(|(w1, _), (w2, _)| {
                let diff1 = (w1 - weight).abs();
                let diff2 = (w2 - weight).abs();
                diff1
                    .partial_cmp(&diff2)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(_, color)| color.clone())
            .unwrap_or_else(|| "#374151".to_string()); // Fallback gray only if config is empty

        closest_color
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

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

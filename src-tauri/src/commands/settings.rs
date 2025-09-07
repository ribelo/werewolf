use crate::settings::{AppSettings, CompetitionSettings, DatabaseSettings, UiSettings};
use crate::system_health::ConfigHealth;
use crate::AppState;
use tauri::State;

/// Get all current settings
#[tauri::command]
pub async fn settings_get_all(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings_manager = state.settings.lock().await;
    Ok(settings_manager.get_settings().clone())
}

/// Get only UI settings
#[tauri::command]
pub async fn settings_get_ui(state: State<'_, AppState>) -> Result<UiSettings, String> {
    let settings_manager = state.settings.lock().await;
    Ok(settings_manager.get_settings().ui.clone())
}

/// Get current language setting
#[tauri::command]
pub async fn settings_get_language(state: State<'_, AppState>) -> Result<String, String> {
    let settings_manager = state.settings.lock().await;
    Ok(settings_manager.get_language().to_string())
}

/// Update all settings
#[tauri::command]
pub async fn settings_update_all(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    let mut settings_manager = state.settings.lock().await;
    settings_manager
        .update_settings(settings)
        .map_err(|e| format!("Failed to update settings: {}", e))
}

/// Update only UI settings
#[tauri::command]
pub async fn settings_update_ui(
    state: State<'_, AppState>,
    ui_settings: UiSettings,
) -> Result<(), String> {
    let mut settings_manager = state.settings.lock().await;
    settings_manager
        .update_ui_settings(ui_settings)
        .map_err(|e| format!("Failed to update UI settings: {}", e))
}

/// Set language setting
#[tauri::command]
pub async fn settings_set_language(
    state: State<'_, AppState>,
    language: String,
) -> Result<(), String> {
    let mut settings_manager = state.settings.lock().await;
    settings_manager
        .set_language(language)
        .map_err(|e| format!("Failed to set language: {}", e))?;

    tracing::info!(
        "Language setting updated to: {}",
        settings_manager.get_language()
    );
    Ok(())
}

/// Update competition settings
#[tauri::command]
pub async fn settings_update_competition(
    state: State<'_, AppState>,
    competition_settings: CompetitionSettings,
) -> Result<(), String> {
    let mut settings_manager = state.settings.lock().await;
    settings_manager
        .update_competition_settings(competition_settings)
        .map_err(|e| format!("Failed to update competition settings: {}", e))
}

/// Update database settings
#[tauri::command]
pub async fn settings_update_database(
    state: State<'_, AppState>,
    database_settings: DatabaseSettings,
) -> Result<(), String> {
    let mut settings_manager = state.settings.lock().await;
    settings_manager
        .update_database_settings(database_settings)
        .map_err(|e| format!("Failed to update database settings: {}", e))
}

/// Reset all settings to defaults
#[tauri::command]
pub async fn settings_reset_to_defaults(state: State<'_, AppState>) -> Result<(), String> {
    let mut settings_manager = state.settings.lock().await;
    settings_manager
        .reset_to_defaults()
        .map_err(|e| format!("Failed to reset settings: {}", e))?;

    tracing::info!("Settings reset to defaults");
    Ok(())
}

/// Get the config file path for debugging
#[tauri::command]
pub async fn settings_get_config_path(state: State<'_, AppState>) -> Result<String, String> {
    let settings_manager = state.settings.lock().await;
    Ok(settings_manager
        .get_config_file_path()
        .to_string_lossy()
        .to_string())
}

/// Get the config health status
#[tauri::command]
pub async fn settings_get_health_status(
    state: State<'_, AppState>,
) -> Result<ConfigHealth, String> {
    let settings_manager = state.settings.lock().await;
    Ok(settings_manager.get_config_health().clone())
}

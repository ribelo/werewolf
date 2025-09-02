use std::sync::Arc;
// Tauri imports - removed unused Manager and State
use tokio::sync::Mutex;

pub mod coefficients;
pub mod commands;
pub mod database;
pub mod error;
pub mod logging;
pub mod models;
pub mod settings;

#[cfg(test)]
mod integration_tests;

use database::DatabasePool;
use logging::write_log;
use settings::SettingsManager;

// Application state to hold the database connection and settings
pub struct AppState {
    pub db: Arc<Mutex<DatabasePool>>, // No Option! Database always ready or app exits!
    pub settings: Arc<Mutex<SettingsManager>>,
}

// All commands are now defined in the commands module

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    // Initialize unified logging system
    let _guard = match logging::init_tracing() {
        Ok((log_path, guard)) => {
            eprintln!(
                "🐺 Werewolf: Unified logging initialized, log file: {}",
                log_path.display()
            );
            guard
        }
        Err(e) => {
            eprintln!("🐺 Werewolf: Failed to initialize logging: {e}");
            panic!("Cannot continue without logging");
        }
    };

    let settings_manager = match SettingsManager::new() {
        Ok(settings) => {
            tracing::info!(
                "Settings loaded from: {:?}",
                settings.get_config_file_path()
            );
            settings
        }
        Err(e) => {
            tracing::error!("Failed to initialize settings manager: {e}");
            tracing::info!("Using default settings");
            SettingsManager::new().unwrap_or_else(|_| panic!("Cannot create settings manager"))
        }
    };

    // Initialize database properly in async function
    tracing::info!("Initializing database before app startup");
    let database_pool = match database::initialize_database().await {
        Ok(pool) => {
            tracing::info!("Database initialized successfully");
            pool
        }
        Err(e) => {
            tracing::error!("Failed to initialize database: {}", e);
            std::process::exit(1);
        }
    };

    let app_state = AppState {
        db: Arc::new(Mutex::new(database_pool)),
        settings: Arc::new(Mutex::new(settings_manager)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // System commands
            commands::greet,
            commands::initialize_app_database,
            commands::get_database_status,
            commands::test_frontend_logging,
            commands::backup_database,
            commands::restore_database,
            commands::list_backups,
            commands::reset_database,
            // Settings commands
            commands::settings_get_all,
            commands::settings_get_ui,
            commands::settings_get_language,
            commands::settings_update_all,
            commands::settings_update_ui,
            commands::settings_set_language,
            commands::settings_update_competition,
            commands::settings_update_database,
            commands::settings_reset_to_defaults,
            commands::settings_get_config_path,
            // Logging
            write_log,
            // Contest management
            commands::contest_create,
            commands::contest_list,
            commands::contest_get,
            commands::contest_update,
            commands::contest_delete,
            // Contest state management
            commands::contest_state_get,
            commands::contest_state_update,
            // Competitor management
            commands::competitor_create,
            commands::competitor_list,
            commands::competitor_get,
            commands::competitor_update,
            commands::competitor_delete,
            commands::competitor_upload_photo,
            commands::competitor_remove_photo,
            commands::competitor_get_photo,
            commands::competitor_move_order,
            // Registration management
            commands::registration_create,
            commands::registration_list,
            commands::registration_get,
            commands::registration_update,
            commands::registration_delete,
            // Attempt management
            commands::attempts::attempt_upsert_weight,
            commands::attempt_list,
            commands::attempts::attempt_list_for_contest,
            commands::attempt_update_result,
            commands::attempt_get_current,
            commands::attempt_set_current,
            commands::attempt_get_next_in_queue,
            // Results and rankings
            commands::result_calculate,
            commands::result_get_rankings,
            commands::result_get_competitor_results,
            commands::result_export,
            commands::result_get_scoreboard,
            // Plate set management
            commands::plate_set_create,
            commands::plate_set_update_quantity,
            commands::plate_set_list,
            commands::plate_set_delete,
            commands::calculate_plates,
            // Window management
            commands::window_open_display,
            commands::window_close_display,
            commands::window_update_display,
            commands::window_list
        ])
        .setup(|_app| {
            tracing::info!("Starting Werewolf application");
            tracing::info!("Version: {}", env!("CARGO_PKG_VERSION"));
            tracing::info!("Authors: {}", env!("CARGO_PKG_AUTHORS"));
            tracing::info!("Tauri app setup starting - database already initialized");
            tracing::info!("Tauri app setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::Mutex;

pub mod commands;
pub mod database;
pub mod error;
pub mod logging;
pub mod models;

use database::DatabasePool;
use logging::write_log;

// Application state to hold the database connection
pub struct AppState {
    pub db: Arc<Mutex<Option<DatabasePool>>>,
}

// All commands are now defined in the commands module

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

    let app_state = AppState {
        db: Arc::new(Mutex::new(None)),
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
            // Window management
            commands::window_open_display,
            commands::window_close_display,
            commands::window_update_display,
            commands::window_list
        ])
        .setup(|app| {
            tracing::info!("Starting Werewolf application");
            tracing::info!("Version: {}", env!("CARGO_PKG_VERSION"));
            tracing::info!("Authors: {}", env!("CARGO_PKG_AUTHORS"));
            tracing::info!("Tauri app setup starting");

            // Initialize database on app startup
            let app_handle = app.handle().clone();
            tokio::spawn(async move {
                let state: State<AppState> = app_handle.state();
                tracing::info!("Attempting to initialize database");
                if let Err(e) = commands::initialize_app_database(state).await {
                    tracing::error!("Failed to initialize database on startup: {}", e);
                } else {
                    tracing::info!("Database initialized successfully on startup");
                }
            });

            tracing::info!("Tauri app setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use crate::error::AppError;
use crate::system_health::SystemHealth;
use crate::{database, AppState};
use tauri::State;

/// Simple greeting command (can be removed in production)
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

/// Initialize the database (always succeeds since database is initialized at startup)
#[tauri::command]
pub async fn initialize_app_database(_state: State<'_, AppState>) -> Result<String, AppError> {
    // Database is always initialized at app startup now
    Ok("Database already initialized at startup".to_string())
}

/// Get database health status
#[tauri::command]
pub async fn get_database_status(state: State<'_, AppState>) -> Result<String, AppError> {
    let db_guard = state.db.lock().await;

    match database::check_database_health(&db_guard).await {
        Ok(_) => Ok("Database is healthy".to_string()),
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Test frontend logging integration
#[tauri::command]
pub async fn test_frontend_logging() -> Result<String, AppError> {
    tracing::info!("Backend: test_frontend_logging command called");
    Ok("Frontend logging test command executed".to_string())
}

/// Create a backup of the database
#[tauri::command]
pub async fn backup_database(state: State<'_, AppState>) -> Result<String, AppError> {
    let _db_guard = state.db.lock().await; // Database always ready now

    let backup_path = database::create_backup().await?;
    tracing::info!("Database backup created at: {}", backup_path);
    Ok(backup_path)
}

/// Restore database from a backup file
#[tauri::command]
pub async fn restore_database(
    state: State<'_, AppState>,
    backup_path: String,
) -> Result<String, AppError> {
    // Close current database connection properly
    {
        let db_guard = state.db.lock().await;
        db_guard.close().await;
    }

    // Restore from backup
    database::restore_from_backup(&backup_path).await?;

    // Reinitialize database connection
    let mut db_guard = state.db.lock().await;
    let (pool, _health) = database::initialize_database().await;
    *db_guard = pool;
    tracing::info!("Database restored from backup: {}", backup_path);
    Ok(format!(
        "Database successfully restored from {}",
        backup_path
    ))
}

/// List available backups
#[tauri::command]
pub async fn list_backups() -> Result<Vec<String>, AppError> {
    let backups = database::list_backups().await?;
    Ok(backups)
}

/// Get the current system health status for frontend
#[tauri::command]
pub async fn system_health_check(state: State<'_, AppState>) -> Result<SystemHealth, String> {
    let system_health = state.system_health.lock().await;
    Ok(system_health.clone())
}

/// Reset database - drops all tables and recreates schema
#[tauri::command]
pub async fn reset_database(state: State<'_, AppState>) -> Result<String, AppError> {
    let db_guard = state.db.lock().await;

    tracing::warn!("Resetting database - all data will be lost!");
    database::reset_database(&db_guard)
        .await
        .map_err(AppError::Database)?;
    tracing::info!("Database reset completed successfully");
    Ok("Database reset completed successfully".to_string())
}

/// Get list of available backup files (both database and config)
#[tauri::command]
pub async fn get_backup_list() -> Result<Vec<String>, String> {
    let db_path = database::get_database_path();
    let db_dir = std::path::Path::new(&db_path)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));

    let mut backups = Vec::new();

    // Check for database backups
    match std::fs::read_dir(db_dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let file_name = entry.file_name();
                let file_name_str = file_name.to_string_lossy();

                if file_name_str.contains("werewolf.db.")
                    && (file_name_str.contains("corrupted")
                        || file_name_str.contains("migration_failed"))
                {
                    backups.push(format!("database/{}", file_name_str));
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to read backup directory: {}", e);
            return Err(format!("Failed to read backup directory: {}", e));
        }
    }

    // Check for config backups
    if let Some(project_dirs) = directories::ProjectDirs::from("com", "ribelo", "werewolf") {
        let config_dir = project_dirs.config_dir();

        match std::fs::read_dir(config_dir) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    let file_name = entry.file_name();
                    let file_name_str = file_name.to_string_lossy();

                    if file_name_str.contains("settings.toml.corrupted") {
                        backups.push(format!("config/{}", file_name_str));
                    }
                }
            }
            Err(e) => {
                tracing::warn!("Failed to read config backup directory: {}", e);
            }
        }
    }

    backups.sort();
    Ok(backups)
}

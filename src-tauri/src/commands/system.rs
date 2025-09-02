use crate::error::AppError;
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
    match database::initialize_database().await {
        Ok(pool) => {
            *db_guard = pool;
            tracing::info!("Database restored from backup: {}", backup_path);
            Ok(format!(
                "Database successfully restored from {}",
                backup_path
            ))
        }
        Err(e) => {
            tracing::error!("Failed to reinitialize database after restore: {}", e);
            Err(AppError::Database(e))
        }
    }
}

/// List available backups
#[tauri::command]
pub async fn list_backups() -> Result<Vec<String>, AppError> {
    let backups = database::list_backups().await?;
    Ok(backups)
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

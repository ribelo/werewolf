use crate::error::AppError;
use crate::{database, AppState};
use tauri::State;

/// Simple greeting command (can be removed in production)
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

/// Initialize the database
#[tauri::command]
pub async fn initialize_app_database(state: State<'_, AppState>) -> Result<String, AppError> {
    let mut db_guard = state.db.lock().await;

    if db_guard.is_some() {
        return Ok("Database already initialized".to_string());
    }

    match database::initialize_database().await {
        Ok(pool) => {
            *db_guard = Some(pool);
            Ok("Database initialized successfully".to_string())
        }
        Err(e) => Err(AppError::Database(e)),
    }
}

/// Get database health status
#[tauri::command]
pub async fn get_database_status(state: State<'_, AppState>) -> Result<String, AppError> {
    let db_guard = state.db.lock().await;

    match db_guard.as_ref() {
        Some(pool) => match database::check_database_health(pool).await {
            Ok(_) => Ok("Database is healthy".to_string()),
            Err(e) => Err(AppError::Database(e)),
        },
        None => Err(AppError::Internal("Database not initialized".to_string())),
    }
}

/// Test frontend logging integration
#[tauri::command]
pub async fn test_frontend_logging() -> Result<String, AppError> {
    tracing::info!("Backend: test_frontend_logging command called");
    Ok("Frontend logging test command executed".to_string())
}

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteJournalMode},
    Pool, Sqlite,
};
use std::{str::FromStr, time::Duration};
use crate::settings::{SettingsManager, DatabaseSettings};

/// Create a new database connection pool using settings
pub async fn create_pool_with_settings(database_url: &str, settings_manager: &SettingsManager) -> Result<Pool<Sqlite>, sqlx::Error> {
    let db_settings = &settings_manager.get_settings().database;
    
    let journal_mode = if db_settings.enable_wal_mode {
        SqliteJournalMode::Wal
    } else {
        SqliteJournalMode::Delete
    };

    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(journal_mode)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(db_settings.connection_timeout_seconds as u64));

    let pool = SqlitePoolOptions::new()
        .max_connections(db_settings.max_connections)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(db_settings.connection_timeout_seconds as u64))
        .idle_timeout(Duration::from_secs(60))
        .max_lifetime(Duration::from_secs(3600))
        .connect_with(options)
        .await?;

    Ok(pool)
}

/// Create a new database connection pool with default settings (fallback)
pub async fn create_pool(database_url: &str) -> Result<Pool<Sqlite>, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(30));

    let pool = SqlitePoolOptions::new()
        .max_connections(20)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(30))
        .idle_timeout(Duration::from_secs(60))
        .max_lifetime(Duration::from_secs(3600))
        .connect_with(options)
        .await?;

    Ok(pool)
}

/// Test database connection
pub async fn test_connection(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT sqlite_version()").execute(pool).await?;

    log::info!("Database connection test successful");
    Ok(())
}

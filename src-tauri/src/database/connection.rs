use sqlx::{Pool, Sqlite, sqlite::{SqliteConnectOptions, SqlitePoolOptions}};
use std::{str::FromStr, time::Duration};

/// Create a new database connection pool
pub async fn create_pool(database_url: &str) -> Result<Pool<Sqlite>, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
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
    sqlx::query("SELECT sqlite_version()")
        .execute(pool)
        .await?;

    log::info!("Database connection test successful");
    Ok(())
}
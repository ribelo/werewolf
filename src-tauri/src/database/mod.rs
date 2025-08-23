use sqlx::{Pool, Sqlite, SqlitePool, migrate::MigrateDatabase};
use directories::ProjectDirs;

pub mod connection;
pub mod db;
pub mod migrations;
pub mod queries;

pub use connection::*;
pub use db::*;
pub use migrations::*;

/// Database connection type alias
pub type DatabasePool = Pool<Sqlite>;

/// Initialize the database for the application
pub async fn initialize_database() -> Result<DatabasePool, sqlx::Error> {
    let db_path = get_database_path();
    let db_url = format!("sqlite:{}", db_path);
    
    // Create database file if it doesn't exist
    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        log::info!("Creating database at: {}", db_path);
        Sqlite::create_database(&db_url).await?;
    }
    
    // Create connection pool
    let pool = SqlitePool::connect(&db_url).await?;
    
    // Run migrations automatically
    log::info!("Running database migrations...");
    run_migrations(&pool).await?;
    
    log::info!("Database initialized successfully");
    Ok(pool)
}

/// Get the path where the database should be stored
pub fn get_database_path() -> String {
    if let Some(project_dirs) = ProjectDirs::from("com", "ribelo", "werewolf") {
        let data_dir = project_dirs.data_dir();
        std::fs::create_dir_all(data_dir).unwrap_or_else(|e| {
            log::warn!("Failed to create data directory: {}", e);
        });
        
        let db_path = data_dir.join("werewolf.db");
        db_path.to_string_lossy().to_string()
    } else {
        // Fallback to current directory
        log::warn!("Could not determine project directories, using fallback");
        "./werewolf.db".to_string()
    }
}

/// Check database health
pub async fn check_database_health(pool: &DatabasePool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await?;
    
    Ok(())
}
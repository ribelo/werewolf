use directories::ProjectDirs;
use sqlx::{migrate::MigrateDatabase, Pool, Sqlite, SqlitePool};

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
    let db_url = format!("sqlite:{db_path}");

    // Create database file if it doesn't exist
    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        log::info!("Creating database at: {db_path}");
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
            log::warn!("Failed to create data directory: {e}");
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
    sqlx::query("SELECT 1").execute(pool).await?;

    Ok(())
}

/// Create a timestamped backup of the database
pub async fn create_backup() -> Result<String, sqlx::Error> {
    let db_path = get_database_path();
    let backup_dir = get_backup_directory();
    
    // Create backup directory if it doesn't exist
    std::fs::create_dir_all(&backup_dir).map_err(|e| {
        log::error!("Failed to create backup directory: {e}");
        sqlx::Error::Io(e)
    })?;
    
    // Generate timestamped backup filename
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("werewolf_backup_{}.db", timestamp);
    let backup_path = std::path::Path::new(&backup_dir).join(backup_filename);
    
    // Copy database file to backup location
    std::fs::copy(&db_path, &backup_path).map_err(|e| {
        log::error!("Failed to create backup: {e}");
        sqlx::Error::Io(e)
    })?;
    
    Ok(backup_path.to_string_lossy().to_string())
}

/// Restore database from a backup file
pub async fn restore_from_backup(backup_path: &str) -> Result<(), sqlx::Error> {
    let db_path = get_database_path();
    
    // Verify backup file exists
    if !std::path::Path::new(backup_path).exists() {
        log::error!("Backup file not found: {}", backup_path);
        return Err(sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Backup file not found"
        )));
    }
    
    // Create backup of current database before restoring
    if std::path::Path::new(&db_path).exists() {
        let safety_backup = format!("{}.before_restore", db_path);
        if let Err(e) = std::fs::copy(&db_path, &safety_backup) {
            log::warn!("Failed to create safety backup: {e}");
        }
    }
    
    // Copy backup file to database location
    std::fs::copy(backup_path, &db_path).map_err(|e| {
        log::error!("Failed to restore from backup: {e}");
        sqlx::Error::Io(e)
    })?;
    
    Ok(())
}

/// List available backup files
pub async fn list_backups() -> Result<Vec<String>, sqlx::Error> {
    let backup_dir = get_backup_directory();
    
    if !std::path::Path::new(&backup_dir).exists() {
        return Ok(vec![]);
    }
    
    let entries = std::fs::read_dir(&backup_dir).map_err(|e| {
        log::error!("Failed to read backup directory: {e}");
        sqlx::Error::Io(e)
    })?;
    
    let mut backups = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            if let Some(filename) = entry.file_name().to_str() {
                if filename.starts_with("werewolf_backup_") && filename.ends_with(".db") {
                    backups.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }
    
    // Sort by filename (which includes timestamp)
    backups.sort();
    backups.reverse(); // Most recent first
    
    Ok(backups)
}

/// Get the backup directory path
fn get_backup_directory() -> String {
    if let Some(project_dirs) = ProjectDirs::from("com", "ribelo", "werewolf") {
        let data_dir = project_dirs.data_dir();
        let backup_dir = data_dir.join("backups");
        backup_dir.to_string_lossy().to_string()
    } else {
        "./backups".to_string()
    }
}

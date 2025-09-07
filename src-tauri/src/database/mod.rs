use crate::settings::SettingsManager;
use directories::ProjectDirs;
use sqlx::{migrate::MigrateDatabase, Pool, Sqlite};

pub mod connection;
pub mod db;
pub mod demo_data;
pub mod migrations;
pub mod queries;

pub use connection::*;
pub use db::*;
pub use migrations::*;

/// Database connection type alias
pub type DatabasePool = Pool<Sqlite>;

/// Initialize the database for the application with settings
pub async fn initialize_database_with_settings(
    settings_manager: &SettingsManager,
) -> Result<DatabasePool, sqlx::Error> {
    let db_path = get_database_path();
    let db_url = format!("sqlite:{db_path}");

    // Create database file if it doesn't exist
    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        log::info!("Creating database at: {db_path}");
        Sqlite::create_database(&db_url).await?;
    }

    // Create connection pool using settings
    let pool = create_pool_with_settings(&db_url, settings_manager).await?;

    // Run migrations automatically
    log::info!("Running database migrations...");
    run_migrations(&pool).await?;

    log::info!("Database initialized successfully with settings");
    Ok(pool)
}

/// Initialize the database for the application - INFALLIBLE
/// Always returns a valid database pool, even if using in-memory fallback
pub async fn initialize_database() -> (DatabasePool, crate::system_health::DatabaseHealth) {
    use crate::system_health::DatabaseHealth;
    use std::time::SystemTime;

    let db_path = get_database_path();
    let db_url = format!("sqlite:{db_path}");

    // Try to create database file if it doesn't exist
    let database_exists = match Sqlite::database_exists(&db_url).await {
        Ok(exists) => exists,
        Err(e) => {
            tracing::error!("Failed to check if database exists: {}", e);
            false
        }
    };

    if !database_exists {
        tracing::info!("Creating database at: {}", db_path);
        match Sqlite::create_database(&db_url).await {
            Ok(_) => {
                tracing::info!("Database created successfully");
            }
            Err(e) => {
                tracing::error!("Failed to create database at {}: {}", db_path, e);

                // Check if it's a permission issue using proper error types
                if let sqlx::Error::Io(io_error) = &e {
                    if matches!(
                        io_error.kind(),
                        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::NotFound
                    ) {
                        return create_fallback_database(DatabaseHealth::Error {
                            backup_path: None,
                            message: format!("Permission denied accessing: {}", db_path),
                            using_fallback: false,
                        })
                        .await;
                    }
                }

                // Try in-memory fallback for other creation errors
                return create_fallback_database(DatabaseHealth::Error {
                    backup_path: None,
                    message: format!("Failed to create database file: {}", e),
                    using_fallback: true,
                })
                .await;
            }
        }
    }

    // Try to create connection pool
    let pool = match create_pool(&db_url).await {
        Ok(pool) => pool,
        Err(e) => {
            tracing::error!("Failed to create database connection pool: {}", e);

            // Check for database corruption using proper error types
            if let sqlx::Error::Database(db_error) = &e {
                // SQLite corruption typically has error code 11 (SQLITE_CORRUPT)
                // or code 26 (SQLITE_NOTADB) for malformed database files
                if let Some(code) = db_error.code() {
                    if code == "11"
                        || code == "26"
                        || code == "SQLITE_CORRUPT"
                        || code == "SQLITE_NOTADB"
                    {
                        return handle_corrupted_database(&db_path, &db_url, e).await;
                    }
                }
            }

            // For other connection errors, use fallback
            return create_fallback_database(DatabaseHealth::Error {
                backup_path: None,
                message: format!("Failed to connect to database: {}", e),
                using_fallback: true,
            })
            .await;
        }
    };

    // Try to run migrations
    match run_migrations(&pool).await {
        Ok(_) => {
            tracing::info!("Database migrations completed successfully");
            (pool, DatabaseHealth::Ok)
        }
        Err(e) => {
            tracing::error!("Database migration failed: {}", e);

            // Migration failure is critical - try to backup and recreate
            let timestamp = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let backup_path =
                std::path::PathBuf::from(format!("{}.migration_failed.{}", db_path, timestamp));

            // Try to backup the problematic database
            match std::fs::copy(&db_path, &backup_path) {
                Ok(_) => {
                    tracing::info!(
                        "Backed up database with migration issues to {:?}",
                        backup_path
                    );
                }
                Err(backup_err) => {
                    tracing::error!(
                        "Failed to backup database with migration issues: {}",
                        backup_err
                    );
                }
            }

            // Try to create a fresh database
            match recreate_fresh_database(&db_url).await {
                Ok(new_pool) => (
                    new_pool,
                    DatabaseHealth::Error {
                        backup_path: Some(backup_path),
                        message: format!("Migration failed: {}", e),
                        using_fallback: false,
                    },
                ),
                Err(recreate_err) => {
                    tracing::error!(
                        "Failed to recreate database after migration failure: {}",
                        recreate_err
                    );
                    create_fallback_database(DatabaseHealth::Error {
                        backup_path: None,
                        message: format!(
                            "Migration failed: {}, Recreation failed: {}",
                            e, recreate_err
                        ),
                        using_fallback: true,
                    })
                    .await
                }
            }
        }
    }
}

async fn handle_corrupted_database(
    db_path: &str,
    db_url: &str,
    corruption_error: sqlx::Error,
) -> (DatabasePool, crate::system_health::DatabaseHealth) {
    use crate::system_health::DatabaseHealth;
    use std::time::SystemTime;

    tracing::error!("Database appears to be corrupted: {}", corruption_error);

    // Create backup with timestamp
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_path = std::path::PathBuf::from(format!("{}.corrupted.{}", db_path, timestamp));

    // Try to backup corrupted database
    match std::fs::copy(db_path, &backup_path) {
        Ok(_) => {
            tracing::info!("Backed up corrupted database to {:?}", backup_path);
        }
        Err(backup_err) => {
            tracing::error!("Failed to backup corrupted database: {}", backup_err);
        }
    }

    // Try to create fresh database
    match recreate_fresh_database(db_url).await {
        Ok(pool) => (
            pool,
            DatabaseHealth::Error {
                backup_path: Some(backup_path),
                message: corruption_error.to_string(),
                using_fallback: false,
            },
        ),
        Err(e) => {
            tracing::error!("Failed to recreate database after corruption: {}", e);
            create_fallback_database(DatabaseHealth::Error {
                backup_path: None,
                message: format!("Database corrupted and recreation failed: {}", e),
                using_fallback: true,
            })
            .await
        }
    }
}

async fn recreate_fresh_database(db_url: &str) -> Result<DatabasePool, sqlx::Error> {
    // Remove the old database file
    if let Some(path) = db_url.strip_prefix("sqlite:") {
        if let Err(e) = std::fs::remove_file(path) {
            tracing::warn!("Could not remove corrupted database file: {}", e);
        }
    }

    // Create fresh database
    Sqlite::create_database(db_url).await?;
    let pool = create_pool(db_url).await?;
    run_migrations(&pool).await?;

    tracing::info!("Successfully created fresh database");
    Ok(pool)
}

async fn create_fallback_database(
    health: crate::system_health::DatabaseHealth,
) -> (DatabasePool, crate::system_health::DatabaseHealth) {
    tracing::warn!("Using in-memory SQLite database as fallback");

    let fallback_url = "sqlite::memory:";

    match create_pool(fallback_url).await {
        Ok(pool) => {
            match run_migrations(&pool).await {
                Ok(_) => {
                    tracing::info!("In-memory fallback database ready");
                    (pool, health)
                }
                Err(e) => {
                    tracing::error!("Even in-memory database migration failed: {}", e);
                    // This should never happen, but if it does, we still return a pool
                    // The app will start but may be very broken
                    (
                        pool,
                        crate::system_health::DatabaseHealth::Error {
                            backup_path: None,
                            message: format!("In-memory migration failed: {}", e),
                            using_fallback: true,
                        },
                    )
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to create even in-memory database: {}", e);
            // This is truly critical - we cannot create any database at all
            // Return a database handle that will fail on all operations
            // but at least allow the app to show an error dialog
            let pool = sqlx::Pool::<sqlx::Sqlite>::connect("sqlite::memory:")
                .await
                .expect("Even basic SQLite connection failed - system is broken");

            (
                pool,
                crate::system_health::DatabaseHealth::Error {
                    backup_path: None,
                    message: format!("Critical: Cannot create any database connection: {}", e),
                    using_fallback: false,
                },
            )
        }
    }
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
            "Backup file not found",
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
    for entry in entries.flatten() {
        if let Some(filename) = entry.file_name().to_str() {
            if filename.starts_with("werewolf_backup_") && filename.ends_with(".db") {
                backups.push(entry.path().to_string_lossy().to_string());
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

/// Photo quality assessment result
#[derive(Debug, Clone)]
pub struct PhotoQuality {
    pub level: PhotoQualityLevel,
    pub message: String,
    pub original_width: u32,
    pub original_height: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PhotoQualityLevel {
    Excellent, // > 800x1000px
    Good,      // 400-800x500-1000px
    Fair,      // 200-400x250-500px
    Poor,      // < 200x250px
}

/// Photo processing result containing processed image data and quality assessment
#[derive(Debug, Clone)]
pub struct PhotoProcessResult {
    pub webp_data: Vec<u8>,
    pub quality: PhotoQuality,
    pub metadata: PhotoMetadata,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PhotoMetadata {
    pub original_width: u32,
    pub original_height: u32,
    pub processed_width: u32,
    pub processed_height: u32,
    pub original_format: String,
    pub file_size_bytes: usize,
    pub compression_quality: u8,
    pub processed_at: String,
}

/// Process a competitor photo from base64 data
/// Converts to WebP format at 400x500px with quality assessment
pub fn process_competitor_photo(
    base64_data: &str,
    original_filename: &str,
) -> Result<PhotoProcessResult, Box<dyn std::error::Error>> {
    use base64::{engine::general_purpose, Engine as _};
    use image::ImageReader;
    use std::io::Cursor;

    // Decode base64 data
    let image_data = general_purpose::STANDARD.decode(base64_data)?;

    // Load image
    let img = ImageReader::new(Cursor::new(&image_data))
        .with_guessed_format()?
        .decode()?;

    let original_width = img.width();
    let original_height = img.height();

    // Assess quality
    let quality = assess_photo_quality(original_width, original_height);

    // Resize to exact 400x500px then convert to RGB
    let processed = img
        .resize_exact(400, 500, image::imageops::FilterType::Lanczos3)
        .to_rgb8();

    // Convert to WebP with 85% quality
    let mut webp_data = Vec::new();
    let encoder = webp::Encoder::from_rgb(&processed, 400, 500);
    let encoded = encoder.encode(85.0);
    webp_data.extend_from_slice(&encoded);

    // Extract original format from filename or image data
    let original_format = std::path::Path::new(original_filename)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("unknown")
        .to_lowercase();

    let metadata = PhotoMetadata {
        original_width,
        original_height,
        processed_width: 400,
        processed_height: 500,
        original_format,
        file_size_bytes: webp_data.len(),
        compression_quality: 85,
        processed_at: chrono::Utc::now().to_rfc3339(),
    };

    Ok(PhotoProcessResult {
        webp_data,
        quality,
        metadata,
    })
}

/// Assess photo quality based on dimensions
fn assess_photo_quality(width: u32, height: u32) -> PhotoQuality {
    let (level, message) = if width >= 800 && height >= 1000 {
        (
            PhotoQualityLevel::Excellent,
            "Excellent quality - perfect for professional use".to_string(),
        )
    } else if width >= 400 && height >= 500 {
        (
            PhotoQualityLevel::Good,
            "Good quality - suitable for competition use".to_string(),
        )
    } else if width >= 200 && height >= 250 {
        (
            PhotoQualityLevel::Fair,
            "Fair quality - acceptable but could be better".to_string(),
        )
    } else {
        (
            PhotoQualityLevel::Poor,
            "Poor quality - image is very small and may appear pixelated".to_string(),
        )
    };

    PhotoQuality {
        level,
        message,
        original_width: width,
        original_height: height,
    }
}

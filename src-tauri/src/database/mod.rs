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
    use image::{ImageFormat, ImageReader};
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
    
    // Convert to RGB if needed and resize to exact 400x500px
    let processed = img
        .to_rgb8()
        .resize_exact(400, 500, image::imageops::FilterType::Lanczos3);
    
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
        (PhotoQualityLevel::Excellent, "Excellent quality - perfect for professional use".to_string())
    } else if width >= 400 && height >= 500 {
        (PhotoQualityLevel::Good, "Good quality - suitable for competition use".to_string()) 
    } else if width >= 200 && height >= 250 {
        (PhotoQualityLevel::Fair, "Fair quality - acceptable but could be better".to_string())
    } else {
        (PhotoQualityLevel::Poor, "Poor quality - image is very small and may appear pixelated".to_string())
    };
    
    PhotoQuality {
        level,
        message,
        original_width: width,
        original_height: height,
    }
}

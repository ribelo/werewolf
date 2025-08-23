use directories::ProjectDirs;
use std::fs;
use std::path::PathBuf;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tracing_appender::non_blocking::WorkerGuard;

/// Initialize the tracing system with file output and log rotation
pub fn init_tracing() -> Result<(PathBuf, WorkerGuard), Box<dyn std::error::Error>> {
    // Create log directory
    let project_dirs = ProjectDirs::from("com", "ribelo", "werewolf")
        .ok_or("Could not determine project directories")?;
    
    let log_dir = project_dirs.data_dir().join("logs");
    fs::create_dir_all(&log_dir)?;
    
    // Create rolling file appender for tracing with daily rotation
    let rolling_appender = tracing_appender::rolling::RollingFileAppender::new(
        tracing_appender::rolling::Rotation::DAILY,
        &log_dir,
        "werewolf.log"
    );
    let (non_blocking, guard) = tracing_appender::non_blocking(rolling_appender);
    
    // Initialize tracing subscriber with BOTH file and stdout output
    let result = tracing_subscriber::registry()
        .with(
            // File layer - detailed logs
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking.clone())
                .with_ansi(false)
                .with_target(false)
                .with_thread_ids(false)
                .with_level(true)
                .with_timer(tracing_subscriber::fmt::time::SystemTime)
                .with_line_number(false)
                .with_file(false)
        )
        .with(
            // Stdout layer - same logs but with colors for terminal
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stdout)
                .with_ansi(true)  // Colors for terminal
                .with_target(false)
                .with_thread_ids(false)
                .with_level(true)
                .with_timer(tracing_subscriber::fmt::time::SystemTime)
                .with_line_number(false)
                .with_file(false)
        )
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
        )
        .try_init();

    // Handle the case where global subscriber is already set (CLI mode)
    match result {
        Ok(_) => {},
        Err(_) => {
            // Global subscriber already set, just continue
            eprintln!("BACKEND: Tracing subscriber already initialized");
        }
    }
    
    let log_path = log_dir.join("werewolf.log");
    let current_log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    eprintln!("BACKEND: Logging system initialized with daily rotation, log file: {}, level: {}", log_path.display(), current_log_level);
    tracing::info!("Logging system initialized with daily rotation, log file: {}, level: {}", log_path.display(), current_log_level);
    
    Ok((log_path, guard))
}

/// Write a frontend log entry to the log file using tracing
pub async fn write_frontend_log(
    level: &str,
    message: &str,
    _timestamp: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Check if this log level should be written
    let min_level_str = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let min_level = LogLevel::from_str(&min_level_str);
    let current_level = LogLevel::from_str(level);
    
    if current_level < min_level {
        return Ok(());
    }
    
    match level.to_lowercase().as_str() {
        "debug" => tracing::debug!(%message, "[frontend]"),
        "info" => tracing::info!(%message, "[frontend]"),
        "warn" => tracing::warn!(%message, "[frontend]"),
        "error" => tracing::error!(%message, "[frontend]"),
        _ => tracing::info!(%message, "[frontend]"),
    }
    
    Ok(())
}

/// Tauri command for writing frontend logs
#[tauri::command]
pub async fn write_log(
    level: String,
    message: String,
    timestamp: Option<String>,
) -> Result<(), String> {
    write_frontend_log(
        &level,
        &message,
        timestamp.as_deref(),
    ).await.map_err(|e| e.to_string())
}

/// Log level hierarchy for filtering
#[derive(Debug, PartialEq, PartialOrd)]
enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
}

impl LogLevel {
    fn from_str(s: &str) -> LogLevel {
        match s.to_lowercase().as_str() {
            "debug" => LogLevel::Debug,
            "info" => LogLevel::Info,
            "warn" => LogLevel::Warn,
            "error" => LogLevel::Error,
            _ => LogLevel::Info, // Default to info
        }
    }
}
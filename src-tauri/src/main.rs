// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::{Parser, Subcommand};
use werewolf_lib::database::{create_pool, run_migrations, reset_database, get_migration_info, get_database_path};

#[derive(Parser)]
#[command(name = "werewolf")]
#[command(about = "Powerlifting contest management application")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the GUI application (default)
    Gui,
    /// Database operations
    Db {
        #[command(subcommand)]
        action: DbCommands,
    },
    /// Export contest results to various formats
    Export {
        contest_id: String,
        #[arg(value_enum)]
        format: ExportFormat,
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Test logging functionality
    TestLogging,
}

#[derive(Subcommand)]
enum DbCommands {
    /// Run pending database migrations
    Migrate,
    /// Reset database (WARNING: destroys all data)
    Reset {
        #[arg(long)]
        confirm: bool,
    },
    /// Show migration status
    Status,
    /// Create database backup
    Backup { path: String },
}

#[derive(clap::ValueEnum, Clone)]
enum ExportFormat {
    Excel,      // Excel (.xlsx) - Federation standard
    Csv,        // CSV format
    Json,       // JSON format
    Pdf,        // PDF results sheet
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    
    // Initialize simple console logging for CLI commands (GUI will use tauri-plugin-log)
    if cli.command.is_some() {
        env_logger::init();
    }
    
    match cli.command {
        Some(Commands::Db { action }) => {
            if let Err(e) = handle_db_command(action).await {
                eprintln!("Database error: {}", e);
                std::process::exit(1);
            }
        },
        Some(Commands::Export { contest_id, format, output }) => {
            if let Err(e) = handle_export_command(contest_id, format, output).await {
                eprintln!("Export error: {}", e);
                std::process::exit(1);
            }
        },
        Some(Commands::TestLogging) => {
            if let Err(e) = test_logging().await {
                eprintln!("Logging test error: {}", e);
                std::process::exit(1);
            }
        },
        _ => {
            // Default: start Tauri GUI
            werewolf_lib::run();
        }
    }
}

async fn handle_db_command(action: DbCommands) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_database_path();
    let db_url = format!("sqlite:{}", db_path);
    
    match action {
        DbCommands::Migrate => {
            println!("Running database migrations...");
            let pool = create_pool(&db_url).await?;
            run_migrations(&pool).await?;
            println!("Migrations completed successfully!");
        },
        DbCommands::Reset { confirm } => {
            if !confirm {
                println!("WARNING: This will destroy all data in the database!");
                println!("Use --confirm flag to proceed: werewolf db reset --confirm");
                return Ok(());
            }
            
            println!("Resetting database...");
            let pool = create_pool(&db_url).await?;
            reset_database(&pool).await?;
            println!("Database reset completed!");
        },
        DbCommands::Status => {
            let pool = create_pool(&db_url).await?;
            let migrations = get_migration_info(&pool).await?;
            
            println!("Migration Status:");
            println!("================");
            for migration in migrations {
                let status = if migration.applied { "✓ Applied" } else { "✗ Pending" };
                println!("{} {} - {}", status, migration.version, migration.description);
            }
        },
        DbCommands::Backup { path } => {
            println!("Creating backup at: {}", path);
            std::fs::copy(&db_path, &path)?;
            println!("Backup created successfully!");
        },
    }
    
    Ok(())
}

async fn handle_export_command(
    _contest_id: String,
    _format: ExportFormat, 
    _output: Option<String>
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Export functionality will be implemented in a future version");
    Ok(())
}

async fn test_logging() -> Result<(), Box<dyn std::error::Error>> {
    use werewolf_lib::logging;
    
    println!("Testing unified logging functionality...");
    
    // Initialize the unified logging system for CLI testing
    let (log_path, _guard) = logging::init_tracing()?;
    println!("Unified logging initialized, log file: {}", log_path.display());
    
    // Test different log levels
    tracing::trace!("This is a TRACE message from CLI");
    tracing::debug!("This is a DEBUG message from CLI"); 
    tracing::info!("This is an INFO message from CLI");
    tracing::warn!("This is a WARN message from CLI");
    tracing::error!("This is an ERROR message from CLI");
    
    // Test frontend log simulation
    logging::write_frontend_log("info", "Simulated frontend message from CLI test", None).await?;
    logging::write_frontend_log("warn", "Simulated frontend warning from CLI test", None).await?;
    
    println!("✅ Unified logging test completed!");
    println!("Log file: {}", log_path.display());
    println!("Both backend and simulated frontend logs written to same file");
    Ok(())
}

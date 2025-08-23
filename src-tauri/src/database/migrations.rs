use sqlx::{Pool, Sqlite, migrate::Migrator};

/// Embedded migrations from the migrations directory
static MIGRATOR: Migrator = sqlx::migrate!();

/// Run all pending migrations
pub async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    log::info!("Running database migrations...");
    
    MIGRATOR.run(pool).await?;
    
    log::info!("Database migrations completed successfully");
    Ok(())
}

/// Simple migration info struct
#[derive(Debug)]
pub struct MigrationInfo {
    pub version: i64,
    pub description: String,
    pub applied: bool,
}

/// Get migration info
pub async fn get_migration_info(pool: &Pool<Sqlite>) -> Result<Vec<MigrationInfo>, sqlx::Error> {
    let migrations = MIGRATOR.iter().collect::<Vec<_>>();
    let mut info = Vec::new();
    
    for migration in migrations {
        let applied = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version = ?)"
        )
        .bind(migration.version)
        .fetch_one(pool)
        .await.unwrap_or(false);
        
        info.push(MigrationInfo {
            version: migration.version,
            description: migration.description.to_string(),
            applied,
        });
    }
    
    Ok(info)
}

/// Check if all migrations are applied
pub async fn check_migration_status(pool: &Pool<Sqlite>) -> Result<bool, sqlx::Error> {
    let info = get_migration_info(pool).await?;
    let all_applied = info.iter().all(|m| m.applied);
    log::info!("All migrations applied: {}", all_applied);
    Ok(all_applied)
}

/// Reset database by dropping all tables and re-running migrations
pub async fn reset_database(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    log::warn!("Resetting database - all data will be lost!");
    
    // Drop all tables
    sqlx::query("DROP TABLE IF EXISTS results")
        .execute(pool)
        .await?;
        
    sqlx::query("DROP TABLE IF EXISTS current_lifts")
        .execute(pool)
        .await?;
        
    sqlx::query("DROP TABLE IF EXISTS attempts")
        .execute(pool)
        .await?;
        
    sqlx::query("DROP TABLE IF EXISTS competitors")
        .execute(pool)
        .await?;
        
    sqlx::query("DROP TABLE IF EXISTS equipment_types")
        .execute(pool)
        .await?;
        
    sqlx::query("DROP TABLE IF EXISTS categories")
        .execute(pool)
        .await?;
        
    sqlx::query("DROP TABLE IF EXISTS contests")
        .execute(pool)
        .await?;
        
    // Drop migrations table to force re-creation
    sqlx::query("DROP TABLE IF EXISTS _sqlx_migrations")
        .execute(pool)
        .await?;
        
    // Re-run all migrations
    run_migrations(pool).await?;
    
    log::info!("Database reset completed");
    Ok(())
}
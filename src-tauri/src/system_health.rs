use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub enum ConfigHealth {
    Ok,
    Error {
        backup_path: Option<PathBuf>,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize)]
pub enum DatabaseHealth {
    Ok,
    Error {
        backup_path: Option<PathBuf>,
        message: String,
        using_fallback: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemHealth {
    pub config_health: ConfigHealth,
    pub database_health: DatabaseHealth,
}

impl SystemHealth {
    pub fn new(config_health: ConfigHealth, database_health: DatabaseHealth) -> Self {
        Self {
            config_health,
            database_health,
        }
    }
}

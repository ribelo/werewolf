use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Database not initialized")]
    DatabaseNotInitialized,

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Competitor not found: {id}")]
    CompetitorNotFound { id: String },

    #[error("Contest not found: {id}")]
    ContestNotFound { id: String },

    #[error("Contest state not found for contest: {contest_id}")]
    ContestStateNotFound { contest_id: String },

    #[error("Registration not found: {id}")]
    RegistrationNotFound { id: String },

    #[error("Invalid attempt: {reason}")]
    InvalidAttempt { reason: String },

    #[error("Contest is not in progress")]
    ContestNotInProgress,

    #[error("Contest already exists: {name}")]
    ContestAlreadyExists { name: String },

    #[error("Invalid input: {field} - {reason}")]
    InvalidInput { field: String, reason: String },

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Photo processing error: {0}")]
    PhotoProcessing(#[from] crate::database::queries::competitors::PhotoProcessError),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// Convert AppError to String for Tauri command returns
impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.to_string()
    }
}

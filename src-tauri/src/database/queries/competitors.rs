use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Row, Sqlite};
use crate::database::{process_competitor_photo, PhotoProcessResult};

#[derive(Debug, thiserror::Error)]
pub enum PhotoProcessError {
    #[error("Photo processing failed: {0}")]
    ProcessingFailed(String),
    #[error("Photo metadata serialization failed: {0}")]
    MetadataSerializationFailed(#[from] serde_json::Error),
}

/// Process photo data and return database-ready values or error
fn process_photo_for_storage(
    base64_data: Option<&str>,
    filename: Option<&str>
) -> Result<(Option<Vec<u8>>, Option<String>, Option<String>), PhotoProcessError> {
    if let (Some(base64_data), Some(filename)) = (base64_data, filename) {
        // Basic input validation
        if base64_data.is_empty() {
            return Err(PhotoProcessError::ProcessingFailed("Base64 data is empty".to_string()));
        }
        
        // Check base64 data size limit (10MB encoded ~= 13MB base64)
        if base64_data.len() > 13 * 1024 * 1024 {
            return Err(PhotoProcessError::ProcessingFailed("Photo data too large (max 10MB)".to_string()));
        }
        
        // Basic base64 validation - check if it contains valid base64 characters
        if !base64_data.chars().all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '=') {
            return Err(PhotoProcessError::ProcessingFailed("Invalid base64 data".to_string()));
        }
        
        let PhotoProcessResult { webp_data, metadata, .. } = process_competitor_photo(base64_data, filename)
            .map_err(|e| PhotoProcessError::ProcessingFailed(e.to_string()))?;
        
        let metadata_json = serde_json::to_string(&metadata)?;
        
        Ok((
            Some(webp_data),
            Some("webp".to_string()),
            Some(metadata_json)
        ))
    } else {
        Ok((None, None, None))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Competitor {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String, // YYYY-MM-DD format
    pub gender: String,
    pub club: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
    pub photo_data: Option<Vec<u8>>,
    pub photo_format: Option<String>,
    pub photo_metadata: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCompetitorRequest {
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String, // YYYY-MM-DD format
    pub gender: String,
    pub club: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
    pub photo_base64: Option<String>,
    pub photo_filename: Option<String>,
}

/// Create a new competitor
pub async fn create_competitor(
    pool: &Pool<Sqlite>,
    request: CreateCompetitorRequest,
) -> Result<Competitor, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    
    // Process photo if provided - convert photo errors to sqlx error for consistency
    let (photo_data, photo_format, photo_metadata) = process_photo_for_storage(
        request.photo_base64.as_deref(),
        request.photo_filename.as_deref()
    ).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

    let row = sqlx::query(
        r#"
        INSERT INTO competitors (id, first_name, last_name, birth_date, gender, club, city, notes, photo_data, photo_format, photo_metadata)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        RETURNING id, first_name, last_name, birth_date, gender, club, city, notes, photo_data, photo_format, photo_metadata, created_at, updated_at
        "#,
    )
    .bind(&id)
    .bind(&request.first_name)
    .bind(&request.last_name)
    .bind(&request.birth_date)
    .bind(&request.gender)
    .bind(&request.club)
    .bind(&request.city)
    .bind(&request.notes)
    .bind(&photo_data)
    .bind(&photo_format)
    .bind(&photo_metadata)
    .fetch_one(pool)
    .await?;

    Ok(Competitor {
        id: row.try_get("id")?,
        first_name: row.try_get("first_name")?,
        last_name: row.try_get("last_name")?,
        birth_date: row.try_get("birth_date")?,
        gender: row.try_get("gender")?,
        club: row.try_get("club")?,
        city: row.try_get("city")?,
        notes: row.try_get("notes")?,
        photo_data: row.try_get("photo_data")?,
        photo_format: row.try_get("photo_format")?,
        photo_metadata: row.try_get("photo_metadata")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// Get competitor by ID
pub async fn get_competitor_by_id(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<Competitor, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, first_name, last_name, birth_date, gender, club, city, notes, photo_data, photo_format, photo_metadata, created_at, updated_at FROM competitors WHERE id = ?1"
    )
    .bind(competitor_id)
    .fetch_one(pool)
    .await?;

    Ok(Competitor {
        id: row.try_get("id")?,
        first_name: row.try_get("first_name")?,
        last_name: row.try_get("last_name")?,
        birth_date: row.try_get("birth_date")?,
        gender: row.try_get("gender")?,
        club: row.try_get("club")?,
        city: row.try_get("city")?,
        notes: row.try_get("notes")?,
        photo_data: row.try_get("photo_data")?,
        photo_format: row.try_get("photo_format")?,
        photo_metadata: row.try_get("photo_metadata")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// Get all competitors
pub async fn get_all_competitors(pool: &Pool<Sqlite>) -> Result<Vec<Competitor>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, first_name, last_name, birth_date, gender, club, city, notes, photo_data, photo_format, photo_metadata, created_at, updated_at FROM competitors ORDER BY last_name, first_name"
    )
    .fetch_all(pool)
    .await?;

    let mut competitors = Vec::new();
    for row in rows {
        competitors.push(Competitor {
            id: row.try_get("id")?,
            first_name: row.try_get("first_name")?,
            last_name: row.try_get("last_name")?,
            birth_date: row.try_get("birth_date")?,
            gender: row.try_get("gender")?,
            club: row.try_get("club")?,
            city: row.try_get("city")?,
            notes: row.try_get("notes")?,
            photo_data: row.try_get("photo_data")?,
            photo_format: row.try_get("photo_format")?,
            photo_metadata: row.try_get("photo_metadata")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }

    Ok(competitors)
}

/// Update competitor
pub async fn update_competitor(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
    request: CreateCompetitorRequest,
) -> Result<(), sqlx::Error> {
    // Process photo if provided - propagate errors instead of silent failure
    let (photo_data, photo_format, photo_metadata) = process_photo_for_storage(
        request.photo_base64.as_deref(),
        request.photo_filename.as_deref()
    ).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

    sqlx::query(
        r#"
        UPDATE competitors 
        SET first_name = ?1, last_name = ?2, birth_date = ?3, gender = ?4, club = ?5, city = ?6, notes = ?7, photo_data = ?8, photo_format = ?9, photo_metadata = ?10
        WHERE id = ?11
        "#
    )
    .bind(&request.first_name)
    .bind(&request.last_name)
    .bind(&request.birth_date)
    .bind(&request.gender)
    .bind(&request.club)
    .bind(&request.city)
    .bind(&request.notes)
    .bind(&photo_data)
    .bind(&photo_format)
    .bind(&photo_metadata)
    .bind(competitor_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Update competitor photo specifically
pub async fn update_competitor_photo(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
    base64_data: &str,
    filename: &str,
) -> Result<(), sqlx::Error> {
    // Process the photo
    let (photo_data, photo_format, photo_metadata) = process_photo_for_storage(
        Some(base64_data),
        Some(filename)
    ).map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
    
    sqlx::query(
        "UPDATE competitors SET photo_data = ?1, photo_format = ?2, photo_metadata = ?3 WHERE id = ?4"
    )
    .bind(&photo_data)
    .bind(&photo_format) 
    .bind(&photo_metadata)
    .bind(competitor_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Remove competitor photo specifically
pub async fn remove_competitor_photo(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE competitors SET photo_data = NULL, photo_format = NULL, photo_metadata = NULL WHERE id = ?1"
    )
    .bind(competitor_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get competitor photo data only (for lazy loading)
pub async fn get_competitor_photo(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<Option<Vec<u8>>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT photo_data FROM competitors WHERE id = ?1"
    )
    .bind(competitor_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.try_get("photo_data")).transpose()?)
}

/// Delete competitor
pub async fn delete_competitor(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM competitors WHERE id = ?1")
        .bind(competitor_id)
        .execute(pool)
        .await?;

    Ok(())
}

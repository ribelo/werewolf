use crate::database::process_competitor_photo;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Sqlite};

#[derive(Debug, thiserror::Error)]
pub enum PhotoProcessError {
    #[error("Photo processing failed: {0}")]
    ProcessingFailed(String),
    #[error("Photo metadata serialization failed: {0}")]
    MetadataSerializationFailed(#[from] serde_json::Error),
}

/// Type alias for processed photo data (BLOB, format, metadata_json)
type ProcessedPhotoData =
    Result<(Option<Vec<u8>>, Option<String>, Option<String>), PhotoProcessError>;

/// Process photo data and return database-ready values or error
fn process_photo_for_storage(
    base64_data: Option<&str>,
    filename: Option<&str>,
) -> ProcessedPhotoData {
    if let (Some(base64_data), Some(filename)) = (base64_data, filename) {
        // Basic input validation
        if base64_data.is_empty() {
            return Err(PhotoProcessError::ProcessingFailed(
                "Base64 data is empty".to_string(),
            ));
        }

        // Check base64 data size limit (10MB encoded ~= 13MB base64)
        if base64_data.len() > 13 * 1024 * 1024 {
            return Err(PhotoProcessError::ProcessingFailed(
                "Photo data too large (max 10MB)".to_string(),
            ));
        }

        // Basic base64 validation - check if it contains valid base64 characters
        if !base64_data
            .chars()
            .all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '=')
        {
            return Err(PhotoProcessError::ProcessingFailed(
                "Invalid base64 data".to_string(),
            ));
        }

        let result = process_competitor_photo(base64_data, filename)
            .map_err(|e| PhotoProcessError::ProcessingFailed(e.to_string()))?;

        Ok((
            Some(result.webp_data),
            Some("webp".to_string()),
            Some(serde_json::to_string(&result.metadata)?),
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
    pub competition_order: i64,
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

    // Get next available competition order
    let next_order =
        sqlx::query_scalar!("SELECT COALESCE(MAX(competition_order), 0) + 1 FROM competitors")
            .fetch_one(pool)
            .await?;

    // Process photo if provided - convert photo errors to sqlx error for consistency
    let (photo_data, photo_format, photo_metadata) = process_photo_for_storage(
        request.photo_base64.as_deref(),
        request.photo_filename.as_deref(),
    )
    .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

    sqlx::query!(
        r#"
        INSERT INTO competitors (id, first_name, last_name, birth_date, gender, club, city, notes, competition_order, photo_data, photo_format, photo_metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
        id,
        request.first_name,
        request.last_name,
        request.birth_date,
        request.gender,
        request.club,
        request.city,
        request.notes,
        next_order,
        photo_data,
        photo_format,
        photo_metadata
    )
    .execute(pool)
    .await?;

    // Fetch the created competitor
    get_competitor_by_id(pool, &id).await
}

/// Get competitor by ID
pub async fn get_competitor_by_id(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<Competitor, sqlx::Error> {
    sqlx::query_as!(
        Competitor,
        r#"SELECT 
            id as "id!", 
            first_name as "first_name!", 
            last_name as "last_name!", 
            birth_date as "birth_date!", 
            gender as "gender!",
            club, 
            city, 
            notes, 
            competition_order as "competition_order!",
            photo_data, 
            photo_format, 
            photo_metadata, 
            created_at as "created_at!", 
            updated_at as "updated_at!"
        FROM competitors WHERE id = ?"#,
        competitor_id
    )
    .fetch_one(pool)
    .await
}

/// Get all competitors
pub async fn get_all_competitors(pool: &Pool<Sqlite>) -> Result<Vec<Competitor>, sqlx::Error> {
    sqlx::query_as!(
        Competitor,
        r#"SELECT 
            id as "id!", 
            first_name as "first_name!", 
            last_name as "last_name!", 
            birth_date as "birth_date!", 
            gender as "gender!",
            club, 
            city, 
            notes, 
            competition_order as "competition_order!",
            photo_data, 
            photo_format, 
            photo_metadata, 
            created_at as "created_at!", 
            updated_at as "updated_at!"
        FROM competitors ORDER BY competition_order, last_name, first_name"#
    )
    .fetch_all(pool)
    .await
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
        request.photo_filename.as_deref(),
    )
    .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

    sqlx::query!(
        r#"
        UPDATE competitors 
        SET first_name = ?, last_name = ?, birth_date = ?, gender = ?, club = ?, city = ?, notes = ?, photo_data = ?, photo_format = ?, photo_metadata = ?
        WHERE id = ?
        "#,
        request.first_name,
        request.last_name,
        request.birth_date,
        request.gender,
        request.club,
        request.city,
        request.notes,
        photo_data,
        photo_format,
        photo_metadata,
        competitor_id
    )
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
    let (photo_data, photo_format, photo_metadata) =
        process_photo_for_storage(Some(base64_data), Some(filename))
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;

    sqlx::query!(
        "UPDATE competitors SET photo_data = ?, photo_format = ?, photo_metadata = ? WHERE id = ?",
        photo_data,
        photo_format,
        photo_metadata,
        competitor_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Remove competitor photo specifically
pub async fn remove_competitor_photo(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE competitors SET photo_data = NULL, photo_format = NULL, photo_metadata = NULL WHERE id = ?",
        competitor_id
    )
    .execute(pool)
    .await?;

    Ok(())
}

/// Get competitor photo data only (for lazy loading)
pub async fn get_competitor_photo(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<Option<Vec<u8>>, sqlx::Error> {
    let result = sqlx::query_scalar!(
        "SELECT photo_data FROM competitors WHERE id = ?",
        competitor_id
    )
    .fetch_optional(pool)
    .await?;

    Ok(result.flatten())
}

/// Delete competitor
pub async fn delete_competitor(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM competitors WHERE id = ?", competitor_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// Move competitor from one position to another (handles shifting other competitors)
pub async fn move_competitor_order(
    pool: &Pool<Sqlite>,
    competitor_id: &str,
    new_order: i64,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;

    // Get the current order of the competitor being moved
    let current_order = sqlx::query_scalar!(
        "SELECT competition_order FROM competitors WHERE id = ?",
        competitor_id
    )
    .fetch_one(&mut *transaction)
    .await?;

    if current_order == new_order {
        // No change needed
        transaction.commit().await?;
        return Ok(());
    }

    // Step 1: Temporarily move the competitor to -1 to avoid constraint violations
    sqlx::query!(
        "UPDATE competitors SET competition_order = -1 WHERE id = ?",
        competitor_id
    )
    .execute(&mut *transaction)
    .await?;

    if current_order < new_order {
        // Moving competitor down (increasing order)
        // Shift competitors between current_order and new_order up by 1
        sqlx::query!(
            "UPDATE competitors SET competition_order = competition_order - 1 
             WHERE competition_order > ? AND competition_order <= ?",
            current_order,
            new_order
        )
        .execute(&mut *transaction)
        .await?;
    } else {
        // Moving competitor up (decreasing order)
        // Shift competitors between new_order and current_order down by 1
        sqlx::query!(
            "UPDATE competitors SET competition_order = competition_order + 1 
             WHERE competition_order >= ? AND competition_order < ?",
            new_order,
            current_order
        )
        .execute(&mut *transaction)
        .await?;
    }

    // Step 3: Set the new order for the moved competitor
    sqlx::query!(
        "UPDATE competitors SET competition_order = ? WHERE id = ?",
        new_order,
        competitor_id
    )
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(())
}

// Temporarily disabled due to SQLx offline mode issues
#[cfg(feature = "disabled-tests")]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tempfile::NamedTempFile;

    async fn setup_test_db() -> Pool<Sqlite> {
        let temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let database_url = format!("sqlite:{}", temp_file.path().display());

        let pool = SqlitePoolOptions::new()
            .connect(&database_url)
            .await
            .expect("Failed to connect to test database");

        // Create competitors table
        sqlx::query!(
            r#"
            CREATE TABLE competitors (
                id TEXT PRIMARY KEY,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                birth_date TEXT NOT NULL,
                gender TEXT NOT NULL CHECK(gender IN ('Male','Female')),
                club TEXT,
                city TEXT,
                notes TEXT,
                competition_order INTEGER NOT NULL DEFAULT 0 UNIQUE,
                photo_data BLOB,
                photo_format TEXT DEFAULT 'webp',
                photo_metadata TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#
        )
        .execute(&pool)
        .await
        .expect("Failed to create competitors table");

        pool
    }

    async fn create_test_competitors(pool: &Pool<Sqlite>, count: i64) -> Vec<String> {
        let mut competitor_ids = Vec::new();

        for i in 1..=count {
            let request = CreateCompetitorRequest {
                first_name: format!("Competitor{}", i),
                last_name: "Test".to_string(),
                birth_date: "1990-01-01".to_string(),
                gender: "Male".to_string(),
                club: None,
                city: None,
                notes: None,
                photo_base64: None,
                photo_filename: None,
            };

            let competitor = create_competitor(pool, request)
                .await
                .expect("Failed to create test competitor");
            competitor_ids.push(competitor.id);
        }

        competitor_ids
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_create_competitor_auto_assigns_order() {
        let pool = setup_test_db().await;
        let competitor_ids = create_test_competitors(&pool, 3).await;

        // Verify orders are assigned sequentially
        for (index, id) in competitor_ids.iter().enumerate() {
            let competitor = get_competitor_by_id(&pool, id)
                .await
                .expect("Failed to get competitor");
            assert_eq!(competitor.competition_order, (index as i64) + 1);
        }
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_move_competitor_first_to_last() {
        let pool = setup_test_db().await;
        let competitor_ids = create_test_competitors(&pool, 5).await;

        // Move first competitor (order 1) to last position (order 5)
        move_competitor_order(&pool, &competitor_ids[0], 5)
            .await
            .expect("Failed to move competitor");

        // Verify new orders
        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get competitors");
        assert_eq!(competitors[0].competition_order, 1); // Was 2nd, now 1st
        assert_eq!(competitors[1].competition_order, 2); // Was 3rd, now 2nd
        assert_eq!(competitors[2].competition_order, 3); // Was 4th, now 3rd
        assert_eq!(competitors[3].competition_order, 4); // Was 5th, now 4th
        assert_eq!(competitors[4].competition_order, 5); // Was 1st, now 5th
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_move_competitor_last_to_first() {
        let pool = setup_test_db().await;
        let competitor_ids = create_test_competitors(&pool, 5).await;

        // Move last competitor (order 5) to first position (order 1)
        move_competitor_order(&pool, &competitor_ids[4], 1)
            .await
            .expect("Failed to move competitor");

        // Verify new orders
        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get competitors");
        assert_eq!(competitors[0].competition_order, 1); // Was 5th, now 1st
        assert_eq!(competitors[1].competition_order, 2); // Was 1st, now 2nd
        assert_eq!(competitors[2].competition_order, 3); // Was 2nd, now 3rd
        assert_eq!(competitors[3].competition_order, 4); // Was 3rd, now 4th
        assert_eq!(competitors[4].competition_order, 5); // Was 4th, now 5th
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_move_competitor_middle_position() {
        let pool = setup_test_db().await;
        let competitor_ids = create_test_competitors(&pool, 5).await;

        // Move middle competitor (order 3) to position 2
        move_competitor_order(&pool, &competitor_ids[2], 2)
            .await
            .expect("Failed to move competitor");

        // Verify new orders
        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get competitors");
        assert_eq!(competitors[0].competition_order, 1); // Was 1st, still 1st
        assert_eq!(competitors[1].competition_order, 2); // Was 3rd, now 2nd
        assert_eq!(competitors[2].competition_order, 3); // Was 2nd, now 3rd
        assert_eq!(competitors[3].competition_order, 4); // Was 4th, still 4th
        assert_eq!(competitors[4].competition_order, 5); // Was 5th, still 5th
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_move_competitor_same_position() {
        let pool = setup_test_db().await;
        let competitor_ids = create_test_competitors(&pool, 3).await;

        // Move competitor to same position (should be no-op)
        move_competitor_order(&pool, &competitor_ids[1], 2)
            .await
            .expect("Failed to move competitor");

        // Verify orders are unchanged
        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get competitors");
        assert_eq!(competitors[0].competition_order, 1);
        assert_eq!(competitors[1].competition_order, 2);
        assert_eq!(competitors[2].competition_order, 3);
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_unique_constraint_violation() {
        let pool = setup_test_db().await;

        // Manually insert competitors with same order (should fail)
        let result = sqlx::query!(
            "INSERT INTO competitors (id, first_name, last_name, birth_date, gender, competition_order) 
             VALUES ('test1', 'Test', 'One', '1990-01-01', 'Male', 1),
                    ('test2', 'Test', 'Two', '1990-01-01', 'Male', 1)"
        )
        .execute(&pool)
        .await;

        assert!(result.is_err());
        assert!(
            matches!(result.unwrap_err(), sqlx::Error::Database(db_err) if db_err.is_unique_violation())
        );
    }

    #[ignore] // Disabled until SQLx offline mode issue is resolved
    #[tokio::test]
    async fn test_competitors_ordered_correctly() {
        let pool = setup_test_db().await;
        create_test_competitors(&pool, 5).await;

        let competitors = get_all_competitors(&pool)
            .await
            .expect("Failed to get competitors");

        // Verify competitors are returned in order
        for (index, competitor) in competitors.iter().enumerate() {
            assert_eq!(competitor.competition_order, (index as i64) + 1);
        }
    }
}

use crate::database::queries;
use crate::error::AppError;
use crate::models::competitor::{Competitor, CompetitorCreate};
use crate::AppState;
use base64::{engine::general_purpose, Engine as _};
use tauri::State;

#[tauri::command]
pub async fn competitor_create(
    state: State<'_, AppState>,
    competitor: CompetitorCreate,
) -> Result<Competitor, AppError> {
    tracing::info!("competitor_create called with: {:?}", competitor);

    // Photo data will be processed in the database layer

    let request = queries::competitors::CreateCompetitorRequest {
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        birth_date: competitor.birth_date,
        gender: competitor.gender,
        club: None,
        city: None,
        notes: None,
        photo_base64: competitor.photo_base64,
        photo_filename: competitor.photo_filename,
    };

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    let created = queries::competitors::create_competitor(db_pool, request).await?;

    // Don't convert photo to base64 here - use lazy loading instead
    Ok(Competitor {
        id: created.id,
        first_name: created.first_name,
        last_name: created.last_name,
        birth_date: created.birth_date,
        gender: created.gender,
        club: created.club,
        city: created.city,
        notes: created.notes,
        competition_order: created.competition_order,
        photo_base64: None, // Lazy load when needed
        created_at: created.created_at,
        updated_at: created.updated_at,
    })
}

#[tauri::command]
pub async fn competitor_list(state: State<'_, AppState>) -> Result<Vec<Competitor>, AppError> {
    tracing::info!("competitor_list called");

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    let db_competitors = queries::competitors::get_all_competitors(db_pool).await?;

    // Don't convert photos to base64 in list - use lazy loading for efficiency
    let competitors = db_competitors
        .into_iter()
        .map(|c| Competitor {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            birth_date: c.birth_date,
            gender: c.gender,
            club: c.club,
            city: c.city,
            notes: c.notes,
            competition_order: c.competition_order,
            photo_base64: None, // Lazy load when needed
            created_at: c.created_at,
            updated_at: c.updated_at,
        })
        .collect();

    Ok(competitors)
}

#[tauri::command]
pub async fn competitor_get(
    state: State<'_, AppState>,
    competitor_id: String,
) -> Result<Competitor, AppError> {
    tracing::info!("competitor_get called for id: {}", competitor_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    let competitor = queries::competitors::get_competitor_by_id(db_pool, &competitor_id).await?;

    // Convert BLOB photo data to base64 for frontend (individual get can afford the conversion)
    let photo_base64 = competitor
        .photo_data
        .as_ref()
        .map(|photo_data| general_purpose::STANDARD.encode(photo_data));

    Ok(Competitor {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        birth_date: competitor.birth_date,
        gender: competitor.gender,
        club: competitor.club,
        city: competitor.city,
        notes: competitor.notes,
        competition_order: competitor.competition_order,
        photo_base64,
        created_at: competitor.created_at,
        updated_at: competitor.updated_at,
    })
}

#[tauri::command]
pub async fn competitor_update(
    state: State<'_, AppState>,
    competitor_id: String,
    competitor: CompetitorCreate,
) -> Result<(), AppError> {
    tracing::info!("competitor_update called for id: {}", competitor_id);

    let request = queries::competitors::CreateCompetitorRequest {
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        birth_date: competitor.birth_date,
        gender: competitor.gender,
        club: None,
        city: None,
        notes: None,
        photo_base64: competitor.photo_base64,
        photo_filename: competitor.photo_filename,
    };

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    queries::competitors::update_competitor(db_pool, &competitor_id, request).await?;

    Ok(())
}

#[tauri::command]
pub async fn competitor_delete(
    state: State<'_, AppState>,
    competitor_id: String,
) -> Result<(), AppError> {
    tracing::info!("competitor_delete called for id: {}", competitor_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    queries::competitors::delete_competitor(db_pool, &competitor_id).await?;

    Ok(())
}

#[tauri::command]
pub async fn competitor_upload_photo(
    state: State<'_, AppState>,
    competitor_id: String,
    photo_base64: String,
    filename: String,
) -> Result<(), AppError> {
    tracing::info!("competitor_upload_photo called for id: {}", competitor_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // Use targeted photo update function - much simpler
    queries::competitors::update_competitor_photo(
        db_pool,
        &competitor_id,
        &photo_base64,
        &filename,
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn competitor_remove_photo(
    state: State<'_, AppState>,
    competitor_id: String,
) -> Result<(), AppError> {
    tracing::info!("competitor_remove_photo called for id: {}", competitor_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // Use targeted photo removal function - much simpler
    queries::competitors::remove_competitor_photo(db_pool, &competitor_id).await?;

    Ok(())
}

#[tauri::command]
pub async fn competitor_get_photo(
    state: State<'_, AppState>,
    competitor_id: String,
) -> Result<Option<String>, AppError> {
    tracing::info!("competitor_get_photo called for id: {}", competitor_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // Use targeted photo fetch function for lazy loading
    let photo_data = queries::competitors::get_competitor_photo(db_pool, &competitor_id).await?;

    // Convert to base64 only when requested
    Ok(photo_data.map(|data| general_purpose::STANDARD.encode(data)))
}

#[tauri::command]
pub async fn competitor_move_order(
    state: State<'_, AppState>,
    competitor_id: String,
    new_order: i64,
) -> Result<(), AppError> {
    tracing::info!(
        "competitor_move_order called for id: {} to position: {}",
        competitor_id,
        new_order
    );

    if new_order < 1 {
        return Err(AppError::ValidationError(
            "Order must be greater than 0".to_string(),
        ));
    }

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // Validate target position doesn't exceed total competitors
    let total_competitors = sqlx::query_scalar!("SELECT COUNT(*) FROM competitors")
        .fetch_one(db_pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to count competitors: {}", e)))?;

    if new_order > total_competitors {
        return Err(AppError::ValidationError(format!(
            "Order {} exceeds total number of competitors ({})",
            new_order, total_competitors
        )));
    }

    // Execute reordering - constraint violations during transactions are normal
    queries::competitors::move_competitor_order(db_pool, &competitor_id, new_order)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to reorder competitor: {}", e)))
}

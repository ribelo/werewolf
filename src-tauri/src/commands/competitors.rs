use crate::database::queries;
use crate::error::AppError;
use crate::models::competitor::{Competitor, CompetitorCreate};
use crate::AppState;
use tauri::State;
use base64::{engine::general_purpose, Engine as _};

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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
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
        photo_base64: None, // Lazy load when needed
        created_at: created.created_at,
        updated_at: created.updated_at,
    })
}

#[tauri::command]
pub async fn competitor_list(state: State<'_, AppState>) -> Result<Vec<Competitor>, AppError> {
    tracing::info!("competitor_list called");

    let db_pool = state.db.lock().await;
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
    let competitor = queries::competitors::get_competitor_by_id(db_pool, &competitor_id).await?;

    // Convert BLOB photo data to base64 for frontend (individual get can afford the conversion)
    let photo_base64 = if let Some(photo_data) = &competitor.photo_data {
        Some(general_purpose::STANDARD.encode(photo_data))
    } else {
        None
    };

    Ok(Competitor {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        birth_date: competitor.birth_date,
        gender: competitor.gender,
        club: competitor.club,
        city: competitor.city,
        notes: competitor.notes,
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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;

    // Use targeted photo update function - much simpler
    queries::competitors::update_competitor_photo(db_pool, &competitor_id, &photo_base64, &filename).await?;

    Ok(())
}

#[tauri::command]
pub async fn competitor_remove_photo(
    state: State<'_, AppState>,
    competitor_id: String,
) -> Result<(), AppError> {
    tracing::info!("competitor_remove_photo called for id: {}", competitor_id);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;

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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;

    // Use targeted photo fetch function for lazy loading
    let photo_data = queries::competitors::get_competitor_photo(db_pool, &competitor_id).await?;
    
    // Convert to base64 only when requested
    Ok(photo_data.map(|data| general_purpose::STANDARD.encode(data)))
}


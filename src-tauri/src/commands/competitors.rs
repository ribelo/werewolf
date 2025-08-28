use crate::database::queries;
use crate::error::AppError;
use crate::models::competitor::{Competitor, CompetitorCreate};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn competitor_create(
    state: State<'_, AppState>,
    competitor: CompetitorCreate,
) -> Result<Competitor, AppError> {
    tracing::info!("competitor_create called with: {:?}", competitor);

    let request = queries::competitors::CreateCompetitorRequest {
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        birth_date: competitor.birth_date,
        gender: competitor.gender,
        club: None,
        city: None,
        notes: None,
    };

    let db_pool = state.db.lock().await;
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
    let created = queries::competitors::create_competitor(db_pool, request).await?;

    Ok(Competitor {
        id: created.id,
        first_name: created.first_name,
        last_name: created.last_name,
        birth_date: created.birth_date,
        gender: created.gender,
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

    let competitors = db_competitors
        .into_iter()
        .map(|c| Competitor {
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            birth_date: c.birth_date,
            gender: c.gender,
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

    Ok(Competitor {
        id: competitor.id,
        first_name: competitor.first_name,
        last_name: competitor.last_name,
        birth_date: competitor.birth_date,
        gender: competitor.gender,
    })
}

#[tauri::command]
pub async fn competitor_update(
    _state: State<'_, AppState>,
    _competitor_id: String,
) -> Result<String, AppError> {
    // TODO: Implement competitor update
    tracing::info!("competitor_update called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

#[tauri::command]
pub async fn competitor_delete(
    _state: State<'_, AppState>,
    _competitor_id: String,
) -> Result<String, AppError> {
    // TODO: Implement competitor deletion
    tracing::info!("competitor_delete called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

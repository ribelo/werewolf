use crate::error::AppError;
use crate::AppState;
use tauri::State;

// TODO: Define proper Result types and requests
// For now, placeholder implementations

use crate::database::queries;

#[tauri::command]
pub async fn result_calculate(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<(), AppError> {
    tracing::info!("result_calculate called for contest: {}", contest_id);
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;

    // 1. Get all registrations for the contest
    let registrations = queries::registrations::get_registrations_by_contest(db_pool, &contest_id).await?;

    // 2. Calculate results for each registration
    for reg in registrations {
        queries::results::calculate_results(db_pool, &reg.id).await?;
    }

    // 3. Update rankings for the entire contest
    queries::results::update_all_rankings(db_pool, &contest_id).await?;

    Ok(())
}

use crate::database::queries::results::CompetitionResult;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RankingType {
    Open,
    Age,
    Weight,
}

#[tauri::command]
pub async fn result_get_rankings(
    state: State<'_, AppState>,
    contest_id: String,
    ranking_type: RankingType,
) -> Result<Vec<CompetitionResult>, AppError> {
    tracing::info!(
        "result_get_rankings called for contest: {}, type: {}",
        contest_id,
        ranking_type.to_string()
    );
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;

    let results = match ranking_type {
        RankingType::Open => queries::results::get_open_ranking(db_pool, &contest_id).await?,
        RankingType::Age => queries::results::get_age_class_ranking(db_pool, &contest_id).await?,
        RankingType::Weight => {
            queries::results::get_weight_class_ranking(db_pool, &contest_id).await?
        }
    };

    Ok(results)
}

use std::fmt;

impl fmt::Display for RankingType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            RankingType::Open => write!(f, "open"),
            RankingType::Age => write!(f, "age"),
            RankingType::Weight => write!(f, "weight"),
        }
    }
}

#[tauri::command]
pub async fn result_get_competitor_results(
    _state: State<'_, AppState>,
    _registration_id: String,
) -> Result<String, AppError> {
    // TODO: Implement individual competitor results
    tracing::info!("result_get_competitor_results called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

#[tauri::command]
pub async fn result_export(
    _state: State<'_, AppState>,
    _contest_id: String,
    _format: String, // "excel", "csv", "json", "pdf"
) -> Result<String, AppError> {
    // TODO: Implement result export
    tracing::info!("result_export called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

#[tauri::command]
pub async fn result_get_scoreboard(
    _state: State<'_, AppState>,
    _contest_id: String,
) -> Result<String, AppError> {
    // TODO: Implement scoreboard data for display window
    tracing::info!("result_get_scoreboard called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

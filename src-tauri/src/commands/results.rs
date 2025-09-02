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
    let db_pool = &*db_pool;

    // 1. Get all registrations for the contest
    let registrations =
        queries::registrations::get_registrations_by_contest(db_pool, &contest_id).await?;

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
    let db_pool = &*db_pool;

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
    state: State<'_, AppState>,
    registration_id: String,
) -> Result<CompetitionResult, AppError> {
    tracing::info!(
        "result_get_competitor_results called for registration: {}",
        registration_id
    );
    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // First try to get existing result
    match queries::results::get_result_by_registration(db_pool, &registration_id).await {
        Ok(result) => Ok(result),
        Err(sqlx::Error::RowNotFound) => {
            // If no result exists, calculate it first
            let result = queries::results::calculate_results(db_pool, &registration_id).await?;
            Ok(result)
        }
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub async fn result_export(
    state: State<'_, AppState>,
    contest_id: String,
    format: String, // "csv", "json"
) -> Result<String, AppError> {
    tracing::info!(
        "result_export called for contest: {}, format: {}",
        contest_id,
        format
    );
    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    match format.as_str() {
        "csv" => {
            let rankings = queries::results::get_open_ranking(db_pool, &contest_id).await?;
            export_to_csv(rankings).await
        }
        "json" => {
            let rankings = queries::results::get_open_ranking(db_pool, &contest_id).await?;
            export_to_json(rankings).await
        }
        _ => Err(AppError::InvalidInput {
            field: "format".to_string(),
            reason: format!(
                "Unsupported export format: {}. Supported formats: csv, json",
                format
            ),
        }),
    }
}

async fn export_to_csv(rankings: Vec<CompetitionResult>) -> Result<String, AppError> {
    let mut csv_content = String::new();

    // Header
    csv_content.push_str(
        "Place,Registration ID,Best Squat,Best Bench,Best Deadlift,Total,Coefficient Points\n",
    );

    // Data rows
    for result in rankings {
        csv_content.push_str(&format!(
            "{},{},{:.1},{:.1},{:.1},{:.1},{:.2}\n",
            result.place_open.unwrap_or(0),
            result.registration_id,
            result.best_squat.unwrap_or(0.0),
            result.best_bench.unwrap_or(0.0),
            result.best_deadlift.unwrap_or(0.0),
            result.total_weight,
            result.coefficient_points
        ));
    }

    Ok(csv_content)
}

async fn export_to_json(rankings: Vec<CompetitionResult>) -> Result<String, AppError> {
    serde_json::to_string_pretty(&rankings)
        .map_err(|e| AppError::Internal(format!("Failed to serialize results to JSON: {}", e)))
}

#[derive(serde::Serialize)]
pub struct ScoreboardData {
    pub rankings: Vec<CompetitionResult>,
    pub total_competitors: usize,
    pub contest_name: Option<String>,
    pub updated_at: String,
}

#[tauri::command]
pub async fn result_get_scoreboard(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<ScoreboardData, AppError> {
    tracing::info!("result_get_scoreboard called for contest: {}", contest_id);
    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // Get current rankings (open ranking by default for scoreboard)
    let rankings = queries::results::get_open_ranking(db_pool, &contest_id).await?;
    let total_competitors = rankings.len();

    // Get contest name
    let contest_name = queries::contests::get_contest_by_id(db_pool, &contest_id)
        .await
        .ok()
        .flatten()
        .map(|c| c.name);

    Ok(ScoreboardData {
        rankings,
        total_competitors,
        contest_name,
        updated_at: chrono::Utc::now().to_rfc3339(),
    })
}

use crate::database::queries::contests as contest_queries;
use crate::error::AppError;
use crate::models::contest::{Contest, NewContest};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn contest_create(
    state: State<'_, AppState>,
    new_contest: NewContest,
) -> Result<Contest, AppError> {
    tracing::info!("Creating new contest: {:?}", new_contest);
    let db_guard = state.db.lock().await;
    let pool = db_guard.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    let contest = contest_queries::create_contest(pool, new_contest).await?;
    tracing::info!("Successfully created contest with ID: {}", contest.id);
    Ok(contest)
}

#[tauri::command]
pub async fn contest_list(state: State<'_, AppState>) -> Result<Vec<Contest>, AppError> {
    tracing::info!("Fetching all contests");
    let db_guard = state.db.lock().await;
    let pool = db_guard.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    let contests = contest_queries::get_all_contests(pool).await?;
    tracing::info!("Successfully fetched {} contests", contests.len());
    Ok(contests)
}

#[tauri::command]
pub async fn contest_get(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Option<Contest>, AppError> {
    tracing::info!("Fetching contest with ID: {}", contest_id);
    let db_guard = state.db.lock().await;
    let pool = db_guard.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    let contest = contest_queries::get_contest_by_id(pool, &contest_id).await?;
    if contest.is_some() {
        tracing::info!("Successfully fetched contest with ID: {}", contest_id);
    } else {
        tracing::warn!("No contest found with ID: {}", contest_id);
    }
    Ok(contest)
}

#[tauri::command]
pub async fn contest_update(
    state: State<'_, AppState>,
    contest_id: String,
    contest: Contest,
) -> Result<Contest, AppError> {
    tracing::info!("Updating contest with ID: {}", contest_id);
    let db_guard = state.db.lock().await;
    let pool = db_guard.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    let updated_contest = contest_queries::update_contest(pool, &contest_id, contest).await?;
    tracing::info!("Successfully updated contest with ID: {}", contest_id);
    Ok(updated_contest)
}

#[tauri::command]
pub async fn contest_delete(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<(), AppError> {
    tracing::info!("Deleting contest with ID: {}", contest_id);
    let db_guard = state.db.lock().await;
    let pool = db_guard.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    contest_queries::delete_contest(pool, &contest_id).await?;
    tracing::info!("Successfully deleted contest with ID: {}", contest_id);
    Ok(())
}

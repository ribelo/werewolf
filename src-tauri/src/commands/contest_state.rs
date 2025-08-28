use crate::database::queries;
use crate::error::AppError;
use crate::models::contest_state::ContestState;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn contest_state_get(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Option<ContestState>, AppError> {
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    let contest_state = queries::contest_states::get_contest_state(db_pool, &contest_id).await?;
    Ok(contest_state)
}

#[tauri::command]
pub async fn contest_state_update(
    state: State<'_, AppState>,
    contest_state: ContestState,
) -> Result<(), AppError> {
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    queries::contest_states::upsert_contest_state(db_pool, &contest_state).await?;
    Ok(())
}

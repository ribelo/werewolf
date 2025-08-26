use crate::database::queries;
use crate::error::AppError;
use crate::models::attempt::{
    Attempt, AttemptStatus, AttemptUpdateResult, AttemptUpsert, LiftType,
};
use crate::AppState;
use std::str::FromStr;
use tauri::State;

impl ToString for LiftType {
    fn to_string(&self) -> String {
        match self {
            LiftType::Squat => "Squat".to_string(),
            LiftType::Bench => "Bench".to_string(),
            LiftType::Deadlift => "Deadlift".to_string(),
        }
    }
}

impl FromStr for LiftType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Squat" => Ok(LiftType::Squat),
            "Bench" => Ok(LiftType::Bench),
            "Deadlift" => Ok(LiftType::Deadlift),
            _ => Err(()),
        }
    }
}

impl ToString for AttemptStatus {
    fn to_string(&self) -> String {
        match self {
            AttemptStatus::Pending => "Pending".to_string(),
            AttemptStatus::Good => "Good".to_string(),
            AttemptStatus::Bad => "Bad".to_string(),
        }
    }
}

impl FromStr for AttemptStatus {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Pending" => Ok(AttemptStatus::Pending),
            "Good" => Ok(AttemptStatus::Good),
            "Bad" => Ok(AttemptStatus::Bad),
            _ => Err(()),
        }
    }
}

#[tauri::command]
pub async fn attempt_upsert_weight(
    state: State<'_, AppState>,
    attempt: AttemptUpsert,
) -> Result<(), AppError> {
    tracing::info!("attempt_upsert_weight called with: {:?}", attempt);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or_else(|| AppError::database("Database not initialized"))?;
    queries::attempts::upsert_attempt_weight(
        db_pool,
        &attempt.registration_id,
        &attempt.lift_type.to_string(),
        attempt.attempt_number,
        attempt.weight,
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn attempt_list(
    state: State<'_, AppState>,
    registration_id: String,
) -> Result<Vec<Attempt>, AppError> {
    tracing::info!("attempt_list called for registration: {}", registration_id);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or_else(|| AppError::database("Database not initialized"))?;
    let db_attempts =
        queries::attempts::get_attempts_by_registration(
            db_pool,
            &registration_id,
        )
        .await?;

    let attempts = db_attempts
        .into_iter()
        .map(|a| Attempt {
            id: a.id,
            registration_id: a.registration_id,
            lift_type: LiftType::from_str(&a.lift_type).unwrap(),
            attempt_number: a.attempt_number,
            weight: a.weight,
            status: AttemptStatus::from_str(&a.status).unwrap(),
        })
        .collect();

    Ok(attempts)
}

#[tauri::command]
pub async fn attempt_update_result(
    state: State<'_, AppState>,
    update: AttemptUpdateResult,
) -> Result<(), AppError> {
    tracing::info!("attempt_update_result called with: {:?}", update);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or_else(|| AppError::database("Database not initialized"))?;
    queries::attempts::update_attempt_result(
        db_pool,
        &update.attempt_id,
        &update.status.to_string(),
        None,
        None,
        None,
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn attempt_list_for_contest(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Vec<Attempt>, AppError> {
    tracing::info!("attempt_list_for_contest called for contest: {}", contest_id);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or_else(|| AppError::database("Database not initialized"))?;
    let db_attempts =
        queries::attempts::get_contest_attempts(db_pool, &contest_id)
            .await?;

    let attempts = db_attempts
        .into_iter()
        .map(|a| Attempt {
            id: a.id,
            registration_id: a.registration_id,
            lift_type: LiftType::from_str(&a.lift_type).unwrap(),
            attempt_number: a.attempt_number,
            weight: a.weight,
            status: AttemptStatus::from_str(&a.status).unwrap(),
        })
        .collect();

    Ok(attempts)
}

#[tauri::command]
pub async fn attempt_get_current(
    _state: State<'_, AppState>,
    _contest_id: String,
) -> Result<String, AppError> {
    // TODO: Implement current attempt retrieval
    tracing::info!("attempt_get_current called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

#[tauri::command]
pub async fn attempt_set_current(
    _state: State<'_, AppState>,
    _contest_id: String,
    _registration_id: String,
    _lift_type: String,
    _attempt_number: i32,
) -> Result<String, AppError> {
    // TODO: Implement current attempt setting
    tracing::info!("attempt_set_current called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}
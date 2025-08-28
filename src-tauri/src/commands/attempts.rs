use crate::database::queries;
use crate::error::AppError;
use crate::models::attempt::{
    Attempt, AttemptStatus, AttemptUpdateResult, AttemptUpsert, LiftType,
};
use crate::AppState;
use std::fmt;
use std::str::FromStr;
use tauri::State;

impl fmt::Display for LiftType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            LiftType::Squat => write!(f, "Squat"),
            LiftType::Bench => write!(f, "Bench"),
            LiftType::Deadlift => write!(f, "Deadlift"),
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

impl fmt::Display for AttemptStatus {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AttemptStatus::Pending => write!(f, "Pending"),
            AttemptStatus::Good => write!(f, "Good"),
            AttemptStatus::Bad => write!(f, "Bad"),
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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
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
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
    let db_attempts =
        queries::attempts::get_attempts_by_registration(db_pool, &registration_id).await?;

    let attempts = db_attempts
        .into_iter()
        .map(|a| {
            Ok(Attempt {
                id: a.id,
                registration_id: a.registration_id,
                lift_type: LiftType::from_str(&a.lift_type).map_err(|_| {
                    AppError::Internal(format!("Invalid lift type in database: {}", a.lift_type))
                })?,
                attempt_number: a.attempt_number,
                weight: a.weight,
                status: AttemptStatus::from_str(&a.status).map_err(|_| {
                    AppError::Internal(format!("Invalid attempt status in database: {}", a.status))
                })?,
            })
        })
        .collect::<Result<Vec<Attempt>, AppError>>()?;

    Ok(attempts)
}

#[tauri::command]
pub async fn attempt_update_result(
    state: State<'_, AppState>,
    update: AttemptUpdateResult,
) -> Result<(), AppError> {
    tracing::info!("attempt_update_result called with: {:?}", update);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
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
    tracing::info!(
        "attempt_list_for_contest called for contest: {}",
        contest_id
    );

    let db_pool = state.db.lock().await;
    let db_pool = db_pool
        .as_ref()
        .ok_or_else(|| AppError::DatabaseNotInitialized)?;
    let db_attempts = queries::attempts::get_contest_attempts(db_pool, &contest_id).await?;

    let attempts = db_attempts
        .into_iter()
        .map(|a| {
            Ok(Attempt {
                id: a.id,
                registration_id: a.registration_id,
                lift_type: LiftType::from_str(&a.lift_type).map_err(|_| {
                    AppError::Internal(format!("Invalid lift type in database: {}", a.lift_type))
                })?,
                attempt_number: a.attempt_number,
                weight: a.weight,
                status: AttemptStatus::from_str(&a.status).map_err(|_| {
                    AppError::Internal(format!("Invalid attempt status in database: {}", a.status))
                })?,
            })
        })
        .collect::<Result<Vec<Attempt>, AppError>>()?;

    Ok(attempts)
}

#[tauri::command]
pub async fn attempt_get_current(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Option<Attempt>, AppError> {
    tracing::info!("attempt_get_current called for contest: {}", contest_id);
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    let attempt = queries::attempts::get_current_attempt(db_pool, &contest_id).await?;

    if let Some(db_attempt) = attempt {
        Ok(Some(Attempt {
            id: db_attempt.id,
            registration_id: db_attempt.registration_id,
            lift_type: LiftType::from_str(&db_attempt.lift_type)
                .map_err(|_| AppError::Internal(format!("Invalid lift type: {}", db_attempt.lift_type)))?,
            attempt_number: db_attempt.attempt_number,
            weight: db_attempt.weight,
            status: AttemptStatus::from_str(&db_attempt.status)
                .map_err(|_| AppError::Internal(format!("Invalid status: {}", db_attempt.status)))?,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn attempt_set_current(
    state: State<'_, AppState>,
    contest_id: String,
    attempt_id: String,
) -> Result<(), AppError> {
    tracing::info!(
        "attempt_set_current called for contest: {}, attempt: {}",
        contest_id,
        attempt_id
    );
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;
    queries::attempts::set_current_attempt(db_pool, &contest_id, &attempt_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn attempt_get_next_in_queue(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Vec<Attempt>, AppError> {
    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or(AppError::DatabaseNotInitialized)?;

    // 1. Get current contest state
    let contest_state =
        queries::contest_states::get_contest_state(db_pool, &contest_id)
            .await?
        .ok_or_else(|| AppError::ContestStateNotFound {
            contest_id: contest_id.clone(),
            })?;

    if let Some(lift_type) = contest_state.current_lift {
        // 2. Get next attempts from the queue
        let db_attempts = queries::attempts::get_next_attempts_in_queue(
            db_pool,
            &contest_id,
            &lift_type.to_string(),
            contest_state.current_round,
        )
        .await?;

        // 3. Map to command model
        let attempts = db_attempts
            .into_iter()
            .map(|a| {
                Ok(Attempt {
                    id: a.id,
                    registration_id: a.registration_id,
                    lift_type: LiftType::from_str(&a.lift_type).map_err(|_| {
                        AppError::Internal(format!("Invalid lift type: {}", a.lift_type))
                    })?,
                    attempt_number: a.attempt_number,
                    weight: a.weight,
                    status: AttemptStatus::from_str(&a.status).map_err(|_| {
                        AppError::Internal(format!("Invalid status: {}", a.status))
                    })?,
                })
            })
            .collect::<Result<Vec<Attempt>, AppError>>()?;

        Ok(attempts)
    } else {
        // No current lift, so no queue
        Ok(vec![])
    }
}

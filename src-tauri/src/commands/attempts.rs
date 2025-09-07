use crate::database::queries;
use crate::error::AppError;
use crate::models::attempt::{
    Attempt, AttemptStatus, AttemptUpdateResult, AttemptUpsert, LiftType,
};
use crate::AppState;
use std::str::FromStr;
use tauri::State;

#[tauri::command]
pub async fn attempt_upsert_weight(
    state: State<'_, AppState>,
    attempt: AttemptUpsert,
) -> Result<(), AppError> {
    tracing::info!("attempt_upsert_weight called with: {:?}", attempt);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
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
    let db_pool = &*db_pool;
    let db_attempts =
        queries::attempts::get_attempts_by_registration(db_pool, &registration_id).await?;

    let attempts = db_attempts
        .into_iter()
        .map(|a| {
            let attempt_id = a.id.clone();
            Ok(Attempt {
                id: a.id,
                registration_id: a.registration_id,
                lift_type: LiftType::from_str(&a.lift_type).map_err(|_| {
                    AppError::Internal(format!("Invalid lift type '{}' in database for attempt {}. Expected 'Squat', 'Bench', or 'Deadlift'", a.lift_type, attempt_id))
                })?,
                attempt_number: a.attempt_number,
                weight: a.weight,
                status: AttemptStatus::from_str(&a.status).map_err(|_| {
                    AppError::Internal(format!("Invalid attempt status '{}' in database for attempt {}. Expected 'Pending', 'Successful', 'Failed', or 'Skipped'", a.status, attempt_id))
                })?,
                timestamp: a.timestamp,
                judge1_decision: a.judge1_decision,
                judge2_decision: a.judge2_decision,
                judge3_decision: a.judge3_decision,
                notes: a.notes,
                created_at: a.created_at.clone(),
                updated_at: a.created_at, // Default to created_at for now
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
    let db_pool = &*db_pool;
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
    let db_pool = &*db_pool;
    let db_attempts = queries::attempts::get_contest_attempts(db_pool, &contest_id).await?;

    let attempts = db_attempts
        .into_iter()
        .map(|a| {
            let attempt_id = a.id.clone();
            Ok(Attempt {
                id: a.id,
                registration_id: a.registration_id,
                lift_type: LiftType::from_str(&a.lift_type).map_err(|_| {
                    AppError::Internal(format!("Invalid lift type '{}' in database for attempt {}. Expected 'Squat', 'Bench', or 'Deadlift'", a.lift_type, attempt_id))
                })?,
                attempt_number: a.attempt_number,
                weight: a.weight,
                status: AttemptStatus::from_str(&a.status).map_err(|_| {
                    AppError::Internal(format!("Invalid attempt status '{}' in database for attempt {}. Expected 'Pending', 'Successful', 'Failed', or 'Skipped'", a.status, attempt_id))
                })?,
                timestamp: a.timestamp,
                judge1_decision: a.judge1_decision,
                judge2_decision: a.judge2_decision,
                judge3_decision: a.judge3_decision,
                notes: a.notes,
                created_at: a.created_at.clone(),
                updated_at: a.created_at, // Default to created_at for now
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
    let db_pool = &*db_pool;
    let attempt = queries::attempts::get_current_attempt(db_pool, &contest_id).await?;

    if let Some(db_attempt) = attempt {
        Ok(Some(Attempt {
            id: db_attempt.id,
            registration_id: db_attempt.registration_id,
            lift_type: LiftType::from_str(&db_attempt.lift_type).map_err(|_| {
                AppError::Internal(format!("Invalid lift type: {}", db_attempt.lift_type))
            })?,
            attempt_number: db_attempt.attempt_number,
            weight: db_attempt.weight,
            status: AttemptStatus::from_str(&db_attempt.status).map_err(|_| {
                AppError::Internal(format!("Invalid status: {}", db_attempt.status))
            })?,
            timestamp: db_attempt.timestamp,
            judge1_decision: db_attempt.judge1_decision,
            judge2_decision: db_attempt.judge2_decision,
            judge3_decision: db_attempt.judge3_decision,
            notes: db_attempt.notes,
            created_at: db_attempt.created_at.clone(),
            updated_at: db_attempt.created_at, // Default to created_at for now
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
    let db_pool = &*db_pool;

    // Check if contest is in progress before setting current attempt
    let contest_state = queries::contest_states::get_contest_state(db_pool, &contest_id)
        .await?
        .ok_or_else(|| AppError::ContestStateNotFound {
            contest_id: contest_id.clone(),
        })?;

    if contest_state.status != crate::models::contest_state::ContestStatus::InProgress {
        return Err(AppError::ContestNotInProgress);
    }

    queries::attempts::set_current_attempt(db_pool, &contest_id, &attempt_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn attempt_get_next_in_queue(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Vec<Attempt>, AppError> {
    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // 1. Get current contest state
    let contest_state = queries::contest_states::get_contest_state(db_pool, &contest_id)
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
                    status: AttemptStatus::from_str(&a.status)
                        .map_err(|_| AppError::Internal(format!("Invalid status: {}", a.status)))?,
                    timestamp: a.timestamp,
                    judge1_decision: a.judge1_decision,
                    judge2_decision: a.judge2_decision,
                    judge3_decision: a.judge3_decision,
                    notes: a.notes,
                    created_at: a.created_at.clone(),
                    updated_at: a.created_at, // Default to created_at for now
                })
            })
            .collect::<Result<Vec<Attempt>, AppError>>()?;

        Ok(attempts)
    } else {
        // No current lift, so no queue
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::attempt::{AttemptStatus, LiftType};

    #[test]
    fn test_lift_type_to_string() {
        assert_eq!(LiftType::Squat.to_string(), "Squat");
        assert_eq!(LiftType::Bench.to_string(), "Bench");
        assert_eq!(LiftType::Deadlift.to_string(), "Deadlift");
    }

    #[test]
    fn test_lift_type_from_str_valid() {
        assert_eq!(LiftType::from_str("Squat"), Ok(LiftType::Squat));
        assert_eq!(LiftType::from_str("Bench"), Ok(LiftType::Bench));
        assert_eq!(LiftType::from_str("Deadlift"), Ok(LiftType::Deadlift));
    }

    #[test]
    fn test_lift_type_from_str_invalid() {
        assert!(LiftType::from_str("invalid").is_err());
        assert!(LiftType::from_str("squat").is_err()); // Case sensitive
        assert!(LiftType::from_str("SQUAT").is_err());
        assert!(LiftType::from_str("").is_err());
    }

    #[test]
    fn test_attempt_status_to_string() {
        assert_eq!(AttemptStatus::Pending.to_string(), "Pending");
        assert_eq!(AttemptStatus::Successful.to_string(), "Successful");
        assert_eq!(AttemptStatus::Failed.to_string(), "Failed");
    }

    #[test]
    fn test_attempt_status_from_str_valid() {
        assert_eq!(
            AttemptStatus::from_str("Pending"),
            Ok(AttemptStatus::Pending)
        );
        assert_eq!(
            AttemptStatus::from_str("Successful"),
            Ok(AttemptStatus::Successful)
        );
        assert_eq!(AttemptStatus::from_str("Failed"), Ok(AttemptStatus::Failed));
    }

    #[test]
    fn test_attempt_status_from_str_invalid() {
        assert!(AttemptStatus::from_str("invalid").is_err());
        assert!(AttemptStatus::from_str("pending").is_err()); // Case sensitive
        assert!(AttemptStatus::from_str("SUCCESSFUL").is_err());
        assert!(AttemptStatus::from_str("").is_err());
    }
}

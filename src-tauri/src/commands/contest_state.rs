use crate::database::queries;
use crate::error::AppError;
use crate::models::contest_state::{ContestState, ContestStatus};
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
    
    // Get current state if it exists
    if let Some(current_state) = queries::contest_states::get_contest_state(db_pool, &contest_state.contest_id).await? {
        // Validate state transition
        validate_contest_state_transition(&current_state.status, &contest_state.status)?;
    }
    
    queries::contest_states::upsert_contest_state(db_pool, &contest_state).await?;
    Ok(())
}

fn validate_contest_state_transition(current: &ContestStatus, new: &ContestStatus) -> Result<(), AppError> {
    use ContestStatus::*;
    
    let valid_transition = match (current, new) {
        // Setup can go to Registration
        (Setup, Registration) => true,
        // Registration can go to InProgress
        (Registration, InProgress) => true,
        // InProgress can go to Paused or Complete
        (InProgress, Paused) => true,
        (InProgress, Complete) => true,
        // Paused can go back to InProgress
        (Paused, InProgress) => true,
        // Same state transitions are always allowed (idempotent updates)
        (current, new) if current == new => true,
        // All other transitions are invalid
        _ => false,
    };
    
    if !valid_transition {
        return Err(AppError::InvalidInput {
            field: "status".to_string(),
            reason: format!("Cannot transition from {:?} to {:?}", current, new),
        });
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::contest_state::ContestStatus;

    #[test]
    fn test_valid_contest_state_transitions() {
        // Valid forward transitions
        assert!(validate_contest_state_transition(&ContestStatus::Setup, &ContestStatus::Registration).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::Registration, &ContestStatus::InProgress).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::InProgress, &ContestStatus::Paused).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::InProgress, &ContestStatus::Complete).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::Paused, &ContestStatus::InProgress).is_ok());
        
        // Same state transitions (idempotent)
        assert!(validate_contest_state_transition(&ContestStatus::Setup, &ContestStatus::Setup).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::Registration, &ContestStatus::Registration).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::InProgress, &ContestStatus::InProgress).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::Paused, &ContestStatus::Paused).is_ok());
        assert!(validate_contest_state_transition(&ContestStatus::Complete, &ContestStatus::Complete).is_ok());
    }

    #[test]
    fn test_invalid_contest_state_transitions() {
        // Invalid backward transitions
        assert!(validate_contest_state_transition(&ContestStatus::Registration, &ContestStatus::Setup).is_err());
        assert!(validate_contest_state_transition(&ContestStatus::InProgress, &ContestStatus::Registration).is_err());
        assert!(validate_contest_state_transition(&ContestStatus::Complete, &ContestStatus::InProgress).is_err());
        assert!(validate_contest_state_transition(&ContestStatus::Complete, &ContestStatus::Setup).is_err());
        
        // Invalid skip transitions  
        assert!(validate_contest_state_transition(&ContestStatus::Setup, &ContestStatus::InProgress).is_err());
        assert!(validate_contest_state_transition(&ContestStatus::Setup, &ContestStatus::Complete).is_err());
        assert!(validate_contest_state_transition(&ContestStatus::Registration, &ContestStatus::Paused).is_err());
        assert!(validate_contest_state_transition(&ContestStatus::Registration, &ContestStatus::Complete).is_err());
    }

    #[test]
    fn test_contest_state_transition_error_messages() {
        let result = validate_contest_state_transition(&ContestStatus::Complete, &ContestStatus::Setup);
        assert!(result.is_err());
        
        match result.unwrap_err() {
            AppError::InvalidInput { field, reason } => {
                assert_eq!(field, "status");
                assert!(reason.contains("Cannot transition from Complete to Setup"));
            },
            _ => panic!("Expected InvalidInput error"),
        }
    }
}

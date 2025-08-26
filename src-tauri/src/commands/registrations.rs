use crate::database::queries;
use crate::error::AppError;
use crate::models::registration::{Registration, RegistrationCreate};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn registration_create(
    state: State<'_, AppState>,
    registration: RegistrationCreate,
) -> Result<Registration, AppError> {
    tracing::info!("registration_create called with: {:?}", registration);

    let request = queries::registrations::CreateRegistrationRequest {
        contest_id: registration.contest_id,
        competitor_id: registration.competitor_id,
        bodyweight: registration.bodyweight,
        age_category_id: "default-age-category".to_string(),
        weight_class_id: "default-weight-class".to_string(),
        equipment_m: false,
        equipment_sm: false,
        equipment_t: false,
        lot_number: None,
        personal_record_at_entry: None,
        reshel_coefficient: None,
        mccullough_coefficient: None,
        rack_height_squat: None,
        rack_height_bench: None,
    };

    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or_else(|| AppError::database("Database not initialized"))?;
    let created =
        queries::registrations::create_registration(db_pool, request)
            .await?;

    Ok(Registration {
        id: created.id,
        contest_id: created.contest_id,
        competitor_id: created.competitor_id,
        bodyweight: created.bodyweight,
    })
}

#[tauri::command]
pub async fn registration_list(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Vec<Registration>, AppError> {
    tracing::info!("registration_list called for contest: {}", contest_id);

    let db_pool = state.db.lock().await;
    let db_pool = db_pool.as_ref().ok_or_else(|| AppError::database("Database not initialized"))?;
    let db_registrations =
        queries::registrations::get_registrations_by_contest(
            db_pool,
            &contest_id,
        )
        .await?;

    let registrations = db_registrations
        .into_iter()
        .map(|r| Registration {
            id: r.id,
            contest_id: r.contest_id,
            competitor_id: r.competitor_id,
            bodyweight: r.bodyweight,
        })
        .collect();

    Ok(registrations)
}

#[tauri::command]
pub async fn registration_get(
    _state: State<'_, AppState>,
    _registration_id: String,
) -> Result<String, AppError> {
    // TODO: Implement registration retrieval
    tracing::info!("registration_get called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

#[tauri::command]
pub async fn registration_update(
    _state: State<'_, AppState>,
    _registration_id: String,
) -> Result<String, AppError> {
    // TODO: Implement registration update
    tracing::info!("registration_update called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}

#[tauri::command]
pub async fn registration_delete(
    _state: State<'_, AppState>,
    _registration_id: String,
) -> Result<String, AppError> {
    // TODO: Implement registration deletion
    tracing::info!("registration_delete called");
    Err(AppError::Internal("Not yet implemented".to_string()))
}
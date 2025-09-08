use crate::coefficients;
use crate::database::queries;
use crate::error::AppError;
use crate::models::registration::{Registration, RegistrationCreate};
use crate::AppState;
use tauri::State;

const DEFAULT_AGE_CATEGORY: &str = "SENIOR";
const DEFAULT_WEIGHT_CLASS: &str = "M_75";

#[tauri::command]
pub async fn registration_create(
    state: State<'_, AppState>,
    registration: RegistrationCreate,
) -> Result<Registration, AppError> {
    tracing::info!("registration_create called with: {:?}", registration);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    // Get competitor data to calculate coefficients
    let competitor =
        queries::competitors::get_competitor_by_id(db_pool, &registration.competitor_id).await?;

    // Get contest data for contest date
    let contest = queries::contests::get_contest_by_id(db_pool, &registration.contest_id)
        .await?
        .ok_or_else(|| AppError::DatabaseError("Contest not found".to_string()))?;

    // Calculate coefficients
    let reshel_coefficient =
        coefficients::calculate_reshel_coefficient(registration.bodyweight, &competitor.gender);
    let mccullough_coefficient = coefficients::calculate_mccullough_coefficient(
        &competitor.birth_date,
        contest.date.to_string().as_str(),
    );

    // Auto-determine categories if not provided
    let age_category_id = registration.age_category_id.unwrap_or_else(|| {
        coefficients::determine_age_category(
            &competitor.birth_date,
            contest.date.to_string().as_str(),
        )
    });
    let weight_class_id = registration.weight_class_id.unwrap_or_else(|| {
        coefficients::determine_weight_class(registration.bodyweight, &competitor.gender)
    });

    let request = queries::registrations::CreateRegistrationRequest {
        contest_id: registration.contest_id,
        competitor_id: registration.competitor_id,
        bodyweight: registration.bodyweight,
        age_category_id,
        weight_class_id,
        equipment_m: registration.equipment_m.unwrap_or(false),
        equipment_sm: registration.equipment_sm.unwrap_or(false),
        equipment_t: registration.equipment_t.unwrap_or(false),
        lot_number: registration.lot_number,
        personal_record_at_entry: registration.personal_record_at_entry,
        reshel_coefficient: Some(reshel_coefficient),
        mccullough_coefficient: Some(mccullough_coefficient),
        rack_height_squat: registration.rack_height_squat,
        rack_height_bench: registration.rack_height_bench,
    };

    let created = queries::registrations::create_registration(db_pool, request).await?;

    Ok(Registration {
        id: created.id,
        contest_id: created.contest_id,
        competitor_id: created.competitor_id,
        age_category_id: created.age_category_id,
        weight_class_id: created.weight_class_id,
        equipment_m: created.equipment_m,
        equipment_sm: created.equipment_sm,
        equipment_t: created.equipment_t,
        bodyweight: created.bodyweight,
        lot_number: created.lot_number,
        personal_record_at_entry: created.personal_record_at_entry,
        reshel_coefficient: created.reshel_coefficient,
        mccullough_coefficient: created.mccullough_coefficient,
        rack_height_squat: created.rack_height_squat,
        rack_height_bench: created.rack_height_bench,
        created_at: created.created_at,
    })
}

#[tauri::command]
pub async fn registration_list(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Vec<Registration>, AppError> {
    tracing::info!("registration_list called for contest: {}", contest_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    let db_registrations =
        queries::registrations::get_registrations_by_contest(db_pool, &contest_id).await?;

    let registrations = db_registrations
        .into_iter()
        .map(|r| Registration {
            id: r.id,
            contest_id: r.contest_id,
            competitor_id: r.competitor_id,
            age_category_id: r.age_category_id,
            weight_class_id: r.weight_class_id,
            equipment_m: r.equipment_m,
            equipment_sm: r.equipment_sm,
            equipment_t: r.equipment_t,
            bodyweight: r.bodyweight,
            lot_number: r.lot_number,
            personal_record_at_entry: r.personal_record_at_entry,
            reshel_coefficient: r.reshel_coefficient,
            mccullough_coefficient: r.mccullough_coefficient,
            rack_height_squat: r.rack_height_squat,
            rack_height_bench: r.rack_height_bench,
            created_at: r.created_at,
        })
        .collect();

    Ok(registrations)
}

#[tauri::command]
pub async fn registration_get(
    state: State<'_, AppState>,
    registration_id: String,
) -> Result<Registration, AppError> {
    tracing::info!("registration_get called for id: {}", registration_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    let registration =
        queries::registrations::get_registration_by_id(db_pool, &registration_id).await?;

    Ok(Registration {
        id: registration.id,
        contest_id: registration.contest_id,
        competitor_id: registration.competitor_id,
        age_category_id: registration.age_category_id,
        weight_class_id: registration.weight_class_id,
        equipment_m: registration.equipment_m,
        equipment_sm: registration.equipment_sm,
        equipment_t: registration.equipment_t,
        bodyweight: registration.bodyweight,
        lot_number: registration.lot_number,
        personal_record_at_entry: registration.personal_record_at_entry,
        reshel_coefficient: registration.reshel_coefficient,
        mccullough_coefficient: registration.mccullough_coefficient,
        rack_height_squat: registration.rack_height_squat,
        rack_height_bench: registration.rack_height_bench,
        created_at: registration.created_at,
    })
}

#[tauri::command]
pub async fn registration_update(
    state: State<'_, AppState>,
    registration_id: String,
    registration: RegistrationCreate,
) -> Result<(), AppError> {
    tracing::info!("registration_update called for id: {}", registration_id);

    let request = queries::registrations::CreateRegistrationRequest {
        contest_id: registration.contest_id,
        competitor_id: registration.competitor_id,
        bodyweight: registration.bodyweight,
        age_category_id: registration
            .age_category_id
            .unwrap_or_else(|| DEFAULT_AGE_CATEGORY.to_string()),
        weight_class_id: registration
            .weight_class_id
            .unwrap_or_else(|| DEFAULT_WEIGHT_CLASS.to_string()),
        equipment_m: registration.equipment_m.unwrap_or(false),
        equipment_sm: registration.equipment_sm.unwrap_or(false),
        equipment_t: registration.equipment_t.unwrap_or(false),
        lot_number: registration.lot_number,
        personal_record_at_entry: registration.personal_record_at_entry,
        reshel_coefficient: None,     // Will be calculated
        mccullough_coefficient: None, // Will be calculated
        rack_height_squat: registration.rack_height_squat,
        rack_height_bench: registration.rack_height_bench,
    };

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    queries::registrations::update_registration(db_pool, &registration_id, request).await?;

    Ok(())
}

#[tauri::command]
pub async fn registration_get_by_competitor_and_contest(
    state: State<'_, AppState>,
    competitor_id: String,
    contest_id: String,
) -> Result<Option<Registration>, AppError> {
    tracing::info!(
        "registration_get_by_competitor_and_contest called for competitor: {}, contest: {}",
        competitor_id, contest_id
    );

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    let registration = queries::registrations::get_registration_by_competitor_and_contest(
        db_pool, &competitor_id, &contest_id
    ).await?;

    if let Some(reg) = &registration {
        Ok(Some(Registration {
            id: reg.id.clone(),
            contest_id: reg.contest_id.clone(),
            competitor_id: reg.competitor_id.clone(),
            age_category_id: reg.age_category_id.clone(),
            weight_class_id: reg.weight_class_id.clone(),
            equipment_m: reg.equipment_m,
            equipment_sm: reg.equipment_sm,
            equipment_t: reg.equipment_t,
            bodyweight: reg.bodyweight,
            lot_number: reg.lot_number.clone(),
            personal_record_at_entry: reg.personal_record_at_entry,
            reshel_coefficient: reg.reshel_coefficient,
            mccullough_coefficient: reg.mccullough_coefficient,
            rack_height_squat: reg.rack_height_squat,
            rack_height_bench: reg.rack_height_bench,
            created_at: reg.created_at.clone(),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn registration_delete(
    state: State<'_, AppState>,
    registration_id: String,
) -> Result<(), AppError> {
    tracing::info!("registration_delete called for id: {}", registration_id);

    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;
    queries::registrations::delete_registration(db_pool, &registration_id).await?;

    Ok(())
}

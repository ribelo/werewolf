use crate::database::queries;
use crate::error::AppError;
use crate::models::plate_set::{CreatePlateSet, PlateCalculation, PlateSet};
use crate::AppState;
use tauri::State;

// Macro to eliminate database lock boilerplate
macro_rules! with_db {
    ($state:expr, |$pool:ident| $body:expr) => {{
        let db_guard = $state.db.lock().await;
        let $pool = &*db_guard;
        $body
    }};
}

#[tauri::command]
pub async fn plate_set_create(
    state: State<'_, AppState>,
    plate_set: CreatePlateSet,
) -> Result<PlateSet, AppError> {
    tracing::info!("plate_set_create called with: {:?}", plate_set);
    with_db!(state, |pool| queries::plate_sets::create_plate_set(
        pool, plate_set
    )
    .await)
}

#[tauri::command]
pub async fn plate_set_update_quantity(
    state: State<'_, AppState>,
    id: String,
    quantity: i32,
) -> Result<(), AppError> {
    tracing::info!(
        "plate_set_update_quantity called for id: {}, quantity: {}",
        id,
        quantity
    );
    with_db!(state, |pool| {
        queries::plate_sets::update_plate_set_quantity(pool, &id, quantity).await
    })
}

#[tauri::command]
pub async fn plate_set_list(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<Vec<PlateSet>, AppError> {
    tracing::info!("plate_set_list called for contest: {}", contest_id);
    with_db!(state, |pool| {
        queries::plate_sets::get_plate_sets_by_contest(pool, &contest_id).await
    })
}

#[tauri::command]
pub async fn plate_set_delete(state: State<'_, AppState>, id: String) -> Result<(), AppError> {
    tracing::info!("plate_set_delete called for id: {}", id);
    with_db!(state, |pool| queries::plate_sets::delete_plate_set(
        pool, &id
    )
    .await)
}

#[tauri::command]
pub async fn calculate_plates(
    state: State<'_, AppState>,
    contest_id: String,
    target_weight: f64,
    gender: Option<String>,
) -> Result<PlateCalculation, AppError> {
    tracing::info!(
        "calculate_plates called for contest: {}, weight: {}, gender: {:?}",
        contest_id,
        target_weight,
        gender
    );
    with_db!(state, |pool| {
        queries::plate_sets::calculate_plates_and_increment_with_gender(
            pool,
            &contest_id,
            target_weight,
            gender.as_deref(),
        )
        .await
    })
}

#[tauri::command]
pub async fn get_contest_bar_weights(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<(f64, f64), AppError> {
    tracing::info!("get_contest_bar_weights called for contest: {}", contest_id);
    with_db!(state, |pool| {
        queries::plate_sets::get_contest_bar_weights(pool, &contest_id).await
    })
}

#[tauri::command]
pub async fn update_contest_bar_weights(
    state: State<'_, AppState>,
    contest_id: String,
    mens_bar_weight: f64,
    womens_bar_weight: f64,
) -> Result<(), AppError> {
    tracing::info!(
        "update_contest_bar_weights called for contest: {}, men: {}kg, women: {}kg",
        contest_id,
        mens_bar_weight,
        womens_bar_weight
    );
    with_db!(state, |pool| {
        queries::plate_sets::update_contest_bar_weights(
            pool,
            &contest_id,
            mens_bar_weight,
            womens_bar_weight,
        )
        .await
    })
}

#[tauri::command]
pub async fn get_plate_colors_for_contest(
    state: State<'_, AppState>,
    contest_id: String,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    tracing::info!(
        "get_plate_colors_for_contest called for contest: {}",
        contest_id
    );
    with_db!(state, |pool| {
        queries::plate_sets::get_plate_colors_for_contest(pool, &contest_id).await
    })
}

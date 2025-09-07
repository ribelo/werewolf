use crate::database::queries::categories;
use crate::models::category::{AgeCategory, WeightClass};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn weight_class_list(state: State<'_, AppState>) -> Result<Vec<WeightClass>, String> {
    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    categories::get_weight_classes(db_pool)
        .await
        .map_err(|e| format!("Failed to get weight classes: {}", e))
}

#[tauri::command]
pub async fn age_category_list(state: State<'_, AppState>) -> Result<Vec<AgeCategory>, String> {
    let db_pool = state.db.lock().await;
    let db_pool = &*db_pool;

    categories::get_age_categories(db_pool)
        .await
        .map_err(|e| format!("Failed to get age categories: {}", e))
}

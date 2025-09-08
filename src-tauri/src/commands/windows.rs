use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayLifterData {
    pub competitor: DisplayCompetitor,
    pub registration: DisplayRegistration,
    pub attempts: DisplayAttempts,
    pub contest: DisplayContest,
    pub current_lift: String,
    pub rack_height_squat: Option<i32>,
    pub rack_height_bench: Option<i32>,
    pub specific_lift: Option<SpecificLift>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpecificLift {
    pub lift_type: String,
    pub attempt_number: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayCompetitor {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub club: Option<String>,
    pub photo_base64: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayRegistration {
    pub bodyweight: f32,
    pub weight_class_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayAttempts {
    pub squat: Vec<DisplayAttempt>,
    pub bench: Vec<DisplayAttempt>,
    pub deadlift: Vec<DisplayAttempt>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayAttempt {
    pub number: i32,
    pub weight: Option<f32>,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayContest {
    pub name: String,
    pub weight_classes: Vec<DisplayWeightClass>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplayWeightClass {
    pub id: String,
    pub name: String,
}

/// Open the display window for external viewing
#[tauri::command]
pub async fn window_open_display(app: AppHandle) -> Result<String, AppError> {
    tracing::info!("Opening display window");

    // Check if display window already exists
    if let Some(_window) = app.get_webview_window("display") {
        return Ok("Display window already open".to_string());
    }

    // Create new display window
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "display",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Contest Display")
    .fullscreen(true)
    .decorations(false)
    .center()
    .build()?;

    tracing::info!("Display window opened successfully");
    Ok("Display window opened".to_string())
}

/// Close the display window
#[tauri::command]
pub async fn window_close_display(app: AppHandle) -> Result<String, AppError> {
    tracing::info!("Closing display window");

    if let Some(window) = app.get_webview_window("display") {
        window.close()?;
        tracing::info!("Display window closed successfully");
        Ok("Display window closed".to_string())
    } else {
        Ok("Display window was not open".to_string())
    }
}

/// Update display window with current lifter info
#[tauri::command]
pub async fn window_update_display(
    app: AppHandle,
    lifter_data: DisplayLifterData,
) -> Result<String, AppError> {
    tracing::info!(
        "Updating display window with lifter: {} {}",
        lifter_data.competitor.first_name,
        lifter_data.competitor.last_name
    );

    if let Some(window) = app.get_webview_window("display") {
        window.emit("display-update", &lifter_data)?;
        Ok("Display window updated".to_string())
    } else {
        Err(AppError::Internal("Display window is not open".to_string()))
    }
}

/// Get list of all open windows
#[tauri::command]
pub async fn window_list(app: AppHandle) -> Result<Vec<String>, AppError> {
    let windows: Vec<String> = app
        .webview_windows()
        .keys()
        .map(|label| label.to_string())
        .collect();

    tracing::info!("Active windows: {:?}", windows);
    Ok(windows)
}

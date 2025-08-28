use crate::error::AppError;
use tauri::{AppHandle, Emitter, Manager};

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
    _lifter_data: String, // TODO: Define proper display data structure
) -> Result<String, AppError> {
    tracing::info!("Updating display window data");

    if let Some(window) = app.get_webview_window("display") {
        // TODO: Emit event to display window with lifter data
        window.emit("display-update", &_lifter_data)?;
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

use crate::settings::{self, WindowState};
use std::sync::Mutex;
use tauri::{Manager, PhysicalSize, WindowEvent};

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let saved = match settings::load() {
        Ok(settings) => settings.window,
        Err(error) => {
            eprintln!("{error}");
            None
        }
    };
    if let Some(state) = &saved {
        if state.width > 0 && state.height > 0 {
            window.set_size(PhysicalSize::new(state.width, state.height))?;
            window.center()?;
        }
        if state.maximized {
            window.maximize()?;
        }
    }
    let size = window.inner_size()?;
    let normal = Mutex::new(saved.unwrap_or(WindowState {
        width: size.width,
        height: size.height,
        maximized: false,
    }));
    let tracked = window.clone();
    window.on_window_event(move |event| {
        if !matches!(
            event,
            WindowEvent::Resized(_) | WindowEvent::CloseRequested { .. }
        ) {
            return;
        }
        if tracked.is_minimized().unwrap_or(false) {
            return;
        }
        let Ok(maximized) = tracked.is_maximized() else {
            return;
        };
        let Ok(mut state) = normal.lock() else {
            return;
        };
        state.maximized = maximized;
        if !maximized {
            if let Ok(size) = tracked.inner_size() {
                if size.width > 0 && size.height > 0 {
                    state.width = size.width;
                    state.height = size.height;
                }
            }
        }
        if let Err(error) = settings::update(|settings| settings.window = Some(state.clone())) {
            eprintln!("{error}");
        }
    });
    Ok(())
}

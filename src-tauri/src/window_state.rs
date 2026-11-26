use crate::settings::{self, WindowState};
use std::sync::Mutex;
use tauri::{LogicalSize, Manager, WindowEvent};

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
        let mut target_w = (state.width as f64).max(860.0);
        let mut target_h = (state.height as f64).max(560.0);

        // Giới hạn kích thước theo màn hình hiện tại để không bao giờ bị tràn mép
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale = monitor.scale_factor();
            let mon_logical = monitor.size().to_logical::<f64>(scale);
            let max_w = (mon_logical.width * 0.95).max(860.0);
            let max_h = (mon_logical.height * 0.92).max(560.0);
            target_w = target_w.min(max_w);
            target_h = target_h.min(max_h);
        }

        let _ = window.set_size(LogicalSize::new(target_w, target_h));
        let _ = window.center();

        if state.maximized {
            let _ = window.maximize();
        }
    } else {
        // Mặc định ban đầu
        let mut target_w: f64 = 960.0;
        let mut target_h: f64 = 650.0;
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale = monitor.scale_factor();
            let mon_logical = monitor.size().to_logical::<f64>(scale);
            let max_w = (mon_logical.width * 0.95).max(860.0);
            let max_h = (mon_logical.height * 0.92).max(560.0);
            target_w = target_w.min(max_w);
            target_h = target_h.min(max_h);
        }
        let _ = window.set_size(LogicalSize::new(target_w, target_h));
        let _ = window.center();
    }

    let default_state = {
        let scale = window.scale_factor().unwrap_or(1.0);
        let log_size = window
            .inner_size()
            .map(|s| s.to_logical::<f64>(scale))
            .unwrap_or(LogicalSize::new(960.0, 650.0));
        WindowState {
            width: log_size.width.round() as u32,
            height: log_size.height.round() as u32,
            maximized: false,
        }
    };

    let normal = Mutex::new(saved.unwrap_or(default_state));
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
            if let Ok(scale) = tracked.scale_factor() {
                if let Ok(phys_size) = tracked.inner_size() {
                    let log_size = phys_size.to_logical::<f64>(scale);

                    // Kiểm tra xem có phải kích thước lúc đang maximize (hoặc gần toàn màn hình) không
                    let is_near_fullscreen =
                        tracked.current_monitor().ok().flatten().map_or(false, |m| {
                            let mon_log = m.size().to_logical::<f64>(scale);
                            log_size.width >= mon_log.width - 30.0
                                && log_size.height >= mon_log.height - 50.0
                        });

                    if !is_near_fullscreen && log_size.width >= 800.0 && log_size.height >= 500.0 {
                        state.width = log_size.width.round() as u32;
                        state.height = log_size.height.round() as u32;
                    }
                }
            }
        }

        if let Err(error) = settings::update(|settings| settings.window = Some(state.clone())) {
            eprintln!("{error}");
        }
    });

    Ok(())
}

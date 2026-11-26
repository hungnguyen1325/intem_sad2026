mod auth;
mod catalog;
mod credentials;
mod db;
mod items;
mod printing;
mod scale;
mod settings;
mod window_state;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(db::DbState::new())
        .manage(db::SessionState::new())
        .manage(scale::ScaleState::new())
        .setup(window_state::setup)
        .invoke_handler(tauri::generate_handler![
            auth::login,
            auth::logout,
            catalog::get_catalog,
            catalog::add_catalog_item,
            items::create_print_items,
            printing::inspect_printing,
            printing::print_labels,
            credentials::save_login,
            credentials::read_login,
            credentials::clear_login,
            scale::list_scale_ports,
            scale::get_scale_config,
            scale::save_scale_config,
            scale::set_scale_multiplier,
            scale::start_scale,
            scale::stop_scale,
            scale::get_scale_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use crate::settings::{self, SavedLogin};

#[tauri::command]
pub fn save_login(username: String, password: String) -> Result<(), String> {
    if username.is_empty() || password.is_empty() {
        return Err("Tài khoản và mật khẩu không được trống.".into());
    }
    settings::update(|settings| settings.login = Some(SavedLogin { username, password }))
}

#[tauri::command]
pub fn read_login() -> Result<Option<SavedLogin>, String> {
    Ok(settings::load()?.login)
}

#[tauri::command]
pub fn clear_login() -> Result<(), String> {
    settings::update(|settings| settings.login = None)
}

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

#[derive(Clone, Serialize, Deserialize)]
pub struct SavedLogin {
    pub username: String,
    pub password: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

#[derive(Default, Serialize, Deserialize)]
pub struct Settings {
    pub login: Option<SavedLogin>,
    pub window: Option<WindowState>,
}

static FILE_LOCK: Mutex<()> = Mutex::new(());

fn path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe
        .parent()
        .ok_or("Không tìm thấy thư mục ứng dụng.")?
        .join("settings.json"))
}

fn read() -> Result<Settings, String> {
    match fs::read(path()?) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| format!("File settings.json không hợp lệ: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(e) => Err(format!("Không đọc được settings.json: {e}")),
    }
}

pub fn load() -> Result<Settings, String> {
    let _guard = FILE_LOCK.lock().map_err(|e| e.to_string())?;
    read()
}

pub fn update(change: impl FnOnce(&mut Settings)) -> Result<(), String> {
    let _guard = FILE_LOCK.lock().map_err(|e| e.to_string())?;
    let mut settings = read()?;
    change(&mut settings);
    let bytes = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
    let destination = path()?;
    let temporary = destination.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|e| format!("Không ghi được settings.json: {e}"))?;
    fs::rename(&temporary, &destination)
        .map_err(|e| format!("Không cập nhật được settings.json: {e}"))
}

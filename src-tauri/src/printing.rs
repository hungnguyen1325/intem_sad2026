use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::Manager;

static PRINT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
pub struct PrintEnvironment {
    bartender: String,
    directory: String,
    templates: Vec<String>,
}

fn template_directory(app: &tauri::AppHandle, directory: &str) -> Result<PathBuf, String> {
    if !directory.trim().is_empty() {
        return PathBuf::from(directory.trim())
            .canonicalize()
            .map_err(|_| "Thư mục mẫu tem không tồn tại.".into());
    }
    let mut candidates = Vec::new();
    if let Ok(resources) = app.path().resource_dir() {
        candidates.push(resources.join("template/tem"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("template/tem"));
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for parent in cwd.ancestors() {
            candidates.push(parent.join("template/tem"));
            candidates.push(parent.join("intem_sad/sources/desktop/template/tem"));
        }
    }
    candidates
        .into_iter()
        .find(|p| p.is_dir())
        .ok_or_else(|| "Chưa tìm thấy thư mục template/tem cạnh ứng dụng.".into())
}

fn bartender_path(raw: &str) -> Option<PathBuf> {
    let valid = |p: &Path| {
        p.is_file()
            && p.file_name()
                .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("bartend.exe"))
    };
    if !raw.trim().is_empty() {
        let path = PathBuf::from(raw.trim());
        return valid(&path).then_some(path);
    }
    for root in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(root) {
            for version in [
                "BarTender Suite",
                "BarTender 2024",
                "BarTender 2022",
                "BarTender 2021",
                "BarTender 2019",
                "BarTender 2016",
                "BarTender 10.1",
                "BarTender",
            ] {
                let path = PathBuf::from(&root)
                    .join("Seagull")
                    .join(version)
                    .join("bartend.exe");
                if valid(&path) {
                    return Some(path);
                }
            }
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let path = dir.join("bartend.exe");
            if valid(&path) {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
pub fn inspect_printing(
    app: tauri::AppHandle,
    directory: String,
    bartender: String,
) -> Result<PrintEnvironment, String> {
    let directory = template_directory(&app, &directory)?;
    let mut templates: Vec<String> = std::fs::read_dir(&directory)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|f| {
            f.path().is_file()
                && f.path()
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("btw"))
        })
        .map(|f| f.file_name().to_string_lossy().into_owned())
        .collect();
    templates.sort();
    Ok(PrintEnvironment {
        directory: directory.to_string_lossy().into_owned(),
        templates,
        bartender: bartender_path(&bartender)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn print_labels(
    app: tauri::AppHandle,
    directory: String,
    bartender: String,
    template: String,
    csv: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = PRINT_LOCK
            .try_lock()
            .map_err(|_| "Một lệnh in khác đang chạy. Vui lòng chờ.".to_string())?;
        let directory = template_directory(&app, &directory)?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let template_path = directory
            .join(&template)
            .canonicalize()
            .map_err(|_| "Mẫu tem không tồn tại.".to_string())?;
        if template_path.parent() != Some(directory.as_path())
            || !template_path.is_file()
            || !template_path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("btw"))
        {
            return Err("Chỉ được in mẫu .btw trong thư mục đã chọn.".into());
        }
        let executable = bartender_path(&bartender).ok_or(
            "Không tìm thấy BarTender (bartend.exe) trên máy. Vui lòng cài đặt BarTender.",
        )?;
        if csv.len() > 5_000_000 || !csv.starts_with('\u{feff}') {
            return Err("Dữ liệu in không hợp lệ.".into());
        }
        let csv_path = directory.join("data.csv");
        std::fs::write(&csv_path, csv).map_err(|e| format!("Không ghi được data.csv: {e}"))?;
        let mut command = Command::new(executable);
        command.args([
            format!("/F={}", template_path.display()),
            format!("/D={}", csv_path.display()),
            "/P".into(),
            "/X".into(),
            "/MIN=1".into(),
        ]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let status = command
            .status()
            .map_err(|e| format!("Không khởi chạy được BarTender: {e}"))?;
        if !status.success() {
            return Err(format!(
                "BarTender báo lỗi ({status}). Kiểm tra mẫu tem và máy in."
            ));
        }
        Ok("BarTender đã nhận lệnh in. Kiểm tra tem tại máy in.".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

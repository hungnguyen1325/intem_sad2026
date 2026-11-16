use crate::db::{DbState, SessionState};
use mysql_async::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: i32,
    pub username: String,
}

#[tauri::command]
pub async fn login(
    db: tauri::State<'_, DbState>,
    session: tauri::State<'_, SessionState>,
    username: String,
    password: String,
) -> Result<AuthUser, String> {
    let username = username.trim();
    let password = password.trim();
    if username.is_empty() || password.is_empty() {
        return Err("Tài khoản và mật khẩu không được để trống.".into());
    }

    let mut conn = db.get_conn().await?;

    let query = "SELECT id, password, CAST(expired AS CHAR) FROM users WHERE username = ? LIMIT 1";
    let row: Option<(i32, String, Option<String>)> = conn
        .exec_first(query, (username,))
        .await
        .map_err(|e| format!("Lỗi truy vấn tài khoản: {e}"))?;

    let (user_id, db_password, expired) = row.ok_or_else(|| "Tài khoản hoặc mật khẩu không chính xác.".to_string())?;

    let input_hash = format!("{:x}", md5::compute(password.as_bytes()));
    if input_hash.to_lowercase() != db_password.to_lowercase() {
        return Err("Tài khoản hoặc mật khẩu không chính xác.".into());
    }

    if let Some(exp) = expired {
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        if exp < now_str {
            return Err("Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên.".into());
        }
    }

    session.set_user_id(Some(user_id))?;

    Ok(AuthUser {
        id: user_id,
        username: username.to_string(),
    })
}

#[tauri::command]
pub fn logout(session: tauri::State<'_, SessionState>) -> Result<(), String> {
    session.set_user_id(None)
}

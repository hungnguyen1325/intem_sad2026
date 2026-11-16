use crate::db::{DbState, SessionState};
use mysql_async::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductRow {
    pub id: i32,
    pub name: String,
    pub unit: String,
    #[serde(rename = "isStatus")]
    pub is_status: Option<bool>,
    #[serde(rename = "latestCode")]
    pub latest_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgeRow {
    pub id: i32,
    pub name: String,
    pub price: String,
    #[serde(rename = "isStatus")]
    pub is_status: Option<bool>,
    pub category: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SupplierRow {
    pub id: i32,
    pub name: Option<String>,
    pub address: Option<String>,
    pub standard: String,
    #[serde(rename = "isStatus")]
    pub is_status: Option<bool>,
    pub kyhieu: Option<String>,
}

#[tauri::command]
pub async fn get_catalog(
    db: tauri::State<'_, DbState>,
    session: tauri::State<'_, SessionState>,
    kind: String,
) -> Result<Value, String> {
    let user_id = session.get_user_id()?;
    let mut conn = db.get_conn().await?;

    match kind.as_str() {
        "products" => {
            let rows: Vec<(i32, String, String, Option<bool>, Option<String>)> = conn
                .exec(
                    "SELECT id, name, unit, is_status, latest_code FROM products WHERE user_id = ? ORDER BY id DESC",
                    (user_id,),
                )
                .await
                .map_err(|e| format!("Lỗi truy vấn sản phẩm: {e}"))?;

            let data: Vec<ProductRow> = rows
                .into_iter()
                .map(|(id, name, unit, is_status, latest_code)| ProductRow {
                    id,
                    name,
                    unit,
                    is_status,
                    latest_code,
                })
                .collect();

            Ok(serde_json::to_value(data).unwrap_or(Value::Null))
        }
        "ages" => {
            let rows: Vec<(i32, String, String, Option<bool>, Option<i32>)> = conn
                .exec(
                    "SELECT id, name, price, is_status, category FROM ages WHERE user_id = ? ORDER BY id DESC",
                    (user_id,),
                )
                .await
                .map_err(|e| format!("Lỗi truy vấn tuổi vàng: {e}"))?;

            let data: Vec<AgeRow> = rows
                .into_iter()
                .map(|(id, name, price, is_status, category)| AgeRow {
                    id,
                    name,
                    price,
                    is_status,
                    category,
                })
                .collect();

            Ok(serde_json::to_value(data).unwrap_or(Value::Null))
        }
        "suppliers" => {
            let rows: Vec<(i32, Option<String>, Option<String>, String, Option<bool>, Option<String>)> = conn
                .exec(
                    "SELECT id, name, address, standard, is_status, kyhieu FROM suppliers WHERE user_id = ? ORDER BY id DESC",
                    (user_id,),
                )
                .await
                .map_err(|e| format!("Lỗi truy vấn nhà cung cấp: {e}"))?;

            let data: Vec<SupplierRow> = rows
                .into_iter()
                .map(|(id, name, address, standard, is_status, kyhieu)| SupplierRow {
                    id,
                    name,
                    address,
                    standard,
                    is_status,
                    kyhieu,
                })
                .collect();

            Ok(serde_json::to_value(data).unwrap_or(Value::Null))
        }
        _ => Err(format!("Danh mục không hợp lệ: {kind}")),
    }
}

#[tauri::command]
pub async fn add_catalog_item(
    db: tauri::State<'_, DbState>,
    session: tauri::State<'_, SessionState>,
    kind: String,
    data: Value,
) -> Result<i32, String> {
    let user_id = session.get_user_id()?;
    let mut conn = db.get_conn().await?;

    match kind.as_str() {
        "products" => {
            let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
            let unit = data.get("unit").and_then(|v| v.as_str()).unwrap_or("").trim();
            let is_status = data.get("isStatus").and_then(|v| v.as_bool()).unwrap_or(true);
            let latest_code = data.get("latestCode").and_then(|v| v.as_str()).map(|s| s.trim());

            if name.is_empty() || unit.is_empty() {
                return Err("Tên sản phẩm và đơn vị tính không được để trống.".into());
            }

            conn.exec_drop(
                "INSERT INTO products (name, unit, is_status, latest_code, user_id) VALUES (?, ?, ?, ?, ?)",
                (name, unit, is_status, latest_code, user_id),
            ).await.map_err(|e| format!("Lỗi thêm sản phẩm: {e}"))?;

            let id_row: Option<(i32,)> = conn.exec_first("SELECT LAST_INSERT_ID()", ()).await
                .map_err(|e| format!("Lỗi lấy ID sản phẩm: {e}"))?;
            Ok(id_row.map(|r| r.0).unwrap_or(0))
        }
        "ages" => {
            let name = data.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
            let price = data.get("price").and_then(|v| v.as_str()).unwrap_or("").trim();
            let is_status = data.get("isStatus").and_then(|v| v.as_bool()).unwrap_or(true);
            let category = data.get("category").and_then(|v| v.as_i64()).map(|c| c as i32).unwrap_or(2);

            if name.is_empty() || price.is_empty() {
                return Err("Tên tuổi vàng và giá không được để trống.".into());
            }

            conn.exec_drop(
                "INSERT INTO ages (name, price, is_status, category, user_id) VALUES (?, ?, ?, ?, ?)",
                (name, price, is_status, category, user_id),
            ).await.map_err(|e| format!("Lỗi thêm tuổi vàng: {e}"))?;

            let id_row: Option<(i32,)> = conn.exec_first("SELECT LAST_INSERT_ID()", ()).await
                .map_err(|e| format!("Lỗi lấy ID tuổi vàng: {e}"))?;
            Ok(id_row.map(|r| r.0).unwrap_or(0))
        }
        "suppliers" => {
            let name = data.get("name").and_then(|v| v.as_str()).map(|s| s.trim());
            let address = data.get("address").and_then(|v| v.as_str()).map(|s| s.trim());
            let standard = data.get("standard").and_then(|v| v.as_str()).unwrap_or("").trim();
            let is_status = data.get("isStatus").and_then(|v| v.as_bool()).unwrap_or(true);
            let kyhieu = data.get("kyhieu").and_then(|v| v.as_str()).map(|s| s.trim());

            if standard.is_empty() {
                return Err("Tiêu chuẩn nhà cung cấp không được để trống.".into());
            }

            conn.exec_drop(
                "INSERT INTO suppliers (name, address, standard, is_status, kyhieu, user_id) VALUES (?, ?, ?, ?, ?, ?)",
                (name, address, standard, is_status, kyhieu, user_id),
            ).await.map_err(|e| format!("Lỗi thêm nhà cung cấp: {e}"))?;

            let id_row: Option<(i32,)> = conn.exec_first("SELECT LAST_INSERT_ID()", ()).await
                .map_err(|e| format!("Lỗi lấy ID nhà cung cấp: {e}"))?;
            Ok(id_row.map(|r| r.0).unwrap_or(0))
        }
        _ => Err(format!("Danh mục không hợp lệ: {kind}")),
    }
}

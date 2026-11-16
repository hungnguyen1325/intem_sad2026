use crate::db::{DbState, SessionState};
use flate2::write::GzEncoder;
use flate2::Compression;
use mysql_async::prelude::*;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::io::Write;

const MARKER: &str = "|INTEM_V1|";
const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductItemsRequest {
    pub product_id: i32,
    pub supplier_id: i32,
    pub age_id: i32,
    pub symbol: String,
    pub product_code: Option<String>,
    pub quantity: usize,
    pub total_weight: f64,
    pub gold_weight: f64,
    pub gem_weight: f64,
    pub total_gram: Option<f64>,
    pub gold_gram: Option<f64>,
    pub gem_gram: Option<f64>,
    pub wage: i64,
    pub gem_price: i64,
    pub retail_price: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductItemResponse {
    pub id: i32,
    pub product_id: i32,
    pub supplier_id: i32,
    pub age_id: i32,
    pub code: String,
    pub qr_link: String,
    pub product_name: String,
    pub supplier: String,
    pub supplier_address: String,
    pub supplier_standard: String,
    pub supplier_code: String,
    pub gold_age: String,
    pub symbol: String,
    pub total_weight: f64,
    pub gold_weight: f64,
    pub gem_weight: f64,
    pub total_gram: f64,
    pub gold_gram: f64,
    pub gem_gram: f64,
    pub wage: i64,
    pub gem_price: i64,
    pub retail_price: i64,
    pub total_wage_gem: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMetadata {
    owner_id: i32,
    item: ProductItemResponse,
    #[serde(skip_serializing_if = "Option::is_none")]
    append_id_to_code: Option<bool>,
}

fn generate_random_code() -> String {
    let mut rng = rand::thread_rng();
    loop {
        let suffix: String = (0..9)
            .map(|_| {
                let idx = rng.gen_range(0..ALPHABET.len());
                ALPHABET[idx] as char
            })
            .collect();

        let has_letter = suffix.chars().any(|c| c.is_ascii_alphabetic());
        let has_digit = suffix.chars().any(|c| c.is_ascii_digit());
        if has_letter && has_digit {
            return format!("S{}", suffix);
        }
    }
}

fn format_number(val: f64) -> String {
    let s = format!("{:.5}", val);
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s.is_empty() {
        "0".to_string()
    } else {
        s.to_string()
    }
}

fn format_money(val: i64) -> String {
    let s = val.to_string();
    let mut result = String::new();
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    for (i, &c) in chars.iter().enumerate() {
        result.push(c);
        let rem = len - 1 - i;
        if rem > 0 && rem % 3 == 0 {
            result.push('.');
        }
    }
    result
}

fn grams(weight: f64) -> f64 {
    ((weight * 3.75 * 100.0).round()) / 100.0
}

#[tauri::command]
pub async fn create_print_items(
    db: tauri::State<'_, DbState>,
    session: tauri::State<'_, SessionState>,
    request: CreateProductItemsRequest,
) -> Result<Vec<ProductItemResponse>, String> {
    let user_id = session.get_user_id()?;

    if request.quantity < 1 || request.quantity > 500 {
        return Err("Số lượng tem phải từ 1 đến 500.".into());
    }

    let mut conn = db.get_conn().await?;

    // Load PrintContext using standard positional parameters '?'
    let context_query = r#"
        SELECT p.name, s.name, s.address, s.standard, s.kyhieu, a.name, u.fullname, u.address
        FROM users u
        JOIN products p ON p.user_id = u.id AND p.id = ?
        JOIN suppliers s ON s.user_id = u.id AND s.id = ?
        JOIN ages a ON a.user_id = u.id AND a.id = ?
        WHERE u.id = ?
        LIMIT 1
    "#;

    type ContextRow = (
        String,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    );

    let row: Option<ContextRow> = conn.exec_first(
        context_query,
        (request.product_id, request.supplier_id, request.age_id, user_id),
    ).await.map_err(|e| format!("Lỗi tải thông tin sản phẩm: {e}"))?;

    let (
        prod_name,
        supp_name,
        supp_addr,
        supp_standard,
        supp_code,
        gold_age,
        shop_name,
        shop_addr,
    ) = row.ok_or_else(|| "Không tìm thấy dữ liệu danh mục tương ứng.".to_string())?;

    let supp_name = supp_name.unwrap_or_default();
    let supp_addr = supp_addr.unwrap_or_default();
    let supp_code = supp_code.unwrap_or_default();
    let shop_name = shop_name.unwrap_or_default();
    let shop_addr = shop_addr.unwrap_or_default();

    let product_code_input = request.product_code.as_deref().unwrap_or("").trim();
    let has_custom_code = !product_code_input.is_empty();
    let append_id = if has_custom_code && request.quantity > 1 {
        Some(true)
    } else {
        None
    };

    let total_gram = request.total_gram.unwrap_or_else(|| grams(request.total_weight));
    let gold_gram = request.gold_gram.unwrap_or_else(|| grams(request.gold_weight));
    let gem_gram = request.gem_gram.unwrap_or_else(|| grams(request.gem_weight));
    let total_wage_gem = request.wage + request.gem_price;

    let mut result_items: Vec<ProductItemResponse> = Vec::with_capacity(request.quantity);
    let mut latest_code = String::new();

    for _ in 0..request.quantity {
        let code = if has_custom_code {
            product_code_input.to_string()
        } else {
            generate_random_code()
        };

        let item_proto = ProductItemResponse {
            id: 0,
            product_id: request.product_id,
            supplier_id: request.supplier_id,
            age_id: request.age_id,
            code: code.clone(),
            qr_link: String::new(),
            product_name: prod_name.clone(),
            supplier: supp_name.clone(),
            supplier_address: supp_addr.clone(),
            supplier_standard: supp_standard.clone(),
            supplier_code: supp_code.clone(),
            gold_age: gold_age.clone(),
            symbol: request.symbol.clone(),
            total_weight: request.total_weight,
            gold_weight: request.gold_weight,
            gem_weight: request.gem_weight,
            total_gram,
            gold_gram,
            gem_gram,
            wage: request.wage,
            gem_price: request.gem_price,
            retail_price: request.retail_price,
            total_wage_gem,
        };

        let stored = StoredMetadata {
            owner_id: user_id,
            item: item_proto.clone(),
            append_id_to_code: append_id,
        };

        let json_bytes = serde_json::to_vec(&stored)
            .map_err(|e| format!("Lỗi mã hóa dữ liệu: {e}"))?;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&json_bytes).map_err(|e| format!("Lỗi nén dữ liệu: {e}"))?;
        let compressed = encoder.finish().map_err(|e| format!("Lỗi hoàn tất nén: {e}"))?;

        use base64::Engine;
        let metadata_b64 = base64::engine::general_purpose::STANDARD.encode(&compressed);

        let legacy = format!(
            "{}|{}|{}  chỉ|{}  chỉ|{}  chỉ|{}|{}|{}|{}|{}|{}",
            prod_name,
            gold_age,
            format_number(request.total_weight),
            format_number(request.gem_weight),
            format_number(request.gold_weight),
            request.symbol,
            supp_name,
            supp_addr,
            supp_standard,
            shop_name,
            shop_addr
        );

        let raw_payload = format!(
            "{}{}{}:{}|{}",
            legacy, MARKER, user_id, code, metadata_b64
        );

        let content = base64::engine::general_purpose::STANDARD.encode(raw_payload.as_bytes());

        conn.exec_drop(
            "INSERT INTO details_product (content, is_status, updated_at) VALUES (?, true, CURRENT_TIMESTAMP)",
            (&content,),
        ).await.map_err(|e| format!("Lỗi lưu chi tiết sản phẩm: {e}"))?;

        let id_row: Option<(i32,)> = conn.exec_first("SELECT LAST_INSERT_ID()", ()).await
            .map_err(|e| format!("Lỗi lấy ID bản ghi: {e}"))?;
        let row_id = id_row.map(|r| r.0).unwrap_or(0);

        let final_code = if append_id == Some(true) {
            format!("{}-{}", code, row_id)
        } else {
            code
        };

        latest_code = final_code.clone();

        let qr_values = format!(
            "|{}|{}|{}|{}|{}|{}|{}||{}|",
            format_number(request.gold_weight),
            format_money(request.wage),
            request.product_id,
            request.age_id,
            format_money(request.retail_price),
            format_number(request.gem_weight),
            format_money(request.gem_price),
            request.supplier_id
        );

        let qr_link = format!("https://inv.sad.vn/p?q={}&v={}{}", row_id, qr_values, final_code);

        let mut final_item = item_proto;
        final_item.id = row_id;
        final_item.code = final_code;
        final_item.qr_link = qr_link;

        result_items.push(final_item);
    }

    if !latest_code.is_empty() {
        let _ = conn.exec_drop(
            "UPDATE products SET latest_code = ? WHERE id = ? AND user_id = ?",
            (latest_code, request.product_id, user_id),
        ).await;
    }

    Ok(result_items)
}

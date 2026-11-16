use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("embedded_db.rs");

    // Tìm file db_config.json tại thư mục gốc dự án hoặc thư mục hiện tại
    let mut config_bytes = Vec::new();
    let candidates = [
        Path::new("../db_config.json"),
        Path::new("db_config.json"),
        Path::new("../../db_config.json"),
    ];

    for path in &candidates {
        if path.exists() {
            if let Ok(bytes) = fs::read(path) {
                config_bytes = bytes;
                break;
            }
        }
    }

    // Mã hóa XOR đơn giản (key 0x7E) để che chuỗi nhạy cảm trong binary
    let xor_key: u8 = 0x7E;
    let obfuscated: Vec<u8> = config_bytes.iter().map(|b| b ^ xor_key).collect();

    let code = format!(
        "pub const EMBEDDED_CONFIG: &[u8] = &{:?};\npub const XOR_KEY: u8 = 0x{:02X};\n",
        obfuscated, xor_key
    );

    fs::write(dest_path, code).unwrap();

    tauri_build::build();
}

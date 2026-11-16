use mysql_async::{OptsBuilder, Pool, PoolConstraints, PoolOpts};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

include!(concat!(env!("OUT_DIR"), "/embedded_db.rs"));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConfig {
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub user: String,
    pub pass: String,
    pub database: String,
    #[serde(default = "default_min_conns")]
    pub min_connections: usize,
    #[serde(default = "default_max_conns")]
    pub max_connections: usize,
}

fn default_port() -> u16 {
    3306
}

fn default_min_conns() -> usize {
    2
}

fn default_max_conns() -> usize {
    10
}

fn find_config_file() -> Option<PathBuf> {
    // 1. Chỉ định qua biến môi trường
    if let Ok(path_str) = std::env::var("DB_CONFIG_PATH") {
        let p = PathBuf::from(path_str);
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Cùng thư mục với file thực thi .exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("db_config.json");
            if p.exists() {
                return Some(p);
            }
        }
    }

    // 3. Thư mục làm việc hiện tại hoặc thư mục con src-tauri
    if let Ok(cwd) = std::env::current_dir() {
        let p = cwd.join("db_config.json");
        if p.exists() {
            return Some(p);
        }
        let p_sub = cwd.join("src-tauri").join("db_config.json");
        if p_sub.exists() {
            return Some(p_sub);
        }
    }

    // 4. Thư mục AppData trên Windows
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = PathBuf::from(appdata).join("intem").join("db_config.json");
        if p.exists() {
            return Some(p);
        }
    }

    None
}

fn load_config() -> Result<DbConfig, String> {
    // 1. Ưu tiên đọc file config ngoài nếu người dùng tự cấu hình
    if let Some(path) = find_config_file() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str::<DbConfig>(&content) {
                return Ok(config);
            }
        }
    }

    // 2. Kiểm tra biến môi trường hệ thống
    if let (Ok(host), Ok(user), Ok(pass), Ok(database)) = (
        std::env::var("DB_HOST"),
        std::env::var("DB_USER"),
        std::env::var("DB_PASS"),
        std::env::var("DB_NAME"),
    ) {
        let port = std::env::var("DB_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(3306);
        return Ok(DbConfig {
            host,
            port,
            user,
            pass,
            database,
            min_connections: 2,
            max_connections: 10,
        });
    }

    // 3. Sử dụng cấu hình mặc định được nhúng an toàn trong binary lúc build
    if !EMBEDDED_CONFIG.is_empty() {
        let decrypted: Vec<u8> = EMBEDDED_CONFIG.iter().map(|b| b ^ XOR_KEY).collect();
        if let Ok(config) = serde_json::from_slice::<DbConfig>(&decrypted) {
            return Ok(config);
        }
    }

    Err("Chưa cấu hình cơ sở dữ liệu. Vui lòng tạo file db_config.json dựa trên db_config.example.json.".to_string())
}

pub struct DbState {
    pub pool: Option<Pool>,
    pub error: Option<String>,
}

impl DbState {
    pub fn new() -> Self {
        match load_config() {
            Ok(cfg) => {
                let pool_opts = PoolOpts::default().with_constraints(
                    PoolConstraints::new(cfg.min_connections, cfg.max_connections)
                        .unwrap_or_else(|| PoolConstraints::new(2, 10).unwrap()),
                );

                let opts = OptsBuilder::default()
                    .ip_or_hostname(cfg.host)
                    .tcp_port(cfg.port)
                    .user(Some(cfg.user))
                    .pass(Some(cfg.pass))
                    .db_name(Some(cfg.database))
                    .pool_opts(pool_opts);

                Self {
                    pool: Some(Pool::new(opts)),
                    error: None,
                }
            }
            Err(e) => Self {
                pool: None,
                error: Some(e),
            },
        }
    }

    pub async fn get_conn(&self) -> Result<mysql_async::Conn, String> {
        match &self.pool {
            Some(pool) => pool
                .get_conn()
                .await
                .map_err(|e| format!("Không thể kết nối cơ sở dữ liệu: {e}")),
            None => Err(self
                .error
                .clone()
                .unwrap_or_else(|| "Chưa cấu hình cơ sở dữ liệu.".to_string())),
        }
    }
}

#[derive(Default)]
pub struct SessionState {
    pub user_id: Mutex<Option<i32>>,
}

impl SessionState {
    pub fn new() -> Self {
        Self {
            user_id: Mutex::new(None),
        }
    }

    pub fn get_user_id(&self) -> Result<i32, String> {
        self.user_id
            .lock()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Chưa đăng nhập.".to_string())
    }

    pub fn set_user_id(&self, id: Option<i32>) -> Result<(), String> {
        let mut lock = self.user_id.lock().map_err(|e| e.to_string())?;
        *lock = id;
        Ok(())
    }
}

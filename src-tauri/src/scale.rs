use crate::settings::{self, ScaleConfig};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{
    Arc, Mutex,
    mpsc::{self, RecvTimeoutError, Sender},
};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::Emitter;

const MAX_SCALE_WEIGHT: f64 = 500.0;
const SCALE_SAMPLE_WINDOW: usize = 7;
const SCALE_STABLE_SAMPLES: usize = 5;
const SCALE_INITIAL_CONFIRM_SAMPLES: usize = 2;
const SCALE_CHANGE_CONFIRM_SAMPLES: usize = 5;
const SCALE_PROTOCOL_TOLERANCE: f64 = 0.01;
const SCALE_NATURAL_TOLERANCE: f64 = 0.002;
const POLL_INTERVAL_MS: u64 = 100;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleReadingEvent {
    pub mode: String,
    pub raw_chunk: String,
    pub raw_weight: f64,
    pub weight: f64,
    pub committed_weight: Option<f64>,
    pub protocol_stable: bool,
    pub status: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleStatusEvent {
    pub connected: bool,
    pub mode: String,
    pub port_name: String,
    pub baud_rate: u32,
    pub using_driver_settings: bool,
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleStartResult {
    pub port_name: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub parity: String,
    pub stop_bits: String,
    pub using_driver_settings: bool,
    pub mode: String,
}

enum WorkerCommand {
    Stop,
    SetMultiplier(f64),
}

struct ActiveScaleWorker {
    tx: Sender<WorkerCommand>,
    handle: JoinHandle<()>,
    status: Arc<Mutex<ScaleStatusEvent>>,
}

pub struct ScaleState {
    worker: Mutex<Option<ActiveScaleWorker>>,
}

impl ScaleState {
    pub fn new() -> Self {
        Self {
            worker: Mutex::new(None),
        }
    }

    fn stop_inner(&self) -> Option<ScaleStatusEvent> {
        let active = self.worker.lock().ok()?.take()?;
        let _ = active.tx.send(WorkerCommand::Stop);
        let _ = active.handle.join();
        active.status.lock().ok().map(|s| s.clone())
    }
}

impl Drop for ScaleState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.worker.lock() {
            if let Some(active) = guard.take() {
                let _ = active.tx.send(WorkerCommand::Stop);
                let _ = active.handle.join();
            }
        }
    }
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn normalize_parity(parity: &str) -> String {
    match parity.trim().to_ascii_uppercase().as_str() {
        "EVEN" => "Even".to_string(),
        "ODD" => "Odd".to_string(),
        "MARK" => "Mark".to_string(),
        "SPACE" => "Space".to_string(),
        _ => "None".to_string(),
    }
}

fn normalize_data_bits(data_bits: u8) -> u8 {
    if (5..=8).contains(&data_bits) {
        data_bits
    } else {
        8
    }
}

fn normalize_stop_bits(data_bits: u8, stop_bits: &str) -> String {
    let normalized = match stop_bits.trim().to_ascii_uppercase().as_str() {
        "TWO" | "2" => "Two",
        "ONEPOINTFIVE" | "1.5" => "OnePointFive",
        _ => "One",
    };

    // Windows không chấp nhận 5 data bits + 2 stop bits, hoặc 6/7/8 data bits + 1.5 stop bits.
    if data_bits == 5 && normalized == "Two" {
        return "One".to_string();
    }
    if data_bits != 5 && normalized == "OnePointFive" {
        return "One".to_string();
    }
    normalized.to_string()
}

pub fn normalize_config(mut config: ScaleConfig) -> ScaleConfig {
    config.port_name = config.port_name.trim().to_string();
    if config.baud_rate == 0 {
        config.baud_rate = 4800;
    }
    config.data_bits = normalize_data_bits(config.data_bits);
    config.parity = normalize_parity(&config.parity);
    config.stop_bits = normalize_stop_bits(config.data_bits, &config.stop_bits);
    if !config.multiplier.is_finite() || config.multiplier <= 0.0 {
        config.multiplier = 1.0;
    }
    config
}

/// Loại bỏ ký tự rác, dấu '?', ký tự điều khiển và non-ASCII (tương đương [\?\x00-\x1F\x7F-\xFF]).
fn clean_scale_buffer(buffer: &str) -> String {
    buffer
        .chars()
        .filter(|&c| {
            let code = c as u32;
            (0x20..=0x7E).contains(&code) && c != '?'
        })
        .collect()
}

/// Trích xuất số cuối cùng khớp regex [-+]?\s*(\d+(?:[.,]\d+)?) cùng đoạn ngữ cảnh trước/sau.
fn extract_last_scale_number(clean: &str) -> Option<(f64, String, String)> {
    let bytes = clean.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    let mut last_match: Option<(f64, usize, usize)> = None;

    while i < len {
        let match_start = i;
        let mut cursor = i;
        if bytes[cursor] == b'+' || bytes[cursor] == b'-' {
            cursor += 1;
            while cursor < len && bytes[cursor].is_ascii_whitespace() {
                cursor += 1;
            }
        }

        if cursor < len && bytes[cursor].is_ascii_digit() {
            let num_start = cursor;
            while cursor < len && bytes[cursor].is_ascii_digit() {
                cursor += 1;
            }
            if cursor + 1 < len
                && (bytes[cursor] == b'.' || bytes[cursor] == b',')
                && bytes[cursor + 1].is_ascii_digit()
            {
                cursor += 1;
                while cursor < len && bytes[cursor].is_ascii_digit() {
                    cursor += 1;
                }
            }

            let num_slice = &clean[num_start..cursor];
            let normalized = num_slice.replace(',', ".");
            if let Ok(parsed) = normalized.parse::<f64>() {
                last_match = Some((parsed, match_start, cursor));
            }
            i = cursor;
        } else {
            i += 1;
        }
    }

    last_match.map(|(value, start_idx, end_idx)| {
        let head_start = start_idx.saturating_sub(12);
        let head_trimmed = clean[head_start..start_idx].trim().to_string();
        let tail = clean[end_idx..].trim();
        let tail_trimmed: String = tail.chars().take(10).collect();
        (value, head_trimmed, tail_trimmed)
    })
}

fn is_protocol_stable(head_text: &str, tail_text: &str) -> bool {
    let has_s = tail_text.contains('S')
        && !tail_text.contains("US")
        && !tail_text.contains('U')
        && !tail_text.contains('D');
    has_s
        || tail_text.contains("ST,")
        || tail_text.contains("ST ")
        || head_text.contains("ST,")
        || head_text.contains("ST ")
}

struct ScaleStabilityFilter {
    samples: VecDeque<f64>,
    pending_weight: Option<f64>,
    pending_count: usize,
    committed_weight: Option<f64>,
}

impl ScaleStabilityFilter {
    fn new() -> Self {
        Self {
            samples: VecDeque::with_capacity(SCALE_SAMPLE_WINDOW),
            pending_weight: None,
            pending_count: 0,
            committed_weight: None,
        }
    }

    fn add_sample(&mut self, value: f64) {
        let clean = round4(value.max(0.0));
        if self.samples.len() >= SCALE_SAMPLE_WINDOW {
            self.samples.pop_front();
        }
        self.samples.push_back(clean);
    }

    fn try_get_filtered_stable(&self, protocol_stable: bool) -> Option<f64> {
        if self.samples.len() < SCALE_STABLE_SAMPLES {
            return None;
        }
        let start = self.samples.len() - SCALE_STABLE_SAMPLES;
        let mut recent: Vec<f64> = self.samples.iter().skip(start).copied().collect();
        recent.sort_by(|a, b| a.total_cmp(b));

        let spread = recent[recent.len() - 1] - recent[0];
        let allowed = if protocol_stable {
            SCALE_PROTOCOL_TOLERANCE
        } else {
            SCALE_NATURAL_TOLERANCE
        };
        if spread > allowed + 1e-9 {
            return None;
        }
        Some(round4(recent[recent.len() / 2]))
    }

    fn confirm_stable(&mut self, candidate: f64) -> bool {
        let changed = match self.pending_weight {
            None => true,
            Some(prev) => (candidate - prev).abs() > SCALE_NATURAL_TOLERANCE + 1e-9,
        };
        if changed {
            self.pending_weight = Some(candidate);
            self.pending_count = 1;
            return false;
        }
        self.pending_weight = Some(candidate);
        self.pending_count += 1;
        let required = if self.committed_weight.is_none() {
            SCALE_INITIAL_CONFIRM_SAMPLES
        } else {
            SCALE_CHANGE_CONFIRM_SAMPLES
        };
        self.pending_count >= required
    }

    fn reset_pending(&mut self) {
        self.pending_weight = None;
        self.pending_count = 0;
    }

    fn commit_if_changed(&mut self, filtered: f64) -> Option<f64> {
        match self.committed_weight {
            Some(prev) if (prev - filtered).abs() <= 1e-9 => None,
            _ => {
                self.committed_weight = Some(filtered);
                Some(filtered)
            }
        }
    }
}

#[cfg(windows)]
mod win32_serial {
    use super::ScaleConfig;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Devices::Communication::{
        COMSTAT, ClearCommError, DCB, GetCommState, PURGE_RXCLEAR, PURGE_TXCLEAR, PurgeComm,
        SetCommState,
    };
    use windows_sys::Win32::Foundation::{
        CloseHandle, ERROR_INVALID_PARAMETER, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS, GENERIC_READ,
        GENERIC_WRITE, GetLastError, HANDLE, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::Storage::FileSystem::{CreateFileW, OPEN_EXISTING, ReadFile};
    use windows_sys::Win32::System::IO::DeviceIoControl;
    use windows_sys::Win32::System::Registry::{
        HKEY, HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ, RegCloseKey, RegEnumValueW, RegOpenKeyExW,
    };

    const IOCTL_SERIAL_SET_BAUD_RATE: u32 = 0x1B0004;
    const IOCTL_SERIAL_SET_LINE_CONTROL: u32 = 0x1B000C;

    struct OwnedHandle(HANDLE);

    unsafe impl Send for OwnedHandle {}

    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
    }

    pub struct SerialPort {
        handle: OwnedHandle,
        pub using_driver_settings: bool,
    }

    fn to_wide_null(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    fn format_win32_error(step: &str, code: u32) -> String {
        let msg = std::io::Error::from_raw_os_error(code as i32).to_string();
        format!("{step} (Win32 {code}): {msg}")
    }

    fn parity_byte(parity: &str) -> u8 {
        match parity {
            "Odd" => 1,
            "Even" => 2,
            "Mark" => 3,
            "Space" => 4,
            _ => 0,
        }
    }

    fn stop_bits_byte(stop_bits: &str) -> u8 {
        match stop_bits {
            "OnePointFive" => 1,
            "Two" => 2,
            _ => 0,
        }
    }

    fn try_apply_baud_and_line_ioctl(handle: HANDLE, cfg: &ScaleConfig) -> bool {
        let mut bytes_returned: u32 = 0;
        let baud_bytes = cfg.baud_rate.to_le_bytes();
        let baud_ok = unsafe {
            DeviceIoControl(
                handle,
                IOCTL_SERIAL_SET_BAUD_RATE,
                baud_bytes.as_ptr() as *const _,
                baud_bytes.len() as u32,
                std::ptr::null_mut(),
                0,
                &mut bytes_returned,
                std::ptr::null_mut(),
            )
        };
        if baud_ok == 0 {
            return false;
        }

        // SERIAL_LINE_CONTROL: StopBits, Parity, WordLength.
        let line_bytes = [
            stop_bits_byte(&cfg.stop_bits),
            parity_byte(&cfg.parity),
            cfg.data_bits,
        ];
        unsafe {
            DeviceIoControl(
                handle,
                IOCTL_SERIAL_SET_LINE_CONTROL,
                line_bytes.as_ptr() as *const _,
                line_bytes.len() as u32,
                std::ptr::null_mut(),
                0,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
        }
        true
    }

    impl SerialPort {
        pub fn open(cfg: &ScaleConfig) -> Result<Self, String> {
            if cfg.port_name.is_empty() {
                return Err("Vui lòng chọn cổng COM kết nối cân.".into());
            }

            let device_path = format!("\\\\.\\{}", cfg.port_name);
            let wide_path = to_wide_null(&device_path);
            let raw_handle = unsafe {
                CreateFileW(
                    wide_path.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    std::ptr::null(),
                    OPEN_EXISTING,
                    0,
                    std::ptr::null_mut(),
                )
            };
            if raw_handle == INVALID_HANDLE_VALUE || raw_handle.is_null() {
                let code = unsafe { GetLastError() };
                return Err(format_win32_error(
                    &format!("Không thể mở cổng {}", cfg.port_name),
                    code,
                ));
            }

            let owned = OwnedHandle(raw_handle);
            let mut state: DCB = unsafe { std::mem::zeroed() };
            state.DCBlength = std::mem::size_of::<DCB>() as u32;

            if unsafe { GetCommState(owned.0, &mut state) } == 0 {
                let code = unsafe { GetLastError() };
                return Err(format_win32_error("GetCommState", code));
            }

            let parity = parity_byte(&cfg.parity);
            state.BaudRate = cfg.baud_rate;
            state.ByteSize = cfg.data_bits;
            state.Parity = parity;
            state.StopBits = stop_bits_byte(&cfg.stop_bits);
            // Một số driver trả XonChar = XoffChar = 0, khiến SetCommState bị từ chối.
            state.XonChar = 0x11;
            state.XoffChar = 0x13;
            state.EofChar = 0x1A;
            // DCB sạch: fBinary = 1, bật fParity nếu có parity, xóa các bit/field dự trữ.
            state._bitfield = if parity != 0 { 0x3 } else { 0x1 };
            state.wReserved = 0;
            state.wReserved1 = 0;

            let mut using_driver_settings = false;
            if unsafe { SetCommState(owned.0, &state) } == 0 {
                let code = unsafe { GetLastError() };
                if code == ERROR_INVALID_PARAMETER {
                    // Driver USB-COM cũ từ chối toàn bộ DCB -> thử đặt riêng Baud/Line qua IOCTL.
                    using_driver_settings = !try_apply_baud_and_line_ioctl(owned.0, cfg);
                } else {
                    return Err(format_win32_error("SetCommState", code));
                }
            }

            // Không gọi SetupComm/SetCommTimeouts để tương thích với driver USB-COM cũ.
            unsafe {
                PurgeComm(owned.0, PURGE_RXCLEAR | PURGE_TXCLEAR);
            }

            Ok(Self {
                handle: owned,
                using_driver_settings,
            })
        }

        pub fn read_existing(&self) -> Result<String, String> {
            let mut errors: u32 = 0;
            let mut status: COMSTAT = unsafe { std::mem::zeroed() };
            if unsafe { ClearCommError(self.handle.0, &mut errors, &mut status) } == 0 {
                let code = unsafe { GetLastError() };
                return Err(format_win32_error("ClearCommError", code));
            }

            if status.cbInQue == 0 {
                return Ok(String::new());
            }

            let count = status.cbInQue.min(4096) as usize;
            let mut buffer = vec![0u8; count];
            let mut bytes_read: u32 = 0;
            if unsafe {
                ReadFile(
                    self.handle.0,
                    buffer.as_mut_ptr(),
                    count as u32,
                    &mut bytes_read,
                    std::ptr::null_mut(),
                )
            } == 0
            {
                let code = unsafe { GetLastError() };
                return Err(format_win32_error("ReadFile", code));
            }

            if bytes_read == 0 {
                return Ok(String::new());
            }

            // Giữ ASCII như Encoding.ASCII (byte >= 0x80 chuyển thành '?').
            let text: String = buffer[..bytes_read as usize]
                .iter()
                .map(|&b| if b < 0x80 { b as char } else { '?' })
                .collect();
            Ok(text)
        }
    }

    pub fn list_com_ports() -> Result<Vec<String>, String> {
        let subkey = to_wide_null("HARDWARE\\DEVICEMAP\\SERIALCOMM");
        let mut hkey: HKEY = std::ptr::null_mut();
        let open_res =
            unsafe { RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey.as_ptr(), 0, KEY_READ, &mut hkey) };
        if open_res != ERROR_SUCCESS {
            return Ok(Vec::new());
        }

        let mut ports = Vec::new();
        let mut index: u32 = 0;
        loop {
            let mut value_name = vec![0u16; 256];
            let mut value_name_len = value_name.len() as u32;
            let mut value_type: u32 = 0;
            let mut data = vec![0u8; 256];
            let mut data_len = data.len() as u32;

            let res = unsafe {
                RegEnumValueW(
                    hkey,
                    index,
                    value_name.as_mut_ptr(),
                    &mut value_name_len,
                    std::ptr::null_mut(),
                    &mut value_type,
                    data.as_mut_ptr(),
                    &mut data_len,
                )
            };

            if res == ERROR_NO_MORE_ITEMS {
                break;
            }
            index += 1;

            if res == ERROR_SUCCESS && value_type == REG_SZ && data_len >= 2 {
                let wide_len = (data_len as usize) / 2;
                let wide: Vec<u16> = data[..wide_len * 2]
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .take_while(|&u| u != 0)
                    .collect();
                let port = String::from_utf16_lossy(&wide).trim().to_string();
                if !port.is_empty() && !ports.iter().any(|p: &String| p.eq_ignore_ascii_case(&port))
                {
                    ports.push(port);
                }
            }
        }

        unsafe {
            RegCloseKey(hkey);
        }

        ports.sort_by(|a, b| {
            let num_a = a
                .strip_prefix("COM")
                .or_else(|| a.strip_prefix("com"))
                .and_then(|s| s.parse::<u32>().ok());
            let num_b = b
                .strip_prefix("COM")
                .or_else(|| b.strip_prefix("com"))
                .and_then(|s| s.parse::<u32>().ok());
            match (num_a, num_b) {
                (Some(na), Some(nb)) => na.cmp(&nb),
                _ => a.cmp(b),
            }
        });
        Ok(ports)
    }
}

#[cfg(not(windows))]
mod win32_serial {
    use super::ScaleConfig;

    pub struct SerialPort {
        pub using_driver_settings: bool,
    }

    impl SerialPort {
        pub fn open(_cfg: &ScaleConfig) -> Result<Self, String> {
            Err("Kết nối cân qua cổng COM chỉ hỗ trợ trên Windows.".into())
        }

        pub fn read_existing(&self) -> Result<String, String> {
            Ok(String::new())
        }
    }

    pub fn list_com_ports() -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
}

fn spawn_scale_worker(
    app: tauri::AppHandle,
    port: win32_serial::SerialPort,
    cfg: ScaleConfig,
    mode: String,
    using_driver_settings: bool,
) -> ActiveScaleWorker {
    let (tx, rx) = mpsc::channel::<WorkerCommand>();
    let status = Arc::new(Mutex::new(ScaleStatusEvent {
        connected: true,
        mode: mode.clone(),
        port_name: cfg.port_name.clone(),
        baud_rate: cfg.baud_rate,
        using_driver_settings,
        error: None,
    }));
    let status_for_thread = Arc::clone(&status);

    let handle = thread::spawn(move || {
        let mut multiplier = cfg.multiplier;
        let mut buffer = String::new();
        let mut stability = ScaleStabilityFilter::new();
        let mut test_last_raw: Option<f64> = None;
        let mut test_consecutive: usize = 0;

        loop {
            match rx.recv_timeout(Duration::from_millis(POLL_INTERVAL_MS)) {
                Ok(WorkerCommand::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                Ok(WorkerCommand::SetMultiplier(new_mult)) => {
                    if new_mult.is_finite() && new_mult > 0.0 {
                        multiplier = new_mult;
                    }
                    continue;
                }
                Err(RecvTimeoutError::Timeout) => {}
            }

            let incoming = match port.read_existing() {
                Ok(chunk) => chunk,
                Err(err) => {
                    if let Ok(mut st) = status_for_thread.lock() {
                        st.connected = false;
                        st.error = Some(err.clone());
                    }
                    let _ = app.emit(
                        "scale:status",
                        ScaleStatusEvent {
                            connected: false,
                            mode: mode.clone(),
                            port_name: cfg.port_name.clone(),
                            baud_rate: cfg.baud_rate,
                            using_driver_settings,
                            error: Some(err),
                        },
                    );
                    break;
                }
            };

            if incoming.is_empty() {
                continue;
            }

            buffer.push_str(&incoming);
            if buffer.len() > 1024 {
                let keep_from = buffer.len() - 512;
                let mut start = keep_from;
                while !buffer.is_char_boundary(start) && start < buffer.len() {
                    start += 1;
                }
                buffer = buffer[start..].to_string();
            }

            let clean = clean_scale_buffer(&buffer);
            let Some((raw_value, head_text, tail_text)) = extract_last_scale_number(&clean) else {
                if mode == "test" {
                    let _ = app.emit(
                        "scale:reading",
                        ScaleReadingEvent {
                            mode: mode.clone(),
                            raw_chunk: incoming,
                            raw_weight: 0.0,
                            weight: 0.0,
                            committed_weight: None,
                            protocol_stable: false,
                            status: "waiting".to_string(),
                            message: "Đang chờ dữ liệu số từ cân…".to_string(),
                        },
                    );
                }
                continue;
            };

            let weight = round4((raw_value * multiplier).max(0.0));
            let protocol_stable = is_protocol_stable(&head_text, &tail_text);

            if mode == "test" {
                let same = test_last_raw.is_some_and(|prev| (prev - raw_value).abs() <= 1e-9);
                if same {
                    test_consecutive += 1;
                } else {
                    test_last_raw = Some(raw_value);
                    test_consecutive = 1;
                }

                let stable = protocol_stable || test_consecutive >= 3;
                let _ = app.emit(
                    "scale:reading",
                    ScaleReadingEvent {
                        mode: mode.clone(),
                        raw_chunk: incoming,
                        raw_weight: raw_value,
                        weight,
                        committed_weight: None,
                        protocol_stable,
                        status: if stable {
                            "stable".to_string()
                        } else {
                            "oscillating".to_string()
                        },
                        message: if stable {
                            "Ổn định (Cân bằng)".to_string()
                        } else {
                            "Đang dao động…".to_string()
                        },
                    },
                );
                continue;
            }

            if weight > MAX_SCALE_WEIGHT {
                let _ = app.emit(
                    "scale:reading",
                    ScaleReadingEvent {
                        mode: mode.clone(),
                        raw_chunk: String::new(),
                        raw_weight: raw_value,
                        weight,
                        committed_weight: None,
                        protocol_stable,
                        status: "over_limit".to_string(),
                        message: format!("Trọng lượng vượt ngưỡng ({weight} > {MAX_SCALE_WEIGHT})"),
                    },
                );
                continue;
            }

            stability.add_sample(weight);
            if let Some(filtered) = stability.try_get_filtered_stable(protocol_stable) {
                if stability.confirm_stable(filtered) {
                    let committed = stability.commit_if_changed(filtered);
                    let _ = app.emit(
                        "scale:reading",
                        ScaleReadingEvent {
                            mode: mode.clone(),
                            raw_chunk: String::new(),
                            raw_weight: raw_value,
                            weight: filtered,
                            committed_weight: committed,
                            protocol_stable,
                            status: "stable".to_string(),
                            message: "Cân bằng".to_string(),
                        },
                    );
                } else {
                    let _ = app.emit(
                        "scale:reading",
                        ScaleReadingEvent {
                            mode: mode.clone(),
                            raw_chunk: String::new(),
                            raw_weight: raw_value,
                            weight: filtered,
                            committed_weight: None,
                            protocol_stable,
                            status: "confirming".to_string(),
                            message: "Đang xác nhận…".to_string(),
                        },
                    );
                }
            } else {
                stability.reset_pending();
                let _ = app.emit(
                    "scale:reading",
                    ScaleReadingEvent {
                        mode: mode.clone(),
                        raw_chunk: String::new(),
                        raw_weight: raw_value,
                        weight,
                        committed_weight: None,
                        protocol_stable,
                        status: "oscillating".to_string(),
                        message: "Đang dao động…".to_string(),
                    },
                );
            }
        }
    });

    ActiveScaleWorker { tx, handle, status }
}

#[tauri::command]
pub fn list_scale_ports() -> Result<Vec<String>, String> {
    win32_serial::list_com_ports()
}

#[tauri::command]
pub fn get_scale_config() -> Result<ScaleConfig, String> {
    Ok(settings::load()?.scale.unwrap_or_default())
}

#[tauri::command]
pub fn save_scale_config(
    state: tauri::State<'_, ScaleState>,
    config: ScaleConfig,
) -> Result<ScaleConfig, String> {
    let normalized = normalize_config(config);
    settings::update(|settings| settings.scale = Some(normalized.clone()))?;
    if let Ok(guard) = state.worker.lock() {
        if let Some(active) = guard.as_ref() {
            let _ = active
                .tx
                .send(WorkerCommand::SetMultiplier(normalized.multiplier));
        }
    }
    Ok(normalized)
}

#[tauri::command]
pub fn set_scale_multiplier(
    state: tauri::State<'_, ScaleState>,
    multiplier: f64,
) -> Result<(), String> {
    if !multiplier.is_finite() || multiplier <= 0.0 {
        return Err("Hệ số nhân phải lớn hơn 0.".into());
    }
    if let Ok(guard) = state.worker.lock() {
        if let Some(active) = guard.as_ref() {
            let _ = active.tx.send(WorkerCommand::SetMultiplier(multiplier));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn start_scale(
    app: tauri::AppHandle,
    state: tauri::State<'_, ScaleState>,
    config: Option<ScaleConfig>,
    mode: Option<String>,
) -> Result<ScaleStartResult, String> {
    let raw_cfg = match config {
        Some(c) => c,
        None => settings::load()?.scale.unwrap_or_default(),
    };
    let cfg = normalize_config(raw_cfg);
    if cfg.port_name.is_empty() {
        return Err("Chưa cấu hình cổng COM kết nối cân.".into());
    }

    let mode = match mode.as_deref() {
        Some("test") => "test".to_string(),
        _ => "live".to_string(),
    };

    // Đảm bảo đóng cổng COM cũ trước khi mở lại.
    state.stop_inner();

    let port = win32_serial::SerialPort::open(&cfg)?;
    let using_driver_settings = port.using_driver_settings;
    let worker = spawn_scale_worker(
        app.clone(),
        port,
        cfg.clone(),
        mode.clone(),
        using_driver_settings,
    );

    {
        let mut guard = state.worker.lock().map_err(|e| e.to_string())?;
        *guard = Some(worker);
    }

    let status_event = ScaleStatusEvent {
        connected: true,
        mode: mode.clone(),
        port_name: cfg.port_name.clone(),
        baud_rate: cfg.baud_rate,
        using_driver_settings,
        error: None,
    };
    let _ = app.emit("scale:status", status_event);

    Ok(ScaleStartResult {
        port_name: cfg.port_name,
        baud_rate: cfg.baud_rate,
        data_bits: cfg.data_bits,
        parity: cfg.parity,
        stop_bits: cfg.stop_bits,
        using_driver_settings,
        mode,
    })
}

#[tauri::command]
pub fn stop_scale(
    app: tauri::AppHandle,
    state: tauri::State<'_, ScaleState>,
) -> Result<(), String> {
    let prev = state.stop_inner();
    let _ = app.emit(
        "scale:status",
        ScaleStatusEvent {
            connected: false,
            mode: prev.as_ref().map(|s| s.mode.clone()).unwrap_or_default(),
            port_name: prev.map(|s| s.port_name).unwrap_or_default(),
            baud_rate: 0,
            using_driver_settings: false,
            error: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn get_scale_status(state: tauri::State<'_, ScaleState>) -> Result<ScaleStatusEvent, String> {
    let guard = state.worker.lock().map_err(|e| e.to_string())?;
    if let Some(active) = guard.as_ref() {
        if let Ok(st) = active.status.lock() {
            return Ok(st.clone());
        }
    }
    Ok(ScaleStatusEvent {
        connected: false,
        mode: String::new(),
        port_name: String::new(),
        baud_rate: 0,
        using_driver_settings: false,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_control_and_question_chars() {
        let raw = "\x02ST,GS,+  1.2540 g?\x03\r\n";
        assert_eq!(clean_scale_buffer(raw), "ST,GS,+  1.2540 g");
    }

    #[test]
    fn extracts_last_number_and_tail() {
        let clean = clean_scale_buffer("\x02US,GS,+  1.2300 g\r\n\x02ST,GS,+  1.2540 g\r\n");
        let (num, head, tail) = extract_last_scale_number(&clean).unwrap();
        assert!((num - 1.254).abs() < 1e-9);
        assert_eq!(tail, "g");
        assert!(is_protocol_stable(&head, &tail));
    }

    #[test]
    fn extracts_comma_decimal_and_protocol_stable_flag() {
        let clean = clean_scale_buffer("WT:  2,5100 S ");
        let (num, head, tail) = extract_last_scale_number(&clean).unwrap();
        assert!((num - 2.51).abs() < 1e-9);
        assert!(is_protocol_stable(&head, &tail));
        assert!(!is_protocol_stable("", "US g"));
    }

    #[test]
    fn stability_filter_confirms_after_consistent_samples() {
        let mut filter = ScaleStabilityFilter::new();
        for _ in 0..4 {
            filter.add_sample(1.25);
            assert!(filter.try_get_filtered_stable(false).is_none());
        }
        // Sample 5 -> filtered median available, confirm count = 1 (< 2 initial)
        filter.add_sample(1.2505);
        let filtered = filter.try_get_filtered_stable(false).unwrap();
        assert!((filtered - 1.25).abs() < 1e-9);
        assert!(!filter.confirm_stable(filtered));

        // Sample 6 -> confirm count = 2 -> committed!
        filter.add_sample(1.2502);
        let filtered2 = filter.try_get_filtered_stable(false).unwrap();
        assert!((filtered2 - 1.25).abs() < 1e-9);
        assert!(filter.confirm_stable(filtered2));
        assert_eq!(filter.commit_if_changed(filtered2), Some(1.25));
        assert_eq!(filter.commit_if_changed(filtered2), None);
    }

    #[test]
    fn normalizes_invalid_windows_stop_bits() {
        assert_eq!(normalize_stop_bits(5, "Two"), "One");
        assert_eq!(normalize_stop_bits(8, "OnePointFive"), "One");
        assert_eq!(normalize_stop_bits(8, "Two"), "Two");
    }
}

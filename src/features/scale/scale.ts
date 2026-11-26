import { invoke, isTauri } from "@tauri-apps/api/core";

export type ScaleConfig = {
  portName: string;
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: string;
  multiplier: number;
};

export type ScaleStatusEvent = {
  connected: boolean;
  mode: string;
  portName: string;
  baudRate: number;
  usingDriverSettings: boolean;
  error: string | null;
};

export type ScaleReadingEvent = {
  mode: string;
  rawChunk: string;
  rawWeight: number;
  weight: number;
  committedWeight: number | null;
  protocolStable: boolean;
  status: "waiting" | "oscillating" | "confirming" | "stable" | "over_limit" | string;
  message: string;
};

export type ScaleStartResult = {
  portName: string;
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: string;
  usingDriverSettings: boolean;
  mode: string;
};

export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
export const DATA_BITS_OPTIONS = [8, 7, 6, 5];
export const PARITY_OPTIONS = ["None", "Even", "Odd", "Mark", "Space"];
export const STOP_BITS_OPTIONS = [
  { value: "One", label: "1" },
  { value: "OnePointFive", label: "1.5" },
  { value: "Two", label: "2" },
];

export const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  portName: "",
  baudRate: 4800,
  dataBits: 8,
  parity: "None",
  stopBits: "One",
  multiplier: 1,
};

export const DISCONNECTED_SCALE_STATUS: ScaleStatusEvent = {
  connected: false,
  mode: "",
  portName: "",
  baudRate: 0,
  usingDriverSettings: false,
  error: null,
};

export function formatScaleWeight(weight: number): string {
  if (!Number.isFinite(weight) || weight <= 0) return "0";
  return String(Number(weight.toFixed(4)));
}

export async function listScalePorts(): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>("list_scale_ports");
}

export async function getScaleConfig(): Promise<ScaleConfig> {
  if (!isTauri()) return { ...DEFAULT_SCALE_CONFIG };
  return invoke<ScaleConfig>("get_scale_config");
}

export async function saveScaleConfig(config: ScaleConfig): Promise<ScaleConfig> {
  if (!isTauri()) return config;
  return invoke<ScaleConfig>("save_scale_config", { config });
}

export async function setScaleMultiplier(multiplier: number): Promise<void> {
  if (!isTauri()) return;
  return invoke("set_scale_multiplier", { multiplier });
}

export async function startScale(
  config?: ScaleConfig,
  mode: "live" | "test" = "live",
): Promise<ScaleStartResult> {
  if (!isTauri()) {
    throw new Error("Mở ứng dụng desktop để kết nối cân điện tử.");
  }
  return invoke<ScaleStartResult>("start_scale", {
    config: config ?? null,
    mode,
  });
}

export async function stopScale(): Promise<void> {
  if (!isTauri()) return;
  return invoke("stop_scale");
}

export async function getScaleStatus(): Promise<ScaleStatusEvent> {
  if (!isTauri()) return { ...DISCONNECTED_SCALE_STATUS };
  return invoke<ScaleStatusEvent>("get_scale_status");
}

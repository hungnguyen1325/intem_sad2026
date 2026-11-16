import { invoke, isTauri } from "@tauri-apps/api/core";

export type SavedLogin = { username: string; password: string };
export async function readSavedLogin(): Promise<SavedLogin | null> {
  return isTauri() ? invoke("read_login") : null;
}
export async function saveLogin(credentials: SavedLogin): Promise<void> {
  if (isTauri()) await invoke("save_login", credentials);
}
export async function clearSavedLogin(): Promise<void> {
  if (isTauri()) await invoke("clear_login");
}

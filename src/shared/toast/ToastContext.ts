import { createContext } from "react";

export type ToastKind = "success" | "error" | "warning" | "info";
export type ToastOptions = { duration?: number; key?: string };
export type ToastMessage = {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
  key?: string;
};
export type ToastApi = Record<ToastKind, (message: string, options?: ToastOptions) => void> & {
  dismiss: (id: string) => void;
};
export const ToastContext = createContext<ToastApi | null>(null);

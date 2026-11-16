import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ToastContext,
  type ToastApi,
  type ToastKind,
  type ToastMessage,
  type ToastOptions,
} from "./ToastContext";

const appearance: Record<ToastKind, { title: string; accent: string }> = {
  success: {
    title: "Thành công",
    accent: "border-l-emerald-600",
  },
  error: {
    title: "Có lỗi xảy ra",
    accent: "border-l-red-500",
  },
  warning: {
    title: "Lưu ý",
    accent: "border-l-amber-500",
  },
  info: {
    title: "Thông báo",
    accent: "border-l-blue-500",
  },
};

function ToastItem({ item, dismiss }: { item: ToastMessage; dismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const style = appearance[item.kind];

  useEffect(() => {
    if (hovered || focused || item.duration === 0) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, hovered, focused, dismiss]);

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={`animate-[toast-enter_180ms_ease-out] motion-reduce:animate-none pointer-events-auto flex items-start gap-2 rounded-lg border border-slate-200 border-l-4 bg-white p-3 shadow-lg shadow-ink/10 ${style.accent}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink">{style.title}</p>
        <p className="mt-1 text-xs leading-5 break-words whitespace-pre-line text-slate-600">
          {item.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={`Đóng thông báo: ${style.title}`}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-ink"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const sequence = useRef(0);
  const dismiss = useCallback(
    (id: string) => setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );
  const notify = useCallback((kind: ToastKind, message: string, options: ToastOptions = {}) => {
    const item: ToastMessage = {
      id: `toast-${++sequence.current}`,
      kind,
      message,
      duration: Math.max(0, options.duration ?? (kind === "error" ? 7000 : 5000)),
      key: options.key,
    };
    setItems((current) => {
      if (
        options.key &&
        current.some((existing) => existing.key === options.key && existing.message === message)
      )
        return current;
      const remaining = options.key
        ? current.filter((existing) => existing.key !== options.key)
        : current;
      return [...remaining, item].slice(-4);
    });
  }, []);
  const value = useMemo<ToastApi>(
    () => ({
      success: (message, options) => notify("success", message, options),
      error: (message, options) => notify("error", message, options),
      warning: (message, options) => notify("warning", message, options),
      info: (message, options) => notify("info", message, options),
      dismiss,
    }),
    [notify, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <section
          aria-label="Thông báo ứng dụng"
          className="pointer-events-none fixed top-5 right-5 z-100 flex w-96 max-w-[calc(100vw-2.5rem)] flex-col gap-3"
        >
          {items.map((item) => (
            <ToastItem key={item.id} item={item} dismiss={dismiss} />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DEFAULT_SCALE_CONFIG,
  DISCONNECTED_SCALE_STATUS,
  getScaleConfig,
  getScaleStatus,
  startScale,
  stopScale,
  type ScaleConfig,
  type ScaleReadingEvent,
  type ScaleStatusEvent,
} from "./scale";

export function useScale({
  onCommittedWeight,
  onError,
}: {
  onCommittedWeight?: (weight: number) => void;
  onError?: (message: string) => void;
}) {
  const [config, setConfig] = useState<ScaleConfig>(DEFAULT_SCALE_CONFIG);
  const [status, setStatus] = useState<ScaleStatusEvent>(DISCONNECTED_SCALE_STATUS);
  const [reading, setReading] = useState<ScaleReadingEvent | null>(null);
  const [paused, setPaused] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const committedCb = useRef(onCommittedWeight);
  committedCb.current = onCommittedWeight;

  const errorCb = useRef(onError);
  errorCb.current = onError;

  const reloadConfig = useCallback(async () => {
    try {
      const cfg = await getScaleConfig();
      setConfig(cfg);
      return cfg;
    } catch {
      return DEFAULT_SCALE_CONFIG;
    }
  }, []);

  useEffect(() => {
    void reloadConfig();
    if (!isTauri()) return;

    let unlistenStatus: (() => void) | undefined;
    let unlistenReading: (() => void) | undefined;
    let cancelled = false;

    void getScaleStatus().then((st) => {
      if (!cancelled) setStatus(st);
    });

    void listen<ScaleStatusEvent>("scale:status", (event) => {
      if (cancelled) return;
      const payload = event.payload;
      setStatus(payload);
      if (!payload.connected) {
        setReading(null);
        if (payload.error && payload.mode === "live") {
          errorCb.current?.(`Lỗi cân: ${payload.error}`);
        }
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenStatus = fn;
    });

    void listen<ScaleReadingEvent>("scale:reading", (event) => {
      if (cancelled) return;
      const payload = event.payload;
      if (payload.mode !== "live") return;
      setReading(payload);
      if (!pausedRef.current && payload.committedWeight !== null) {
        committedCb.current?.(payload.committedWeight);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenReading = fn;
    });

    return () => {
      cancelled = true;
      unlistenStatus?.();
      unlistenReading?.();
    };
  }, [reloadConfig]);

  const connect = useCallback(async (overrideConfig?: ScaleConfig) => {
    setConnecting(true);
    try {
      const result = await startScale(overrideConfig, "live");
      setPaused(false);
      setReading(null);
      return { ok: true as const, result };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false as const, error: msg };
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await stopScale();
    setPaused(false);
    setReading(null);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((prev) => !prev);
  }, []);

  return {
    config,
    status,
    reading,
    paused,
    connecting,
    reloadConfig,
    connect,
    disconnect,
    togglePause,
  };
}

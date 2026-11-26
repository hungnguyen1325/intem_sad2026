import { Plug, RefreshCw, SlidersHorizontal, Trash2, Unplug, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppSelect } from "../../shared/AppSelect";
import { useToast } from "../../shared/toast/useToast";
import {
  BAUD_RATES,
  DATA_BITS_OPTIONS,
  DEFAULT_SCALE_CONFIG,
  PARITY_OPTIONS,
  STOP_BITS_OPTIONS,
  formatScaleWeight,
  getScaleConfig,
  listScalePorts,
  saveScaleConfig,
  setScaleMultiplier,
  startScale,
  stopScale,
  type ScaleConfig,
  type ScaleReadingEvent,
  type ScaleStatusEvent,
} from "./scale";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function ScaleConfigDialog({
  wasLiveConnected,
  onClose,
  onSaved,
}: {
  wasLiveConnected: boolean;
  onClose: () => void;
  onSaved: (config: ScaleConfig, shouldConnect: boolean) => void;
}) {
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const rawBox = useRef<HTMLPreElement>(null);

  const [ports, setPorts] = useState<string[]>([]);
  const [scanningPorts, setScanningPorts] = useState(false);
  const [form, setForm] = useState<ScaleConfig>(DEFAULT_SCALE_CONFIG);
  const [multiplierInput, setMultiplierInput] = useState("1");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [testing, setTesting] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawLog, setRawLog] = useState("");
  const [previewWeight, setPreviewWeight] = useState("0");
  const [testStatus, setTestStatus] = useState<{
    tone: "idle" | "stable" | "warn" | "error";
    text: string;
  }>({ tone: "idle", text: "Chưa kết nối thử" });

  const testingRef = useRef(testing);
  testingRef.current = testing;

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => {
      el?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Nếu cân đang kết nối ở màn hình chính thì tạm đóng để mở test không bị chiếm cổng COM.
      if (wasLiveConnected) {
        await stopScale().catch(() => {});
      }
      const [portList, saved] = await Promise.all([
        listScalePorts().catch(() => [] as string[]),
        getScaleConfig().catch(() => ({ ...DEFAULT_SCALE_CONFIG })),
      ]);
      if (cancelled) return;
      const mergedPorts =
        saved.portName && !portList.some((p) => p.toUpperCase() === saved.portName.toUpperCase())
          ? [saved.portName, ...portList]
          : portList;
      setPorts(mergedPorts);
      setForm({
        ...saved,
        portName: saved.portName || mergedPorts[0] || "",
      });
      setMultiplierInput(String(saved.multiplier || 1));
    }

    void init();

    return () => {
      cancelled = true;
      if (testingRef.current) {
        void stopScale();
      }
    };
  }, [wasLiveConnected]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlistenReading: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    void listen<ScaleReadingEvent>("scale:reading", (event) => {
      if (cancelled || event.payload.mode !== "test") return;
      const data = event.payload;
      if (data.rawChunk) {
        setRawLog((prev) => {
          const combined = prev + data.rawChunk;
          return combined.length > 6000 ? combined.slice(combined.length - 3000) : combined;
        });
      }
      if (data.status === "waiting") {
        setTestStatus({ tone: "idle", text: data.message });
        return;
      }
      setPreviewWeight(formatScaleWeight(data.weight));
      if (data.status === "stable") {
        setTestStatus({ tone: "stable", text: data.message });
      } else {
        setTestStatus({ tone: "warn", text: data.message });
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenReading = fn;
    });

    void listen<ScaleStatusEvent>("scale:status", (event) => {
      if (cancelled || event.payload.mode !== "test") return;
      if (!event.payload.connected) {
        setTesting(false);
        if (event.payload.error) {
          setTestStatus({ tone: "error", text: event.payload.error });
        }
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenStatus = fn;
    });

    return () => {
      cancelled = true;
      unlistenReading?.();
      unlistenStatus?.();
    };
  }, []);

  useEffect(() => {
    if (rawBox.current) {
      rawBox.current.scrollTop = rawBox.current.scrollHeight;
    }
  }, [rawLog]);

  function parsedMultiplier(): number {
    const val = Number(multiplierInput.replace(",", "."));
    return Number.isFinite(val) && val > 0 ? val : 1;
  }

  async function refreshPorts() {
    setScanningPorts(true);
    try {
      const list = await listScalePorts();
      setPorts(list);
      if (list.length > 0 && !list.some((p) => p.toUpperCase() === form.portName.toUpperCase())) {
        setForm((prev) => ({ ...prev, portName: list[0] }));
      }
    } catch (error) {
      toast.error(`Không quét được cổng COM: ${errorText(error)}`);
    } finally {
      setScanningPorts(false);
    }
  }

  async function startTestWithConfig(targetConfig: ScaleConfig) {
    if (!targetConfig.portName.trim()) {
      toast.warning("Vui lòng chọn cổng COM kết nối cân.");
      return;
    }
    setBusyTest(true);
    try {
      setRawLog("");
      setPreviewWeight("0");
      const res = await startScale(targetConfig, "test");
      setTesting(true);
      if (res.usingDriverSettings) {
        setTestStatus({
          tone: "warn",
          text: `Đã mở ${res.portName} bằng cấu hình driver (yêu cầu ${res.baudRate} baud)`,
        });
      } else {
        setTestStatus({
          tone: "idle",
          text: `Đang kết nối ${res.portName} / ${res.baudRate} baud…`,
        });
      }
    } catch (error) {
      setTesting(false);
      const msg = errorText(error);
      setTestStatus({ tone: "error", text: msg });
      toast.error(msg);
    } finally {
      setBusyTest(false);
    }
  }

  async function stopTest() {
    setBusyTest(true);
    try {
      await stopScale();
      setTesting(false);
      setTestStatus({ tone: "idle", text: "Đã ngắt kết nối thử" });
    } finally {
      setBusyTest(false);
    }
  }

  function handleBaudChange(newBaudText: string) {
    const baudRate = Number(newBaudText) || 4800;
    const nextConfig = { ...form, baudRate, multiplier: parsedMultiplier() };
    setForm(nextConfig);
    if (testing) {
      void startTestWithConfig(nextConfig);
    } else {
      setTestStatus({ tone: "idle", text: `Đã chọn Baud ${baudRate}` });
    }
  }

  function handleMultiplierChange(raw: string) {
    const clean = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const [whole, ...frac] = clean.split(".");
    const formatted = frac.length ? `${whole}.${frac.join("").slice(0, 6)}` : whole;
    setMultiplierInput(formatted);
    const val = Number(formatted);
    if (Number.isFinite(val) && val > 0) {
      setForm((prev) => ({ ...prev, multiplier: val }));
      if (testing) {
        void setScaleMultiplier(val);
      }
    }
  }

  async function handleClose() {
    if (testing) {
      await stopScale().catch(() => {});
      setTesting(false);
    }
    onClose();
  }

  async function handleSave(shouldConnect: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      if (testing) {
        await stopScale().catch(() => {});
        setTesting(false);
      }
      const payload: ScaleConfig = {
        ...form,
        portName: form.portName.trim(),
        multiplier: parsedMultiplier(),
      };
      const saved = await saveScaleConfig(payload);
      toast.success("Đã lưu cấu hình cân điện tử.");
      onSaved(saved, shouldConnect);
    } catch (error) {
      toast.error(`Lỗi lưu cấu hình cân: ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const baudOptions = (
    BAUD_RATES.includes(form.baudRate)
      ? BAUD_RATES
      : [...BAUD_RATES, form.baudRate].sort((a, b) => a - b)
  ).map((b) => ({ value: String(b), label: String(b) }));

  const statusToneClass =
    testStatus.tone === "stable"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : testStatus.tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : testStatus.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <dialog
      ref={dialog}
      className="animate-dialog-in motion-reduce:animate-none m-auto max-h-[92vh] w-[620px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border-0 bg-white p-6 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      aria-labelledby="scale-config-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) void handleClose();
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
        <div>
          <h2 id="scale-config-title" className="text-xl font-semibold text-ink">
            Cấu hình kết nối cân điện tử
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Chọn cổng COM, tốc độ Baud và hệ số quy đổi để đọc trọng lượng trực tiếp từ cân.
          </p>
        </div>
        <button
          type="button"
          aria-label="Đóng"
          disabled={saving}
          onClick={() => void handleClose()}
          className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-paper hover:text-ink"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_auto] items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">Cổng COM</span>
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <AppSelect
                  label="Cổng COM"
                  value={form.portName}
                  placeholder={ports.length ? "Chọn cổng COM" : "Không có cổng COM"}
                  onChange={(value) => setForm((prev) => ({ ...prev, portName: value }))}
                  options={ports.map((p) => ({ value: p, label: p }))}
                />
              </div>
              <button
                type="button"
                title="Quét lại danh sách cổng COM"
                aria-label="Quét lại danh sách cổng COM"
                disabled={scanningPorts || testing}
                onClick={() => void refreshPorts()}
                className="grid h-11 w-10 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand/30 hover:text-brand disabled:opacity-50"
              >
                <RefreshCw
                  size={16}
                  className={scanningPorts ? "animate-spin" : ""}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">Tốc độ Baud</span>
            <AppSelect
              label="Tốc độ Baud"
              value={String(form.baudRate)}
              onChange={handleBaudChange}
              options={baudOptions}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600">Hệ số nhân</span>
            <input
              type="text"
              inputMode="decimal"
              value={multiplierInput}
              onChange={(e) => handleMultiplierChange(e.target.value)}
              placeholder="1"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base tabular-nums text-ink transition-colors hover:border-brand/30"
            />
          </label>

          <button
            type="button"
            disabled={busyTest || (!testing && !form.portName)}
            onClick={() =>
              testing
                ? void stopTest()
                : void startTestWithConfig({ ...form, multiplier: parsedMultiplier() })
            }
            className={`flex h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors disabled:opacity-50 ${
              testing
                ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-brand/30 bg-brand/5 text-brand hover:bg-brand/10"
            }`}
          >
            {testing ? (
              <Unplug size={16} aria-hidden="true" />
            ) : (
              <Plug size={16} aria-hidden="true" />
            )}
            {testing ? "Ngắt thử" : "Test cân"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span>Gợi ý hệ số:</span>
            <button
              type="button"
              onClick={() => handleMultiplierChange("1")}
              className={`rounded border px-2 py-0.5 transition-colors ${
                parsedMultiplier() === 1
                  ? "border-brand/40 bg-brand/10 font-medium text-brand"
                  : "border-slate-200 hover:border-brand/30"
              }`}
            >
              1 (Giữ nguyên)
            </button>
            <button
              type="button"
              onClick={() => handleMultiplierChange("0.2667")}
              className={`rounded border px-2 py-0.5 transition-colors ${
                Math.abs(parsedMultiplier() - 0.2667) < 0.0005
                  ? "border-brand/40 bg-brand/10 font-medium text-brand"
                  : "border-slate-200 hover:border-brand/30"
              }`}
              title="Quy đổi từ gam (cân) sang chỉ (ô nhập liệu)"
            >
              0.2667 (gam → chỉ)
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-brand"
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            {showAdvanced ? "Ẩn thông số COM" : "Thông số COM nâng cao"}
          </button>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-paper/70 p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Data bits</span>
              <AppSelect
                label="Data bits"
                value={String(form.dataBits)}
                onChange={(v) => setForm((prev) => ({ ...prev, dataBits: Number(v) || 8 }))}
                options={DATA_BITS_OPTIONS.map((d) => ({ value: String(d), label: String(d) }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Parity</span>
              <AppSelect
                label="Parity"
                value={form.parity}
                onChange={(v) => setForm((prev) => ({ ...prev, parity: v }))}
                options={PARITY_OPTIONS.map((p) => ({ value: p, label: p }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Stop bits</span>
              <AppSelect
                label="Stop bits"
                value={form.stopBits}
                onChange={(v) => setForm((prev) => ({ ...prev, stopBits: v }))}
                options={STOP_BITS_OPTIONS}
              />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-slate-100">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Dữ liệu thô từ cân (Raw Data)</span>
            <button
              type="button"
              onClick={() => setRawLog("")}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-white"
            >
              <Trash2 size={12} aria-hidden="true" />
              Xóa log
            </button>
          </div>
          <pre
            ref={rawBox}
            className="h-28 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-emerald-300 [scrollbar-width:thin]"
          >
            {rawLog || 'Bấm "Test cân" để kiểm tra luồng dữ liệu từ cổng COM…'}
          </pre>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-paper px-4 py-3">
          <div>
            <div className="text-xs font-medium text-slate-500">Kết quả đã cân (đã nhân hệ số)</div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{previewWeight}</div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusToneClass}`}>
            {testStatus.text}
          </span>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleClose()}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:border-brand/30 hover:bg-paper"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave(false)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-brand/40 hover:bg-brand/5"
        >
          Chỉ lưu
        </button>
        <button
          type="button"
          disabled={saving || !form.portName.trim()}
          onClick={() => void handleSave(true)}
          className="inline-flex items-center justify-center rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu & Kết nối"}
        </button>
      </div>
    </dialog>
  );
}

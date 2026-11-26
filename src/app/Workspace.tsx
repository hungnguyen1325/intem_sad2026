import {
  Gem,
  LogOut,
  PackagePlus,
  Pause,
  Play,
  Scale,
  Settings,
  Truck,
  Unplug,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { AuthUser } from "../features/auth/LoginPage";
import { catalogs, type CatalogId } from "../features/catalog/catalogs";
import { AddProductDialog } from "../features/catalog/components/AddProductDialog";
import { AddAgeDialog } from "../features/catalog/components/AddAgeDialog";
import { AddSupplierDialog } from "../features/catalog/components/AddSupplierDialog";
import type { AddedCatalogItem } from "../features/catalog/components/AddCatalogDialog";
import { DashboardPage, type ScaleWeightUpdate } from "../features/dashboard/DashboardPage";
import { ScaleConfigDialog } from "../features/scale/ScaleConfigDialog";
import { formatScaleWeight } from "../features/scale/scale";
import { useScale } from "../features/scale/useScale";
import { useToast } from "../shared/toast/useToast";

const catalogIcons = { products: PackagePlus, ages: Gem, suppliers: Truck };

export function Workspace({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const toast = useToast();
  const [dialog, setDialog] = useState<CatalogId | "scale" | null>(null);
  const [addedItem, setAddedItem] = useState<AddedCatalogItem>();
  const [scaleUpdate, setScaleUpdate] = useState<ScaleWeightUpdate>();
  const scaleSeq = useRef(0);
  const wasLiveBeforeConfig = useRef(false);

  const handleCommittedWeight = useCallback((weight: number) => {
    if (weight <= 0) return;
    scaleSeq.current += 1;
    setScaleUpdate({ weight, seq: scaleSeq.current });
  }, []);

  const handleScaleError = useCallback(
    (msg: string) => {
      toast.error(msg);
    },
    [toast],
  );

  const scale = useScale({
    onCommittedWeight: handleCommittedWeight,
    onError: handleScaleError,
  });

  const dialogProps = {
    onClose: () => setDialog(null),
    onSaved: (item: AddedCatalogItem) => {
      setAddedItem(item);
      setDialog(null);
    },
  };

  async function handleToggleScale() {
    if (scale.status.connected) {
      await scale.disconnect();
      return;
    }
    if (!scale.config.portName) {
      wasLiveBeforeConfig.current = false;
      setDialog("scale");
      return;
    }
    const res = await scale.connect();
    if (!res.ok) {
      toast.error(res.error);
    } else if (res.result.usingDriverSettings) {
      toast.warning(
        `Đã mở ${res.result.portName} bằng cấu hình driver (yêu cầu ${res.result.baudRate} baud).`,
      );
    }
  }

  function openScaleConfig() {
    wasLiveBeforeConfig.current = scale.status.connected && scale.status.mode === "live";
    setDialog("scale");
  }

  function handleLogout() {
    if (scale.status.connected) {
      void scale.disconnect();
    }
    onLogout();
  }

  const liveReading = scale.status.connected ? scale.reading : null;
  const scaleBadgeTone = scale.paused
    ? "border-slate-200 bg-slate-100 text-slate-600"
    : liveReading?.status === "stable"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : liveReading?.status === "over_limit"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 flex-nowrap items-center gap-2 border-b border-slate-200 bg-white px-3">
        <button
          aria-label="INTEM — Trang in tem"
          className="shrink-0 whitespace-nowrap text-xl font-semibold tracking-[.18em] [&_span]:text-[#b68b47] lg:text-2xl"
          onClick={() => setDialog(null)}
        >
          INTEM<span>.</span>
        </button>
        <span className="h-6 w-px shrink-0 bg-slate-200" />
        <nav aria-label="Điều hướng chính" className="flex min-w-0 shrink-0 items-center gap-1.5">
          {catalogs.map((catalog) => {
            const Icon = catalogIcons[catalog.id];
            return (
              <button
                key={catalog.id}
                type="button"
                aria-haspopup="dialog"
                onClick={() => setDialog(catalog.id)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-600 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand active:scale-[.98] motion-reduce:transition-none lg:px-3 lg:text-sm"
              >
                <Icon size={16} aria-hidden="true" />
                {catalog.title}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            {scale.status.connected ? (
              <div
                className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 text-xs font-medium ${scaleBadgeTone}`}
                title={`Cân ${scale.status.portName} (${scale.status.baudRate} baud) — ${
                  scale.paused
                    ? "Tạm dừng"
                    : liveReading
                      ? liveReading.message
                      : "Đang chờ dữ liệu…"
                }`}
              >
                <Scale size={14} aria-hidden="true" />
                <span className="tabular-nums font-semibold">
                  {liveReading ? formatScaleWeight(liveReading.weight) : "0"}
                </span>
                <span className="hidden xl:inline">
                  {scale.paused
                    ? "Tạm dừng"
                    : liveReading
                      ? liveReading.message
                      : `Chờ ${scale.status.portName}…`}
                </span>
                <button
                  type="button"
                  onClick={scale.togglePause}
                  title={scale.paused ? "Tiếp tục nhận số cân" : "Tạm dừng nhận số cân"}
                  aria-label={scale.paused ? "Tiếp tục nhận số cân" : "Tạm dừng nhận số cân"}
                  className="grid size-6 place-items-center rounded hover:bg-black/5"
                >
                  {scale.paused ? (
                    <Play size={12} aria-hidden="true" />
                  ) : (
                    <Pause size={12} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleScale()}
                  title="Ngắt kết nối cân"
                  aria-label="Ngắt kết nối cân"
                  className="grid size-6 place-items-center rounded hover:bg-black/5"
                >
                  <Unplug size={12} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={scale.connecting}
                onClick={() => void handleToggleScale()}
                title={
                  scale.config.portName
                    ? `Kết nối cân (${scale.config.portName})`
                    : "Cấu hình và kết nối cân điện tử"
                }
                className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-600 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand disabled:opacity-50"
              >
                <Scale size={15} aria-hidden="true" />
                <span>{scale.connecting ? "Đang kết nối…" : "Kết nối cân"}</span>
              </button>
            )}
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label="Cấu hình cân điện tử"
              title="Cấu hình cân điện tử"
              onClick={openScaleConfig}
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
            >
              <Settings size={15} aria-hidden="true" />
            </button>
          </div>
          <span className="h-5 w-px shrink-0 bg-slate-200" />
          <span
            className="max-w-[96px] truncate text-[13px] font-medium text-slate-600 lg:max-w-[140px] lg:text-sm"
            title={user.username}
          >
            {user.username}
          </span>
          <button
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-500 hover:text-brand lg:text-sm"
          >
            Đăng xuất <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="mx-auto min-h-0 w-full max-w-6xl flex-1 p-4">
        <DashboardPage
          addedItem={addedItem}
          scaleUpdate={scaleUpdate}
          scaleConnected={scale.status.connected}
          scaleReadingWeight={
            scale.status.connected && scale.reading ? scale.reading.weight : undefined
          }
        />
      </main>
      {dialog === "products" && <AddProductDialog {...dialogProps} />}
      {dialog === "ages" && <AddAgeDialog {...dialogProps} />}
      {dialog === "suppliers" && <AddSupplierDialog {...dialogProps} />}
      {dialog === "scale" && (
        <ScaleConfigDialog
          wasLiveConnected={wasLiveBeforeConfig.current}
          onClose={() => {
            setDialog(null);
            if (wasLiveBeforeConfig.current) {
              void scale.connect();
            }
          }}
          onSaved={(_saved, shouldConnect) => {
            setDialog(null);
            void scale.reloadConfig();
            if (shouldConnect || wasLiveBeforeConfig.current) {
              void scale.connect().then((res) => {
                if (!res.ok) toast.error(res.error);
              });
            }
          }}
        />
      )}
    </div>
  );
}

import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../../../shared/toast/useToast";
import type { CatalogId } from "../catalogs";

export type AddedCatalogItem = { kind: CatalogId; id: number };
export type AddDialogProps = {
  onClose: () => void;
  onSaved: (item: AddedCatalogItem) => void;
};
export const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export function AddCatalogDialog({
  kind,
  title,
  children,
  payload,
  onClose,
  onSaved,
}: AddDialogProps & {
  kind: CatalogId;
  title: string;
  children: ReactNode;
  payload: (data: FormData) => object;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const data = new FormData(event.currentTarget);
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const id = await invoke<number>("add_catalog_item", { kind, data: payload(data) });
      if (!id) throw new Error("Chưa nhận được mã danh mục đã thêm.");
      onSaved({ kind, id });
      toast.success("Đã thêm danh mục.");
    } catch (cause) {
      setError(
        typeof cause === "string"
          ? cause
          : cause instanceof Error
            ? cause.message
            : "Không thể lưu danh mục.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="animate-dialog-in motion-reduce:animate-none max-h-[90vh] w-[480px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl bg-white p-7 text-ink shadow-2xl [&_h2]:my-2 [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:mb-4 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-slate-500 [&_label]:my-4 m-auto border-0 backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      aria-labelledby="add-catalog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!savingRef.current) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="flex items-center justify-between gap-4 [&>button]:grid [&>button]:size-8 [&>button]:place-items-center [&>button]:rounded-md [&>button]:text-slate-400 [&>button:hover]:bg-paper">
          <h2 id="add-catalog-title">{title}</h2>
          <button type="button" aria-label="Đóng" disabled={saving} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <fieldset disabled={saving}>{children}</fieldset>
        {error && (
          <div
            className="mb-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 [&_button]:ml-2 [&_button]:underline"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 hover:border-brand/30 hover:bg-paper"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            className="flex items-center justify-center gap-3 rounded-lg border border-brand bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink transition-colors duration-150 active:scale-[.98] motion-reduce:transition-none disabled:opacity-50 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-white/20 [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:text-xs [&_kbd]:font-normal [&_kbd]:text-white/70"
            disabled={saving}
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Catalog } from "./catalogs";
type Row = { id: number } & Record<string, string | number | boolean | null>;

export function CatalogPage({ catalog }: { catalog: Catalog }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setRows([]);
    invoke<Row[]>("get_catalog", { kind: catalog.id })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error("Dữ liệu danh mục không hợp lệ.");
        if (!cancelled) setRows(data);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            typeof cause === "string"
              ? cause
              : cause instanceof Error
                ? cause.message
                : "Không thể tải dữ liệu.",
          );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog.id, revision]);
  function display(value: Row[string] | undefined) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Hoạt động" : "Tạm ngưng";
    return String(value);
  }
  return (
    <section>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs tracking-[.18em] text-slate-400">DANH MỤC</p>
          <h1 className="text-3xl font-semibold">{catalog.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{catalog.description}</p>
        </div>
        <button
          onClick={() => setRevision((v) => v + 1)}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className="mr-2 inline-block" aria-hidden="true" /> Làm mới
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex justify-between border-b border-slate-100 px-6 py-5">
          <h2 className="font-semibold">Danh sách {catalog.title.toLowerCase()}</h2>
          <span className="text-xs text-slate-400">
            {busy ? "Đang tải…" : `${rows.length} bản ghi`}
          </span>
        </div>
        {error ? (
          <div role="alert" className="p-10 text-center text-sm text-red-700">
            {error}
            <button
              onClick={() => setRevision((v) => v + 1)}
              className="mx-auto mt-4 block text-brand underline"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-4">ID</th>
                  {catalog.columns.map((c) => (
                    <th key={c.key} className="px-6 py-4 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-paper/60">
                    <td className="px-6 py-4 text-slate-400">{row.id}</td>
                    {catalog.columns.map((c) => (
                      <td key={c.key} className="max-w-72 px-6 py-4 break-words">
                        {display(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(busy || !rows.length) && (
              <div role="status" className="py-20 text-center">
                <p className="text-sm font-medium">
                  {busy ? "Đang tải danh mục…" : "Chưa có dữ liệu"}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {busy
                    ? "Vui lòng chờ trong giây lát."
                    : "Danh sách sẽ xuất hiện khi cửa hàng có dữ liệu."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

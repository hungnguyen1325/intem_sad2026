import { Printer } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../../shared/toast/useToast";
import type { AddedCatalogItem } from "../catalog/components/AddCatalogDialog";
import { AppSelect } from "../../shared/AppSelect";
import {
  emptyForm,
  inspectPrinting,
  money,
  numeric,
  numericMoney,
  sendPrint,
  type CatalogItem,
  type ProductItem,
  toGram,
  type PrintEnvironment,
  type PrintForm,
} from "./printing";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </label>
  );
}
export function DashboardPage({
  addedItem,
}: {
  addedItem?: AddedCatalogItem;
}) {
  const toast = useToast();
  const [form, setForm] = useState<PrintForm>(emptyForm);
  const [catalogs, setCatalogs] = useState<{
    products: CatalogItem[];
    suppliers: CatalogItem[];
    ages: CatalogItem[];
  }>({ products: [], suppliers: [], ages: [] });
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [revision, setRevision] = useState(0);

  const [environment, setEnvironment] = useState<PrintEnvironment | null>(null);
  const [printError, setPrintError] = useState("");

  const [busy, setBusy] = useState(false);
  const savedBatch = useRef<{ key: string; items: ProductItem[] } | null>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const appliedAddedItem = useRef<AddedCatalogItem | undefined>(undefined);
  const product = catalogs.products.find((x) => String(x.id) === form.productId);
  const supplier = catalogs.suppliers.find((x) => String(x.id) === form.supplierId);
  const age = catalogs.ages.find((x) => String(x.id) === form.ageId);
  const quantity = Number(form.quantity);
  const printDisabled = busy || loading || !!dataError;
  const codeHint = form.productCode
    ? quantity > 1
      ? "Gắn ID từng tem"
      : "Giữ nguyên mã"
    : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDataError("");
    Promise.all(
      ["products", "suppliers", "ages"].map((kind) =>
        invoke<CatalogItem[]>("get_catalog", { kind }),
      ),
    )
      .then(([p, s, a]) => {
        if (cancelled) return;
        if (![p, s, a].every((x) => Array.isArray(x)))
          throw new Error("Dữ liệu danh mục không hợp lệ.");
        const data = {
          products: p.filter((x) => x.isStatus !== false),
          suppliers: s.filter((x) => x.isStatus !== false),
          ages: a.filter((x) => x.isStatus !== false),
        };
        setCatalogs(data);
        const newlyAdded = appliedAddedItem.current !== addedItem ? addedItem : undefined;
        appliedAddedItem.current = addedItem;
        setForm((current) => ({
          ...current,
          productId:
            newlyAdded?.kind === "products"
              ? String(newlyAdded.id)
              : data.products.some((x) => String(x.id) === current.productId)
                ? current.productId
                : String(data.products[0]?.id ?? ""),
          supplierId:
            newlyAdded?.kind === "suppliers"
              ? String(newlyAdded.id)
              : data.suppliers.some((x) => String(x.id) === current.supplierId)
                ? current.supplierId
                : String(data.suppliers[0]?.id ?? ""),
          ageId:
            newlyAdded?.kind === "ages"
              ? String(newlyAdded.id)
              : data.ages.some((x) => String(x.id) === current.ageId)
                ? current.ageId
                : String(data.ages[0]?.id ?? ""),
        }));
      })
      .catch((error) => {
        if (!cancelled) setDataError(message(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision, addedItem]);
  useEffect(() => {
    let cancelled = false;
    inspectPrinting()
      .then((env) => {
        if (cancelled) return;
        setEnvironment(env);
        setForm((current) => ({ ...current, template: env.templates[0] ?? "" }));
      })
      .catch((error) => {
        if (!cancelled) setPrintError(message(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key === "F7") {
        event.preventDefault();
        if (!document.querySelector("dialog[open]") && !inFlight.current)
          formElement.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function update(key: keyof PrintForm, value: string) {
    if (key.includes("Weight")) {
      const clean = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
      const [whole, ...fraction] = clean.split(".");
      value = fraction.length ? `${whole}.${fraction.join("").slice(0, 5)}` : whole;
    }
    if (["wage", "gemPrice", "retailPrice"].includes(key)) {
      const digits = value
        .replace(/[^0-9]/g, "")
        .replace(/^0+(?=\d)/, "")
        .slice(0, 9);
      value = digits ? money(Number(digits)) : "";
    }
    setForm((current) => {
      const next = { ...current, [key]: value };
      const total = numeric(next.totalWeight);
      if (key === "totalWeight" || key === "gemWeight")
        next.goldWeight = String(Math.max(0, +(total - numeric(next.gemWeight)).toFixed(5)));
      if (key === "goldWeight")
        next.gemWeight = String(Math.max(0, +(total - numeric(next.goldWeight)).toFixed(5)));
      return next;
    });
  }
  async function print(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || printDisabled) return;
    if (!product || !supplier || !age) {
      toast.warning("Chọn đủ sản phẩm, nhà cung cấp và tuổi vàng.");
      return;
    }
    if (!environment || !form.template) {
      toast.warning(printError || "Chưa có mẫu tem. Đặt mẫu .btw trong thư mục template/tem.");
      return;
    }
    const total = numeric(form.totalWeight),
      gold = numeric(form.goldWeight),
      gem = numeric(form.gemWeight);
    if (Math.round(gold * 100000) + Math.round(gem * 100000) > Math.round(total * 100000)) {
      toast.warning("Trọng lượng vàng + đá vượt tổng. Không thể tạo sản phẩm hoặc in tem.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      toast.warning("Số lượng từ 1 đến 500 tem.");
      return;
    }
    const request = {
      productId: product.id,
      supplierId: supplier.id,
      ageId: age.id,
      symbol: form.symbol,
      productCode: form.productCode,
      quantity,
      totalWeight: total,
      goldWeight: gold,
      gemWeight: gem,
      totalGram: toGram(total),
      goldGram: toGram(gold),
      gemGram: toGram(gem),
      wage: numericMoney(form.wage),
      gemPrice: numericMoney(form.gemPrice),
      retailPrice: numericMoney(form.retailPrice),
    };
    const key = JSON.stringify(request);
    inFlight.current = true;
    setBusy(true);
    try {
      if (savedBatch.current?.key !== key) {
        const items = await invoke<ProductItem[]>("create_print_items", { request });
        if (
          !Array.isArray(items) ||
          items.length !== quantity ||
          !items.every(
            (item) =>
              Number.isInteger(item?.id) &&
              item.id > 0 &&
              typeof item.code === "string" &&
              item.code.length > 0 &&
              typeof item.qrLink === "string" &&
              item.qrLink.startsWith("https://inv.sad.vn/p?"),
          )
        )
          throw new Error("Máy chủ trả dữ liệu in không hợp lệ.");
        savedBatch.current = { key, items };
      }
      const result = await sendPrint(environment, form.template, savedBatch.current.items);
      savedBatch.current = null;
      setForm((current) => ({
        ...current,
        quantity: "1",
        productCode: "",
      }));
      toast.success(result);
    } catch (error) {
      toast.error(
        savedBatch.current?.key === key
          ? `Sản phẩm đã lưu, chưa in được. Bấm In tem để thử lại. ${message(error)}`
          : message(error),
        { duration: 8000 },
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  const select = (key: "productId" | "supplierId" | "ageId", items: CatalogItem[]) => (
    <AppSelect
      label={
        key === "productId" ? "Tên sản phẩm" : key === "supplierId" ? "Nhà cung cấp" : "Tuổi vàng"
      }
      value={form[key]}
      onChange={(value) => update(key, value)}
      options={items.map((x) => ({ value: String(x.id), label: x.name }))}
    />
  );
  const input = (key: keyof PrintForm, placeholder = "0", unit?: string) => (
    <div className="relative [&_input]:pr-10 [&_input]:tabular-nums [&>span]:pointer-events-none [&>span]:absolute [&>span]:right-3 [&>span]:top-1/2 [&>span]:-translate-y-1/2 [&>span]:text-sm [&>span]:text-slate-400">
      <input
        type="text"
        inputMode={key.includes("Weight") ? "decimal" : "numeric"}
        maxLength={key === "quantity" ? 3 : 20}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => update(key, e.target.value)}
        required={key === "quantity"}
      />
      {unit && <span>{unit}</span>}
    </div>
  );

  return (
    <section className="animate-page-in motion-reduce:animate-none flex min-h-full flex-col text-sm">
      {dataError && (
        <div
          className="mb-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 [&_button]:ml-2 [&_button]:underline"
          role="alert"
        >
          {dataError} <button onClick={() => setRevision((value) => value + 1)}>Thử lại</button>
        </div>
      )}
      <form ref={formElement} onSubmit={print} className="flex min-w-0 flex-1">
        <fieldset
          className="flex min-w-0 flex-1 flex-col justify-start gap-4 rounded-xl border border-slate-200 bg-white p-5 disabled:opacity-60 [&>div+div]:border-t [&>div+div]:border-slate-100 [&>div+div]:pt-4"
          disabled={printDisabled}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Nhà cung cấp">{select("supplierId", catalogs.suppliers)}</Field>
            <Field label="Tiêu chuẩn cơ sở">
              <input
                readOnly
                value={supplier?.standard || ""}
                placeholder="Chưa có tiêu chuẩn cơ sở"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Tên sản phẩm *">{select("productId", catalogs.products)}</Field>
            <Field label="Hàm lượng (Tuổi vàng)">{select("ageId", catalogs.ages)}</Field>
            <Field label="Ký hiệu quốc tế">
              <AppSelect
                label="Ký hiệu quốc tế"
                value={form.symbol}
                onChange={(value) => update("symbol", value)}
                options={[
                  { value: " ", label: "Để trống" },
                  ...["C", "P", "GP", "GF"].map((value) => ({ value, label: value })),
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <Field
              label="Trọng lượng tổng"
              hint={`${toGram(numeric(form.totalWeight)).toFixed(2)} g`}
            >
              {input("totalWeight", "0.0000", "chỉ")}
            </Field>
            <Field
              label="Trọng lượng vàng"
              hint={`${toGram(numeric(form.goldWeight)).toFixed(2)} g`}
            >
              {input("goldWeight", "0.0000", "chỉ")}
            </Field>
            <Field label="Trọng lượng đá" hint={`${toGram(numeric(form.gemWeight)).toFixed(2)} g`}>
              {input("gemWeight", "0.0000", "chỉ")}
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Tiền công">{input("wage", "0", "₫")}</Field>
            <Field label="Tiền đá">{input("gemPrice", "0", "₫")}</Field>
            <div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-300 [&_label]:text-amber-900 [&_input]:border-amber-400 [&_input]:bg-amber-100 [&_input]:font-semibold [&_input]:text-amber-950 [&_input:focus-visible]:border-amber-600 [&_input:focus-visible]:ring-amber-600">
              <Field label="Giá bán niêm yết">{input("retailPrice", "0", "₫")}</Field>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <Field label="Mẫu tem in *">
              <AppSelect
                label="Mẫu tem in"
                value={form.template}
                onChange={(value) => update("template", value)}
                placeholder="Chọn mẫu .btw"
                options={(environment?.templates ?? []).map((value) => ({ value, label: value }))}
              />
            </Field>
            <Field label="Mã sản phẩm" hint={codeHint}>
              <input
                value={form.productCode}
                maxLength={90}
                pattern="[A-Za-z0-9_\-]*"
                placeholder="Để trống để tự tạo"
                onChange={(e) => update("productCode", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-[1fr_1.3fr] items-end gap-3 [&_button]:h-11 [&_button]:w-full [&_button]:gap-2">
              <Field label="Số lượng">{input("quantity", "1", "tem")}</Field>
              <button
                className="flex items-center justify-center gap-3 rounded-lg border border-brand bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink transition-colors duration-150 active:scale-[.98] motion-reduce:transition-none disabled:opacity-50 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-white/20 [&_kbd]:px-1 [&_kbd]:py-0.5 [&_kbd]:text-xs [&_kbd]:font-normal [&_kbd]:text-white/70"
                type="submit"
              >
                <Printer size={16} aria-hidden="true" />
                {busy ? "Đang xử lý…" : "In tem"}
                <kbd>F7</kbd>
              </button>
            </div>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

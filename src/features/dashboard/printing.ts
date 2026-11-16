import { invoke, isTauri } from "@tauri-apps/api/core";

export type CatalogItem = {
  id: number;
  name: string;
  isStatus?: boolean;
  standard?: string;
};
export type PrintForm = {
  productId: string;
  supplierId: string;
  ageId: string;
  symbol: string;
  totalWeight: string;
  goldWeight: string;
  gemWeight: string;
  wage: string;
  gemPrice: string;
  retailPrice: string;
  productCode: string;
  quantity: string;
  template: string;
};
export type ProductItem = {
  id: number;
  code: string;
  qrLink: string;
  productName: string;
  supplier: string;
  supplierAddress: string;
  supplierStandard: string;
  supplierCode: string;
  goldAge: string;
  symbol: string;
  totalWeight: number;
  goldWeight: number;
  gemWeight: number;
  totalGram: number;
  goldGram: number;
  gemGram: number;
  wage: number;
  gemPrice: number;
  retailPrice: number;
  totalWageGem: number;
};
export type PrintEnvironment = { bartender: string; directory: string; templates: string[] };
export const emptyForm: PrintForm = {
  productId: "",
  supplierId: "",
  ageId: "",
  symbol: " ",
  totalWeight: "",
  goldWeight: "",
  gemWeight: "",
  wage: "",
  gemPrice: "",
  retailPrice: "",
  productCode: "",
  quantity: "1",
  template: "",
};
const moneyFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
export const money = (n: number) => moneyFormatter.format(n);
export const numeric = (s: string) => Number(s.replace(",", ".")) || 0;
export const numericMoney = (value: string) => Number(value.replace(/[^0-9]/g, "")) || 0;
export async function inspectPrinting(directory = "", bartender = ""): Promise<PrintEnvironment> {
  if (!isTauri()) throw new Error("Mở ứng dụng desktop để kết nối BarTender và đọc mẫu tem.");
  return invoke("inspect_printing", { directory, bartender });
}
const headers =
  "MA_SP,QR_LINK,TEN_SP,NCC,DCNCC,DIA_CHI_NCC,TCCS_NCC,MA_NCC,TUOI_VANG,KY_HIEU,TL_TONG,TL_DA,TL_VANG,TL_TONG_GAM,TL_DA_GAM,TL_VANG_GAM,TIEN_CONG,TIEN_DA,TONG_CONG_DA,GIA_BAN,NGAY_IN";
const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
export const toGram = (value: number) =>
  Math.floor((Math.round(value * 100000) * 375 + 50000) / 100000) / 100;
export function buildCsv(items: ProductItem[], date = new Date()) {
  const dateText = `${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const rows = items.map((item) =>
    [
      item.code,
      item.qrLink,
      item.productName,
      item.supplier,
      item.supplierAddress,
      item.supplierAddress,
      item.supplierStandard,
      item.supplierCode,
      item.goldAge,
      item.symbol,
      item.totalWeight,
      item.gemWeight,
      item.goldWeight,
      item.totalGram.toFixed(2),
      item.gemGram.toFixed(2),
      item.goldGram.toFixed(2),
      money(item.wage),
      money(item.gemPrice),
      money(item.totalWageGem),
      money(item.retailPrice),
      dateText,
    ]
      .map(cell)
      .join(","),
  );
  return `\uFEFF${headers}\r\n${rows.join("\r\n")}\r\n`;
}
export async function sendPrint(
  environment: PrintEnvironment,
  template: string,
  items: ProductItem[],
) {
  return invoke<string>("print_labels", {
    directory: environment.directory,
    bartender: environment.bartender,
    template,
    csv: buildCsv(items),
  });
}

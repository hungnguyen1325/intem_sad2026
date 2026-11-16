import { AddCatalogDialog, text, type AddDialogProps } from "./AddCatalogDialog";
export function AddProductDialog(props: AddDialogProps) {
  return (
    <AddCatalogDialog
      {...props}
      kind="products"
      title="Thêm sản phẩm"
      payload={(data) => ({ name: text(data, "name"), unit: text(data, "unit"), isStatus: true })}
    >
      <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
        <span>Tên sản phẩm</span>
        <input name="name" required maxLength={500} autoFocus placeholder="Nhập tên sản phẩm" />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
        <span>Đơn vị tính</span>
        <input name="unit" required maxLength={20} defaultValue="Cái" />
      </label>
    </AddCatalogDialog>
  );
}

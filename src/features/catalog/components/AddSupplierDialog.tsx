import { AddCatalogDialog, text, type AddDialogProps } from "./AddCatalogDialog";
export function AddSupplierDialog(props: AddDialogProps) {
  return (
    <AddCatalogDialog
      {...props}
      kind="suppliers"
      title="Thêm nhà cung cấp"
      payload={(data) => ({
        name: text(data, "name"),
        address: text(data, "address"),
        standard: text(data, "standard"),
        kyhieu: text(data, "kyhieu"),
        isStatus: true,
      })}
    >
      <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
        <span>Tên nhà cung cấp</span>
        <input
          name="name"
          required
          maxLength={1000}
          autoFocus
          placeholder="Nhập tên nhà cung cấp"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
        <span>Địa chỉ</span>
        <input name="address" maxLength={1000} placeholder="Nhập địa chỉ" />
      </label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
          <span>Tiêu chuẩn cơ sở</span>
          <input name="standard" required maxLength={600} defaultValue="TCCS" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
          <span>Ký hiệu</span>
          <input name="kyhieu" maxLength={50} defaultValue="Được khắc trên sản phẩm" />
        </label>
      </div>
    </AddCatalogDialog>
  );
}

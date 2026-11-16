import { AddCatalogDialog, text, type AddDialogProps } from "./AddCatalogDialog";
export function AddAgeDialog(props: AddDialogProps) {
  return (
    <AddCatalogDialog
      {...props}
      kind="ages"
      title="Thêm tuổi vàng"
      payload={(data) => ({
        name: text(data, "name"),
        price: text(data, "price"),
        category: 2,
        isStatus: true,
      })}
    >
      <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
        <span>Tuổi vàng</span>
        <input name="name" required maxLength={20} autoFocus placeholder="Ví dụ: 18K, 24K, 750" />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 [&>span]:flex [&>span]:justify-between [&>span]:gap-2 [&>span]:text-sm [&>span]:font-medium [&>span]:text-slate-600 [&_small]:text-xs [&_small]:font-normal [&_small]:text-slate-400 [&_input]:h-11 [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-base [&_input]:text-ink [&_input]:transition-colors [&_input:hover]:border-brand/30 [&_input::placeholder]:text-slate-400 [&_input:read-only]:bg-paper [&_input:read-only]:text-slate-500">
        <span>Giá</span>
        <input
          name="price"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={20}
          required
          defaultValue="0"
        />
      </label>
    </AddCatalogDialog>
  );
}

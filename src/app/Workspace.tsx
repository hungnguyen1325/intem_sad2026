import { Gem, LogOut, PackagePlus, Truck } from "lucide-react";
import { useState } from "react";
import type { AuthUser } from "../features/auth/LoginPage";
import { catalogs, type CatalogId } from "../features/catalog/catalogs";
import { AddProductDialog } from "../features/catalog/components/AddProductDialog";
import { AddAgeDialog } from "../features/catalog/components/AddAgeDialog";
import { AddSupplierDialog } from "../features/catalog/components/AddSupplierDialog";
import type { AddedCatalogItem } from "../features/catalog/components/AddCatalogDialog";
import { DashboardPage } from "../features/dashboard/DashboardPage";

const catalogIcons = { products: PackagePlus, ages: Gem, suppliers: Truck };

export function Workspace({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [dialog, setDialog] = useState<CatalogId | null>(null);
  const [addedItem, setAddedItem] = useState<AddedCatalogItem>();
  const dialogProps = {
    onClose: () => setDialog(null),
    onSaved: (item: AddedCatalogItem) => {
      setAddedItem(item);
      setDialog(null);
    },
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <button
          aria-label="INTEM — Trang in tem"
          className="text-2xl font-semibold tracking-[.18em] [&_span]:text-[#b68b47]"
          onClick={() => setDialog(null)}
        >
          INTEM<span>.</span>
        </button>
        <span className="h-6 w-px bg-slate-200" />
        <nav aria-label="Điều hướng chính" className="flex flex-wrap items-center gap-2">
          {catalogs.map((catalog) => {
            const Icon = catalogIcons[catalog.id];
            return (
              <button
                key={catalog.id}
                type="button"
                aria-haspopup="dialog"
                onClick={() => setDialog(catalog.id)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand active:scale-[.98] motion-reduce:transition-none"
              >
                <Icon size={17} aria-hidden="true" />
                {catalog.title}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm font-medium text-slate-600">{user.username}</span>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-brand"
          >
            Đăng xuất <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="mx-auto min-h-0 w-full max-w-6xl flex-1 p-4">
        <DashboardPage addedItem={addedItem} />
      </main>
      {dialog === "products" && <AddProductDialog {...dialogProps} />}
      {dialog === "ages" && <AddAgeDialog {...dialogProps} />}
      {dialog === "suppliers" && <AddSupplierDialog {...dialogProps} />}
    </div>
  );
}

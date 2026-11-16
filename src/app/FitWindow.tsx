import type { ReactNode } from "react";

export function FitWindow({ children }: { children: ReactNode }) {
  return (
    <div className="app-viewport flex h-full w-full min-h-0 flex-col overflow-hidden">
      {children}
    </div>
  );
}

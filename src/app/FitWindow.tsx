import { useLayoutEffect, useState, type ReactNode } from "react";

export function FitWindow({ children }: { children: ReactNode }) {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useLayoutEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const scale = Math.min(1, viewport.width / 960, viewport.height / 640);
  return (
    <div
      style={{
        zoom: scale,
        width: viewport.width / scale,
        height: viewport.height / scale,
      }}
      className="app-viewport"
    >
      {children}
    </div>
  );
}

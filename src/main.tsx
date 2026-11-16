import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./styles.css";
import { ToastProvider } from "./shared/toast/ToastProvider";
import { FitWindow } from "./app/FitWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FitWindow><ToastProvider>
      <App />
    </ToastProvider></FitWindow>
  </React.StrictMode>,
);

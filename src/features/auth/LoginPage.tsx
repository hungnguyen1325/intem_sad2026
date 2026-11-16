import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../../shared/toast/useToast";
import { readSavedLogin, saveLogin, type SavedLogin } from "./savedLogin";

export type AuthUser = { id: number; username: string };

export function LoginPage({
  onLogin,
  autoLogin = true,
}: {
  onLogin: (user: AuthUser) => void;
  autoLogin?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(autoLogin);
  const restoreTask = useRef<Promise<SavedLogin | null> | null>(null);
  const toast = useToast();
  useEffect(() => {
    if (!autoLogin) return;
    let cancelled = false;
    restoreTask.current ??= readSavedLogin();
    restoreTask.current
      .then(async (credentials) => {
        if (cancelled || !credentials) return;
        setUsername(credentials.username);
        setPassword(credentials.password);
        const user = await invoke<AuthUser>("login", credentials);
        if (!user.id) throw new Error("Đăng nhập thất bại.");
        if (!cancelled) onLogin(user);
      })
      .catch((cause) => {
        if (!cancelled)
          toast.warning(
            cause instanceof Error ? cause.message : "Không thể tự đăng nhập. Vui lòng thử lại.",
            { key: "auto-login" },
          );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [autoLogin, onLogin, toast]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const credentials = { username, password };
    try {
      const user = await invoke<AuthUser>("login", credentials);
      if (!user.id) throw new Error("Đăng nhập thất bại.");
      try {
        await saveLogin(credentials);
      } catch {
        toast.warning("Đăng nhập thành công nhưng chưa ghi được tài khoản vào settings.json.");
      }
      onLogin(user);
      toast.success("Đăng nhập thành công.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không thể kết nối máy chủ.", {
        key: "login-error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout animate-page-in motion-reduce:animate-none grid">
      <section className="login-brand relative flex flex-col justify-between overflow-hidden bg-ink p-8 text-white">
        <div className="text-2xl font-semibold tracking-[.2em]">
          INTEM<span className="text-[#d7b777]">.</span>
        </div>
        <div className="z-10">
          <p className="mb-6 text-sm tracking-[.2em] text-[#d7b777]">KHÔNG GIAN QUẢN LÝ CỦA BẠN</p>
          <h1 className="text-5xl leading-tight font-light">
            Mọi danh mục.
            <br />
            Một nơi quản lý.
          </h1>
          <p className="mt-7 max-w-xs text-base leading-7 text-white/60">
            Sản phẩm, tuổi vàng, nhà cung cấp và kho hàng trong một không gian làm việc thống nhất.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="absolute -right-40 bottom-12 size-96 rounded-full border-[40px] border-[#d7b777]/10"
        />
        <p className="text-sm text-white/40">INTEM DESKTOP · 0.1</p>
      </section>
      <section className="flex min-w-0 items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <p className="mb-3 text-sm font-semibold tracking-[.2em] text-brand">CHÀO MỪNG TRỞ LẠI</p>
          <h2 className="text-3xl font-semibold">Đăng nhập</h2>
          <p className="mt-3 mb-9 text-base text-slate-500">Mở không gian làm việc của bạn.</p>
          <label htmlFor="username" className="mb-2 block text-base font-medium">
            Tên đăng nhập
          </label>
          <input
            id="username"
            autoComplete="username"
            required
            maxLength={30}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-5 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base"
            placeholder="Nhập tên đăng nhập"
          />
          <label htmlFor="password" className="mb-2 block text-base font-medium">
            Mật khẩu
          </label>
          <div className="relative">
            <input
              id="password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pr-16 text-base"
              placeholder="Nhập mật khẩu"
            />
            <button
              type="button"
              aria-pressed={visible}
              aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              onClick={() => setVisible(!visible)}
              className="absolute inset-y-0 right-4 text-sm text-slate-500"
            >
              {visible ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </div>
          <button
            disabled={busy}
            className="mt-7 flex items-center justify-center gap-3 w-full rounded-lg bg-brand py-3.5 text-base font-semibold text-white hover:bg-ink transition-colors duration-150 active:scale-[.98] motion-reduce:transition-none disabled:opacity-50"
          >
            {busy ? "Đang đăng nhập…" : "Vào không gian làm việc"}
            {!busy && <ArrowRight size={17} aria-hidden="true" />}
          </button>
          <p className="mt-7 text-center text-sm leading-6 text-slate-400">
            Cần hỗ trợ? Liên hệ quản trị viên cửa hàng.
          </p>
        </form>
      </section>
    </main>
  );
}


import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Workspace } from "./app/Workspace";
import { LoginPage, type AuthUser } from "./features/auth/LoginPage";
import { useToast } from "./shared/toast/useToast";
import { clearSavedLogin } from "./features/auth/savedLogin";
import { useSelectInputText } from "./shared/useSelectInputText";

export default function App() {
  return <SessionApp />;
}

function SessionApp() {
  useSelectInputText();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [autoLogin, setAutoLogin] = useState(true);
  const toast = useToast();
  useEffect(() => {
    const expire = () => {
      setAutoLogin(false);
      setUser(null);
      toast.warning("Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.", {
        key: "session-expired",
      });
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [toast]);
  async function logout() {
    setAutoLogin(false);
    setUser(null);
    try {
      await invoke("logout");
      await clearSavedLogin();
    } catch {
      toast.warning("Chưa xóa được tài khoản đã lưu trong Windows.");
    }
  }
  return user ? (
    <Workspace user={user} onLogout={logout} />
  ) : (
    <LoginPage onLogin={setUser} autoLogin={autoLogin} />
  );
}

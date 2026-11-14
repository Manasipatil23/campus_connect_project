import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, TOKEN_KEY } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) return setLoading(false);
    try {
      setUser(await api("/auth/me"));
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // The sign-in is shared by every tab of this browser. When another tab signs in as someone else
  // (or signs out), reload this one so it never shows one role's screens while acting as another.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === TOKEN_KEY && e.newValue !== e.oldValue) window.location.reload(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = (res) => { setToken(res.token); setUser(res.user); };
  const signOut = () => { setToken(null); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

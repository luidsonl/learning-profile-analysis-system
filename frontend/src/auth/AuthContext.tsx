import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authApi } from "../api/endpoints";
import { clearToken, getToken, setToken, setUnauthorizedHandler } from "../api/client";
import type { User } from "../api/types";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [ready, setReady] = useState<boolean>(() => !getToken());

  const clear = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
    setStudentId(null);
  }, []);

  useEffect(() => {
    const stored = getToken();
    if (!stored) {
      setReady(true);
      return;
    }
    let cancelled = false;
    authApi
      .me()
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        setStudentId(res.studentId ?? null);
      })
      .catch(() => {
        if (!cancelled) clear();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clear]);

  // Any 401 anywhere clears the session and returns to login.
  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    setToken(res.token);
    setTokenState(res.token);
    // /me carries the studentId for students.
    const me = await authApi.me();
    setUser(me.user);
    setStudentId(me.studentId ?? null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // session may already be expired; clear locally regardless
    }
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ user, studentId, token, ready, login, logout }),
    [user, studentId, token, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

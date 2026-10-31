"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi, type AuthUser } from "@/lib/auth-api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  refreshUser: () => Promise<AuthUser | null>;
  signIn: (input: { email: string; password: string }) => Promise<AuthUser>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await authApi.me();
      setUser(currentUser);
      setStatus("authenticated");
      return currentUser;
    } catch {
      setUser(null);
      setStatus("unauthenticated");
      return null;
    }
  }, []);

  useEffect(() => {
  let active = true;

  authApi
    .me()
    .then((currentUser) => {
      if (!active) return;

      setUser(currentUser);
      setStatus("authenticated");
    })
    .catch(() => {
      if (!active) return;

      setUser(null);
      setStatus("unauthenticated");
    });

  return () => {
    active = false;
  };
}, []);

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      const signedInUser = await authApi.login(input);
      setUser(signedInUser);
      setStatus("authenticated");
      return signedInUser;
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, refreshUser, signIn, signOut }),
    [user, status, refreshUser, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

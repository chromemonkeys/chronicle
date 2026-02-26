import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadSession, login, logout } from "../api/client";

type AuthContextValue = {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  userName: string | null;
  signIn: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userName, setUserName] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSession()
      .then((session) => {
        if (!active) {
          return;
        }
        setUserName(session.authenticated ? session.userName : null);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setUserName(null);
      })
      .finally(() => {
        if (active) {
          setIsAuthLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: userName !== null,
      isAuthLoading,
      userName,
      signIn: async (name: string) => {
        const response = await login(name);
        setUserName(response.userName);
      },
      signOut: async () => {
        await logout();
        setUserName(null);
      }
    }),
    [isAuthLoading, userName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

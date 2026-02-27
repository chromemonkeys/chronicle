import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadSession, login, logout, signIn, signUp as apiSignUp } from "../api/client";

type AuthContextValue = {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  userName: string | null;
  signIn: (name: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{
    userId: string;
    message: string;
    devVerificationToken?: string;
  }>;
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
      signInWithPassword: async (email: string, password: string) => {
        // For demo mode (no password), fall back to legacy login
        if (!password && email) {
          const response = await login(email);
          setUserName(response.userName);
          return;
        }
        const response = await signIn(email, password);
        setUserName(response.userName);
      },
      signUp: async (email: string, password: string, displayName: string) => {
        const response = await apiSignUp(email, password, displayName);
        return response;
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

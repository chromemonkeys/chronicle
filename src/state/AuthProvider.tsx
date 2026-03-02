import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadSession, login, logout, signIn, signUp as apiSignUp } from "../api/client";

type AuthContextValue = {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  userName: string | null;
  userId: string | null;
  role: string | null;
  isAdmin: boolean;
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
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadSession()
      .then((session) => {
        if (!active) {
          return;
        }
        if (session.authenticated) {
          setUserName(session.userName);
          setUserId(session.userId ?? null);
          setRole(session.role ?? null);
        } else {
          setUserName(null);
          setUserId(null);
          setRole(null);
        }
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setUserName(null);
        setUserId(null);
        setRole(null);
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
      userId,
      role,
      isAdmin: role === "admin",
      signIn: async (name: string) => {
        const response = await login(name);
        setUserName(response.userName);
        setUserId(response.userId ?? null);
        setRole(response.role ?? null);
      },
      signInWithPassword: async (email: string, password: string) => {
        // For demo mode (no password), fall back to legacy login
        if (!password && email) {
          const response = await login(email);
          setUserName(response.userName);
          setUserId(response.userId ?? null);
          setRole(response.role ?? null);
          return;
        }
        const response = await signIn(email, password);
        setUserName(response.userName);
        setUserId(response.userId ?? null);
        setRole(response.role ?? null);
      },
      signUp: async (email: string, password: string, displayName: string) => {
        const response = await apiSignUp(email, password, displayName);
        return response;
      },
      signOut: async () => {
        await logout();
        setUserName(null);
        setUserId(null);
        setRole(null);
      }
    }),
    [isAuthLoading, userName, userId, role]
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

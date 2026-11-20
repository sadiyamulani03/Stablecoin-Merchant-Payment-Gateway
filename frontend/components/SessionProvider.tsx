"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { clearSession, getSession, saveSession, type Session } from "../lib/auth";

type Listener = () => void;

const listeners = new Set<Listener>();
let current: Session | null = null;
let initialized = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function readSession(): Session | null {
  const session = getSession();
  if (session && session.expiresAt && session.expiresAt <= Date.now()) {
    clearSession();
    return null;
  }
  return session;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Session | null {
  if (!initialized) {
    initialized = true;
    current = readSession();
  }
  return current;
}

function getServerSnapshot(): Session | null {
  return null;
}

type SessionContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isResolved: boolean;
  signIn: (input: { token: string; merchantId: string; name?: string; remember?: boolean }) => Session;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const signIn = useCallback<SessionContextValue["signIn"]>((input) => {
    const saved = saveSession(input);
    initialized = true;
    current = saved;
    emit();
    return saved;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    initialized = true;
    current = null;
    emit();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session?.token),
      isResolved: typeof window !== "undefined" && initialized,
      signIn,
      signOut
    }),
    [session, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

"use client";

import { useState, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { isPrivyConfigured } from "../lib/privy";

const PRIVY_APP_ID = (process.env.NEXT_PUBLIC_PRIVY_APP_ID || "").trim();

export type PrivyReadyStatus = "unconfigured" | "loading" | "ready" | "error";

export function PrivyProviderWrapper({
  children,
  onReady,
  onError,
}: {
  children: ReactNode;
  onReady?: () => void;
  onError?: (error: Error) => void;
}) {
  const [status, setStatus] = useState<PrivyReadyStatus>(
    isPrivyConfigured() ? "loading" : "unconfigured"
  );

  if (status === "unconfigured") {
    return (
      <div className="privy-notice">
        <p>Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID to enable Google Sign-In and embedded wallets.</p>
        {children}
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      loginMethods={["google"]}
      embeddedWallets={{ createOnLogin: "users-without-wallets", appearanceTheme: "cta" }}
      onReady={() => {
        setStatus("ready");
        onReady?.();
      }}
      onError={(error: Error) => {
        setStatus("error");
        onError?.(error);
      }}
    >
      {children}
    </PrivyProvider>
  );
}

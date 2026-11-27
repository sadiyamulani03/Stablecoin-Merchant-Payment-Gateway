"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { isPrivyConfigured } from "../lib/privy";

const PRIVY_APP_ID = (process.env.NEXT_PUBLIC_PRIVY_APP_ID || "").trim();

export function PrivyProviderWrapper({
  children,
}: {
  children: ReactNode;
}) {
  if (!isPrivyConfigured()) {
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
      config={{
        loginMethods: ["google"],
      embeddedWallets: {
        ethereum: {
          createOnLogin: "off"
        }
      }
      }}
    >
      {children}
    </PrivyProvider>
  );
}

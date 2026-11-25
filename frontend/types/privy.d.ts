import type { ReactNode } from "react";

// Re-export PrivyProviderProps shape for the wrapper component.
export interface PrivyProviderProps {
  appId: string;
  clientId?: string;
  config?: {
    loginMethods?: Array<
      | "wallet"
      | "email"
      | "sms"
      | "google"
      | "twitter"
      | "discord"
      | "github"
      | "linkedin"
      | "spotify"
      | "instagram"
      | "tiktok"
      | "line"
      | "apple"
      | "farcaster"
      | "telegram"
      | "passkey"
    >;
    embeddedWallets?: {
      createOnLogin?: "all-users" | "users-without-wallets" | "off";
      ethereum?: {
        createOnLogin?: "all-users" | "users-without-wallets" | "off";
      };
      solana?: {
        createOnLogin?: "all-users" | "users-without-wallets" | "off";
      };
    };
  };
  children: ReactNode;
}

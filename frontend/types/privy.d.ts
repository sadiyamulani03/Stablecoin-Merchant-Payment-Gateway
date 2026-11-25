import type { ReactNode } from "react";

export interface PrivyEmail {
  address: string;
  verified: boolean;
}

export interface PrivyWallet {
  address: string;
  chainType: string;
  type?: string;
  connectorType?: string;
  walletClientType?: string;
}

export interface PrivyUser {
  id: string;
  email: PrivyEmail | null;
  wallet: PrivyWallet | null;
}

export interface PrivyInterface {
  ready: boolean;
  authenticated: boolean;
  user: PrivyUser | null;
  login: (options?: { loginMethods?: string[] }) => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export interface PrivyProviderProps {
  appId: string;
  loginMethods?: string[];
  embeddedWallets?: Record<string, unknown>;
  onReady?: () => void;
  onError?: (error: Error) => void;
  children: ReactNode;
}

declare module "@privy-io/react-auth" {
  export function usePrivy(): PrivyInterface;
  export function PrivyProvider(props: PrivyProviderProps): JSX.Element;
}

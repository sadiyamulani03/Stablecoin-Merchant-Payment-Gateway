// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock @privy-io/react-auth - static mock objects (factory functions are hoisted,
// so they can't reference variables declared in this file)
vi.mock("@privy-io/react-auth", {
  usePrivy: vi.fn(),
  useIdentityToken: vi.fn(),
  useWallets: vi.fn(),
  useCreateWallet: vi.fn(),
} as any);

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    beforePopState: vi.fn(),
  }),
  usePathname: () => "/login",
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: (props: any) => React.createElement("a", props),
}));

// Mock ../lib/api
vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Mock ../components/SessionProvider
vi.mock("../components/SessionProvider", () => ({
  useSession: () => ({
    session: null,
    isAuthenticated: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// Mock ../lib/auth
vi.mock("../lib/auth", () => ({
  saveWalletSession: vi.fn(),
}));

// Mock ../lib/privy
vi.mock("../lib/privy", () => ({
  isPrivyConfigured: () => true,
  findEmbeddedEthereumWallet: vi.fn(),
  isEmbeddedEthereumWallet: vi.fn(),
}));

import { usePrivy, useIdentityToken, useWallets, useCreateWallet } from "@privy-io/react-auth";
import Login from "../app/login/page";
import { apiFetch } from "../lib/api";
import { findEmbeddedEthereumWallet } from "../lib/privy";

const mockApiFetchFn = vi.mocked(apiFetch);
const mockFindEmbeddedEthereumWalletFn = vi.mocked(findEmbeddedEthereumWallet);
const mockUsePrivy = vi.mocked(usePrivy);
const mockUseIdentityToken = vi.mocked(useIdentityToken);
const mockUseWallets = vi.mocked(useWallets);
const mockUseCreateWallet = vi.mocked(useCreateWallet);

function renderLogin({
  authenticated = true,
  walletsReady = true,
  embeddedWallet = null,
  createWalletError = null,
  getAccessTokenResult = "mock-access-token",
  apiFetchResult = {},
  apiFetchError = null,
}: {
  authenticated?: boolean;
  walletsReady?: boolean;
  embeddedWallet?: any;
  createWalletError?: Error | null;
  getAccessTokenResult?: string | null;
  apiFetchResult?: any;
  apiFetchError?: Error | null;
} = {}) {
  mockUsePrivy.mockReturnValue({
    login: vi.fn().mockResolvedValue(undefined),
    authenticated,
    getAccessToken: vi.fn().mockResolvedValue(getAccessTokenResult),
  } as any);
  mockUseIdentityToken.mockReturnValue({ identityToken: "mock-identity-token" });
  mockUseWallets.mockReturnValue({
    wallets: embeddedWallet ? [embeddedWallet] : [],
    ready: walletsReady,
  });
  if (createWalletError) {
    mockUseCreateWallet.mockReturnValue({
      createWallet: vi.fn().mockRejectedValue(createWalletError),
    });
  } else {
    mockUseCreateWallet.mockReturnValue({
      createWallet: vi.fn().mockResolvedValue(undefined),
    });
  }
  mockFindEmbeddedEthereumWalletFn.mockReturnValue(embeddedWallet);
  mockApiFetchFn.mockResolvedValue(apiFetchResult);
  if (apiFetchError) mockApiFetchFn.mockRejectedValue(apiFetchError);

  return { ...render(<Login />), router: { push: mockRouterPush } };
}

describe("Login page - Privy embedded wallet creation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePrivy.mockReturnValue({
      login: vi.fn().mockResolvedValue(undefined),
      authenticated: true,
      getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
    } as any);
    mockUseIdentityToken.mockReturnValue({ identityToken: "mock-identity-token" });
    mockUseCreateWallet.mockReturnValue({
      createWallet: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not initiate wallet creation when user is not authenticated", () => {
    renderLogin({
      authenticated: false,
      walletsReady: true,
      embeddedWallet: null,
    });

    expect(mockUseCreateWallet().createWallet).not.toHaveBeenCalled();
    screen.getByText("Continue with Google");
  });

  it("does not initiate wallet creation when wallets are not ready", () => {
    renderLogin({
      authenticated: true,
      walletsReady: false,
      embeddedWallet: null,
    });

    expect(mockUseCreateWallet().createWallet).not.toHaveBeenCalled();
  });

  it("skips wallet creation when an embedded Ethereum wallet already exists", async () => {
    const embeddedWallet = {
      type: "ethereum",
      address: "0xexistingwallet",
      walletClientType: "privy",
      connectorType: "embedded",
      imported: false,
      chainId: "eip155:80002",
    } as any;

    renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet,
    });

    expect(mockUseCreateWallet().createWallet).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockApiFetchFn).toHaveBeenCalledTimes(1);
    });
    expect(mockApiFetchFn).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/privy/verify"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-access-token",
        }),
        body: JSON.stringify({ idToken: "mock-access-token", identityToken: "mock-identity-token" }),
      })
    );
  });

  it("creates exactly one embedded wallet when none exists", () => {
    renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet: null,
    });

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);
    screen.getByText("Creating your embedded wallet…");
  });

  it("does not create duplicate wallets on rerender while creation is pending", () => {
    const { rerender } = renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet: null,
    });

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);

    rerender(<Login />);

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);
  });

  it("proceeds to backend verification after successful wallet creation", async () => {
    const { rerender } = renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet: null,
    });

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);

    const newWallet = {
      type: "ethereum",
      address: "0xnewwallet",
      walletClientType: "privy",
      connectorType: "embedded",
      imported: false,
      chainId: "eip155:80002",
    } as any;

    mockFindEmbeddedEthereumWalletFn.mockReturnValue(newWallet);
    rerender(<Login />);

    await waitFor(() => {
      expect(mockApiFetchFn).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/privy/verify"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-access-token",
          }),
        })
      );
    });
  });

  it("shows error when wallet creation fails", async () => {
    const createError = new Error("Wallet creation failed");
    renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet: null,
      createWalletError: createError,
    });

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.some((a) => /Wallet creation failed/.test(a.textContent || ""))).toBe(true);
    });
    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);
  });

  it("retries wallet creation after failure", async () => {
    const createError = new Error("Wallet creation failed");
    renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet: null,
      createWalletError: createError,
    });

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]);

    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(2);
  });

  it("initiates embedded wallet creation when only external wallet exists", () => {
    const metamaskWallet = {
      type: "ethereum",
      address: "0xmetamask",
      walletClientType: "metamask",
      connectorType: "injected",
      imported: false,
      chainId: "eip155:80002",
    } as any;

    renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet: metamaskWallet,
    });
    mockFindEmbeddedEthereumWalletFn.mockReturnValue(null);
    render(<Login />);

    expect(mockFindEmbeddedEthereumWalletFn).toHaveBeenCalledWith([metamaskWallet]);
    expect(mockUseCreateWallet().createWallet).toHaveBeenCalledTimes(1);
  });

  it("navigates to dashboard after successful verification", async () => {
    const embeddedWallet = {
      type: "ethereum",
      address: "0xexistingwallet",
      walletClientType: "privy",
      connectorType: "embedded",
      imported: false,
      chainId: "eip155:80002",
    } as any;

    const { router } = renderLogin({
      authenticated: true,
      walletsReady: true,
      embeddedWallet,
    });
    mockApiFetchFn.mockResolvedValue({ walletAddress: embeddedWallet.address });

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/dashboard");
    });
  });
});

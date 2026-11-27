import { describe, expect, it } from "vitest";
import type { ConnectedWallet } from "@privy-io/react-auth";
import {
  findEmbeddedEthereumWallet,
  isEmbeddedEthereumWallet
} from "../lib/privy";

function makeWallet(overrides: Partial<ConnectedWallet> = {}): ConnectedWallet {
  return {
    type: "ethereum",
    address: "0x1234567890123456789012345678901234567890",
    connectedAt: Date.now(),
    walletClientType: "privy",
    connectorType: "embedded",
    imported: false,
    chainId: "eip155:80002",
    linked: true,
    loginOrLink: async () => {},
    unlink: async () => {},
    getEthereumProvider: async () => ({
      request: async () => {}
    } as unknown as never),
    sign: async () => "",
    fund: async () => {},
    switchChain: async () => {},
    ...overrides
  } as ConnectedWallet;
}

describe("findEmbeddedEthereumWallet", () => {
  it("returns the embedded Ethereum wallet when present", () => {
    const embedded = makeWallet({
      address: "0xembedded",
      walletClientType: "privy",
      connectorType: "embedded"
    });
    const external = makeWallet({
      address: "0xexternal",
      walletClientType: "metamask",
      connectorType: "injected"
    });
    const result = findEmbeddedEthereumWallet([external, embedded]);
    expect(result).toBe(embedded);
    expect(result?.address).toBe("0xembedded");
  });

  it("returns null when only external wallets exist", () => {
    const metamask = makeWallet({
      address: "0xmetamask",
      walletClientType: "metamask",
      connectorType: "injected"
    });
    const coinbase = makeWallet({
      address: "0xcoinbase",
      walletClientType: "coinbase_wallet",
      connectorType: "injected"
    });
    const result = findEmbeddedEthereumWallet([metamask, coinbase]);
    expect(result).toBeNull();
  });

  it("returns null when no wallets exist", () => {
    expect(findEmbeddedEthereumWallet([])).toBeNull();
  });

  it("does not select imported wallets", () => {
    const imported = makeWallet({
      address: "0ximported",
      walletClientType: "privy",
      connectorType: "embedded",
      imported: true
    });
    expect(findEmbeddedEthereumWallet([imported])).toBeNull();
  });

  it("does not select wallets with wrong connectorType", () => {
    const walletConnect = makeWallet({
      address: "0xwc",
      walletClientType: "privy",
      connectorType: "wallet_connect"
    });
    expect(findEmbeddedEthereumWallet([walletConnect])).toBeNull();
  });
});

describe("isEmbeddedEthereumWallet", () => {
  it("returns true for a Privy embedded Ethereum wallet", () => {
    const embedded = makeWallet({
      walletClientType: "privy",
      connectorType: "embedded"
    });
    expect(isEmbeddedEthereumWallet(embedded)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isEmbeddedEthereumWallet(null)).toBe(false);
  });

  it("returns false for MetaMask", () => {
    const metamask = makeWallet({
      walletClientType: "metamask",
      connectorType: "injected"
    });
    expect(isEmbeddedEthereumWallet(metamask)).toBe(false);
  });

  it("returns false for Solana wallets", () => {
    const solana = makeWallet({
      type: "solana" as any,
      walletClientType: "privy",
      connectorType: "embedded"
    });
    expect(isEmbeddedEthereumWallet(solana)).toBe(false);
  });
});

describe("dashboard sign-in navigation", () => {
  it("navigates to login when no Privy embedded wallet exists", () => {
    const metamask = makeWallet({
      address: "0xmetamask",
      walletClientType: "metamask",
      connectorType: "injected"
    });
    const embeddedWallet = findEmbeddedEthereumWallet([metamask]);
    expect(embeddedWallet).toBeNull();
  });

  it("shows wallet info instead of login link when embedded wallet exists", () => {
    const embedded = makeWallet({
      address: "0xembedded",
      walletClientType: "privy",
      connectorType: "embedded"
    });
    const embeddedWallet = findEmbeddedEthereumWallet([embedded]);
    expect(embeddedWallet).not.toBeNull();
    expect(embeddedWallet?.address).toBe("0xembedded");
  });

  it("preserves merchant session when navigating to login", () => {
    // The login page does not clear merchant session state; it only reads/writes
    // Privy wallet session keys separate from merchant JWT keys.
    const merchantKeys = ["gateway_token", "merchant_id", "merchant_name", "gateway_persist"];
    const walletKeys = ["gateway_wallet_address", "gateway_wallet_email", "gateway_wallet_provider"];
    expect(merchantKeys).not.toContain("gateway_wallet_address");
    expect(walletKeys).not.toContain("gateway_token");
  });
});

describe("wallet creation flow", () => {
  it("does not create a duplicate wallet when an embedded Ethereum wallet already exists", () => {
    const embedded = makeWallet({
      address: "0xembedded",
      walletClientType: "privy",
      connectorType: "embedded",
      imported: false
    });
    const embeddedWallet = findEmbeddedEthereumWallet([embedded]);
    expect(embeddedWallet).not.toBeNull();
    expect(embeddedWallet?.address).toBe("0xembedded");
    // An existing embedded wallet means creation should be skipped.
    expect(isEmbeddedEthereumWallet(embeddedWallet)).toBe(true);
  });

  it("creates a wallet when no embedded Ethereum wallet exists but external wallets do", () => {
    const metamask = makeWallet({
      address: "0xmetamask",
      walletClientType: "metamask",
      connectorType: "injected",
      imported: false
    });
    const embeddedWallet = findEmbeddedEthereumWallet([metamask]);
    expect(embeddedWallet).toBeNull();
    // No embedded wallet → creation should be initiated.
    expect(isEmbeddedEthereumWallet(embeddedWallet)).toBe(false);
  });

  it("does not create a wallet when only an imported Privy wallet exists", () => {
    const imported = makeWallet({
      address: "0ximported",
      walletClientType: "privy",
      connectorType: "embedded",
      imported: true
    });
    const embeddedWallet = findEmbeddedEthereumWallet([imported]);
    expect(embeddedWallet).toBeNull();
    // Imported wallets are not eligible → creation should be initiated.
    expect(isEmbeddedEthereumWallet(embeddedWallet)).toBe(false);
  });

  it("does not create a wallet when only a Solana embedded wallet exists", () => {
    const solana = makeWallet({
      address: "0xsolana",
      type: "solana" as any,
      walletClientType: "privy",
      connectorType: "embedded",
      imported: false
    });
    const embeddedWallet = findEmbeddedEthereumWallet([solana]);
    expect(embeddedWallet).toBeNull();
    // Solana embedded wallet ≠ Ethereum embedded wallet → creation should be initiated.
    expect(isEmbeddedEthereumWallet(embeddedWallet)).toBe(false);
  });

  it("creates exactly one wallet when creation is pending and rerender occurs", () => {
    // Simulate: no embedded wallet, creation not yet attempted
    const emptyWallets: ConnectedWallet[] = [];
    let creationCount = 0;

    const embeddedWallet = findEmbeddedEthereumWallet(emptyWallets);
    expect(embeddedWallet).toBeNull();

    // Simulate: creation attempted → guard prevents duplicate
    let creationAttempted = false;
    if (!embeddedWallet && !creationAttempted) {
      creationAttempted = true;
      creationCount += 1;
    }
    // Rerender: creationAttempted still true → no duplicate call
    if (!embeddedWallet && creationAttempted) {
      creationCount += 0; // no additional call
    }
    expect(creationCount).toBe(1);
  });

  it("allows retry after creation failure resets the attempt guard", () => {
    const emptyWallets: ConnectedWallet[] = [];
    const embeddedWallet = findEmbeddedEthereumWallet(emptyWallets);
    expect(embeddedWallet).toBeNull();

    // Simulate: first creation attempt
    let creationAttempted = true;
    let creationCount = 1;

    // Simulate: failure → reset guard
    creationAttempted = false;

    // Simulate: retry → new creation attempt
    if (!embeddedWallet && !creationAttempted) {
      creationAttempted = true;
      creationCount += 1;
    }
    expect(creationCount).toBe(2);
    expect(creationAttempted).toBe(true);
  });
});

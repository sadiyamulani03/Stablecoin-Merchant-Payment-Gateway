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

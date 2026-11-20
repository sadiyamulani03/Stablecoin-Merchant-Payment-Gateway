import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatUnitsSafe,
  paymentStatusFromContract,
  paymentStatusMeta,
  shortenAddress,
  subscriptionStatusMeta
} from "../lib/format";
import { NETWORKS } from "../lib/config";

describe("amount formatting", () => {
  it("formats decimal strings with two decimals", () => {
    expect(formatAmount("25")).toBe("25.00");
    expect(formatAmount("1250.5")).toBe("1,250.50");
  });

  it("falls back to zero for missing or invalid values", () => {
    expect(formatAmount(undefined)).toBe("0.00");
    expect(formatAmount("not-a-number")).toBe("0.00");
  });

  it("formats base units without losing precision", () => {
    expect(formatUnitsSafe(BigInt(125050), 2)).toBe("1,250.50");
    expect(formatUnitsSafe(BigInt(5), 2)).toBe("0.05");
    expect(formatUnitsSafe(BigInt(0), 2)).toBe("0.00");
  });
});

describe("status mapping", () => {
  it("maps contract payment status codes", () => {
    expect(paymentStatusFromContract(0)).toBe("missing");
    expect(paymentStatusFromContract(1)).toBe("pending");
    expect(paymentStatusFromContract(2)).toBe("paid");
    expect(paymentStatusFromContract(3)).toBe("refunded");
    expect(paymentStatusFromContract(4)).toBe("expired");
    expect(paymentStatusFromContract(9)).toBe("unknown");
  });

  it("assigns a tone for each payment status", () => {
    expect(paymentStatusMeta("paid").tone).toBe("success");
    expect(paymentStatusMeta("pending").tone).toBe("pending");
    expect(paymentStatusMeta("missing").tone).toBe("danger");
  });

  it("maps contract subscription status codes", () => {
    expect(subscriptionStatusMeta(1).label).toBe("Active");
    expect(subscriptionStatusMeta(2).label).toBe("Paused");
    expect(subscriptionStatusMeta(3).label).toBe("Cancelled");
    expect(subscriptionStatusMeta(4).label).toBe("Exhausted");
  });
});

describe("address helpers", () => {
  it("shortens long addresses and keeps short values intact", () => {
    expect(shortenAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…345678");
    expect(shortenAddress("0xabc")).toBe("0xabc");
    expect(shortenAddress(null)).toBe("—");
  });
});

describe("network configuration", () => {
  it("keeps both supported chains with the expected ids", () => {
    expect(NETWORKS["adi-testnet"].chainId).toBe(99999);
    expect(NETWORKS["polygon-amoy"].chainId).toBe(80002);
  });
});

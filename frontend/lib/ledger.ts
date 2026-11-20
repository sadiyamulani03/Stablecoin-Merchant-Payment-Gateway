import type { ChainKey } from "./types";
import type { ChainKey as ConfigChainKey } from "./config";

export type LedgerEntry = {
  paymentId: string;
  chain: ConfigChainKey;
  amount: string;
  description: string;
  createdAt: string;
  expiresAt: string;
  txHash: string;
  merchantId: string;
};

const STORAGE_PREFIX = "gateway_ledger:";

function storageKey(merchantId: string): string {
  return `${STORAGE_PREFIX}${merchantId}`;
}

function readAll(merchantId: string): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(merchantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is LedgerEntry =>
        !!entry && typeof entry === "object" && typeof (entry as LedgerEntry).paymentId === "string"
    );
  } catch {
    return [];
  }
}

export function listPayments(merchantId: string | null): LedgerEntry[] {
  if (!merchantId) return [];
  return readAll(merchantId).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export function recordPayment(merchantId: string, entry: Omit<LedgerEntry, "merchantId">): LedgerEntry {
  const existing = readAll(merchantId).filter((item) => item.paymentId !== entry.paymentId);
  const next: LedgerEntry = { ...entry, merchantId };
  existing.unshift(next);
  try {
    window.localStorage.setItem(storageKey(merchantId), JSON.stringify(existing.slice(0, 100)));
  } catch {
    /* storage full or unavailable */
  }
  return next;
}

export function clearPayments(merchantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(merchantId));
}

export type { ChainKey };

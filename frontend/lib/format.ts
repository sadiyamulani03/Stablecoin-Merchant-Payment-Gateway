import type { ChainKey } from "./config";
import { NETWORKS } from "./config";
import type { PaymentStatus } from "./types";

export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.00";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "0.00";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);
}

export function formatRelative(value: string | number | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.34524],
    ["month", 12],
    ["year", Number.POSITIVE_INFINITY]
  ];
  let duration = deltaSeconds;
  for (const [unit, size] of units) {
    if (Math.abs(duration) < size) return formatter.format(Math.round(duration), unit);
    duration /= size;
  }
  return formatter.format(Math.round(duration), "year");
}

export function shortenAddress(address: string | null | undefined, size = 6): string {
  if (!address) return "—";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function explorerTxUrl(chain: ChainKey, txHash: string | null | undefined): string | null {
  if (!txHash) return null;
  return `${NETWORKS[chain].explorer}/tx/${txHash}`;
}

export function explorerAddressUrl(chain: ChainKey, address: string | null | undefined): string | null {
  if (!address) return null;
  return `${NETWORKS[chain].explorer}/address/${address}`;
}

export type StatusTone = "pending" | "success" | "danger" | "neutral" | "info";

export function paymentStatusMeta(status: PaymentStatus | string | null | undefined): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "paid":
      return { label: "Paid", tone: "success" };
    case "pending":
      return { label: "Pending", tone: "pending" };
    case "refunded":
      return { label: "Refunded", tone: "info" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "missing":
      return { label: "Not found on-chain", tone: "danger" };
    default:
      return { label: "Unknown", tone: "neutral" };
  }
}

export function subscriptionStatusMeta(status: number | bigint | string | undefined): {
  label: string;
  tone: StatusTone;
} {
  if (typeof status === "number" || typeof status === "bigint") {
    switch (Number(status)) {
      case 0:
        return { label: "Not found", tone: "neutral" };
      case 1:
        return { label: "Active", tone: "success" };
      case 2:
        return { label: "Paused", tone: "pending" };
      case 3:
        return { label: "Cancelled", tone: "neutral" };
      case 4:
        return { label: "Exhausted", tone: "danger" };
      default:
        return { label: "Unknown", tone: "neutral" };
    }
  }
  switch (status) {
    case "active":
      return { label: "Active", tone: "success" };
    case "paused":
      return { label: "Paused", tone: "pending" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "exhausted":
      return { label: "Exhausted", tone: "danger" };
    default:
      return { label: "Active", tone: "success" };
  }
}

export function paymentStatusFromContract(status: number | bigint): PaymentStatus {
  switch (Number(status)) {
    case 0:
      return "missing";
    case 1:
      return "pending";
    case 2:
      return "paid";
    case 3:
      return "refunded";
    case 4:
      return "expired";
    default:
      return "unknown";
  }
}

export function formatUnitsSafe(value: bigint, decimals: number): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const base = BigInt(10) ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction.toString().padStart(decimals, "0");
  const grouped = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${grouped}${decimals > 0 ? `.${fractionText}` : ""}`;
}

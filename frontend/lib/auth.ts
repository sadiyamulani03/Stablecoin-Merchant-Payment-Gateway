const TOKEN_KEY = "gateway_token";
const MERCHANT_ID_KEY = "merchant_id";
const MERCHANT_NAME_KEY = "merchant_name";
const PERSIST_KEY = "gateway_persist";

export type Session = {
  token: string;
  merchantId: string;
  name: string;
  email: string;
  expiresAt: number | null;
};

type JwtClaims = {
  merchantId?: string;
  email?: string;
  exp?: number;
};

function decodeClaims(token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    const parsed = JSON.parse(json) as JwtClaims;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function storages(): Storage[] {
  if (typeof window === "undefined") return [];
  const available: Storage[] = [];
  try {
    available.push(window.localStorage);
  } catch {
    /* storage unavailable */
  }
  try {
    available.push(window.sessionStorage);
  } catch {
    /* storage unavailable */
  }
  return available;
}

function readValue(key: string): string | null {
  for (const storage of storages()) {
    const value = storage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function writeValue(key: string, value: string, persistent: boolean): void {
  const target = persistent ? window.localStorage : window.sessionStorage;
  target.setItem(key, value);
}

function removeValue(key: string): void {
  for (const storage of storages()) storage.removeItem(key);
}

export function isPersistentSession(): boolean {
  return readValue(PERSIST_KEY) === "1";
}

export function saveSession(session: {
  token: string;
  merchantId: string;
  name?: string;
  remember?: boolean;
}): Session {
  const persistent = session.remember !== false;
  removeValue(TOKEN_KEY);
  removeValue(MERCHANT_ID_KEY);
  removeValue(MERCHANT_NAME_KEY);

  const claims = decodeClaims(session.token);
  writeValue(TOKEN_KEY, session.token, persistent);
  writeValue(MERCHANT_ID_KEY, session.merchantId, persistent);
  writeValue(MERCHANT_NAME_KEY, session.name ?? "", persistent);
  window.localStorage.setItem(PERSIST_KEY, persistent ? "1" : "0");

  return {
    token: session.token,
    merchantId: session.merchantId,
    name: session.name ?? "",
    email: claims.email ?? "",
    expiresAt: claims.exp ? claims.exp * 1000 : null
  };
}

export function clearSession(): void {
  removeValue(TOKEN_KEY);
  removeValue(MERCHANT_ID_KEY);
  removeValue(MERCHANT_NAME_KEY);
  removeValue(PERSIST_KEY);
}

export function getToken(): string | null {
  return readValue(TOKEN_KEY);
}

export function getMerchantId(): string | null {
  return readValue(MERCHANT_ID_KEY);
}

export function getSession(): Session | null {
  const token = getToken();
  const merchantId = getMerchantId();
  if (!token || !merchantId) return null;
  const claims = decodeClaims(token);
  return {
    token,
    merchantId,
    name: readValue(MERCHANT_NAME_KEY) ?? "",
    email: claims.email ?? "",
    expiresAt: claims.exp ? claims.exp * 1000 : null
  };
}

export function isExpired(session: Session | null): boolean {
  if (!session) return true;
  if (!session.expiresAt) return false;
  return session.expiresAt <= Date.now();
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

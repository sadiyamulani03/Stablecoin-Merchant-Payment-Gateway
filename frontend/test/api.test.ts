import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
global.fetch = fetchMock;

vi.mock("../lib/config", () => ({
  API_URL: "http://localhost:4000",
  API_URL_CONFIGURED: true,
}));
vi.mock("../lib/auth", () => ({
  getToken: vi.fn(),
}));

import { apiFetch } from "../lib/api";
import { getToken } from "../lib/auth";

const mockGetToken = vi.mocked(getToken);

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockClear();
    mockGetToken.mockReturnValue("test-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends object body JSON-stringified with auth header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    );

    await apiFetch("/api/test", { method: "POST", auth: true, body: { foo: "bar" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:4000/api/test");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer test-token",
    });
    expect(init.body).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("passes string bodies through without double-encoding", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const raw = JSON.stringify({ already: "string" });
    await apiFetch("/api/test", { method: "POST", body: raw });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(raw);
    expect(init.body).not.toBe(JSON.stringify(raw));
  });

  it("merges custom headers on top of defaults", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    );

    await apiFetch("/api/test", {
      method: "GET",
      headers: { "X-Custom": "value1", Accept: "text/plain" },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({
      "X-Custom": "value1",
      Accept: "text/plain",
    });
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("does not add Authorization when auth is false", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    );

    await apiFetch("/api/test", { method: "GET" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("throws ApiError on non-ok responses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 400, headers: { "content-type": "application/json" } })
    );

    await expect(apiFetch("/api/test")).rejects.toMatchObject({ status: 400 });
  });
});

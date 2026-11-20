import { describe, expect, it } from "vitest";
import {
  amountSchema,
  backendFieldErrors,
  descriptionSchema,
  loginSchema,
  registerSchema,
  walletAddressSchema,
  zodFieldErrors
} from "../lib/validation";

describe("amount validation", () => {
  it("accepts amounts with up to two decimals", () => {
    expect(amountSchema.safeParse("125").success).toBe(true);
    expect(amountSchema.safeParse("125.5").success).toBe(true);
    expect(amountSchema.safeParse("125.55").success).toBe(true);
  });

  it("rejects malformed, negative and zero amounts", () => {
    expect(amountSchema.safeParse("12.555").success).toBe(false);
    expect(amountSchema.safeParse("abc").success).toBe(false);
    expect(amountSchema.safeParse("-5").success).toBe(false);
    expect(amountSchema.safeParse("0").success).toBe(false);
  });
});

describe("description validation", () => {
  it("limits descriptions to 200 characters", () => {
    expect(descriptionSchema.safeParse("a".repeat(200)).success).toBe(true);
    expect(descriptionSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
});

describe("wallet address validation", () => {
  it("accepts a valid checksum-able EVM address", () => {
    expect(walletAddressSchema.safeParse("0x06289D9c452369abcb9bc1b5D6Adf80982C5679C").success).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(walletAddressSchema.safeParse("").success).toBe(false);
    expect(walletAddressSchema.safeParse("0x123").success).toBe(false);
    expect(walletAddressSchema.safeParse("not-an-address").success).toBe(false);
  });
});

describe("login validation", () => {
  it("requires a valid email and a password", () => {
    expect(loginSchema.safeParse({ email: "merchant@example.com", password: "secret" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "secret" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "merchant@example.com", password: "" }).success).toBe(false);
  });
});

describe("registration validation", () => {
  const valid = {
    name: "Al Noor Trading",
    tradeLicense: "DED-123456",
    emirate: "Dubai",
    category: "Retail",
    settlementPreference: "stablecoin" as const,
    walletAddress: "0x06289D9c452369abcb9bc1b5D6Adf80982C5679C",
    email: "merchant@example.com",
    password: "long-enough-password"
  };

  it("accepts a complete merchant profile", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a password of at least ten characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("requires a receiving wallet address", () => {
    expect(registerSchema.safeParse({ ...valid, walletAddress: "" }).success).toBe(false);
  });
});

describe("error mapping", () => {
  it("keeps the first message per field from zod issues", () => {
    const result = registerSchema.safeParse({
      name: "A",
      tradeLicense: "",
      emirate: "",
      category: "",
      settlementPreference: "stablecoin",
      walletAddress: "0x123",
      email: "bad",
      password: "short"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = zodFieldErrors(result.error);
      expect(errors.name).toBeDefined();
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
    }
  });

  it("maps backend field errors into single-line messages", () => {
    expect(backendFieldErrors({ email: ["Already registered", "Second"] })).toEqual({
      email: "Already registered"
    });
    expect(backendFieldErrors(undefined)).toEqual({});
  });
});

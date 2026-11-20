import { isAddress } from "ethers";
import { z } from "zod";

export const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export const amountSchema = z
  .string()
  .trim()
  .regex(AMOUNT_PATTERN, "Enter an amount with up to two decimals, for example 125.50")
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");

export const descriptionSchema = z.string().max(200, "Description must be 200 characters or fewer");

export const walletAddressSchema = z
  .string()
  .trim()
  .min(1, "A receiving wallet address is required")
  .refine((value) => isAddress(value), "Enter a valid EVM address starting with 0x");

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password")
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Business name must be at least 2 characters"),
  tradeLicense: z.string().trim().min(2, "Trade licence reference is required"),
  emirate: z.string().trim().min(2, "Select an emirate"),
  category: z.string().trim().min(2, "Select a business category"),
  settlementPreference: z.enum(["stablecoin", "partner-fiat"]),
  walletAddress: walletAddressSchema,
  email: z.email("Enter a valid email address"),
  password: z.string().min(10, "Use a password with at least 10 characters")
});

export const subscriptionSchema = z.object({
  merchant: walletAddressSchema,
  amount: amountSchema,
  topUp: amountSchema,
  period: z.number().int().positive()
});

export type FieldErrors = Record<string, string>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function backendFieldErrors(fieldErrors: Record<string, string[] | undefined> | undefined): FieldErrors {
  const errors: FieldErrors = {};
  for (const [key, messages] of Object.entries(fieldErrors ?? {})) {
    if (Array.isArray(messages) && messages.length > 0) errors[key] = messages[0];
  }
  return errors;
}

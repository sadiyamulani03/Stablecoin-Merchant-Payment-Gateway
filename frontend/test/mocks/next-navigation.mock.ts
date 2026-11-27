import { useCallback } from "react";
import { vi } from "vitest";

export const useRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  beforePopState: vi.fn(),
});

export const usePathname = () => "/login";

export const useSearchParams = () => new URLSearchParams();

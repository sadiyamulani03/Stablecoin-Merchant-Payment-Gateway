import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "^next/navigation$": path.resolve(__dirname, "./test/mocks/next-navigation.mock.ts"),
      "^next/link$": path.resolve(__dirname, "./test/mocks/next-link.mock.ts"),
    },
  },
});

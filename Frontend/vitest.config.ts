import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@/common": path.resolve(__dirname, "src/common")
    }
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.spec.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}"
    ],
    reporters: "verbose",
    coverage: {
      enabled: false
    }
  }
});

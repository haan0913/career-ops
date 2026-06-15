import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal unit-test setup for pure web/lib logic (fit scoring, classifiers).
// DB-coupled modules (anything importing "server-only" / @/db) are out of scope.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});

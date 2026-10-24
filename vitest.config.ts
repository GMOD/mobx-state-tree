import { defineConfig } from "vitest/config"

export default defineConfig(({ mode }) => ({
  test: {
    env: { NODE_ENV: mode },
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    setupFiles: ["__tests__/setup.ts"],
    benchmark: {
      include: ["__tests__/**/*.bench.ts"]
    }
  }
}))

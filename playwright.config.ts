import { defineConfig, devices } from "@playwright/test";

const demoURL = "http://127.0.0.1:4173";
const liveURL = "http://127.0.0.1:4174";
const mockMarket = "http://127.0.0.1:18787";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: [
    {
      command: "node e2e/mock-live-market.mjs",
      url: `${mockMarket}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort`,
      url: demoURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `VITE_MARKET_URL=${mockMarket} npx vite --host 127.0.0.1 --port 4174 --strictPort`,
      url: liveURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: /live-proxy\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: demoURL },
    },
    {
      name: "live-proxy",
      testMatch: /live-proxy\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: liveURL },
    },
  ],
});

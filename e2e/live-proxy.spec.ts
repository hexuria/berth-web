import { expect, test } from "@playwright/test";

test.describe("live Vite proxy (in-process mock market)", () => {
  test("banner is Live market and catalog arrives via /mkt", async ({ page }) => {
    const listings = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/mkt/listings" && response.request().method() === "GET";
    });
    await page.goto("/#/buyer");
    await expect(page.getByTestId("mode-banner")).toContainText("Live market");
    const catalogResponse = await listings;
    expect(catalogResponse.ok()).toBe(true);
    await expect(page.getByTestId("listing-weather.now")).toBeVisible();
    await expect(page.getByTestId("listing-gpu-box.session")).toBeVisible();
    await expect(page.getByTestId("listing-mainnet.stored")).toContainText("eip155:8453");
    await expect(page.getByTestId("new-listing")).toBeVisible();
  });

  test("MemoryWallet create/fund enables test pay; receipt is payTo_100 accounting", async ({ page }) => {
    await page.goto("/#/buyer");
    await expect(page.getByTestId("listing-weather.now")).toBeVisible();
    await page.getByTestId("listing-weather.now").getByRole("button", { name: "Invoke unpaid" }).click();

    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(quote).toContainText("HTTP 402");
    await expect(quote).toContainText("MemoryWallet");
    await expect(quote).toContainText("eip155:84532");
    await expect(page.getByTestId("pay-demo")).toBeEnabled();

    await page.getByTestId("pay-demo").click();
    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible();
    const split = page.getByTestId("receipt-split");
    await expect(split).toContainText("receipt accounting");
    await expect(split).toContainText("100% USDC went to payTo");
    await expect(split).not.toContainText("CDP moved 90%");
    await expect(split).not.toContainText("USDC split on Base");
  });

  test("new listing helper stays on Sepolia and does not rewrite the stored mainnet row", async ({ page }) => {
    await page.goto("/#/buyer");
    await expect(page.getByTestId("listing-mainnet.stored")).toContainText("eip155:8453");
    await page.getByTestId("new-listing").click();
    const created = page.locator("[data-testid^='listing-local.http.']").first();
    await expect(created).toBeVisible();
    await expect(created).toContainText("eip155:84532");
    await expect(page.getByTestId("listing-mainnet.stored")).toContainText("eip155:8453");
  });

  test("paid desktop.linux returns occupancy lease and a loopback berth view URL", async ({ page }) => {
    await page.goto("/#/buyer");
    await expect(page.getByTestId("listing-gpu-box.session")).toBeVisible();
    await page.getByTestId("listing-gpu-box.session").getByRole("button", { name: "Invoke unpaid" }).click();

    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(quote).toContainText("HTTP 402");
    await expect(quote).toContainText("MemoryWallet");
    await expect(page.getByTestId("pay-demo")).toBeEnabled();

    await page.getByTestId("pay-demo").click();
    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible();
    await expect(page.getByTestId("lease-id")).toHaveText(/^l_/);
    await expect(page.getByTestId("view-url")).toContainText("127.0.0.1");
    await expect(page.getByTestId("view-url")).toContainText("berth view");
    const split = page.getByTestId("receipt-split");
    await expect(split).toContainText("receipt accounting");
    await expect(split).toContainText("100% USDC went to payTo");

    await page.getByRole("button", { name: "End lease" }).click();
    await expect(receipt).toContainText("occupancySeconds=60");
    await expect(receipt).toContainText("not a second charge");
  });

  test("laptop listing is refused (forbidden_class) and is not invokable", async ({ page }) => {
    await page.goto("/#/buyer");
    const refused = page.getByTestId("refused-listing");
    await expect(refused).toBeVisible();
    await expect(refused).toContainText("daily-driver.laptop");
    await expect(refused.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(refused.getByRole("button", { name: "Invoke unpaid" })).toHaveCount(0);
  });
});

import { expect, test } from "@playwright/test";

test.describe("live Vite proxy (in-process mock market)", () => {
  test("banner is Live market and catalog arrives via /mkt", async ({ page }) => {
    const listings = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/mkt/listings" && response.request().method() === "GET";
    });
    await page.goto("/#/buyer");
    await expect(page.getByTestId("mode-banner")).toContainText("Live market");
    await expect(page.getByTestId("health-identity")).toHaveText("walletAdapter=memory facilitator=test");
    await expect(page.getByTestId("mode-banner")).not.toContainText("facilitatorUrl");
    const catalogResponse = await listings;
    expect(catalogResponse.ok()).toBe(true);
    await expect(page.getByTestId("listing-weather.now")).toBeVisible();
    await expect(page.getByTestId("listing-weather.tool")).toBeVisible();
    await expect(page.getByTestId("listing-weather.tool")).toContainText("mcp");
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

  test("MemoryWallet pays MCP SKU; receipt is payTo_100 without a lease", async ({ page }) => {
    await page.goto("/#/buyer");
    const listing = page.getByTestId("listing-weather.tool");
    await expect(listing).toBeVisible();
    await expect(listing).toContainText("mcp");
    await listing.getByRole("button", { name: "Invoke unpaid" }).click();

    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(quote).toContainText("HTTP 402");
    await expect(quote).toContainText("MemoryWallet");
    await expect(quote).toContainText("eip155:84532");
    await expect(page.getByTestId("pay-demo")).toBeEnabled();

    await page.getByTestId("pay-demo").click();
    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText("eip155:84532");
    const split = page.getByTestId("receipt-split");
    await expect(split).toContainText("receipt accounting");
    await expect(split).toContainText("100% USDC went to payTo");
    await expect(split).not.toContainText("CDP moved 90%");
    await expect(split).not.toContainText("USDC split on Base");
    await expect(page.getByTestId("lease-id")).toHaveCount(0);
    await expect(page.getByTestId("view-url")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "End lease" })).toHaveCount(0);
    await expect(receipt).not.toContainText("occupancySeconds");
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
    await expect(page.getByTestId("view-url")).toContainText("berth mcp");
    const split = page.getByTestId("receipt-split");
    await expect(split).toContainText("receipt accounting");
    await expect(split).toContainText("100% USDC went to payTo");

    await page.getByRole("button", { name: "End lease" }).click();
    await expect(receipt).toContainText("occupancySeconds=60");
    await expect(receipt).toContainText("not a second charge");
    await expect(page.getByTestId("view-url")).toHaveCount(0);
  });

  test("CDP / live facilitator health disables Pay with test signature", async ({ page }) => {
    await page.route("**/mkt/health", async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("walletAdapter", "cdp");
      url.searchParams.set("facilitator", "live");
      url.searchParams.set("facilitatorUrl", "https://x402.org/facilitator");
      const response = await route.fetch({ url: url.toString() });
      await route.fulfill({ response });
    });

    await page.goto("/#/buyer");
    await expect(page.getByTestId("health-identity")).toHaveText("walletAdapter=cdp facilitator=live");
    await expect(page.getByTestId("mode-banner")).not.toContainText("x402.org");
    await expect(page.getByTestId("pay-blocked")).toBeVisible();
    await expect(page.getByTestId("pay-blocked")).toContainText("WALLET_ADAPTER=cdp");
    await expect(page.getByTestId("pay-blocked")).toContainText("test:");

    await page.getByTestId("listing-weather.now").getByRole("button", { name: "Invoke unpaid" }).click();
    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(page.getByTestId("pay-demo")).toBeDisabled();
    await expect(page.getByTestId("pay-blocked")).toContainText("WALLET_ADAPTER=cdp");
  });

  test("host /bos eligibility is vm-guest desktop.linux; laptop and host-desktop stay refused", async ({
    page,
  }) => {
    const eligibility = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/bos/v1/eligibility" && response.request().method() === "GET";
    });
    await page.goto("/#/host");
    const eligibilityResponse = await eligibility;
    expect(eligibilityResponse.ok()).toBe(true);

    await expect(page.getByTestId("eligibility-status")).toHaveText("eligible");
    await expect(page.getByTestId("eligibility-class")).toContainText("vm-guest");
    await expect(page.getByTestId("eligibility-kind")).toContainText("desktop.linux");

    await page.getByTestId("try-laptop").click();
    await expect(page.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(page.getByTestId("forbidden-class")).toContainText("laptop");

    await page.getByTestId("try-host-desktop").click();
    await expect(page.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(page.getByTestId("forbidden-class")).toContainText("host-desktop");
  });

  test("host parks eligible desktop.linux; buyer catalog pays and ends lease", async ({ page }) => {
    await page.goto("/#/host");
    await expect(page.getByTestId("eligibility-status")).toHaveText("eligible");
    await expect(page.getByTestId("park-guest")).toBeVisible();
    await page.getByTestId("park-listing").click();
    const parked = page.getByTestId("parked-listing");
    await expect(parked).toBeVisible();
    await expect(parked).toContainText("desktop.linux");
    await expect(parked).toContainText("eip155:84532");

    await page.getByRole("link", { name: "Buyer" }).click();
    const created = page.locator("[data-testid^='listing-parked.desktop.']").first();
    await expect(created).toBeVisible();
    await expect(created).toContainText("desktop.linux");
    await expect(created).toContainText("eip155:84532");
    await created.getByRole("button", { name: "Invoke unpaid" }).click();

    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(quote).toContainText("HTTP 402");
    await expect(quote).toContainText("eip155:84532");
    await expect(page.getByTestId("pay-demo")).toBeEnabled();

    await page.getByTestId("pay-demo").click();
    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible();
    await expect(page.getByTestId("lease-id")).toHaveText(/^l_/);
    await expect(page.getByTestId("view-url")).toContainText("127.0.0.1");
    await expect(page.getByTestId("view-url")).toContainText("berth view");
    await expect(page.getByTestId("view-url")).toContainText("berth mcp");
    const split = page.getByTestId("receipt-split");
    await expect(split).toContainText("receipt accounting");
    await expect(split).toContainText("100% USDC went to payTo");

    await page.getByRole("button", { name: "End lease" }).click();
    await expect(receipt).toContainText("occupancySeconds=60");
    await expect(receipt).toContainText("not a second charge");
    await expect(page.getByTestId("view-url")).toHaveCount(0);

    await page.getByRole("link", { name: "Host" }).click();
    const hostReceipt = page.getByTestId("host-receipt");
    await expect(hostReceipt).toBeVisible();
    await expect(page.getByTestId("host-lease-state")).toHaveText("ended");
    await expect(page.getByTestId("host-occupancy")).toContainText("occupancySeconds=60");
    const hostSplit = page.getByTestId("host-receipt-split");
    await expect(hostSplit).toContainText("receipt accounting");
    await expect(hostSplit).toContainText("90%");
    await expect(hostSplit).toContainText("10%");
    await expect(hostSplit).toContainText("100% USDC went to payTo");
    await expect(hostSplit).not.toContainText("CDP moved 90%");
    await expect(hostSplit).not.toContainText("USDC split on Base");
    await expect(page.getByTestId("view-url")).toHaveCount(0);
    await expect(page.getByTestId("host-earn")).not.toContainText("berth view");
    await page.getByTestId("try-laptop").click();
    await expect(page.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(page.getByTestId("forbidden-class")).toContainText("laptop");
    await page.getByTestId("try-host-desktop").click();
    await expect(page.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(page.getByTestId("forbidden-class")).toContainText("host-desktop");
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

import { expect, test } from "@playwright/test";

test.describe("buyer catalog and 402 → receipt", () => {
  test("CI default is demo MSW (no live market, no CORS proxy needed)", async ({ page }) => {
    await page.goto("/#/buyer");
    await expect(page.getByTestId("mode-banner")).toContainText("Demo mode");
  });

  test("buyer sees catalog, unpaid invoke shows 402, demo pay shows receipt", async ({ page }) => {
    await page.goto("/#/buyer");
    const catalog = page.getByTestId("catalog");
    await expect(catalog).toBeVisible();
    await expect(page.getByTestId("listing-weather.now")).toBeVisible();
    await expect(page.getByTestId("listing-weather.tool")).toBeVisible();
    await expect(page.getByTestId("listing-weather.tool")).toContainText("mcp");
    await expect(page.getByTestId("listing-gpu-box.session")).toBeVisible();

    await page.getByTestId("listing-gpu-box.session").getByRole("button", { name: "Invoke unpaid" }).click();
    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(quote).toContainText("HTTP 402");
    await expect(quote).toContainText("eip155:84532");

    await page.getByTestId("pay-demo").click();
    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible();
    await expect(page.getByTestId("lease-id")).toContainText("l_demo_lease");
    await expect(page.getByTestId("view-url")).toContainText("127.0.0.1");
    await expect(page.getByTestId("view-url")).toContainText("berth view");
    await expect(page.getByTestId("view-url")).toContainText("berth mcp");
    await page.getByRole("button", { name: "End lease" }).click();
    await expect(page.getByTestId("receipt")).toContainText("occupancySeconds=60");
    await expect(page.getByTestId("view-url")).toHaveCount(0);
  });

  test("MCP catalog row pays like HTTP: 402 then receipt, no lease", async ({ page }) => {
    await page.goto("/#/buyer");
    const listing = page.getByTestId("listing-weather.tool");
    await expect(listing).toBeVisible();
    await expect(listing).toContainText("mcp");
    await listing.getByRole("button", { name: "Invoke unpaid" }).click();

    const quote = page.getByTestId("quote");
    await expect(quote).toBeVisible();
    await expect(quote).toContainText("HTTP 402");
    await expect(quote).toContainText("eip155:84532");

    await page.getByTestId("pay-demo").click();
    const receipt = page.getByTestId("receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText("eip155:84532");
    const split = page.getByTestId("receipt-split");
    await expect(split).toContainText("receipt accounting");
    await expect(split).not.toContainText("CDP moved 90%");
    await expect(page.getByTestId("lease-id")).toHaveCount(0);
    await expect(page.getByTestId("view-url")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "End lease" })).toHaveCount(0);
    await expect(receipt).not.toContainText("occupancySeconds");
  });

  test("laptop listing is refused in the UI", async ({ page }) => {
    await page.goto("/#/buyer");
    const refused = page.getByTestId("refused-listing");
    await expect(refused).toBeVisible();
    await expect(refused).toContainText("daily-driver.laptop");
    await expect(refused.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(refused.getByRole("button", { name: "Invoke unpaid" })).toHaveCount(0);

    await page.goto("/#/host");
    await expect(page.getByTestId("host-page")).toBeVisible();
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

  test("host parks eligible desktop.linux and buyer catalog shows it", async ({ page }) => {
    await page.goto("/#/host");
    await expect(page.getByTestId("eligibility-status")).toHaveText("eligible");
    await expect(page.getByTestId("park-guest")).toBeVisible();
    await page.getByTestId("park-listing").click();
    await expect(page.getByTestId("parked-listing")).toContainText("desktop.linux");
    await expect(page.getByTestId("parked-listing")).toContainText("eip155:84532");

    await page.getByRole("link", { name: "Buyer" }).click();
    const created = page.locator("[data-testid^='listing-parked.desktop.']").first();
    await expect(created).toBeVisible();
    await expect(created).toContainText("desktop.linux");
    await created.getByRole("button", { name: "Invoke unpaid" }).click();
    await expect(page.getByTestId("quote")).toContainText("HTTP 402");
    await page.getByTestId("pay-demo").click();
    await expect(page.getByTestId("lease-id")).toHaveText(/^l_/);
    await expect(page.getByTestId("view-url")).toContainText("127.0.0.1");
    await expect(page.getByTestId("view-url")).toContainText("berth view");
    await expect(page.getByTestId("view-url")).toContainText("berth mcp");
    await page.getByRole("button", { name: "End lease" }).click();
    await expect(page.getByTestId("receipt")).toContainText("occupancySeconds=60");
    await expect(page.getByTestId("receipt")).toContainText("not a second charge");
    await expect(page.getByTestId("view-url")).toHaveCount(0);
  });
});

import { expect, test } from "@playwright/test";

test.describe("buyer catalog and 402 → receipt", () => {
  test("buyer sees catalog, unpaid invoke shows 402, demo pay shows receipt", async ({ page }) => {
    await page.goto("/#/buyer");
    const catalog = page.getByTestId("catalog");
    await expect(catalog).toBeVisible();
    await expect(page.getByTestId("listing-weather.now")).toBeVisible();
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
    await page.getByTestId("try-laptop").click();
    await expect(page.getByTestId("forbidden-class")).toContainText("forbidden_class");
    await expect(page.getByTestId("forbidden-class")).toContainText("laptop");
  });
});

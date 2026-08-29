import { expect, type Page } from "@playwright/test";

/** Same key HostPage uses so this test can poll GET /receipts?listingId= after pay. */
const PARKED_LISTING_KEY = "berth-web:parked-listing";
export const CDP_SPLIT_LISTING_ID = "lst_cdp_split";
export const CDP_SPLIT_LISTING_TITLE = "cdp-split.now";

const SEEDED_PARKED = {
  id: CDP_SPLIT_LISTING_ID,
  kind: "http",
  title: CDP_SPLIT_LISTING_TITLE,
  price: { amount: "1000", asset: "USDC" as const, network: "eip155:84532" },
};

export async function payCdpSplitListing(page: Page): Promise<void> {
  await page.goto("/#/buyer");
  const listing = page.getByTestId(`listing-${CDP_SPLIT_LISTING_TITLE}`);
  await expect(listing).toBeVisible();
  await listing.getByRole("button", { name: "Invoke unpaid" }).click();

  const quote = page.getByTestId("quote");
  await expect(quote).toBeVisible();
  await expect(quote).toContainText("HTTP 402");
  await expect(quote).toContainText("eip155:84532");
  await expect(page.getByTestId("pay-demo")).toBeEnabled();

  await page.getByTestId("pay-demo").click();
  const receipt = page.getByTestId("receipt");
  await expect(receipt).toBeVisible();
  const split = page.getByTestId("receipt-split");
  await expect(split).toContainText("receipt accounting");
  await expect(split).toContainText("CDP moved 90%");
  await expect(split).toContainText("That matches this receipt");
  await expect(split).not.toContainText("100% USDC went to payTo");
  await expect(page.getByTestId("lease-id")).toHaveCount(0);
  await expect(page.getByTestId("view-url")).toHaveCount(0);
}

export async function assertHostCdpSplitForSeededListing(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, listing }) => {
      sessionStorage.setItem(key, JSON.stringify(listing));
    },
    { key: PARKED_LISTING_KEY, listing: SEEDED_PARKED },
  );
  await page.goto("/#/host");
  const hostSplit = page.getByTestId("host-receipt-split");
  await expect(hostSplit).toBeVisible();
  await expect(hostSplit).toContainText("receipt accounting");
  await expect(hostSplit).toContainText("CDP moved 90%");
  await expect(hostSplit).toContainText("That matches this receipt");
  await expect(hostSplit).not.toContainText("100% USDC went to payTo");
  await expect(page.getByTestId("view-url")).toHaveCount(0);
  await expect(page.getByTestId("host-earn")).not.toContainText("berth view");
  await expect(page.getByTestId("host-earn")).not.toContainText("berth mcp");
}

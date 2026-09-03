import { expect, type Locator, type Page } from "@playwright/test";
import {
  DEMO_HTTP_LISTING_ID,
  DEMO_SEPOLIA_TX_HASH,
  DEMO_SEPOLIA_TX_LISTING_ID,
  DEMO_SEPOLIA_TX_LISTING_TITLE,
  testFacilitatorSettleId,
} from "../src/mocks/data";

const PARKED_LISTING_KEY = "berth-web:parked-listing";
const SEPOLIA_EXPLORER = `https://sepolia.basescan.org/tx/${DEMO_SEPOLIA_TX_HASH}`;
const TEST_FACILITATOR_ID = testFacilitatorSettleId(DEMO_HTTP_LISTING_ID);

const SEEDED_SEPOLIA_PARKED = {
  id: DEMO_SEPOLIA_TX_LISTING_ID,
  kind: "http",
  title: DEMO_SEPOLIA_TX_LISTING_TITLE,
  price: { amount: "1000", asset: "USDC" as const, network: "eip155:84532" },
};

const SEEDED_WEATHER_PARKED = {
  id: DEMO_HTTP_LISTING_ID,
  kind: "http",
  title: "weather.now",
  price: { amount: "1000", asset: "USDC" as const, network: "eip155:84532" },
};

export { DEMO_SEPOLIA_TX_HASH, SEPOLIA_EXPLORER, TEST_FACILITATOR_ID };

async function payListing(page: Page, title: string): Promise<Locator> {
  await page.goto("/#/buyer");
  const listing = page.getByTestId(`listing-${title}`);
  await expect(listing).toBeVisible();
  await listing.getByRole("button", { name: "Invoke unpaid" }).click();
  await expect(page.getByTestId("quote")).toBeVisible();
  await page.getByTestId("pay-demo").click();
  const receipt = page.getByTestId("receipt");
  await expect(receipt).toBeVisible();
  return receipt;
}

export async function paySepoliaSettleListing(page: Page): Promise<void> {
  const receipt = await payListing(page, DEMO_SEPOLIA_TX_LISTING_TITLE);
  const link = receipt.getByTestId("receipt-tx-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", SEPOLIA_EXPLORER);
  await expect(link).toContainText("Basescan Sepolia");
  await expect(receipt.getByTestId("receipt-tx-hash")).toHaveText(DEMO_SEPOLIA_TX_HASH);
  await expect(receipt.getByTestId("receipt-tx-offchain")).toHaveCount(0);
  await expect(receipt.getByTestId("receipt-tx")).not.toContainText("did not touch a chain");
  const split = page.getByTestId("receipt-split");
  await expect(split).toContainText("100% USDC went to payTo");
}

export async function payTestFacilitatorListing(page: Page): Promise<void> {
  const receipt = await payListing(page, "weather.now");
  await expect(receipt.getByTestId("receipt-tx-link")).toHaveCount(0);
  await expect(receipt.getByTestId("receipt-tx-id")).toHaveText(TEST_FACILITATOR_ID);
  await expect(receipt.getByTestId("receipt-tx-offchain")).toContainText("did not touch a chain");
  await expect(receipt.getByTestId("receipt-tx")).not.toContainText("sepolia.basescan.org");
  await expect(receipt.getByTestId("receipt-tx")).not.toContainText("undefined");
}

export async function assertHostSepoliaTx(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, listing }) => {
      sessionStorage.setItem(key, JSON.stringify(listing));
    },
    { key: PARKED_LISTING_KEY, listing: SEEDED_SEPOLIA_PARKED },
  );
  await page.goto("/#/host");
  const host = page.getByTestId("host-receipt");
  await expect(host).toBeVisible();
  const link = host.getByTestId("host-receipt-tx-link");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", SEPOLIA_EXPLORER);
  await expect(host.getByTestId("host-receipt-tx-hash")).toHaveText(DEMO_SEPOLIA_TX_HASH);
  await expect(host.getByTestId("host-receipt-tx-offchain")).toHaveCount(0);
}

export async function assertHostTestFacilitatorTx(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, listing }) => {
      sessionStorage.setItem(key, JSON.stringify(listing));
    },
    { key: PARKED_LISTING_KEY, listing: SEEDED_WEATHER_PARKED },
  );
  await page.goto("/#/host");
  const host = page.getByTestId("host-receipt");
  await expect(host).toBeVisible();
  await expect(host.getByTestId("host-receipt-tx-link")).toHaveCount(0);
  await expect(host.getByTestId("host-receipt-tx-id")).toHaveText(TEST_FACILITATOR_ID);
  await expect(host.getByTestId("host-receipt-tx-offchain")).toContainText("did not touch a chain");
  await expect(page.getByTestId("host-earn")).not.toContainText("sepolia.basescan.org");
}

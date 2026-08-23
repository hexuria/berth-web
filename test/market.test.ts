import { describe, expect, it } from "vitest";
import { fetchViewUrl } from "../src/lib/berthos";
import { decideListing } from "../src/lib/listing-guard";
import { createListing, fetchCatalog, fetchWallet, invokeListing } from "../src/lib/market";
import { encodeDemoPaymentSignature } from "../src/lib/payment";
import {
  DEMO_DESKTOP_LISTING_ID,
  DEMO_HTTP_LISTING_ID,
  DEMO_LAPTOP_LISTING_ID,
  DEMO_LEASE_ID,
  DEMO_VIEW_URL,
} from "../src/mocks/data";
import { DEMO_WALLET_ID } from "../src/lib/config";
import { BASE_SEPOLIA_CAIP2 } from "../src/lib/types";

describe("mocked market integration", () => {
  it("returns a catalog that includes a leaked laptop row", async () => {
    const listings = await fetchCatalog();
    const titles = listings.map((row) => row.title);
    expect(titles).toContain("weather.now");
    expect(titles).toContain("gpu-box.session");
    expect(listings.some((row) => row.id === DEMO_LAPTOP_LISTING_ID)).toBe(true);
  });

  it("unpaid invoke → 402 quote; demo pay → receipt + leaseId", async () => {
    const unpaid = await invokeListing(DEMO_HTTP_LISTING_ID);
    expect(unpaid.status).toBe(402);
    expect(unpaid.quote?.x402Version).toBe(2);
    expect(unpaid.error?.code).toBe("payment_required");

    const wallet = await fetchWallet(DEMO_WALLET_ID);
    const signature = encodeDemoPaymentSignature(unpaid.quote!, wallet);
    const paid = await invokeListing(DEMO_HTTP_LISTING_ID, signature);
    expect(paid.status).toBe(200);
    expect(paid.receipt?.id).toMatch(/^rct_/);
    expect(paid.receipt?.network).toBe(BASE_SEPOLIA_CAIP2);
    expect(paid.receipt?.sellerAtomic).toBe("900");
    expect(paid.receipt?.protocolAtomic).toBe("100");
  });

  it("desktop pay returns leaseId and a berthos view URL", async () => {
    const unpaid = await invokeListing(DEMO_DESKTOP_LISTING_ID);
    expect(unpaid.status).toBe(402);
    const wallet = await fetchWallet(DEMO_WALLET_ID);
    const paid = await invokeListing(DEMO_DESKTOP_LISTING_ID, encodeDemoPaymentSignature(unpaid.quote!, wallet));
    expect(paid.status).toBe(200);
    expect(paid.receipt?.leaseId).toBe(DEMO_LEASE_ID);
    expect(paid.fulfillment?.leaseId).toBe(DEMO_LEASE_ID);
    const view = await fetchViewUrl(DEMO_LEASE_ID);
    expect(view?.viewer_url).toBe(DEMO_VIEW_URL);
    expect(view?.target).toBe("guest");
  });

  it("POST laptop listing is rejected with forbidden_class", async () => {
    const decision = decideListing({ kind: "laptop", class: "laptop" });
    expect(decision.ok).toBe(false);
    const result = await createListing({
      kind: "laptop",
      title: "daily-driver.laptop",
      price: { amount: "1000", asset: "USDC", network: BASE_SEPOLIA_CAIP2 },
      payTo: "0x1111111111111111111111111111111111111111",
      class: "laptop",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("forbidden_class");
      expect(result.status).toBe(400);
    }
  });
});

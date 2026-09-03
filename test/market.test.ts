import { describe, expect, it } from "vitest";
import { fetchViewUrl } from "../src/lib/berthos";
import { decideListing } from "../src/lib/listing-guard";
import {
  createAgent,
  createListing,
  endReceipt,
  fetchCatalog,
  fetchReceipts,
  fetchWallet,
  fundWallet,
  invokeListing,
} from "../src/lib/market";
import { onChainSettlementFor, transactionFor } from "../src/mocks/handlers";
import { newDesktopListingInput, newHttpListingInput } from "../src/lib/listing-defaults";
import { encodeDemoPaymentSignature } from "../src/lib/payment";
import {
  DEMO_CDP_SPLIT_LISTING_ID,
  DEMO_DESKTOP_LISTING_ID,
  DEMO_HTTP_LISTING_ID,
  DEMO_MCP_LISTING_ID,
  DEMO_LAPTOP_LISTING_ID,
  DEMO_LEASE_ID,
  DEMO_SEPOLIA_TX_HASH,
  DEMO_SEPOLIA_TX_LISTING_ID,
  DEMO_VIEW_URL,
  eligibleDoctorReport,
  testFacilitatorSettleId,
} from "../src/mocks/data";
import { DEMO_WALLET_ID } from "../src/lib/config";
import { BASE_SEPOLIA_CAIP2 } from "../src/lib/types";

describe("mocked market integration", () => {
  it("returns a catalog that includes a leaked laptop row", async () => {
    const listings = await fetchCatalog();
    const titles = listings.map((row) => row.title);
    expect(titles).toContain("weather.now");
    expect(titles).toContain("weather.tool");
    expect(titles).toContain("gpu-box.session");
    expect(titles).toContain("cdp-split.now");
    expect(titles).toContain("sepolia-settle.now");
    expect(listings.some((row) => row.id === DEMO_MCP_LISTING_ID && row.kind === "mcp")).toBe(true);
    expect(listings.some((row) => row.id === DEMO_CDP_SPLIT_LISTING_ID && row.kind === "http")).toBe(true);
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
    expect(paid.receipt?.leaseId).toBeUndefined();
    expect(paid.receipt?.onChainSettlement).toBeUndefined();
    expect(paid.receipt?.transaction).toBe(testFacilitatorSettleId(DEMO_HTTP_LISTING_ID));
    expect(paid.fulfillment?.status).toBe("accepted");
  });

  it("onChainSettlementFor is label-only: seed id or query flag, never default MemoryWallet", () => {
    expect(onChainSettlementFor("lst_cdp_split", "http://127.0.0.1:8787/listings/lst_cdp_split/invoke")).toBe(
      "cdp_split_90_10",
    );
    expect(
      onChainSettlementFor(
        "lst_weather",
        "http://127.0.0.1:8787/listings/lst_weather/invoke?onChainSettlement=cdp_split_90_10",
      ),
    ).toBe("cdp_split_90_10");
    expect(onChainSettlementFor("lst_weather", "http://127.0.0.1:8787/listings/lst_weather/invoke")).toBeUndefined();
    expect(
      onChainSettlementFor("lst_sepolia_tx", "http://127.0.0.1:8787/listings/lst_sepolia_tx/invoke"),
    ).toBe("payTo_100");
  });

  it("transactionFor is a Sepolia hash only for the sepolia-settle SKU", () => {
    expect(transactionFor(DEMO_SEPOLIA_TX_LISTING_ID)).toBe(DEMO_SEPOLIA_TX_HASH);
    expect(transactionFor(DEMO_HTTP_LISTING_ID)).toBe(testFacilitatorSettleId(DEMO_HTTP_LISTING_ID));
    expect(transactionFor(DEMO_HTTP_LISTING_ID)).not.toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("sepolia-settle SKU stores a realistic hash and payTo_100 for explorer display", async () => {
    const unpaid = await invokeListing(DEMO_SEPOLIA_TX_LISTING_ID);
    expect(unpaid.status).toBe(402);
    const wallet = await fetchWallet(DEMO_WALLET_ID);
    const paid = await invokeListing(
      DEMO_SEPOLIA_TX_LISTING_ID,
      encodeDemoPaymentSignature(unpaid.quote!, wallet),
    );
    expect(paid.status).toBe(200);
    expect(paid.receipt?.transaction).toBe(DEMO_SEPOLIA_TX_HASH);
    expect(paid.receipt?.network).toBe(BASE_SEPOLIA_CAIP2);
    expect(paid.receipt?.onChainSettlement).toBe("payTo_100");
    expect(paid.receipt?.leaseId).toBeUndefined();

    const listed = await fetchReceipts(DEMO_SEPOLIA_TX_LISTING_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.transaction).toBe(DEMO_SEPOLIA_TX_HASH);
    expect(listed[0]?.onChainSettlement).toBe("payTo_100");
  });

  it("cdp-split SKU stores onChainSettlement for buyer pay and host poll", async () => {
    const unpaid = await invokeListing(DEMO_CDP_SPLIT_LISTING_ID);
    expect(unpaid.status).toBe(402);
    const wallet = await fetchWallet(DEMO_WALLET_ID);
    const paid = await invokeListing(DEMO_CDP_SPLIT_LISTING_ID, encodeDemoPaymentSignature(unpaid.quote!, wallet));
    expect(paid.status).toBe(200);
    expect(paid.receipt?.onChainSettlement).toBe("cdp_split_90_10");
    expect(paid.receipt?.sellerAtomic).toBe("900");
    expect(paid.receipt?.protocolAtomic).toBe("100");
    expect(paid.receipt?.leaseId).toBeUndefined();

    const listed = await fetchReceipts(DEMO_CDP_SPLIT_LISTING_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.onChainSettlement).toBe("cdp_split_90_10");
    expect(listed[0]?.listingId).toBe(DEMO_CDP_SPLIT_LISTING_ID);
  });

  it("mcp pay returns 200 without a lease or occupancy", async () => {
    const unpaid = await invokeListing(DEMO_MCP_LISTING_ID);
    expect(unpaid.status).toBe(402);
    expect(unpaid.quote?.x402Version).toBe(2);
    expect(unpaid.quote?.accepts[0]?.network).toBe(BASE_SEPOLIA_CAIP2);
    expect(unpaid.error?.code).toBe("payment_required");

    const wallet = await fetchWallet(DEMO_WALLET_ID);
    const paid = await invokeListing(DEMO_MCP_LISTING_ID, encodeDemoPaymentSignature(unpaid.quote!, wallet));
    expect(paid.status).toBe(200);
    expect(paid.listing?.kind).toBe("mcp");
    expect(paid.receipt?.id).toMatch(/^rct_/);
    expect(paid.receipt?.network).toBe(BASE_SEPOLIA_CAIP2);
    expect(paid.receipt?.sellerAtomic).toBe("900");
    expect(paid.receipt?.protocolAtomic).toBe("100");
    expect(paid.receipt?.leaseId).toBeUndefined();
    expect(paid.receipt?.leaseState).toBeUndefined();
    expect(paid.receipt?.occupancySeconds).toBeUndefined();
    expect(paid.fulfillment?.status).toBe("accepted");
    expect(paid.fulfillment?.leaseId).toBeUndefined();
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

  it("POST /wallets/agent + fund then test:<walletId> settles 402→200", async () => {
    const agent = await createAgent({ spendCap: "5000000", label: "berth-web-buyer" });
    const funded = await fundWallet(agent.id, "2000000");
    expect(funded.balanceAtomic).toBe("2000000");
    const unpaid = await invokeListing(DEMO_HTTP_LISTING_ID);
    const paid = await invokeListing(DEMO_HTTP_LISTING_ID, encodeDemoPaymentSignature(unpaid.quote!, funded));
    expect(paid.status).toBe(200);
    expect(paid.receipt?.payerWalletId).toBe(funded.id);
  });

  it("new listing helper defaults to Sepolia and does not rewrite mainnet", async () => {
    const sepolia = await createListing(newHttpListingInput({ title: "fresh.sepolia" }));
    expect(sepolia.ok).toBe(true);
    if (sepolia.ok) expect(sepolia.listing.price.network).toBe(BASE_SEPOLIA_CAIP2);

    const mainnet = await createListing({
      ...newHttpListingInput({ title: "kept.mainnet", network: "eip155:8453" }),
    });
    expect(mainnet.ok).toBe(true);
    if (mainnet.ok) expect(mainnet.listing.price.network).toBe("eip155:8453");
  });

  it("host park posts desktop.linux and buyer catalog can invoke it", async () => {
    const created = await createListing(
      newDesktopListingInput({ title: "parked.guest", eligibility: eligibleDoctorReport() }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.listing.kind).toBe("desktop.linux");
    expect(created.listing.class).toBe("vm-guest");
    expect(created.listing.price.network).toBe(BASE_SEPOLIA_CAIP2);

    const titles = (await fetchCatalog()).map((row) => row.title);
    expect(titles).toContain("parked.guest");

    const unpaid = await invokeListing(created.listing.id);
    expect(unpaid.status).toBe(402);
    const wallet = await fetchWallet(DEMO_WALLET_ID);
    const paid = await invokeListing(created.listing.id, encodeDemoPaymentSignature(unpaid.quote!, wallet));
    expect(paid.status).toBe(200);
    expect(paid.receipt?.leaseId).toMatch(/^l_/);
    expect(paid.receipt?.network).toBe(BASE_SEPOLIA_CAIP2);

    const live = await fetchReceipts(created.listing.id);
    expect(live).toHaveLength(1);
    expect(live[0]?.id).toBe(paid.receipt?.id);
    expect(live[0]?.listingId).toBe(created.listing.id);
    expect(live[0]?.leaseState).toBe("live");
    expect(live[0]?.sellerAtomic).toBe("900");
    expect(live[0]?.protocolAtomic).toBe("100");
    expect(live[0]?.occupancySeconds).toBeUndefined();
    expect(await fetchReceipts("lst_nobody")).toHaveLength(0);

    const ended = await endReceipt(paid.receipt!.id);
    expect(ended.error).toBeUndefined();
    expect(ended.receipt.leaseState).toBe("ended");
    const listed = await fetchReceipts(created.listing.id);
    expect(listed[0]?.leaseState).toBe("ended");
    expect(listed[0]?.occupancySeconds).toBe(60);
    expect(listed[0]?.sellerAtomic).toBe("900");
    expect(listed[0]?.protocolAtomic).toBe("100");
    const all = await fetchReceipts();
    expect(all.some((row) => row.id === paid.receipt?.id)).toBe(true);
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

import { http, HttpResponse } from "msw";
import { DEMO_BERTHOS_URL, DEMO_MARKET_URL, DEMO_WALLET_ID } from "../lib/config";
import { decideListing } from "../lib/listing-guard";
import type { Listing, PaymentPayload, PaymentRequired, Receipt, Wallet } from "../lib/types";
import { BASE_SEPOLIA_CAIP2 } from "../lib/types";
import { decodeX402Header, encodeX402Header, PAYMENT_REQUIRED_HEADER, PAYMENT_SIGNATURE_HEADER } from "../lib/x402";
import {
  DEMO_AGENT_ADDRESS,
  DEMO_DESKTOP_LISTING_ID,
  DEMO_LEASE_ID,
  DEMO_PROTOCOL_ADDRESS,
  DEMO_VIEW_URL,
  eligibleDoctorReport,
  quoteRequirements,
  seedListings,
  seedWallet,
} from "./data";

interface MarketState {
  listings: Listing[];
  wallet: Wallet;
  receipts: Map<string, Receipt>;
  nonces: Set<string>;
  leaseSeq: number;
}

function createState(): MarketState {
  return {
    listings: seedListings(),
    wallet: seedWallet(),
    receipts: new Map(),
    nonces: new Set(),
    leaseSeq: 0,
  };
}

let state = createState();

export function resetDemoMarket(): void {
  state = createState();
}

function paymentRequired(listing: Listing, url: string, error: string) {
  const quote: PaymentRequired = {
    x402Version: 2,
    error,
    resource: {
      url,
      description: listing.description ?? listing.title,
      mimeType: "application/json",
      serviceName: "berth-market",
    },
    accepts: [quoteRequirements(listing)],
    extensions: {},
  };
  return HttpResponse.json(
    { error: { code: "payment_required", message: error }, quote },
    {
      status: 402,
      headers: { [PAYMENT_REQUIRED_HEADER]: encodeX402Header(quote) },
    },
  );
}

function splitProceeds(amountAtomic: string): { sellerAtomic: string; protocolAtomic: string } {
  const amount = BigInt(amountAtomic);
  const protocol = (amount * 1000n) / 10_000n;
  return { sellerAtomic: (amount - protocol).toString(), protocolAtomic: protocol.toString() };
}

export const handlers = [
  http.get(`${DEMO_MARKET_URL}/health`, () =>
    HttpResponse.json({
      ok: true,
      service: "berth-market",
      asset: "USDC",
      network: BASE_SEPOLIA_CAIP2,
      stagingNetwork: BASE_SEPOLIA_CAIP2,
      protocolCutBps: 1000,
      demo: true,
    }),
  ),

  http.get(`${DEMO_MARKET_URL}/listings`, () => HttpResponse.json({ listings: state.listings })),

  http.get(`${DEMO_MARKET_URL}/listings/:id`, ({ params }) => {
    const listing = state.listings.find((row) => row.id === params.id);
    if (!listing) {
      return HttpResponse.json({ error: { code: "not_found", message: "listing not found" } }, { status: 404 });
    }
    return HttpResponse.json({ listing });
  }),

  http.post(`${DEMO_MARKET_URL}/listings`, async ({ request }) => {
    const input = (await request.json()) as Listing;
    const decision = decideListing(input);
    if (!decision.ok) {
      return HttpResponse.json({ error: { code: decision.code, message: decision.message } }, { status: 400 });
    }
    const listing: Listing = {
      ...input,
      id: `lst_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      price: {
        amount: input.price.amount,
        asset: "USDC",
        network: input.price.network || BASE_SEPOLIA_CAIP2,
      },
    };
    state.listings.push(listing);
    return HttpResponse.json({ listing }, { status: 201 });
  }),

  http.get(`${DEMO_MARKET_URL}/listings/:id/invoke`, async ({ request, params }) => {
    const listing = state.listings.find((row) => row.id === params.id);
    if (!listing) {
      return HttpResponse.json({ error: { code: "not_found", message: "listing not found" } }, { status: 404 });
    }
    const leaked = decideListing(listing);
    if (!leaked.ok) {
      return HttpResponse.json({ error: { code: leaked.code, message: leaked.message } }, { status: 400 });
    }

    const signatureHeader = request.headers.get(PAYMENT_SIGNATURE_HEADER);
    if (!signatureHeader) {
      return paymentRequired(listing, request.url, "PAYMENT-SIGNATURE header is required");
    }

    let payload: PaymentPayload;
    try {
      payload = decodeX402Header<PaymentPayload>(signatureHeader);
    } catch {
      return paymentRequired(listing, request.url, "PAYMENT-SIGNATURE is not valid base64 JSON");
    }

    if (!payload.payload.signature.startsWith("test:")) {
      return paymentRequired(listing, request.url, "unsupported_signature");
    }
    const walletId = payload.payload.signature.slice("test:".length);
    if (walletId !== state.wallet.id) {
      return paymentRequired(listing, request.url, "unknown_wallet");
    }
    if (payload.accepted.amount !== listing.price.amount) {
      return paymentRequired(listing, request.url, "amount_mismatch");
    }
    if (state.nonces.has(payload.payload.authorization.nonce)) {
      return paymentRequired(
        listing,
        request.url,
        "payment already settled (replayed nonce); no second charge and no new lease",
      );
    }
    state.nonces.add(payload.payload.authorization.nonce);

    const { sellerAtomic, protocolAtomic } = splitProceeds(listing.price.amount);
    const receipt: Receipt = {
      id: `rct_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      listingId: listing.id,
      payerWalletId: DEMO_WALLET_ID,
      payerAddress: DEMO_AGENT_ADDRESS,
      sellerAddress: listing.payTo,
      protocolAddress: DEMO_PROTOCOL_ADDRESS,
      amountAtomic: listing.price.amount,
      sellerAtomic,
      protocolAtomic,
      transaction: `0x${crypto.randomUUID().replaceAll("-", "")}`,
      network: listing.price.network,
      createdAt: new Date().toISOString(),
    };

    let fulfillment: Record<string, unknown> = {
      status: "accepted",
      note: "HTTP/MCP invoke is priced here; v1 does not proxy the upstream call.",
      endpoint: listing.endpoint,
    };

    if (listing.kind === "desktop.linux" || listing.id === DEMO_DESKTOP_LISTING_ID) {
      state.leaseSeq += 1;
      const leaseId = state.leaseSeq === 1 ? DEMO_LEASE_ID : `l_demo_${state.leaseSeq}`;
      receipt.leaseId = leaseId;
      receipt.berthosUrl = DEMO_BERTHOS_URL;
      receipt.leaseState = "live";
      receipt.occupancyUnit = "seconds";
      fulfillment = {
        status: "leased",
        leaseId,
        berthosUrl: DEMO_BERTHOS_URL,
        os: "linux",
        state: "live",
        occupancyUnit: "seconds",
        note: "Isolated Linux guest is live on the Berthos node. End the lease to store occupancy seconds; they are not a second charge.",
      };
    }

    state.receipts.set(receipt.id, receipt);
    return HttpResponse.json({
      ok: true,
      listing: { id: listing.id, kind: listing.kind, title: listing.title },
      fulfillment,
      receipt,
    });
  }),

  http.get(`${DEMO_MARKET_URL}/wallets/:id`, ({ params }) => {
    if (params.id !== state.wallet.id) {
      return HttpResponse.json({ error: { code: "not_found", message: "wallet not found" } }, { status: 404 });
    }
    return HttpResponse.json({ wallet: state.wallet });
  }),

  http.get(`${DEMO_MARKET_URL}/receipts/:id`, ({ params }) => {
    const receipt = state.receipts.get(String(params.id));
    if (!receipt) {
      return HttpResponse.json({ error: { code: "not_found", message: "receipt not found" } }, { status: 404 });
    }
    return HttpResponse.json({ receipt });
  }),

  http.post(`${DEMO_MARKET_URL}/receipts/:id/end`, ({ params }) => {
    const receipt = state.receipts.get(String(params.id));
    if (!receipt) {
      return HttpResponse.json({ error: { code: "not_found", message: "receipt not found" } }, { status: 404 });
    }
    if (!receipt.leaseId) {
      return HttpResponse.json(
        { error: { code: "no_lease", message: "receipt has no Berthos lease to end" } },
        { status: 400 },
      );
    }
    if (receipt.leaseState === "ended") {
      return HttpResponse.json({
        ok: true,
        receipt,
        occupancy: {
          seconds: receipt.occupancySeconds ?? 60,
          billedSeconds: receipt.billedSeconds ?? 60,
          unit: "seconds",
          chargedHere: false,
          note: "lease already ended; occupancy is a receipt, not a second charge",
        },
      });
    }
    const updated: Receipt = {
      ...receipt,
      leaseState: "ended",
      occupancySeconds: 60,
      billedSeconds: 60,
      occupancyUnit: "seconds",
    };
    state.receipts.set(updated.id, updated);
    return HttpResponse.json({
      ok: true,
      receipt: updated,
      occupancy: {
        seconds: 60,
        billedSeconds: 60,
        minSeconds: 60,
        unit: "seconds",
        chargedHere: false,
        note: "v1 is pay-then-occupy. Occupancy seconds are a receipt, not a second x402 charge.",
      },
    });
  }),

  http.get(`${DEMO_BERTHOS_URL}/v1/eligibility`, () => HttpResponse.json(eligibleDoctorReport())),

  http.get(`${DEMO_BERTHOS_URL}/health`, () => HttpResponse.json({ ok: true, service: "berthos" })),

  http.get(`${DEMO_BERTHOS_URL}/v1/leases/:id/view`, ({ params }) => {
    if (!String(params.id).startsWith("l_")) {
      return HttpResponse.json({ error: { code: "not_found", message: "lease not found" } }, { status: 404 });
    }
    return HttpResponse.json({
      viewer_url: DEMO_VIEW_URL,
      target: "guest",
      token: "demo-lease-bearer",
    });
  }),
];

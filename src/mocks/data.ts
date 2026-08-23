import { DEMO_BERTHOS_URL, DEMO_WALLET_ID } from "../lib/config";
import { defaultListingPrice, usdcAddressFor } from "../lib/listing-defaults";
import type { EligibilityAttestation, Listing, Wallet } from "../lib/types";

export const DEMO_AGENT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const DEMO_SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
export const DEMO_PROTOCOL_ADDRESS = "0x2222222222222222222222222222222222222222";

export const DEMO_HTTP_LISTING_ID = "lst_weather";
export const DEMO_DESKTOP_LISTING_ID = "lst_gpu";
export const DEMO_LAPTOP_LISTING_ID = "lst_laptop";
export const DEMO_LEASE_ID = "l_demo_lease";
export const DEMO_VIEW_URL = "http://127.0.0.1:17900/?token=demo-lease-bearer";

export function eligibleDoctorReport(now = new Date().toISOString()): EligibilityAttestation {
  return {
    protocol: "v1",
    source: "berthos.doctor",
    ok: true,
    eligible: true,
    class: "vm-guest",
    intent: "private",
    attestedAt: now,
    timestamp: now,
    berthosUrl: DEMO_BERTHOS_URL,
    nodeId: "node_demo",
    checks: [
      {
        id: "class",
        status: "pass",
        detail: "class=vm-guest (isolated guest, not the host desktop)",
      },
      { id: "runtime", status: "pass", detail: "Docker (or equivalent) is running (mocked in demo)" },
      {
        id: "guest_image",
        status: "pass",
        detail: "berthos-linux-desktop:v1 labels ok (v1, xvfb-openbox-chromium, default-deny)",
      },
    ],
    image: {
      name: "berthos-linux-desktop:v1",
      labels: {
        "berthos.guest.version": "v1",
        "berthos.desktop": "xvfb-openbox-chromium",
        "berthos.egress.policy": "default-deny",
      },
    },
  };
}

export function seedWallet(): Wallet {
  return {
    id: DEMO_WALLET_ID,
    kind: "agent",
    label: "demo-agent",
    address: DEMO_AGENT_ADDRESS,
    spendCapAtomic: "5000000",
    spentAtomic: "0",
    balanceAtomic: "2000000",
    createdAt: "2026-08-23T00:00:00.000Z",
  };
}

export function seedListings(): Listing[] {
  const eligibility = eligibleDoctorReport("2026-08-23T07:00:00.000Z");
  return [
    {
      id: DEMO_HTTP_LISTING_ID,
      kind: "http",
      title: "weather.now",
      description: "Current conditions (demo HTTP SKU)",
      price: defaultListingPrice(),
      payTo: DEMO_SELLER_ADDRESS,
      endpoint: { url: "https://api.example.com/weather", method: "GET" },
      createdAt: "2026-08-23T07:00:00.000Z",
    },
    {
      id: DEMO_DESKTOP_LISTING_ID,
      kind: "desktop.linux",
      title: "gpu-box.session",
      description: "Isolated Linux guest fulfilled by a Berthos node",
      price: defaultListingPrice(),
      payTo: DEMO_SELLER_ADDRESS,
      class: "vm-guest",
      fulfillment: {
        berthosUrl: DEMO_BERTHOS_URL,
        sku: "linux-gpu-1",
        nodeId: "node_demo",
      },
      eligibility,
      createdAt: "2026-08-23T07:00:00.000Z",
    },
    {
      // Seeded so the UI can refuse it the same way the market API does.
      // A real market never stores this row.
      id: DEMO_LAPTOP_LISTING_ID,
      kind: "laptop",
      title: "daily-driver.laptop",
      description: "Must never be offered as a public listing",
      price: defaultListingPrice(),
      payTo: DEMO_SELLER_ADDRESS,
      class: "laptop",
      createdAt: "2026-08-23T07:00:00.000Z",
    },
  ];
}

export function quoteRequirements(listing: Listing) {
  return {
    scheme: "exact" as const,
    network: listing.price.network,
    amount: listing.price.amount,
    asset: usdcAddressFor(listing.price.network),
    payTo: listing.payTo,
    maxTimeoutSeconds: 60,
    extra: {
      name: "USDC",
      version: "2",
      listingId: listing.id,
      assetTransferMethod: "eip3009",
    },
  };
}

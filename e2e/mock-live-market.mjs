/**
 * In-process MemoryWallet stand-in for Playwright live-proxy e2e.
 * Vite proxies /mkt (market) and /bos (lease view) → this process.
 * No secrets, no Docker, no real berth-market, no real Berthos, no wallets on /v1.
 *
 * GET /health defaults to walletAdapter=memory + facilitator=test.
 * Override via query (?walletAdapter=cdp&facilitator=live&facilitatorUrl=…)
 * or MOCK_WALLET_ADAPTER / MOCK_FACILITATOR / MOCK_FACILITATOR_URL — no keys.
 *
 * Paid invokes default to onChainSettlement=payTo_100. lst_cdp_split (or
 * ?onChainSettlement=cdp_split_90_10) stores the CDP 90/10 label only — no Coinbase.
 *
 * Transaction: lst_sepolia_tx stores a realistic Base Sepolia hash (explorer
 * link). Other MemoryWallet pays store tf_settle_<listingId> (not a chain hop).
 * lst_mainnet stores a mainnet hash so the UI can show basescan.org, never Sepolia.
 */
import { createServer } from "node:http";

const PORT = Number.parseInt(process.env.MOCK_MARKET_PORT ?? "18787", 10);
const HOST = "127.0.0.1";
const SEPOLIA = "eip155:84532";
const MAINNET = "eip155:8453";
const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SELLER = "0x1111111111111111111111111111111111111111";
const PROTOCOL = "0x2222222222222222222222222222222222222222";
const LOOPBACK_VIEW = "http://127.0.0.1:17900/?token=live-lease-bearer";
const SELF = `http://${HOST}:${PORT}`;

const FORBIDDEN_KINDS = new Set([
  "laptop",
  "host-desktop",
  "host_desktop",
  "hostdesktop",
  "desktop.laptop",
  "desktop.host",
  "desktop.host-desktop",
]);
const FORBIDDEN_CLASSES = new Set(["laptop", "host-desktop", "host_desktop", "hostdesktop"]);
const LISTING_KINDS = new Set(["http", "mcp", "desktop.linux"]);

const wallets = new Map();
const receipts = new Map();
const listings = [
  {
    id: "lst_weather",
    kind: "http",
    title: "weather.now",
    description: "Live-proxy mock HTTP SKU",
    price: { amount: "1000", asset: "USDC", network: SEPOLIA },
    payTo: SELLER,
    endpoint: { url: "https://api.example.com/weather", method: "GET" },
    createdAt: "2026-08-23T07:00:00.000Z",
  },
  {
    id: "lst_weather_tool",
    kind: "mcp",
    title: "weather.tool",
    description: "Live-proxy mock MCP SKU",
    price: { amount: "1000", asset: "USDC", network: SEPOLIA },
    payTo: SELLER,
    endpoint: { url: "https://mcp.example.com/sse", method: "POST", tool: "weather" },
    createdAt: "2026-08-23T07:00:00.000Z",
  },
  {
    id: "lst_mainnet",
    kind: "http",
    title: "mainnet.stored",
    description: "Stored mainnet row — must not be rewritten to Sepolia",
    price: { amount: "1000", asset: "USDC", network: MAINNET },
    payTo: SELLER,
    createdAt: "2026-08-23T07:00:00.000Z",
  },
    {
    // Test-only SKU: paid invoke stores cdp_split_90_10 (label only — no Coinbase).
    id: "lst_cdp_split",
    kind: "http",
    title: "cdp-split.now",
    description:
      "Test-only HTTP SKU. Paid invoke stores onChainSettlement=cdp_split_90_10 so the UI can show CDP honesty copy. No Coinbase, no chain.",
    price: { amount: "1000", asset: "USDC", network: SEPOLIA },
    payTo: SELLER,
    endpoint: { url: "https://api.example.com/cdp-split", method: "GET" },
    createdAt: "2026-08-23T07:00:00.000Z",
  },
  {
    // Test-only SKU: paid invoke stores a realistic Sepolia hash + payTo_100 (display only).
    id: "lst_sepolia_tx",
    kind: "http",
    title: "sepolia-settle.now",
    description:
      "Test-only HTTP SKU. Paid invoke stores a realistic Base Sepolia tx hash plus onChainSettlement=payTo_100 so the UI can show a Basescan Sepolia link. No live settle.",
    price: { amount: "1000", asset: "USDC", network: SEPOLIA },
    payTo: SELLER,
    endpoint: { url: "https://api.example.com/sepolia-settle", method: "GET" },
    createdAt: "2026-08-23T07:00:00.000Z",
  },
  {
    id: "lst_gpu",
    kind: "desktop.linux",
    title: "gpu-box.session",
    description: "Live-proxy mock isolated Linux guest (no real Berthos)",
    price: { amount: "1000", asset: "USDC", network: SEPOLIA },
    payTo: SELLER,
    class: "vm-guest",
    fulfillment: { berthosUrl: SELF, sku: "linux-gpu-1", nodeId: "node_live_mock" },
    eligibility: {
      protocol: "v1",
      source: "berthos.doctor",
      ok: true,
      eligible: true,
      class: "vm-guest",
      attestedAt: "2026-08-23T07:00:00.000Z",
      timestamp: "2026-08-23T07:00:00.000Z",
      berthosUrl: SELF,
      nodeId: "node_live_mock",
      checks: [
        { id: "class", status: "pass", detail: "class=vm-guest (isolated guest, not the host desktop)" },
      ],
    },
    createdAt: "2026-08-23T07:00:00.000Z",
  },
  {
    // Seeded so the buyer UI can refuse it the same way the market API does.
    id: "lst_laptop",
    kind: "laptop",
    title: "daily-driver.laptop",
    description: "Must never be offered as a public listing",
    price: { amount: "1000", asset: "USDC", network: SEPOLIA },
    payTo: SELLER,
    class: "laptop",
    createdAt: "2026-08-23T07:00:00.000Z",
  },
];
const nonces = new Set();
let leaseSeq = 0;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function nextId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function nextAddress() {
  return `0x${crypto.randomUUID().replaceAll("-", "").slice(0, 40).padEnd(40, "a")}`;
}

function header(req, name) {
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase() === want) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function decodePayment(headerValue) {
  return JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
}

function healthIdentity(url) {
  const walletAdapter =
    url.searchParams.get("walletAdapter")?.trim() || process.env.MOCK_WALLET_ADAPTER?.trim() || "memory";
  const facilitator =
    url.searchParams.get("facilitator")?.trim() || process.env.MOCK_FACILITATOR?.trim() || "test";
  const facilitatorUrl =
    url.searchParams.get("facilitatorUrl")?.trim() || process.env.MOCK_FACILITATOR_URL?.trim() || "";
  return { walletAdapter, facilitator, facilitatorUrl };
}

const SEPOLIA_TX_HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const MAINNET_TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Label only. MemoryWallet pays stay payTo_100 unless this listing or query asks for the CDP copy. */
function onChainSettlementFor(listing, url) {
  const requested = url.searchParams.get("onChainSettlement");
  if (requested === "cdp_split_90_10" || listing.id === "lst_cdp_split") {
    return "cdp_split_90_10";
  }
  return "payTo_100";
}

/** Realistic Sepolia / stored-mainnet hash vs test-facilitator id. Display only. */
function transactionFor(listing) {
  if (listing.id === "lst_sepolia_tx") return SEPOLIA_TX_HASH;
  if (listing.id === "lst_mainnet") return MAINNET_TX_HASH;
  return `tf_settle_${listing.id}`;
}

function decideListing(input) {
  const kind = typeof input.kind === "string" ? input.kind.trim() : "";
  if (kind && FORBIDDEN_KINDS.has(kind)) {
    return {
      ok: false,
      code: "forbidden_class",
      message: `listings that claim kind=${kind} are rejected — only VM/server guests, never a laptop or host desktop`,
    };
  }
  if (kind && !LISTING_KINDS.has(kind)) {
    return {
      ok: false,
      code: "unsupported_kind",
      message: `unsupported listing kind "${kind}". v1 kinds: http, mcp, desktop.linux`,
    };
  }
  if (input.class && FORBIDDEN_CLASSES.has(input.class)) {
    return {
      ok: false,
      code: "forbidden_class",
      message: `class=${input.class} is forbidden. Hard rule: only VM/server guests, never a laptop or host desktop`,
    };
  }
  const eligibilityClass = input.eligibility?.class;
  if (eligibilityClass && FORBIDDEN_CLASSES.has(eligibilityClass)) {
    return {
      ok: false,
      code: "forbidden_class",
      message: `eligibility.class=${eligibilityClass} is forbidden. Hard rule: only VM/server guests, never a laptop or host desktop`,
    };
  }
  if (kind.startsWith("desktop.") && input.eligibility && input.eligibility.ok === false) {
    return {
      ok: false,
      code: "eligibility_failed",
      message: "desktop listings fail closed when the stored doctor attestation is not ok",
    };
  }
  return { ok: true };
}

function quoteFor(listing, url) {
  const network = listing.price.network;
  return {
    x402Version: 2,
    error: "PAYMENT-SIGNATURE header is required",
    resource: { url, description: listing.title, mimeType: "application/json", serviceName: "berth-market" },
    accepts: [
      {
        scheme: "exact",
        network,
        amount: listing.price.amount,
        asset: network === MAINNET ? USDC_BASE : USDC_SEPOLIA,
        payTo: listing.payTo,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2", listingId: listing.id },
      },
    ],
    extensions: {},
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/health") {
      const identity = healthIdentity(url);
      const body = {
        ok: true,
        service: "berth-market",
        asset: "USDC",
        network: SEPOLIA,
        stagingNetwork: SEPOLIA,
        walletAdapter: identity.walletAdapter,
        facilitator: identity.facilitator,
        protocolCutBps: 1000,
      };
      if (identity.facilitatorUrl) body.facilitatorUrl = identity.facilitatorUrl;
      json(res, 200, body);
      return;
    }

    if (req.method === "GET" && path === "/listings") {
      json(res, 200, { listings });
      return;
    }

    if (req.method === "POST" && path === "/listings") {
      const input = await readBody(req);
      const decision = decideListing(input);
      if (!decision.ok) {
        json(res, 400, { error: { code: decision.code, message: decision.message } });
        return;
      }
      const network = typeof input.price?.network === "string" && input.price.network.trim()
        ? input.price.network.trim()
        : SEPOLIA;
      const listing = {
        id: nextId("lst"),
        kind: input.kind ?? "http",
        title: input.title ?? "local.http",
        description: input.description,
        price: { amount: input.price?.amount ?? "1000", asset: "USDC", network },
        payTo: input.payTo ?? SELLER,
        class: input.class,
        endpoint: input.endpoint,
        fulfillment: input.fulfillment,
        eligibility: input.eligibility,
        createdAt: new Date().toISOString(),
      };
      listings.push(listing);
      json(res, 201, { listing });
      return;
    }

    const invoke = path.match(/^\/listings\/([^/]+)\/invoke$/);
    if (req.method === "GET" && invoke) {
      const listing = listings.find((row) => row.id === invoke[1]);
      if (!listing) {
        json(res, 404, { error: { code: "not_found", message: "listing not found" } });
        return;
      }
      const leaked = decideListing(listing);
      if (!leaked.ok) {
        json(res, 400, { error: { code: leaked.code, message: leaked.message } });
        return;
      }
      const signature = header(req, "PAYMENT-SIGNATURE");
      const quote = quoteFor(listing, `http://${HOST}:${PORT}${path}`);
      if (!signature) {
        json(res, 402, { error: { code: "payment_required", message: "PAYMENT-SIGNATURE header is required" }, quote });
        return;
      }
      const payload = decodePayment(signature);
      const testSig = payload?.payload?.signature ?? "";
      if (!String(testSig).startsWith("test:")) {
        json(res, 402, { error: { code: "payment_required", message: "unsupported_signature" }, quote });
        return;
      }
      const walletId = String(testSig).slice("test:".length);
      const payer = wallets.get(walletId);
      if (!payer) {
        json(res, 402, { error: { code: "payment_required", message: "unknown_wallet" }, quote });
        return;
      }
      const nonce = payload?.payload?.authorization?.nonce;
      if (nonce && nonces.has(nonce)) {
        json(res, 402, { error: { code: "payment_required", message: "replayed nonce" }, quote });
        return;
      }
      if (nonce) nonces.add(nonce);
      const amount = BigInt(listing.price.amount);
      const protocolAtomic = ((amount * 1000n) / 10_000n).toString();
      const sellerAtomic = (amount - BigInt(protocolAtomic)).toString();
      const receipt = {
        id: nextId("rct"),
        listingId: listing.id,
        payerWalletId: payer.id,
        payerAddress: payer.address,
        sellerAddress: listing.payTo,
        protocolAddress: PROTOCOL,
        amountAtomic: listing.price.amount,
        sellerAtomic,
        protocolAtomic,
        transaction: transactionFor(listing),
        network: listing.price.network,
        createdAt: new Date().toISOString(),
        onChainSettlement: onChainSettlementFor(listing, url),
      };
      let fulfillment = { status: "accepted" };
      if (listing.kind === "desktop.linux") {
        leaseSeq += 1;
        const leaseId = leaseSeq === 1 ? "l_live_lease" : `l_live_${leaseSeq}`;
        receipt.leaseId = leaseId;
        receipt.berthosUrl = SELF;
        receipt.leaseState = "live";
        receipt.occupancyUnit = "seconds";
        fulfillment = {
          status: "leased",
          leaseId,
          berthosUrl: SELF,
          os: "linux",
          state: "live",
          occupancyUnit: "seconds",
          note: "Isolated Linux guest is live. End the lease to store occupancy seconds; they are not a second charge.",
        };
      }
      receipts.set(receipt.id, receipt);
      json(res, 200, {
        ok: true,
        listing: { id: listing.id, kind: listing.kind, title: listing.title },
        fulfillment,
        receipt,
      });
      return;
    }

    if (req.method === "POST" && path === "/wallets/treasury") {
      const body = await readBody(req);
      const wallet = {
        id: nextId("wal"),
        kind: "treasury",
        label: body.label,
        address: nextAddress(),
        spendCapAtomic: "0",
        spentAtomic: "0",
        balanceAtomic: "0",
        createdAt: new Date().toISOString(),
      };
      wallets.set(wallet.id, wallet);
      json(res, 201, { wallet });
      return;
    }

    if (req.method === "POST" && path === "/wallets/agent") {
      const body = await readBody(req);
      const treasury = {
        id: nextId("wal"),
        kind: "treasury",
        label: "agent-parent",
        address: nextAddress(),
        spendCapAtomic: "0",
        spentAtomic: "0",
        balanceAtomic: "0",
        createdAt: new Date().toISOString(),
      };
      wallets.set(treasury.id, treasury);
      const wallet = {
        id: nextId("wal"),
        kind: "agent",
        label: body.label,
        address: nextAddress(),
        parentId: treasury.id,
        spendCapAtomic: body.spendCap ?? "5000000",
        spentAtomic: "0",
        balanceAtomic: "0",
        createdAt: new Date().toISOString(),
      };
      wallets.set(wallet.id, wallet);
      json(res, 201, { wallet });
      return;
    }

    const fund = path.match(/^\/wallets\/([^/]+)\/fund$/);
    if (req.method === "POST" && fund) {
      const wallet = wallets.get(fund[1]);
      if (!wallet) {
        json(res, 404, { error: { code: "not_found", message: "wallet not found" } });
        return;
      }
      const body = await readBody(req);
      const updated = {
        ...wallet,
        balanceAtomic: (BigInt(wallet.balanceAtomic) + BigInt(body.amount ?? "0")).toString(),
      };
      wallets.set(updated.id, updated);
      json(res, 200, { wallet: updated });
      return;
    }

    const getWallet = path.match(/^\/wallets\/([^/]+)$/);
    if (req.method === "GET" && getWallet) {
      const wallet = wallets.get(getWallet[1]);
      if (!wallet) {
        json(res, 404, { error: { code: "not_found", message: "wallet not found" } });
        return;
      }
      json(res, 200, { wallet });
      return;
    }

    if (req.method === "GET" && path === "/receipts") {
      const listingId = url.searchParams.get("listingId");
      const all = [...receipts.values()];
      const filtered = listingId ? all.filter((row) => row.listingId === listingId) : all;
      json(res, 200, { receipts: filtered });
      return;
    }

    const getReceipt = path.match(/^\/receipts\/([^/]+)$/);
    if (req.method === "GET" && getReceipt) {
      const receipt = receipts.get(getReceipt[1]);
      if (!receipt) {
        json(res, 404, { error: { code: "not_found", message: "receipt not found" } });
        return;
      }
      json(res, 200, { receipt });
      return;
    }

    const endReceipt = path.match(/^\/receipts\/([^/]+)\/end$/);
    if (req.method === "POST" && endReceipt) {
      const receipt = receipts.get(endReceipt[1]);
      if (!receipt) {
        json(res, 404, { error: { code: "not_found", message: "receipt not found" } });
        return;
      }
      if (!receipt.leaseId) {
        json(res, 400, { error: { code: "no_lease", message: "receipt has no Berthos lease to end" } });
        return;
      }
      if (receipt.leaseState === "ended") {
        json(res, 200, {
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
        return;
      }
      const updated = {
        ...receipt,
        leaseState: "ended",
        occupancySeconds: 60,
        billedSeconds: 60,
        occupancyUnit: "seconds",
      };
      receipts.set(updated.id, updated);
      json(res, 200, {
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
      return;
    }

    if (req.method === "GET" && path === "/v1/eligibility") {
      json(res, 200, {
        protocol: "v1",
        source: "berthos.doctor",
        ok: true,
        eligible: true,
        class: "vm-guest",
        attestedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        berthosUrl: SELF,
        nodeId: "node_live_mock",
        checks: [
          { id: "class", status: "pass", detail: "class=vm-guest (isolated guest, not the host desktop)" },
          { id: "runtime", status: "pass", detail: "mocked — this process is not Docker or a real node" },
        ],
      });
      return;
    }

    const view = path.match(/^\/v1\/leases\/([^/]+)\/view$/);
    if (req.method === "GET" && view) {
      if (!String(view[1]).startsWith("l_")) {
        json(res, 404, { error: { code: "not_found", message: "lease not found" } });
        return;
      }
      json(res, 200, {
        viewer_url: LOOPBACK_VIEW,
        target: "guest",
        token: "live-lease-bearer",
      });
      return;
    }

    json(res, 404, { error: { code: "not_found", message: `${req.method} ${path}` } });
  } catch (error) {
    json(res, 500, { error: { code: "mock_failed", message: error instanceof Error ? error.message : "mock failed" } });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`mock-live-market http://${HOST}:${PORT}\n`);
});

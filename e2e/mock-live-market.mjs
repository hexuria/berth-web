/**
 * In-process MemoryWallet stand-in for Playwright live-proxy e2e.
 * Vite proxies /mkt → this process. No secrets, no Docker, no real berth-market.
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

const wallets = new Map();
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
    id: "lst_mainnet",
    kind: "http",
    title: "mainnet.stored",
    description: "Stored mainnet row — must not be rewritten to Sepolia",
    price: { amount: "1000", asset: "USDC", network: MAINNET },
    payTo: SELLER,
    createdAt: "2026-08-23T07:00:00.000Z",
  },
];
const nonces = new Set();

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
      json(res, 200, {
        ok: true,
        service: "berth-market",
        asset: "USDC",
        network: SEPOLIA,
        stagingNetwork: SEPOLIA,
        walletAdapter: "memory",
        protocolCutBps: 1000,
      });
      return;
    }

    if (req.method === "GET" && path === "/listings") {
      json(res, 200, { listings });
      return;
    }

    if (req.method === "POST" && path === "/listings") {
      const input = await readBody(req);
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
        endpoint: input.endpoint,
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
        transaction: `0x${crypto.randomUUID().replaceAll("-", "")}`,
        network: listing.price.network,
        createdAt: new Date().toISOString(),
        onChainSettlement: "payTo_100",
      };
      json(res, 200, {
        ok: true,
        listing: { id: listing.id, kind: listing.kind, title: listing.title },
        fulfillment: { status: "accepted" },
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

    json(res, 404, { error: { code: "not_found", message: `${req.method} ${path}` } });
  } catch (error) {
    json(res, 500, { error: { code: "mock_failed", message: error instanceof Error ? error.message : "mock failed" } });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`mock-live-market http://${HOST}:${PORT}\n`);
});

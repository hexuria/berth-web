import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { DEMO_MARKET_URL, DEMO_WALLET_ID } from "../src/lib/config";
import {
  LIVE_WALLET_STORAGE_KEY,
  cdpWalletMessage,
  liveFacilitatorMessage,
  reportsLiveFacilitator,
  resolvePayMode,
} from "../src/lib/pay-mode";
import { BASE_SEPOLIA_CAIP2 } from "../src/lib/types";
import { server } from "../src/mocks/server";

function memoryStore(seed?: Record<string, string>) {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("pay mode (MemoryWallet vs CDP / live facilitator)", () => {
  it("treats cdp adapter and facilitatorUrl as live", () => {
    expect(reportsLiveFacilitator({ ok: true, walletAdapter: "memory" })).toBe(false);
    expect(reportsLiveFacilitator({ ok: true, walletAdapter: "cdp" })).toBe(true);
    expect(reportsLiveFacilitator({ ok: true, facilitator: "live" })).toBe(true);
    expect(reportsLiveFacilitator({ ok: true, facilitatorUrl: "https://x402.org/facilitator" })).toBe(true);
    expect(liveFacilitatorMessage({ ok: true, walletAdapter: "cdp" })).toMatch(/WALLET_ADAPTER=cdp/);
    expect(cdpWalletMessage()).toMatch(/CDP wallet/);
  });

  it("demo mode uses GET /wallets/wal_demo_agent", async () => {
    const mode = await resolvePayMode(true);
    expect(mode.kind).toBe("test-signature");
    if (mode.kind === "test-signature") {
      expect(mode.source).toBe("demo");
      expect(mode.wallet.id).toBe(DEMO_WALLET_ID);
    }
  });

  it("live MemoryWallet creates and funds a test agent", async () => {
    const store = memoryStore();
    const mode = await resolvePayMode(false, store);
    expect(mode.kind).toBe("test-signature");
    if (mode.kind === "test-signature") {
      expect(mode.source).toBe("memory");
      expect(mode.wallet.kind).toBe("agent");
      expect(mode.wallet.balanceAtomic).toBe("2000000");
      expect(mode.wallet.cdp).toBeUndefined();
      expect(store.getItem(LIVE_WALLET_STORAGE_KEY)).toBe(mode.wallet.id);
    }
  });

  it("reuses a stored MemoryWallet id", async () => {
    const first = await resolvePayMode(false, memoryStore());
    if (first.kind !== "test-signature") throw new Error("expected test agent");
    const store = memoryStore({ [LIVE_WALLET_STORAGE_KEY]: first.wallet.id });
    const again = await resolvePayMode(false, store);
    expect(again.kind).toBe("test-signature");
    if (again.kind === "test-signature") {
      expect(again.wallet.id).toBe(first.wallet.id);
    }
  });

  it("disables test signatures when health reports CDP", async () => {
    server.use(
      http.get(`${DEMO_MARKET_URL}/health`, () =>
        HttpResponse.json({
          ok: true,
          service: "berth-market",
          network: BASE_SEPOLIA_CAIP2,
          walletAdapter: "cdp",
        }),
      ),
    );
    const mode = await resolvePayMode(false, memoryStore());
    expect(mode).toEqual({
      kind: "disabled",
      reason: liveFacilitatorMessage({ ok: true, walletAdapter: "cdp" }),
    });
  });

  it("disables test signatures when the created wallet is CDP", async () => {
    server.use(
      http.post(`${DEMO_MARKET_URL}/wallets/agent`, async () =>
        HttpResponse.json(
          {
            wallet: {
              id: "wal_cdp_agent",
              kind: "agent",
              address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              spendCapAtomic: "5000000",
              spentAtomic: "0",
              balanceAtomic: "0",
              createdAt: "2026-08-23T00:00:00.000Z",
              cdp: { ownerAddress: "0xcccccccccccccccccccccccccccccccccccccccc" },
            },
          },
          { status: 201 },
        ),
      ),
      http.post(`${DEMO_MARKET_URL}/wallets/wal_cdp_agent/fund`, async () =>
        HttpResponse.json({
          wallet: {
            id: "wal_cdp_agent",
            kind: "agent",
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            spendCapAtomic: "5000000",
            spentAtomic: "0",
            balanceAtomic: "2000000",
            createdAt: "2026-08-23T00:00:00.000Z",
            cdp: { ownerAddress: "0xcccccccccccccccccccccccccccccccccccccccc" },
          },
        }),
      ),
    );
    const mode = await resolvePayMode(false, memoryStore());
    expect(mode).toEqual({ kind: "disabled", reason: cdpWalletMessage() });
  });
});

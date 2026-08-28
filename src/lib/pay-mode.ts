import { DEMO_WALLET_ID } from "./config";
import { createAgent, fetchHealth, fetchWallet, fundWallet } from "./market";
import type { MarketHealth, Wallet } from "./types";

export const LIVE_WALLET_STORAGE_KEY = "berth.liveWalletId";
export const LIVE_AGENT_SPEND_CAP = "5000000";
export const LIVE_AGENT_FUND = "2000000";
export const LIVE_AGENT_LABEL = "berth-web-buyer";

export type PayMode =
  | { kind: "test-signature"; wallet: Wallet; source: "demo" | "memory" }
  | { kind: "disabled"; reason: string };

export function reportsLiveFacilitator(health: MarketHealth): boolean {
  const adapter = health.walletAdapter?.trim().toLowerCase();
  if (adapter === "cdp") return true;
  const facilitator = health.facilitator?.trim().toLowerCase();
  if (facilitator === "live" || facilitator === "cdp") return true;
  return Boolean(health.facilitatorUrl?.trim());
}

export function liveFacilitatorMessage(health: MarketHealth): string {
  const adapter = health.walletAdapter?.trim().toLowerCase();
  if (adapter === "cdp") {
    return "This market reports WALLET_ADAPTER=cdp. Pay with test signature is disabled — use a live facilitator / CDP spend path, not test:<walletId>.";
  }
  return "This market reports a live x402 facilitator. Pay with test signature is disabled.";
}

export function cdpWalletMessage(): string {
  return "This market created a CDP wallet. Pay with test signature is disabled.";
}

/** Live-banner labels only. Never include facilitatorUrl or other secrets. */
export function formatHealthIdentity(health: MarketHealth): string {
  const parts: string[] = [];
  const adapter = health.walletAdapter?.trim();
  const facilitator = health.facilitator?.trim();
  if (adapter) parts.push(`walletAdapter=${adapter}`);
  if (facilitator) parts.push(`facilitator=${facilitator}`);
  return parts.join(" ");
}

interface WalletStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export async function ensureMemoryTestAgent(storage?: WalletStorage): Promise<Wallet> {
  const store = storage ?? (typeof sessionStorage === "undefined" ? undefined : sessionStorage);
  const stored = store?.getItem(LIVE_WALLET_STORAGE_KEY);
  if (stored) {
    try {
      return await fetchWallet(stored);
    } catch {
      store?.removeItem(LIVE_WALLET_STORAGE_KEY);
    }
  }

  const agent = await createAgent({ spendCap: LIVE_AGENT_SPEND_CAP, label: LIVE_AGENT_LABEL });
  const funded = await fundWallet(agent.id, LIVE_AGENT_FUND);
  store?.setItem(LIVE_WALLET_STORAGE_KEY, funded.id);
  return funded;
}

/** Demo: GET the seed wallet. Live MemoryWallet: POST /wallets/agent + fund. CDP/live facilitator: disabled. */
export async function resolvePayMode(demo: boolean, storage?: WalletStorage): Promise<PayMode> {
  if (demo) {
    const wallet = await fetchWallet(DEMO_WALLET_ID);
    return { kind: "test-signature", wallet, source: "demo" };
  }

  const health = await fetchHealth();
  if (reportsLiveFacilitator(health)) {
    return { kind: "disabled", reason: liveFacilitatorMessage(health) };
  }

  const wallet = await ensureMemoryTestAgent(storage);
  if (wallet.cdp) {
    return { kind: "disabled", reason: cdpWalletMessage() };
  }
  return { kind: "test-signature", wallet, source: "memory" };
}

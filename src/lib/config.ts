import { BERTHOS_PROXY_PATH, MARKET_PROXY_PATH, trimOrigin } from "./dev-proxy";

/** Default listen addresses from berth-market / berthos READMEs. */
export const DEMO_MARKET_URL = "http://127.0.0.1:8787";
export const DEMO_BERTHOS_URL = "http://127.0.0.1:7432";

export const DEMO_WALLET_ID = "wal_demo_agent";

export { BERTHOS_PROXY_PATH, MARKET_PROXY_PATH };

export function liveMarketUrl(): string | undefined {
  return trimOrigin(import.meta.env.VITE_MARKET_URL);
}

export function liveBerthosUrl(): string | undefined {
  return trimOrigin(import.meta.env.VITE_BERTHOS_URL);
}

/** Demo mode when no real market is configured. Tests and CI stay here. */
export function isDemoMode(): boolean {
  return !liveMarketUrl();
}

export function isDemoModeFromEnv(liveMarket: string | undefined): boolean {
  return !trimOrigin(liveMarket);
}

/**
 * Browser fetch base for the market.
 * Live mode uses same-origin `/mkt` (Vite proxies to `VITE_MARKET_URL`) so
 * the page does not cross-origin fetch :8787 (berth-market has no CORS).
 * Demo/CI keeps the loopback origin so MSW can intercept it.
 */
export function resolveMarketUrl(liveMarket: string | undefined): string {
  return trimOrigin(liveMarket) ? MARKET_PROXY_PATH : DEMO_MARKET_URL;
}

export function marketUrl(): string {
  return resolveMarketUrl(import.meta.env.VITE_MARKET_URL);
}

/**
 * Browser fetch base for Berthos.
 * Live node → same-origin `/bos`. Demo → loopback for MSW. Live market
 * without a node URL → undefined (host page shows "set VITE_BERTHOS_URL").
 */
export function resolveBerthosUrl(
  liveBerthos: string | undefined,
  liveMarket: string | undefined,
): string | undefined {
  if (trimOrigin(liveBerthos)) return BERTHOS_PROXY_PATH;
  return isDemoModeFromEnv(liveMarket) ? DEMO_BERTHOS_URL : undefined;
}

export function berthosUrl(): string | undefined {
  return resolveBerthosUrl(import.meta.env.VITE_BERTHOS_URL, import.meta.env.VITE_MARKET_URL);
}

export function shouldMockNetwork(): boolean {
  return isDemoMode();
}

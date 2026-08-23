/** Default listen addresses from berth-market / berthos READMEs. */
export const DEMO_MARKET_URL = "http://127.0.0.1:8787";
export const DEMO_BERTHOS_URL = "http://127.0.0.1:7432";

export const DEMO_WALLET_ID = "wal_demo_agent";

export function liveMarketUrl(): string | undefined {
  const value = import.meta.env.VITE_MARKET_URL?.trim();
  return value ? value.replace(/\/$/, "") : undefined;
}

export function liveBerthosUrl(): string | undefined {
  const value = import.meta.env.VITE_BERTHOS_URL?.trim();
  return value ? value.replace(/\/$/, "") : undefined;
}

/** Demo mode when no real market is configured. Tests and CI stay here. */
export function isDemoMode(): boolean {
  return !liveMarketUrl();
}

export function marketUrl(): string {
  return liveMarketUrl() ?? DEMO_MARKET_URL;
}

/**
 * Berthos loopback HTTP. Optional. In demo mode the MSW node answers so
 * eligibility / view-URL UI can be exercised without a guest runtime.
 */
export function berthosUrl(): string | undefined {
  return liveBerthosUrl() ?? (isDemoMode() ? DEMO_BERTHOS_URL : undefined);
}

export function shouldMockNetwork(): boolean {
  return isDemoMode();
}

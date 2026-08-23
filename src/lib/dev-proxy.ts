/** Same-origin prefixes the Vite dev/preview server rewrites to loopback backends. */
export const MARKET_PROXY_PATH = "/mkt";
export const BERTHOS_PROXY_PATH = "/bos";

export interface DevProxyEntry {
  target: string;
  changeOrigin: true;
  rewrite: (path: string) => string;
}

export type DevProxyTable = Record<string, DevProxyEntry>;

export function trimOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : undefined;
}

/** `/mkt/listings` → `/listings` so the market sees its own paths. */
export function stripProxyPrefix(path: string, prefix: string): string {
  if (path === prefix || path === `${prefix}/`) return "/";
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  return path;
}

/**
 * Build the Vite `server.proxy` / `preview.proxy` table from env.
 * Unset in CI so demo MSW stays the default (no live market required).
 */
export function viteProxyFromEnv(env: Record<string, string | undefined>): DevProxyTable {
  const proxy: DevProxyTable = {};
  const market = trimOrigin(env.VITE_MARKET_URL);
  const berthos = trimOrigin(env.VITE_BERTHOS_URL);

  if (market) {
    proxy[MARKET_PROXY_PATH] = {
      target: market,
      changeOrigin: true,
      rewrite: (path) => stripProxyPrefix(path, MARKET_PROXY_PATH),
    };
  }
  if (berthos) {
    proxy[BERTHOS_PROXY_PATH] = {
      target: berthos,
      changeOrigin: true,
      rewrite: (path) => stripProxyPrefix(path, BERTHOS_PROXY_PATH),
    };
  }
  return proxy;
}

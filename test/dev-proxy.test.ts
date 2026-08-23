import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer as createViteServer } from "vite";
import { describe, expect, it } from "vitest";
import {
  BERTHOS_PROXY_PATH,
  DEMO_BERTHOS_URL,
  DEMO_MARKET_URL,
  isDemoModeFromEnv,
  MARKET_PROXY_PATH,
  resolveBerthosUrl,
  resolveMarketUrl,
} from "../src/lib/config";
import { stripProxyPrefix, viteProxyFromEnv } from "../src/lib/dev-proxy";
import { server } from "../src/mocks/server";

describe("same-origin live proxy (no live market required)", () => {
  it("demo / CI (unset env) keeps loopback URLs so MSW stays the default", () => {
    expect(isDemoModeFromEnv(undefined)).toBe(true);
    expect(isDemoModeFromEnv("")).toBe(true);
    expect(isDemoModeFromEnv("   ")).toBe(true);
    expect(resolveMarketUrl(undefined)).toBe(DEMO_MARKET_URL);
    expect(resolveMarketUrl(undefined)).toBe("http://127.0.0.1:8787");
    expect(resolveBerthosUrl(undefined, undefined)).toBe(DEMO_BERTHOS_URL);
    expect(viteProxyFromEnv({})).toEqual({});
    expect(viteProxyFromEnv({ VITE_MARKET_URL: "", VITE_BERTHOS_URL: "  " })).toEqual({});
  });

  it("live market fetches /mkt (same origin) instead of :8787", () => {
    expect(isDemoModeFromEnv("http://127.0.0.1:8787")).toBe(false);
    expect(resolveMarketUrl("http://127.0.0.1:8787")).toBe(MARKET_PROXY_PATH);
    expect(resolveMarketUrl("http://127.0.0.1:8787/")).toBe("/mkt");
    expect(resolveBerthosUrl(undefined, "http://127.0.0.1:8787")).toBeUndefined();
  });

  it("live berthos fetches /bos (same origin) instead of :7432", () => {
    expect(resolveBerthosUrl("http://127.0.0.1:7432", "http://127.0.0.1:8787")).toBe(
      BERTHOS_PROXY_PATH,
    );
    expect(resolveBerthosUrl("http://127.0.0.1:7432/", undefined)).toBe("/bos");
  });

  it("maps env targets and strips prefixes so backends see their own paths", () => {
    const proxy = viteProxyFromEnv({
      VITE_MARKET_URL: "http://127.0.0.1:8787/",
      VITE_BERTHOS_URL: "http://127.0.0.1:7432",
    });

    expect(Object.keys(proxy).sort()).toEqual(["/bos", "/mkt"]);
    expect(proxy["/mkt"]?.target).toBe("http://127.0.0.1:8787");
    expect(proxy["/bos"]?.target).toBe("http://127.0.0.1:7432");
    expect(proxy["/mkt"]?.changeOrigin).toBe(true);
    expect(proxy["/bos"]?.changeOrigin).toBe(true);

    expect(proxy["/mkt"]?.rewrite("/mkt/listings")).toBe("/listings");
    expect(proxy["/mkt"]?.rewrite("/mkt/listings/lst_1/invoke")).toBe("/listings/lst_1/invoke");
    expect(proxy["/mkt"]?.rewrite("/mkt/health")).toBe("/health");
    expect(proxy["/mkt"]?.rewrite("/mkt")).toBe("/");
    expect(proxy["/bos"]?.rewrite("/bos/v1/eligibility")).toBe("/v1/eligibility");
    expect(proxy["/bos"]?.rewrite("/bos/v1/leases/l_1/view")).toBe("/v1/leases/l_1/view");
    expect(proxy["/bos"]?.rewrite("/bos")).toBe("/");
  });

  it("leaves unrelated paths untouched", () => {
    expect(stripProxyPrefix("/src/main.tsx", MARKET_PROXY_PATH)).toBe("/src/main.tsx");
    expect(stripProxyPrefix("/bos-extra", BERTHOS_PROXY_PATH)).toBe("/bos-extra");
  });

  it("Vite /mkt hits a mock market (not a live berth-market)", async () => {
    server.close();
    const upstream = createHttpServer((req, res) => {
      if (req.url === "/listings") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ listings: [{ id: "lst_proxy", title: "proxied.listing" }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      await new Promise<void>((resolve, reject) => {
        upstream.once("error", reject);
        upstream.listen(0, "127.0.0.1", () => resolve());
      });
      const upPort = (upstream.address() as AddressInfo).port;

      const vite = await createViteServer({
        configFile: false,
        logLevel: "silent",
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: false,
          proxy: viteProxyFromEnv({
            VITE_MARKET_URL: `http://127.0.0.1:${upPort}`,
          }),
        },
      });

      try {
        await vite.listen();
        const vitePort = (vite.httpServer?.address() as AddressInfo).port;
        const response = await fetch(`http://127.0.0.1:${vitePort}/mkt/listings`);
        expect(response.ok).toBe(true);
        expect(await response.json()).toEqual({
          listings: [{ id: "lst_proxy", title: "proxied.listing" }],
        });
      } finally {
        await vite.close();
      }
    } finally {
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
      server.listen({ onUnhandledRequest: "error" });
    }
  });
});

import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import { viteProxyFromEnv } from "./src/lib/dev-proxy";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const proxy = viteProxyFromEnv(env) as Record<string, ProxyOptions>;
  const useProxy = Object.keys(proxy).length > 0;

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      ...(useProxy ? { proxy } : {}),
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      ...(useProxy ? { proxy } : {}),
    },
  };
});

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MARKET_URL?: string;
  readonly VITE_BERTHOS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

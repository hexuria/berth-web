import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { shouldMockNetwork } from "./lib/config";

async function enableDemoMocks(): Promise<void> {
  if (!shouldMockNetwork()) return;
  const { worker } = await import("./mocks/browser");
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root");
}

void enableDemoMocks().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

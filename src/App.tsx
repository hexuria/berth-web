import { useEffect, useState } from "react";
import { isDemoMode } from "./lib/config";
import { fetchHealth } from "./lib/market";
import { formatHealthIdentity } from "./lib/pay-mode";
import type { MarketHealth } from "./lib/types";
import { BuyerPage } from "./pages/BuyerPage";
import { HostPage } from "./pages/HostPage";

type Role = "buyer" | "host";

function roleFromHash(): Role {
  return window.location.hash === "#/host" ? "host" : "buyer";
}

export function App() {
  const [role, setRole] = useState<Role>(roleFromHash);
  const [health, setHealth] = useState<MarketHealth | undefined>();
  const demo = isDemoMode();

  useEffect(() => {
    const onHash = () => setRole(roleFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void fetchHealth()
      .then((report) => {
        if (!cancelled) setHealth(report);
      })
      .catch(() => {
        /* banner stays "Live market" without identity */
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const identity = health ? formatHealthIdentity(health) : "";

  return (
    <>
      <header className="app-bar">
        <div>
          <h1>Berth</h1>
          <p>Human UI for parking a node and buying a listing. Not the market. Not the node.</p>
        </div>
        <nav className="roles" aria-label="Role">
          <a href="#/buyer" aria-current={role === "buyer" ? "page" : undefined}>
            Buyer
          </a>
          <a href="#/host" aria-current={role === "host" ? "page" : undefined}>
            Host
          </a>
        </nav>
      </header>
      <div className="banner" data-testid="mode-banner">
        <strong>{demo ? "Demo mode" : "Live market"}</strong>
        {identity ? (
          <>
            {" — "}
            <span className="mono" data-testid="health-identity">
              {identity}
            </span>
          </>
        ) : null}
        {" — "}
        payments settle in <a href="https://github.com/hexuria/berth-market">berth-market</a>
        {"; "}
        isolation lives in <a href="https://github.com/hexuria/berthos">berthos</a>
        {". "}
        Staging is Base Sepolia <code>eip155:84532</code>. No BERTH token. No custody. Mainnet off.
      </div>
      {role === "host" ? <HostPage /> : <BuyerPage />}
      <footer className="foot">
        hexuria/berth-web · USDC on Base Sepolia · laptop and host-desktop listings are refused
      </footer>
    </>
  );
}

import { useEffect, useState } from "react";
import { fetchViewUrl } from "../lib/berthos";
import { isDemoMode } from "../lib/config";
import { decideListing } from "../lib/listing-guard";
import { newHttpListingInput } from "../lib/listing-defaults";
import { createListing, endReceipt, fetchCatalog, invokeListing } from "../lib/market";
import { resolvePayMode } from "../lib/pay-mode";
import { encodeDemoPaymentSignature, formatUsdcAtomic } from "../lib/payment";
import { describeReceiptSplit } from "../lib/receipt-split";
import type { Listing, PaymentRequired, Receipt, ViewUrl, Wallet } from "../lib/types";

interface QuoteState {
  listing: Listing;
  quote: PaymentRequired;
}

interface PaidState {
  listing: Listing;
  receipt: Receipt;
  leaseId?: string;
  view?: ViewUrl;
}

export function BuyerPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [wallet, setWallet] = useState<Wallet | undefined>();
  const [payBlocked, setPayBlocked] = useState<string | undefined>();
  const [paySource, setPaySource] = useState<"demo" | "memory" | undefined>();
  const [quote, setQuote] = useState<QuoteState | undefined>();
  const [paid, setPaid] = useState<PaidState | undefined>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const demo = isDemoMode();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchCatalog(),
      resolvePayMode(demo).catch((error: unknown) => ({
        kind: "disabled" as const,
        reason: error instanceof Error ? error.message : "wallet setup failed",
      })),
    ])
      .then(([rows, pay]) => {
        if (cancelled) return;
        setListings(rows);
        if (pay.kind === "test-signature") {
          setWallet(pay.wallet);
          setPaySource(pay.source);
        } else {
          setPayBlocked(pay.reason);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "catalog failed");
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  async function onInvoke(listing: Listing) {
    setActionError(undefined);
    setPaid(undefined);
    setBusy(true);
    try {
      const result = await invokeListing(listing.id);
      if (result.status === 402 && result.quote) {
        setQuote({ listing, quote: result.quote });
        return;
      }
      setActionError(result.error?.message ?? `invoke → ${result.status}`);
    } finally {
      setBusy(false);
    }
  }

  async function onPay() {
    if (!quote) return;
    const payer = wallet;
    if (!payer) {
      setActionError(
        payBlocked ??
          "No test agent. Live MemoryWallet markets create one via POST /wallets/agent; CDP / live facilitator disables test signatures.",
      );
      return;
    }
    setBusy(true);
    setActionError(undefined);
    try {
      const signature = encodeDemoPaymentSignature(quote.quote, payer);
      const result = await invokeListing(quote.listing.id, signature);
      if (result.status !== 200 || !result.receipt) {
        setActionError(result.error?.message ?? `pay → ${result.status}`);
        return;
      }
      const leaseId = result.receipt.leaseId ?? result.fulfillment?.leaseId;
      const view = leaseId ? await fetchViewUrl(leaseId) : undefined;
      setPaid({ listing: quote.listing, receipt: result.receipt, leaseId, view });
    } finally {
      setBusy(false);
    }
  }

  async function onEnd() {
    if (!paid?.receipt.id) return;
    setBusy(true);
    try {
      const ended = await endReceipt(paid.receipt.id);
      if (ended.error) {
        setActionError(ended.error.message);
        return;
      }
      setPaid({ ...paid, receipt: ended.receipt, view: undefined });
    } finally {
      setBusy(false);
    }
  }

  async function onNewListing() {
    setActionError(undefined);
    setBusy(true);
    try {
      const result = await createListing(newHttpListingInput());
      if (!result.ok) {
        setActionError(result.error.message);
        return;
      }
      setListings((rows) => [...rows, result.listing]);
    } finally {
      setBusy(false);
    }
  }

  const receiptSplit = paid ? describeReceiptSplit(paid.receipt) : undefined;
  const canPay = Boolean(wallet) && !payBlocked;

  return (
    <main>
      <section>
        <h2>Catalog</h2>
        <p className="meta">
          Listings come from berth-market <code>GET /listings</code>. Prices are atomic USDC on{" "}
          <strong>Base Sepolia</strong> (<code>eip155:84532</code>). Mainnet is off in this UI. Laptop / host-desktop
          rows are refused here the same way the market API rejects them.
          Stored listings keep their own network — this UI does not rewrite mainnet rows to Sepolia.
        </p>
        {!demo && paySource === "memory" && (
          <div className="actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => void onNewListing()} data-testid="new-listing">
              New listing (Sepolia USDC)
            </button>
          </div>
        )}
        {loadError && <p>{loadError}</p>}
        {payBlocked && !quote && (
          <p className="meta" data-testid="pay-blocked">
            {payBlocked}
          </p>
        )}
        <div className="grid catalog" data-testid="catalog">
          {listings.map((listing) => {
            const decision = decideListing(listing);
            if (!decision.ok) {
              return (
                <article
                  key={listing.id}
                  className="card refused"
                  data-testid="refused-listing"
                  data-listing-id={listing.id}
                >
                  <h3>{listing.title}</h3>
                  <p>
                    <span className="pill bad">refused</span>
                    <span className="mono">
                      {listing.kind} / class={listing.class ?? "—"}
                    </span>
                  </p>
                  <p data-testid="forbidden-class">
                    {decision.code}: {decision.message}
                  </p>
                </article>
              );
            }
            return (
              <article key={listing.id} className="card" data-testid={`listing-${listing.title}`}>
                <h3>{listing.title}</h3>
                <p>
                  <span className="pill">{listing.kind}</span>
                  {listing.class && <span className="pill ok">{listing.class}</span>}
                  <span className="mono">
                    {formatUsdcAtomic(listing.price.amount)} USDC · {listing.price.network}
                  </span>
                </p>
                <p className="meta">{listing.description}</p>
                <div className="actions">
                  <button type="button" disabled={busy} onClick={() => void onInvoke(listing)}>
                    Invoke unpaid
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {quote && (
        <section className="card" data-testid="quote">
          <h2>
            <span className="pill quote">HTTP 402</span> Payment required
          </h2>
          <p>
            Unpaid <code>GET /listings/{quote.listing.id}/invoke</code> returned an x402 v2 quote.{" "}
            {paySource === "memory"
              ? "This market is MemoryWallet (no WALLET_ADAPTER=cdp). Pay sends test:"
              : "Demo pay uses test:"}
            <code>{wallet?.id ?? "walletId"}</code>
            {paySource === "memory" ? " against the local TestFacilitator — no keys, no chain." : " against the in-memory market — no keys, no chain."}
          </p>
          {payBlocked && (
            <p className="meta" data-testid="pay-blocked">
              {payBlocked}
            </p>
          )}
          <dl className="facts">
            <dt>listing</dt>
            <dd>{quote.listing.title}</dd>
            <dt>amount</dt>
            <dd>
              {formatUsdcAtomic(quote.quote.accepts[0]?.amount ?? "0")} USDC ({quote.quote.accepts[0]?.amount} atomic)
            </dd>
            <dt>network</dt>
            <dd>{quote.quote.accepts[0]?.network}</dd>
            <dt>payTo</dt>
            <dd className="mono">{quote.quote.accepts[0]?.payTo}</dd>
          </dl>
          <pre className="quote">{JSON.stringify(quote.quote, null, 2)}</pre>
          <div className="actions">
            <button type="button" disabled={busy || !canPay} onClick={() => void onPay()} data-testid="pay-demo">
              Pay with test signature
            </button>
          </div>
        </section>
      )}

      {paid && (
        <section className="card" data-testid="receipt">
          <h2>Receipt</h2>
          <dl className="facts">
            <dt>receipt</dt>
            <dd className="mono">{paid.receipt.id}</dd>
            <dt>transaction</dt>
            <dd className="mono">{paid.receipt.transaction}</dd>
            <dt>split</dt>
            <dd data-testid="receipt-split">
              {receiptSplit?.headline}
              {receiptSplit?.detail && <p className="meta">{receiptSplit.detail}</p>}
            </dd>
            {paid.leaseId && (
              <>
                <dt>leaseId</dt>
                <dd className="mono" data-testid="lease-id">
                  {paid.leaseId}
                </dd>
              </>
            )}
            <dt>network</dt>
            <dd>{paid.receipt.network}</dd>
          </dl>
          {paid.view?.viewer_url && (
            <p data-testid="view-url">
              Guest view (not the host desktop):{" "}
              <a href={paid.view.viewer_url} rel="noreferrer">
                {paid.view.viewer_url}
              </a>
              . On the node host run <code>berth view</code>.
            </p>
          )}
          {paid.receipt.leaseState === "ended" && (
            <p className="meta">
              Lease ended. occupancySeconds={paid.receipt.occupancySeconds} (not a second charge).
            </p>
          )}
          {paid.leaseId && paid.receipt.leaseState !== "ended" && (
            <div className="actions">
              <button type="button" className="secondary" disabled={busy} onClick={() => void onEnd()}>
                End lease
              </button>
            </div>
          )}
        </section>
      )}

      {actionError && <p>{actionError}</p>}
    </main>
  );
}

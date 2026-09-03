import { useEffect, useState } from "react";
import { ReceiptTransaction } from "../components/ReceiptTransaction";
import { fetchEligibility } from "../lib/berthos";
import { isDemoMode } from "../lib/config";
import { defaultListingPrice, newDesktopListingInput } from "../lib/listing-defaults";
import { decideListing, forbiddenKindMessage } from "../lib/listing-guard";
import { createListing, fetchReceipts } from "../lib/market";
import { describeReceiptSplit } from "../lib/receipt-split";
import type { EligibilityAttestation, Listing, MarketError, Receipt } from "../lib/types";

const PARK_COMMANDS = `# In hexuria/berthos — this UI does not run Docker or start a guest.
cargo install --path crates/berthos-cli   # command name is \`berth\`

docker build -t berthos-linux-desktop:v1 images/linux-desktop
berth doctor --json                       # must be eligible; exit 1 if red
berth node up                             # http://127.0.0.1:7432 — loopback only
# pairing code printed, e.g. ABCD-EFGH

berth pair --code ABCD-EFGH`;

const LAPTOP_KIND = "laptop";
const HOST_DESKTOP_KIND = "host-desktop";
const PARKED_LISTING_KEY = "berth-web:parked-listing";
const RECEIPT_POLL_MS = 2000;

function readParkedListing(): Listing | undefined {
  try {
    const raw = sessionStorage.getItem(PARKED_LISTING_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Listing;
    if (typeof parsed?.id !== "string" || !parsed.id) return undefined;
    if (typeof parsed.kind !== "string" || typeof parsed.title !== "string") return undefined;
    if (!parsed.price || typeof parsed.price.network !== "string") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeParkedListing(listing: Listing): void {
  sessionStorage.setItem(PARKED_LISTING_KEY, JSON.stringify(listing));
}

export function HostPage() {
  const [eligibility, setEligibility] = useState<
    { status: "loading" } | { status: "ready"; report: EligibilityAttestation } | { status: "missing"; message: string }
  >({ status: "loading" });
  const [laptopError, setLaptopError] = useState<MarketError | undefined>();
  const [parked, setParked] = useState<Listing | undefined>(readParkedListing);
  const [parkError, setParkError] = useState<MarketError | undefined>();
  const [parkBusy, setParkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptError, setReceiptError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void fetchEligibility().then((result) => {
      if (cancelled) return;
      if (result.ok) setEligibility({ status: "ready", report: result.report });
      else setEligibility({ status: "missing", message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!parked) return;
    const listingId = parked.id;
    let cancelled = false;
    async function load() {
      try {
        const rows = await fetchReceipts(listingId);
        if (cancelled) return;
        setReceipts(rows);
        setReceiptError(undefined);
      } catch (error: unknown) {
        if (!cancelled) {
          setReceiptError(error instanceof Error ? error.message : "receipts failed");
        }
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), RECEIPT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [parked]);

  async function copyCommands() {
    await navigator.clipboard.writeText(PARK_COMMANDS);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function refuseInUi(kind: string, listingClass: string) {
    const decision = decideListing({ kind, class: listingClass });
    if (!decision.ok) {
      setLaptopError({ code: decision.code, message: decision.message });
    }
  }

  async function refuseLaptopViaMarket() {
    const decision = decideListing({ kind: LAPTOP_KIND, class: "laptop" });
    if (!decision.ok) {
      setLaptopError({ code: decision.code, message: decision.message });
      return;
    }
    const result = await createListing({
      kind: LAPTOP_KIND,
      title: "daily-driver.laptop",
      price: defaultListingPrice(),
      payTo: "0x1111111111111111111111111111111111111111",
      class: "laptop",
    });
    if (!result.ok) setLaptopError(result.error);
  }

  async function parkEligibleGuest() {
    if (eligibility.status !== "ready") return;
    const input = newDesktopListingInput({ eligibility: eligibility.report });
    const decision = decideListing(input);
    if (!decision.ok) {
      setParked(undefined);
      sessionStorage.removeItem(PARKED_LISTING_KEY);
      setParkError({ code: decision.code, message: decision.message });
      return;
    }
    setParkBusy(true);
    setParkError(undefined);
    try {
      const result = await createListing(input);
      if (!result.ok) {
        setParked(undefined);
        sessionStorage.removeItem(PARKED_LISTING_KEY);
        setParkError(result.error);
        return;
      }
      writeParkedListing(result.listing);
      setParked(result.listing);
      setReceipts([]);
    } finally {
      setParkBusy(false);
    }
  }

  const classDecision =
    eligibility.status === "ready" ? decideListing({ kind: "desktop.linux", class: eligibility.report.class }) : undefined;

  return (
    <main>
      <section className="card" data-testid="host-page">
        <h2>Park a node (not this process)</h2>
        <p className="meta">
          Isolation lives in <a href="https://github.com/hexuria/berthos">hexuria/berthos</a>. This page copies
          the doctor / node-up commands. It does <strong>not</strong> start Docker, a hypervisor, or a guest.
        </p>
        <pre className="commands" data-testid="park-commands">
          {PARK_COMMANDS}
        </pre>
        <div className="actions">
          <button type="button" onClick={() => void copyCommands()}>
            {copied ? "Copied" : "Copy commands"}
          </button>
        </div>
      </section>

      <section className="card" data-testid="eligibility">
        <h2>Eligibility</h2>
        <p className="meta">
          {isDemoMode()
            ? "Demo mode mocks GET /v1/eligibility so CI can run without a node."
            : "Read same-origin /bos (Vite proxy of VITE_BERTHOS_URL) when a live Berthos node is listening on loopback."}
        </p>
        {eligibility.status === "loading" && <p>Checking node…</p>}
        {eligibility.status === "missing" && <p className="status-line">{eligibility.message}</p>}
        {eligibility.status === "ready" && (
          <>
            <p>
              <span
                className={`pill ${eligibility.report.ok && classDecision?.ok ? "ok" : "bad"}`}
                data-testid="eligibility-status"
              >
                {eligibility.report.ok && classDecision?.ok ? "eligible" : "refused"}
              </span>
              <span className="mono" data-testid="eligibility-class">
                class={eligibility.report.class} ok={String(eligibility.report.ok)}
              </span>
            </p>
            {classDecision?.ok && (
              <p className="meta" data-testid="eligibility-kind">
                Eligible for <code>desktop.linux</code> listings (isolated guest, not the host desktop).
              </p>
            )}
            {classDecision && !classDecision.ok && (
              <p data-testid="eligibility-refused">
                {classDecision.code}: {classDecision.message}
              </p>
            )}
            <ul className="meta">
              {(eligibility.report.checks ?? []).map((check) => (
                <li key={check.id}>
                  {check.id}: {check.status} — {check.detail}
                </li>
              ))}
            </ul>
            {classDecision?.ok && eligibility.report.ok && (
              <div data-testid="park-guest">
                <p className="meta">
                  Doctor is green for an isolated guest. Post <code>kind=desktop.linux</code> on
                  Base Sepolia (<code>eip155:84532</code>). Never laptop or host-desktop.
                </p>
                <div className="actions">
                  <button
                    type="button"
                    disabled={parkBusy}
                    onClick={() => void parkEligibleGuest()}
                    data-testid="park-listing"
                  >
                    {parkBusy ? "Parking…" : "Park guest on market"}
                  </button>
                </div>
                {parkError && (
                  <p data-testid="park-error">
                    {parkError.code}: {parkError.message}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {parked && (
        <section className="card" data-testid="host-earn">
          <h2>Occupancy and earn</h2>
          <p className="meta">
            After a buyer pays this parked guest, this page reads{" "}
            <code>GET /receipts?listingId={parked.id}</code> (demo MSW, or same-origin{" "}
            <code>/mkt</code> in live). 90/10 is receipt accounting. A paid receipt's{" "}
            <code>transaction</code> is the settle hash or a test-facilitator id — only a
            real 64-hex hash on a known CAIP-2 becomes an explorer link. Guest view stays
            on the buyer receipt — this is not a host-desktop viewer.
          </p>
          <p data-testid="parked-listing">
            Listed <code>{parked.title}</code> as <code>{parked.kind}</code> on{" "}
            <code>{parked.price.network}</code>. Buyer catalog will show it.
          </p>
          {receiptError && <p className="status-line">{receiptError}</p>}
          {receipts.length === 0 && !receiptError && (
            <p className="meta" data-testid="host-earn-empty">
              Waiting for a buyer to pay this listing. Occupancy and the 90/10 earn
              appear on the receipt after a paid invoke.
            </p>
          )}
          {receipts.map((receipt) => {
            const split = describeReceiptSplit(receipt);
            return (
              <article key={receipt.id} data-testid="host-receipt">
                <dl className="facts">
                  <dt>receipt</dt>
                  <dd className="mono">{receipt.id}</dd>
                  <ReceiptTransaction receipt={receipt} testId="host-receipt-tx" />
                  <dt>leaseState</dt>
                  <dd data-testid="host-lease-state">{receipt.leaseState ?? "—"}</dd>
                  <dt>split</dt>
                  <dd data-testid="host-receipt-split">
                    {split.headline}
                    {split.detail && <p className="meta">{split.detail}</p>}
                  </dd>
                </dl>
                {receipt.leaseState === "ended" && (
                  <p className="meta" data-testid="host-occupancy">
                    occupancySeconds={receipt.occupancySeconds} (not a second charge).
                  </p>
                )}
              </article>
            );
          })}
        </section>
      )}

      <section className="card refused" data-testid="laptop-refuse">
        <h2>Laptop / host desktop</h2>
        <p>
          Never present a host desktop or laptop as a public listing. The market returns{" "}
          <code>forbidden_class</code>; this UI uses the same rule.
        </p>
        <p className="meta">{forbiddenKindMessage("laptop")}</p>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() => refuseInUi(LAPTOP_KIND, "laptop")}
            data-testid="try-laptop"
          >
            Try listing a laptop
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => refuseInUi(HOST_DESKTOP_KIND, "host-desktop")}
            data-testid="try-host-desktop"
          >
            Try listing a host desktop
          </button>
          <button type="button" className="secondary" onClick={() => void refuseLaptopViaMarket()}>
            Send laptop to market
          </button>
        </div>
        {laptopError && (
          <p data-testid="forbidden-class">
            {laptopError.code}: {laptopError.message}
          </p>
        )}
      </section>
    </main>
  );
}

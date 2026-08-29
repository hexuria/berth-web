# Three-repo demo

Honest map. This repo is the **human UI**. Money is [hexuria/berth-market](https://github.com/hexuria/berth-market). Isolation is [hexuria/berthos](https://github.com/hexuria/berthos).

```
Role A — Host                         Role B — Buyer
park a computer                       pay to use a listing
berthos CLI: doctor / node up / pair  this UI → berth-market HTTP
this UI: POST desktop.linux listing   unpaid invoke → 402 → test:<walletId>
never host-desktop / laptop           receipt + leaseId
GET /receipts?listingId= → occupancy  berth view + berth mcp when a view URL exists
and honest 90/10 earn                 (buyer page only; not a host-desktop viewer)
```

| Claim | Actual state |
| --- | --- |
| This repo is a marketplace | No. It calls berth-market over HTTP (or an MSW stand-in). |
| This repo is a node | No. It does not run Docker, a hypervisor, or a guest. |
| Payments | x402 + USDC in **berth-market**. Demo mode uses `test:<walletId>` against the in-memory facilitator. |
| Isolation | **berthos** labeled Linux guest (`berthos-linux-desktop:v1`). Guest Xvfb, not the host DISPLAY. |
| Staging chain | Base Sepolia `eip155:84532`. Mainnet off in this UI. |
| BERTH token / own chain / AgentMail | Out. |
| Custody / CDP in CI | None. No secrets required. |

The market's own two-role notes (HTTP + loops, no SPA): [berth-market docs/DEMO.md](https://github.com/hexuria/berth-market/blob/main/docs/DEMO.md). Berthos session / `berth view` / `berth mcp`: [berthos docs/SESSION.md](https://github.com/hexuria/berthos/blob/main/docs/SESSION.md).

---

## Demo mode (this repo only)

No market process, no node, no keys:

```bash
git clone https://github.com/hexuria/berth-web.git
cd berth-web
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run dev
```

Open `http://127.0.0.1:5173/#/buyer`:

1. Catalog shows `weather.now` and `gpu-box.session`.
2. A leaked `daily-driver.laptop` row is **refused** (`forbidden_class`) — never offered as a buyable listing.
3. **Invoke unpaid** on `gpu-box.session` → HTTP 402 quote (`eip155:84532`).
4. **Pay with test signature** → receipt, `leaseId`, a mocked guest view URL (`GET /v1/leases/{id}/view`), and copyable `berth view` / `berth mcp` attach commands for that leased guest.
5. Host tab copies `berth doctor` / `berth node up`. Eligibility is the mocked doctor report. **Park guest on market** posts `kind=desktop.linux` on `eip155:84532`; the buyer catalog then shows that parked row. After the buyer pays and ends the lease, Host reads `GET /receipts?listingId=` and shows occupancy seconds plus receipt-accounting 90/10 (not an on-chain Base split when `onChainSettlement` is `payTo_100`).

That is enough for CI. It is **not** a live USDC transfer and **not** a real guest.

---

## Role A — Host / parking a computer

Doctor, `berth node up`, and pairing stay in **berthos**. This UI copies those commands, reads `GET /v1/eligibility` (mocked in demo / same-origin `/bos` in live), and — when the doctor is green for `vm-guest` — **Park guest on market** `POST /listings` as `kind=desktop.linux` on Base Sepolia (`eip155:84532`). It does not start Docker.

Never rent the host desktop or a laptop. `class=laptop` and `host-desktop` are rejected on the node, again in berth-market, and again in this UI. The park control is not shown unless eligibility is an allowed guest class.

On the parked box (Linux + Docker + Rust) — from the [berthos README](https://github.com/hexuria/berthos/blob/main/README.md):

```bash
git clone https://github.com/hexuria/berthos.git
cd berthos
cargo install --path crates/berthos-cli

docker build -t berthos-linux-desktop:v1 images/linux-desktop
berth doctor --json
berth node up                             # http://127.0.0.1:7432
berth pair --code ABCD-EFGH
```

`berth node up --bind 0.0.0.0` is rejected. Occupancy quotes on the node are seconds, not a charge.

Point **this** UI at that loopback (optional):

```bash
export VITE_BERTHOS_URL=http://127.0.0.1:7432
npm run dev
```

The host page reads same-origin `/bos/v1/eligibility` (Vite → `:7432`). If the node is down, the page says so. It will not pretend Docker started. A green `vm-guest` report enables **Park guest on market**; the buyer catalog then lists that guest. After a paid invoke, Host polls same-origin `/mkt/receipts?listingId=` for occupancy and the receipt 90/10. Laptop / host-desktop refuse buttons stay on the page. Guest view stays on the buyer receipt.

---

## Role B — Buyer / paying to use

### Path 1 — demo (CI default)

In-browser MSW market. Pay with `test:wal_demo_agent`. See [Demo mode](#demo-mode-this-repo-only).

### Path 2 — live berth-market, still test USDC

In [berth-market](https://github.com/hexuria/berth-market):

```bash
npm ci
npm start            # http://127.0.0.1:8787
```

Create a treasury, a capped agent, fund test USDC, and list an HTTP or `desktop.linux` SKU — payloads in the market [README](https://github.com/hexuria/berth-market/blob/main/README.md) and [LISTING.md](https://github.com/hexuria/berth-market/blob/main/docs/LISTING.md). Then:

```bash
export VITE_MARKET_URL=http://127.0.0.1:8787
# desktop SKUs also need a live node:
# export VITE_BERTHOS_URL=http://127.0.0.1:7432
npm run dev
```

**Live = `VITE_MARKET_URL` + the Vite proxy.** The page stays on `http://127.0.0.1:5173`. It fetches **same origin** `/mkt/*` and `/bos/*`. Vite rewrites those to `:8787` and `:7432`. A direct browser call to `http://127.0.0.1:8787` fails CORS (`Failed to fetch`); the proxy is the supported live path. CI leaves the env vars unset (demo MSW) and also runs Playwright against an in-process mock behind the same `/mkt` + `/bos` proxies — HTTP `weather.now` and paid `desktop.linux` (occupancy + loopback `berth view` URL), no secrets, no Docker, no real Berthos.

Default market `npm start` is MemoryWallet (no `WALLET_ADAPTER=cdp`). The buyer page `POST /wallets/agent` + funds test USDC and enables **Pay with test signature**. If `/health` reports CDP or a live facilitator, that button stays off.

Buyer flow in the UI:

1. Catalog = `GET /listings`. Host **Park guest on market** posts `desktop.linux` on `eip155:84532`. Buyer **New listing (Sepolia USDC)** posts an HTTP SKU the same way. Stored mainnet rows are not rewritten.
2. Invoke unpaid = `GET /listings/:id/invoke` without `PAYMENT-SIGNATURE` → **402**.
3. MemoryWallet / demo pay encodes a v2 payload whose signature is `test:<walletId>` (market `TestFacilitator`). A live Sepolia pay is **not** this UI; use the market's `npm run sepolia-loop`.
4. 200 body: receipt. **90/10 is receipt accounting.** `onChainSettlement=payTo_100` means on-chain USDC went 100% to `payTo` — not a Base split. `cdp_split_90_10` is the only on-chain 90/10. `leaseId` for `desktop.linux`.
5. Guest view needs a rebuilt `berthos-linux-desktop:v1` image on the node host (`docker build -t berthos-linux-desktop:v1 images/linux-desktop` in hexuria/berthos). Then `GET /v1/leases/{id}/view` can return `viewer_url`; on that host run `berth view` (loopback guest Xvfb) or `berth mcp` (stdio attach to the same leased guest — never the operator desktop). End lease drops both.
6. **End lease** = `POST /receipts/:id/end`. Occupancy seconds, `chargedHere: false`. Not a second x402.

Unreachable node, red doctor, `class=laptop`, or 409 already-leased → market 4xx and **no charge**. This UI surfaces that error.

### Path 3 — Base Sepolia (optional, not CI)

Real testnet USDC stays in **berth-market** (`npm run sepolia-loop`). Needs a throwaway EOA and faucet USDC. Never commit the key. This UI does not hold `STAGING_PAYER_PRIVATE_KEY` and does not call a facilitator.

---

## Reproduce checklist

### UI only (no keys, no Docker)

- [ ] `npm ci && npm run lint && npm test && npm run test:e2e`
- [ ] Buyer: catalog, 402, receipt
- [ ] Laptop row refused (`forbidden_class`)
- [ ] Host: commands visible; eligibility is vm-guest / desktop.linux; **Park guest on market** lists `desktop.linux` on Sepolia; buyer catalog shows it; after pay + end lease, Host shows occupancySeconds and receipt-accounting 90/10; laptop and host-desktop refused

### Live market + optional node

- [ ] Market `npm start` on `:8787` (MemoryWallet default)
- [ ] `VITE_MARKET_URL=http://127.0.0.1:8787` (Vite proxies `/mkt`; do not fetch :8787 from the page)
- [ ] Optional: berthos `berth node up` + `VITE_BERTHOS_URL=http://127.0.0.1:7432` (proxied as `/bos`)
- [ ] Rebuild `berthos-linux-desktop:v1` on the node host before expecting `berth view`
- [ ] Buyer creates/funds a test agent; **Pay with test signature** completes 402 → 200
- [ ] Confirm the catalog loads without `Failed to fetch` / CORS errors
- [ ] Confirm host desktop / laptop cannot be listed

### Do not

- [ ] Commit private keys or CDP secrets
- [ ] Set staging traffic at `eip155:8453`
- [ ] Treat demo MSW balances as Sepolia USDC
- [ ] Treat this UI as starting Docker
- [ ] List or rent `laptop` / `host-desktop`

---

## Related

- [hexuria/berth-market](https://github.com/hexuria/berth-market) — listings, 402, wallets, receipts
- [hexuria/berthos](https://github.com/hexuria/berthos) — doctor, loopback HTTP, guest view
- [berth-market LISTING.md](https://github.com/hexuria/berth-market/blob/main/docs/LISTING.md) — `forbidden_class`
- [berthos ELIGIBILITY.md](https://github.com/hexuria/berthos/blob/main/docs/ELIGIBILITY.md) — `GET /v1/eligibility`

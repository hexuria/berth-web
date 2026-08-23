# Three-repo demo

Honest map. This repo is the **human UI**. Money is [hexuria/berth-market](https://github.com/hexuria/berth-market). Isolation is [hexuria/berthos](https://github.com/hexuria/berthos).

```
Role A — Host                         Role B — Buyer
park a computer                       pay to use a listing
berthos CLI (not this UI)             this UI → berth-market HTTP
berth doctor / node up / pair         unpaid invoke → 402 → test:<walletId>
never host-desktop / laptop           receipt + leaseId
eligibility: GET /v1/eligibility      berth view when a view URL exists
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

The market's own two-role notes (HTTP + loops, no SPA): [berth-market docs/DEMO.md](https://github.com/hexuria/berth-market/blob/main/docs/DEMO.md). Berthos session / `berth view`: [berthos docs/SESSION.md](https://github.com/hexuria/berthos/blob/main/docs/SESSION.md).

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
4. **Pay with test signature** → receipt, `leaseId`, and a mocked guest view URL (`GET /v1/leases/{id}/view`).
5. Host tab copies `berth doctor` / `berth node up`. Eligibility is the mocked doctor report.

That is enough for CI. It is **not** a live USDC transfer and **not** a real guest.

---

## Role A — Host / parking a computer

Do the work in **berthos**, not here. This UI only shows the commands and, if `VITE_BERTHOS_URL` is set, `GET /v1/eligibility`.

Never rent the host desktop or a laptop. `class=laptop` and `host-desktop` are rejected on the node, again in berth-market, and again in this UI.

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

If the node is down, the host page says so. It will not pretend Docker started.

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

Buyer flow in the UI:

1. Catalog = `GET /listings`.
2. Invoke unpaid = `GET /listings/:id/invoke` without `PAYMENT-SIGNATURE` → **402**.
3. Demo pay encodes a v2 payload whose signature is `test:<walletId>` (market `TestFacilitator`). A live Sepolia pay is **not** this UI; use the market's `npm run sepolia-loop`.
4. 200 body: receipt (90% seller / 10% protocol **accounting**), and `leaseId` for `desktop.linux`.
5. If Berthos answers `GET /v1/leases/{id}/view`, the UI links `viewer_url` and tells you to run `berth view` on the node host. That URL is loopback guest Xvfb, not the operator desktop.
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
- [ ] Host: commands visible; eligibility mocked

### Live market + optional node

- [ ] Market `npm start` on `:8787`
- [ ] `VITE_MARKET_URL=http://127.0.0.1:8787`
- [ ] Optional: berthos `berth node up` + `VITE_BERTHOS_URL=http://127.0.0.1:7432`
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

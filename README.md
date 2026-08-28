# berth-web

Public **host / buyer** UI for [Berth Market](https://github.com/hexuria/berth-market) and [Berthos](https://github.com/hexuria/berthos).

This repo is **not** the node and **not** the market. It is the human surface:

| Role | What this UI does | What it does not do |
| --- | --- | --- |
| **Host** | Copy `berth doctor` / `berth node up` commands. Show eligibility if a Berthos URL is set (mocked in demo / CI). When the doctor is green for `vm-guest`, park that guest as `kind=desktop.linux` on Sepolia. | Start Docker, a hypervisor, or a guest. List `laptop` / `host-desktop`. |
| **Buyer** | Catalog, unpaid invoke → HTTP 402 quote, demo pay with `test:<walletId>`, receipt + `leaseId`, link to `berth view` when a view URL exists. | Hold keys. Settle USDC. Drive the host desktop. |

Payments live in **berth-market** (x402, USDC, wallets, receipts, end lease). Isolation lives in **berthos** (doctor, loopback HTTP, labeled Linux guest). Two-role walkthrough: [docs/DEMO.md](docs/DEMO.md).

## Hard rules

- Public GitHub. CI is free GitHub Actions: lint, unit + integration, Playwright Chromium. No paid runners. No secrets.
- No Docker, no hypervisor, no guest runtime **in this repo**.
- No custody of keys. No CDP secrets in CI.
- Never present a host desktop or laptop as a public listing. The UI refuses `kind` / `class` of `laptop` and `host-desktop` the same way [the market API](https://github.com/hexuria/berth-market/blob/main/docs/LISTING.md) does (`forbidden_class`).
- No BERTH token. No own chain. No AgentMail.
- Staging network is **Base Sepolia** (`eip155:84532`). Mainnet is off in this UI.

## Quick start

```bash
npm install
npm test
npm run dev          # http://127.0.0.1:5173  (demo market via MSW)
```

Default **demo mode** talks to an in-memory market (MSW). `npm test` and Playwright need no network and no secrets.

**Live mode** is `VITE_MARKET_URL` + the Vite proxy. Do not fetch `:8787` from the page.

```bash
# other terminal: hexuria/berth-market
npm start            # http://127.0.0.1:8787  (MemoryWallet + TestFacilitator)

# this repo
export VITE_MARKET_URL=http://127.0.0.1:8787
# optional loopback node (same role as BERTHOS_URL on the market)
export VITE_BERTHOS_URL=http://127.0.0.1:7432
npm run dev          # browser uses /mkt → :8787 and /bos → :7432
```

The page stays on `:5173`. It fetches **same-origin** `/mkt/*` and `/bos/*`. Vite rewrites those to the env origins. A direct browser call to `http://127.0.0.1:8787` fails CORS (`Failed to fetch`).

| Browser path | Upstream (env) |
| --- | --- |
| `/mkt` | `VITE_MARKET_URL` (e.g. `http://127.0.0.1:8787`) |
| `/bos` | `VITE_BERTHOS_URL` (e.g. `http://127.0.0.1:7432`) |

Default `npm start` on the market is **MemoryWallet** (no `WALLET_ADAPTER=cdp`). This UI then `POST /wallets/agent` + `POST /wallets/:id/fund` and enables **Pay with test signature** (`test:<walletId>`) so unpaid invoke → 402 → 200 works locally. If `/health` reports `walletAdapter=cdp` or a live `facilitatorUrl`, test-signature pay stays disabled and the page says so. The live-mode banner shows `walletAdapter` and `facilitator` from `/health` (never `facilitatorUrl` or other secrets).

Leave both env vars unset for demo MSW (CI default). Restart `npm run dev` after changing env. Do not set CDP keys, wallet secrets, or `NETWORK=eip155:8453` here.

Guest view (`GET /v1/leases/{id}/view` / `berth view`) needs the labeled **berthos-linux-desktop:v1** image on the node host. Rebuild it after pulling berthos — an old image can lease but omit a viewer:

```bash
# in hexuria/berthos, on the node host — not this repo
docker build -t berthos-linux-desktop:v1 images/linux-desktop
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run lint` | ESLint + `tsc --noEmit` |
| `npm test` | Vitest unit + MSW integration |
| `npm run test:e2e` | Playwright Chromium: demo MSW + Vite `/mkt` + `/bos` against an in-process mock (HTTP + host-park `desktop.linux` + CDP health disable + host eligibility, no Docker) |
| `npm run build` | Production bundle |

## Talks to

**berth-market** over HTTP ([README](https://github.com/hexuria/berth-market/blob/main/README.md)):

| Method | Path | Used for |
| --- | --- | --- |
| `GET` | `/listings` | Catalog |
| `POST` | `/listings` | Host park of eligible `desktop.linux`; refuse laptop / host-desktop (`forbidden_class`) |
| `GET` | `/listings/:id/invoke` | Unpaid → 402 + `PAYMENT-REQUIRED`; paid → receipt |
| `POST` | `/wallets/treasury` | Seller / parent treasury (live MemoryWallet) |
| `POST` | `/wallets/agent` | Capped child; live MemoryWallet bootstrap |
| `POST` | `/wallets/:id/fund` | Test USDC for `test:<walletId>` |
| `GET` | `/wallets/:id` | Demo seed wallet, or the live test agent |
| `GET` | `/receipts/:id` | Receipt (`onChainSettlement` when the market set it) |
| `POST` | `/receipts/:id/end` | End Berthos lease; occupancy seconds, not a second charge |
| `GET` | `/health` | Liveness + identity (`walletAdapter` / `facilitator`; `facilitatorUrl` is not shown in the UI) |

Demo and local MemoryWallet pay encode a v2 `PAYMENT-SIGNATURE` whose inner signature is `test:<walletId>` — the market's `TestFacilitator` format. Receipt **90/10** is accounting (`sellerAtomic` / `protocolAtomic`). When `onChainSettlement` is `payTo_100`, on-chain USDC went 100% to `payTo` — this UI does not call that a Base split. `cdp_split_90_10` is the only on-chain 90/10.

New listings (demo seed + the buyer **New listing** helper) default to **Base Sepolia** (`eip155:84532`) / Sepolia USDC. A stored `eip155:8453` row is shown as-is and is not rewritten.

**berthos** over loopback HTTP, optional ([README](https://github.com/hexuria/berthos/blob/main/README.md)):

| Method | Path | Used for |
| --- | --- | --- |
| `GET` | `/v1/eligibility` | Host eligibility (`ok`, `class`, `checks[]`) |
| `GET` | `/v1/leases/{id}/view` | `{ viewer_url }` for the **guest**, not the host desktop |

CI mocks both. A missing node is shown as unreachable; this UI does not start it.

## License

MIT.

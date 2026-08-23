# berth-web

Public **host / buyer** UI for [Berth Market](https://github.com/hexuria/berth-market) and [Berthos](https://github.com/hexuria/berthos).

This repo is **not** the node and **not** the market. It is the human surface:

| Role | What this UI does | What it does not do |
| --- | --- | --- |
| **Host** | Copy `berth doctor` / `berth node up` commands. Show eligibility if a Berthos URL is set (mocked in demo / CI). | Start Docker, a hypervisor, or a guest. |
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

Optional live market (same-origin Vite proxy — do not fetch :8787 from the page):

```bash
# other terminal: hexuria/berth-market
npm start            # http://127.0.0.1:8787

# this repo
export VITE_MARKET_URL=http://127.0.0.1:8787
# optional loopback node (same role as BERTHOS_URL on the market)
export VITE_BERTHOS_URL=http://127.0.0.1:7432
npm run dev          # browser uses /mkt → :8787 and /bos → :7432
```

berth-market does not send CORS headers, so `VITE_MARKET_URL=http://127.0.0.1:8787` as a **browser** fetch target fails (`Failed to fetch`). The default Vite config reads those env vars and proxies:

| Browser path | Upstream (env) |
| --- | --- |
| `/mkt` | `VITE_MARKET_URL` (e.g. `http://127.0.0.1:8787`) |
| `/bos` | `VITE_BERTHOS_URL` (e.g. `http://127.0.0.1:7432`) |

Leave both unset for demo MSW (CI default). Restart `npm run dev` after changing env. Do not set CDP keys, wallet secrets, or `NETWORK=eip155:8453` here.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run lint` | ESLint + `tsc --noEmit` |
| `npm test` | Vitest unit + MSW integration |
| `npm run test:e2e` | Playwright Chromium (demo mocks) |
| `npm run build` | Production bundle |

## Talks to

**berth-market** over HTTP ([README](https://github.com/hexuria/berth-market/blob/main/README.md)):

| Method | Path | Used for |
| --- | --- | --- |
| `GET` | `/listings` | Catalog |
| `POST` | `/listings` | Refuse laptop / host-desktop (`forbidden_class`) |
| `GET` | `/listings/:id/invoke` | Unpaid → 402 + `PAYMENT-REQUIRED`; paid → receipt |
| `GET` | `/wallets/:id` | Demo agent wallet |
| `GET` | `/receipts/:id` | Receipt |
| `POST` | `/receipts/:id/end` | End Berthos lease; occupancy seconds, not a second charge |
| `GET` | `/health` | Liveness |

Demo pay encodes a v2 `PAYMENT-SIGNATURE` whose inner signature is `test:<walletId>` — the market's `TestFacilitator` format.

**berthos** over loopback HTTP, optional ([README](https://github.com/hexuria/berthos/blob/main/README.md)):

| Method | Path | Used for |
| --- | --- | --- |
| `GET` | `/v1/eligibility` | Host eligibility (`ok`, `class`, `checks[]`) |
| `GET` | `/v1/leases/{id}/view` | `{ viewer_url }` for the **guest**, not the host desktop |

CI mocks both. A missing node is shown as unreachable; this UI does not start it.

## License

MIT.

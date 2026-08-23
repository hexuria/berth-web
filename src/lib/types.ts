export const BASE_SEPOLIA_CAIP2 = "eip155:84532" as const;
export const BASE_CAIP2 = "eip155:8453" as const;
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
/** Circle USDC on Base mainnet. Never rewrite a stored listing onto this. */
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** How USDC actually moved on-chain. Receipt 90/10 is always stored. */
export type OnChainSettlement = "payTo_100" | "cdp_split_90_10";

export type ListingKind = "http" | "mcp" | "desktop.linux";

export interface DoctorCheck {
  id: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface EligibilityAttestation {
  source: "berthos.doctor";
  ok: boolean;
  eligible?: boolean;
  class: string;
  nodeId?: string;
  attestedAt?: string;
  timestamp?: string;
  berthosUrl?: string;
  protocol?: string;
  intent?: string;
  checks?: DoctorCheck[];
  image?: {
    name?: string;
    labels?: Record<string, string>;
  };
}

export interface Listing {
  id: string;
  kind: string;
  title: string;
  description?: string;
  price: {
    amount: string;
    asset: "USDC";
    network: string;
  };
  payTo: string;
  class?: string;
  endpoint?: {
    url: string;
    method: string;
    tool?: string;
  };
  fulfillment?: {
    berthosUrl?: string;
    sku?: string;
    nodeId?: string;
  };
  eligibility?: EligibilityAttestation;
  createdAt: string;
}

export interface CdpWalletMeta {
  ownerAddress?: string;
  spendPermission?: {
    account: string;
    spender: string;
    token: "usdc";
    allowance: string;
    periodInDays: number;
  };
}

export interface Wallet {
  id: string;
  kind: "treasury" | "agent";
  label?: string;
  address: string;
  parentId?: string;
  spendCapAtomic: string;
  spentAtomic: string;
  balanceAtomic: string;
  createdAt: string;
  /** Present when the market created the wallet through CdpWalletAdapter. */
  cdp?: CdpWalletMeta;
}

export interface Receipt {
  id: string;
  listingId: string;
  payerWalletId: string;
  payerAddress: string;
  sellerAddress: string;
  protocolAddress: string;
  amountAtomic: string;
  sellerAtomic: string;
  protocolAtomic: string;
  transaction: string;
  network: string;
  createdAt: string;
  leaseId?: string;
  berthosUrl?: string;
  leaseState?: "live" | "ended";
  occupancySeconds?: number;
  billedSeconds?: number;
  occupancyUnit?: "seconds";
  /**
   * On-chain movement. `payTo_100` = public facilitator sent the full amount
   * to `sellerAddress`. `cdp_split_90_10` = CDP did two USDC transfers.
   * Omitted for the in-memory test ledger.
   */
  onChainSettlement?: OnChainSettlement;
}

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
    listingId?: string;
    assetTransferMethod?: string;
  };
}

export interface PaymentRequired {
  x402Version: 2;
  error?: string;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
    serviceName?: string;
  };
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

export interface PaymentPayload {
  x402Version: 2;
  resource?: PaymentRequired["resource"];
  accepted: PaymentRequirements;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

export interface Fulfillment {
  status: string;
  leaseId?: string;
  berthosUrl?: string;
  os?: string;
  state?: string;
  occupancyUnit?: "seconds";
  note?: string;
  endpoint?: Listing["endpoint"];
}

export interface InvokeResult {
  status: number;
  quote?: PaymentRequired;
  error?: { code: string; message: string };
  listing?: { id: string; kind: string; title: string };
  fulfillment?: Fulfillment;
  receipt?: Receipt;
}

export interface MarketError {
  code: string;
  message: string;
}

/** GET /health — extra fields are optional because older markets omit them. */
export interface MarketHealth {
  ok: boolean;
  service?: string;
  asset?: string;
  network?: string;
  stagingNetwork?: string;
  protocolCutBps?: number;
  demo?: boolean;
  /** `memory` (default npm start) or `cdp`. */
  walletAdapter?: string;
  /** `test` / omitted vs `live` / `cdp`. */
  facilitator?: string;
  facilitatorUrl?: string;
}

export interface ViewUrl {
  viewer_url: string;
  target?: string;
  token?: string;
}

export interface Occupancy {
  seconds: number;
  billedSeconds: number;
  unit: "seconds";
  chargedHere: false;
  note: string;
}

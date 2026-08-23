import { marketUrl } from "./config";
import type {
  InvokeResult,
  Listing,
  MarketError,
  Occupancy,
  Receipt,
  Wallet,
} from "./types";
import { PAYMENT_SIGNATURE_HEADER } from "./x402";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function asError(body: unknown, fallback: string): MarketError {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "code" in body.error &&
    "message" in body.error
  ) {
    const error = body.error as MarketError;
    return { code: String(error.code), message: String(error.message) };
  }
  return { code: "request_failed", message: fallback };
}

export async function fetchCatalog(): Promise<Listing[]> {
  const response = await fetch(`${marketUrl()}/listings`);
  const body = await readJson<{ listings?: Listing[]; error?: MarketError }>(response);
  if (!response.ok) {
    throw new Error(asError(body, `GET /listings → ${response.status}`).message);
  }
  return body.listings ?? [];
}

export async function createListing(input: unknown): Promise<
  { ok: true; listing: Listing } | { ok: false; error: MarketError; status: number }
> {
  const response = await fetch(`${marketUrl()}/listings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ listing?: Listing; error?: MarketError }>(response);
  if (!response.ok || !body.listing) {
    return { ok: false, status: response.status, error: asError(body, "listing rejected") };
  }
  return { ok: true, listing: body.listing };
}

export async function invokeListing(id: string, paymentSignature?: string): Promise<InvokeResult> {
  const headers = new Headers();
  if (paymentSignature) {
    headers.set(PAYMENT_SIGNATURE_HEADER, paymentSignature);
  }
  const response = await fetch(`${marketUrl()}/listings/${id}/invoke`, { headers });
  const body = await readJson<InvokeResult>(response);
  return {
    status: response.status,
    quote: body.quote,
    error: body.error,
    listing: body.listing,
    fulfillment: body.fulfillment,
    receipt: body.receipt,
  };
}

export async function fetchWallet(id: string): Promise<Wallet> {
  const response = await fetch(`${marketUrl()}/wallets/${id}`);
  const body = await readJson<{ wallet?: Wallet; error?: MarketError }>(response);
  if (!response.ok || !body.wallet) {
    throw new Error(asError(body, `wallet ${id} not found`).message);
  }
  return body.wallet;
}

export async function fetchReceipt(id: string): Promise<Receipt> {
  const response = await fetch(`${marketUrl()}/receipts/${id}`);
  const body = await readJson<{ receipt?: Receipt; error?: MarketError }>(response);
  if (!response.ok || !body.receipt) {
    throw new Error(asError(body, `receipt ${id} not found`).message);
  }
  return body.receipt;
}

export async function endReceipt(id: string): Promise<{
  receipt: Receipt;
  occupancy?: Occupancy;
  error?: MarketError;
}> {
  const response = await fetch(`${marketUrl()}/receipts/${id}/end`, { method: "POST" });
  const body = await readJson<{
    receipt?: Receipt;
    occupancy?: Occupancy;
    error?: MarketError;
  }>(response);
  if (!response.ok || !body.receipt) {
    return { receipt: body.receipt as Receipt, occupancy: body.occupancy, error: asError(body, "end failed") };
  }
  return { receipt: body.receipt, occupancy: body.occupancy };
}

export async function fetchHealth(): Promise<{ ok: boolean; service?: string; stagingNetwork?: string }> {
  const response = await fetch(`${marketUrl()}/health`);
  return readJson(response);
}

import { BASE_CAIP2, BASE_SEPOLIA_CAIP2, USDC_BASE, USDC_BASE_SEPOLIA } from "./types";

export const DEFAULT_LISTING_PAY_TO = "0x1111111111111111111111111111111111111111";
export const DEFAULT_LISTING_AMOUNT = "1000";

export interface ListingPriceInput {
  amount?: string;
  asset?: "USDC";
  network?: string;
}

export interface NewHttpListingInput {
  kind: "http";
  title: string;
  description: string;
  price: { amount: string; asset: "USDC"; network: string };
  payTo: string;
  endpoint: { url: string; method: "GET" };
}

/** Stored / explicit `eip155:8453` stays mainnet. Omitted network → Sepolia. */
export function defaultListingNetwork(explicit?: string): string {
  const trimmed = explicit?.trim();
  return trimmed || BASE_SEPOLIA_CAIP2;
}

/** Quote asset follows the listing's stored network. Does not rewrite mainnet. */
export function usdcAddressFor(network: string): string {
  return network === BASE_CAIP2 || network === "base" ? USDC_BASE : USDC_BASE_SEPOLIA;
}

export function isMainnetListingNetwork(network: string | undefined): boolean {
  const trimmed = network?.trim();
  return trimmed === BASE_CAIP2 || trimmed === "base";
}

/**
 * Default price for demo seed and any "new listing" helper.
 * Pass an explicit network (including mainnet) to keep it; never overwrite.
 */
export function defaultListingPrice(
  amount = DEFAULT_LISTING_AMOUNT,
  network?: string,
): { amount: string; asset: "USDC"; network: string } {
  return {
    amount,
    asset: "USDC",
    network: defaultListingNetwork(network),
  };
}

/** Merge a posted price: omit network → Sepolia; keep a caller-supplied mainnet. */
export function withListingNetworkDefault(price: ListingPriceInput | undefined): {
  amount: string;
  asset: "USDC";
  network: string;
} {
  return defaultListingPrice(price?.amount ?? DEFAULT_LISTING_AMOUNT, price?.network);
}

/** Local MemoryWallet helper — always Sepolia USDC unless the caller sets a network. */
export function newHttpListingInput(overrides?: {
  title?: string;
  description?: string;
  amount?: string;
  network?: string;
  payTo?: string;
}): NewHttpListingInput {
  const title = overrides?.title ?? `local.http.${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
  return {
    kind: "http",
    title,
    description:
      overrides?.description ??
      "Local MemoryWallet listing. Base Sepolia USDC (eip155:84532). Not a mainnet rewrite.",
    price: defaultListingPrice(overrides?.amount, overrides?.network),
    payTo: overrides?.payTo ?? DEFAULT_LISTING_PAY_TO,
    endpoint: { url: "https://api.example.com/weather", method: "GET" },
  };
}

import { describe, expect, it } from "vitest";
import {
  defaultListingNetwork,
  defaultListingPrice,
  isMainnetListingNetwork,
  newHttpListingInput,
  usdcAddressFor,
  withListingNetworkDefault,
} from "../src/lib/listing-defaults";
import { BASE_CAIP2, BASE_SEPOLIA_CAIP2, USDC_BASE, USDC_BASE_SEPOLIA } from "../src/lib/types";

describe("listing defaults (Sepolia; do not rewrite mainnet)", () => {
  it("omitted network defaults to eip155:84532", () => {
    expect(defaultListingNetwork()).toBe(BASE_SEPOLIA_CAIP2);
    expect(defaultListingNetwork("")).toBe(BASE_SEPOLIA_CAIP2);
    expect(defaultListingPrice().network).toBe(BASE_SEPOLIA_CAIP2);
    expect(withListingNetworkDefault({ amount: "1000" }).network).toBe(BASE_SEPOLIA_CAIP2);
  });

  it("keeps an explicit mainnet network", () => {
    expect(defaultListingNetwork(BASE_CAIP2)).toBe(BASE_CAIP2);
    expect(defaultListingPrice("1000", BASE_CAIP2).network).toBe(BASE_CAIP2);
    expect(withListingNetworkDefault({ amount: "5000", network: BASE_CAIP2 })).toEqual({
      amount: "5000",
      asset: "USDC",
      network: BASE_CAIP2,
    });
    expect(isMainnetListingNetwork(BASE_CAIP2)).toBe(true);
    expect(isMainnetListingNetwork(BASE_SEPOLIA_CAIP2)).toBe(false);
  });

  it("quotes USDC from the listing network (no rewrite)", () => {
    expect(usdcAddressFor(BASE_SEPOLIA_CAIP2)).toBe(USDC_BASE_SEPOLIA);
    expect(usdcAddressFor(BASE_CAIP2)).toBe(USDC_BASE);
    expect(usdcAddressFor("base")).toBe(USDC_BASE);
  });

  it("new listing helper is Sepolia unless the caller sets a network", () => {
    const listing = newHttpListingInput({ title: "local.http" });
    expect(listing.kind).toBe("http");
    expect(listing.price).toEqual({ amount: "1000", asset: "USDC", network: BASE_SEPOLIA_CAIP2 });
    const mainnet = newHttpListingInput({ title: "kept.mainnet", network: BASE_CAIP2 });
    expect(mainnet.price.network).toBe(BASE_CAIP2);
  });
});

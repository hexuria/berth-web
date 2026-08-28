import { describe, expect, it } from "vitest";
import {
  defaultListingNetwork,
  defaultListingPrice,
  isMainnetListingNetwork,
  newDesktopListingInput,
  newHttpListingInput,
  usdcAddressFor,
  withListingNetworkDefault,
} from "../src/lib/listing-defaults";
import { decideListing } from "../src/lib/listing-guard";
import { eligibleDoctorReport } from "../src/mocks/data";
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

  it("host park helper is desktop.linux on Sepolia, never laptop or host-desktop", () => {
    const listing = newDesktopListingInput({
      title: "parked.guest",
      eligibility: eligibleDoctorReport(),
    });
    expect(listing.kind).toBe("desktop.linux");
    expect(listing.class).toBe("vm-guest");
    expect(listing.price).toEqual({ amount: "1000", asset: "USDC", network: BASE_SEPOLIA_CAIP2 });
    expect(listing.eligibility.ok).toBe(true);
    expect(listing.eligibility.class).toBe("vm-guest");
    expect(listing.fulfillment.nodeId).toBe("node_demo");
    expect(decideListing(listing).ok).toBe(true);

    const kept = newDesktopListingInput({
      eligibility: eligibleDoctorReport(),
      network: BASE_CAIP2,
    });
    expect(kept.kind).toBe("desktop.linux");
    expect(kept.price.network).toBe(BASE_CAIP2);

    const laptopClass = newDesktopListingInput({
      eligibility: { ...eligibleDoctorReport(), class: "laptop" },
    });
    expect(laptopClass.kind).toBe("desktop.linux");
    const refused = decideListing(laptopClass);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("forbidden_class");
  });
});

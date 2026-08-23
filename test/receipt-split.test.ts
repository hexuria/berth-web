import { describe, expect, it } from "vitest";
import { describeReceiptSplit } from "../src/lib/receipt-split";

describe("receipt 90/10 copy", () => {
  const atoms = { sellerAtomic: "900", protocolAtomic: "100" };

  it("omitted onChainSettlement is receipt accounting, not an on-chain split", () => {
    const copy = describeReceiptSplit(atoms);
    expect(copy.onChainSplit).toBe(false);
    expect(copy.headline).toContain("receipt accounting");
    expect(copy.headline).toContain("90%");
    expect(copy.detail).toMatch(/not an on-chain USDC split/i);
  });

  it("payTo_100 never implies a Base USDC split", () => {
    const copy = describeReceiptSplit({ ...atoms, onChainSettlement: "payTo_100" });
    expect(copy.onChainSplit).toBe(false);
    expect(copy.headline).toContain("receipt accounting");
    expect(copy.detail).toMatch(/100% USDC went to payTo/i);
    expect(copy.detail).not.toMatch(/on-chain 90\/10/i);
    expect(copy.detail).toMatch(/does not split/i);
  });

  it("cdp_split_90_10 is the only on-chain split claim", () => {
    const copy = describeReceiptSplit({ ...atoms, onChainSettlement: "cdp_split_90_10" });
    expect(copy.onChainSplit).toBe(true);
    expect(copy.detail).toMatch(/CDP moved 90%/i);
  });
});

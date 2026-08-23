import { formatUsdcAtomic } from "./payment";
import type { Receipt } from "./types";

export interface ReceiptSplitCopy {
  headline: string;
  detail: string;
  onChainSplit: boolean;
}

/**
 * 90/10 is receipt accounting unless the market says an on-chain split happened.
 * `payTo_100` is 100% USDC to payTo — never imply a Base split.
 */
export function describeReceiptSplit(receipt: Pick<Receipt, "sellerAtomic" | "protocolAtomic" | "onChainSettlement">): ReceiptSplitCopy {
  const seller = formatUsdcAtomic(receipt.sellerAtomic);
  const protocol = formatUsdcAtomic(receipt.protocolAtomic);
  const accounting = `seller ${seller} (90%) · protocol ${protocol} (10%) — receipt accounting`;

  if (receipt.onChainSettlement === "cdp_split_90_10") {
    return {
      headline: accounting,
      detail: "On-chain: CDP moved 90% USDC to the seller and 10% to the protocol. That matches this receipt.",
      onChainSplit: true,
    };
  }

  if (receipt.onChainSettlement === "payTo_100") {
    return {
      headline: accounting,
      detail:
        "On-chain: 100% USDC went to payTo (seller). The public facilitator does not split. Do not read 90/10 as a Base USDC split.",
      onChainSplit: false,
    };
  }

  return {
    headline: accounting,
    detail: "In-memory / test ledger only. 90/10 was not an on-chain USDC split on Base.",
    onChainSplit: false,
  };
}

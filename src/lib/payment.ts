import type { PaymentPayload, PaymentRequired, Wallet } from "./types";
import { encodeX402Header } from "./x402";

/** Market TestFacilitator accepts `test:<walletId>` inside a v2 PaymentPayload. */
export function testPaymentSignature(walletId: string): string {
  if (!walletId) {
    throw new Error("wallet id required for test signature");
  }
  return `test:${walletId}`;
}

export function buildDemoPaymentPayload(
  quote: PaymentRequired,
  wallet: Pick<Wallet, "id" | "address">,
  nowSeconds = Math.floor(Date.now() / 1000),
): PaymentPayload {
  const accepted = quote.accepts[0];
  if (!accepted) {
    throw new Error("quote has no accepts[]");
  }
  return {
    x402Version: 2,
    resource: quote.resource,
    accepted,
    payload: {
      signature: testPaymentSignature(wallet.id),
      authorization: {
        from: wallet.address,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: String(nowSeconds - 30),
        validBefore: String(nowSeconds + 120),
        nonce: `0x${crypto.randomUUID().replaceAll("-", "")}`,
      },
    },
  };
}

export function encodeDemoPaymentSignature(
  quote: PaymentRequired,
  wallet: Pick<Wallet, "id" | "address">,
): string {
  return encodeX402Header(buildDemoPaymentPayload(quote, wallet));
}

export function formatUsdcAtomic(atomic: string): string {
  const value = BigInt(atomic);
  const whole = value / 1_000_000n;
  const frac = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length === 0 ? `${whole}` : `${whole}.${frac}`;
}

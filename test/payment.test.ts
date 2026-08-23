import { describe, expect, it } from "vitest";
import { buildDemoPaymentPayload, testPaymentSignature } from "../src/lib/payment";
import { decodeX402Header, encodeX402Header } from "../src/lib/x402";
import type { PaymentPayload, PaymentRequired } from "../src/lib/types";

const quote: PaymentRequired = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: {
    url: "http://127.0.0.1:8787/listings/lst_weather/invoke",
    description: "weather.now",
    mimeType: "application/json",
    serviceName: "berth-market",
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      amount: "1000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 60,
    },
  ],
};

describe("demo payment signature", () => {
  it("uses test:<walletId>", () => {
    expect(testPaymentSignature("wal_demo_agent")).toBe("test:wal_demo_agent");
  });

  it("encodes a v2 PAYMENT-SIGNATURE the market TestFacilitator accepts", () => {
    const payload = buildDemoPaymentPayload(quote, {
      id: "wal_demo_agent",
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(payload.payload.signature).toBe("test:wal_demo_agent");
    expect(payload.accepted.network).toBe("eip155:84532");
    expect(payload.payload.authorization.to).toBe(quote.accepts[0]?.payTo);
    const header = encodeX402Header(payload);
    const roundTrip = decodeX402Header<PaymentPayload>(header);
    expect(roundTrip.payload.signature).toBe("test:wal_demo_agent");
  });
});

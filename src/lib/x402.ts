/** x402 v2 header encode/decode — same wire as berth-market `src/domain/x402.ts`. */

export const X402_VERSION = 2 as const;
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

export function encodeX402Header(value: unknown): string {
  const json = JSON.stringify(value);
  return bytesToBase64(new TextEncoder().encode(json));
}

export function decodeX402Header<T>(header: string): T {
  const bytes = base64ToBytes(header.trim());
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as T;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

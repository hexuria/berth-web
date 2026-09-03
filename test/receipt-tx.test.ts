import { describe, expect, it } from "vitest";
import {
  BASESCAN_MAINNET_TX,
  BASESCAN_SEPOLIA_TX,
  TEST_FACILITATOR_TX_COPY,
  UNKNOWN_NETWORK_TX_COPY,
  describeReceiptTx,
  explorerTxBaseUrl,
  isEvmTxHash,
  shortenTxId,
} from "../src/lib/receipt-tx";
import { BASE_CAIP2, BASE_SEPOLIA_CAIP2 } from "../src/lib/types";

const SEPOLIA_HASH = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const MAINNET_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("isEvmTxHash", () => {
  it("accepts 0x + 64 hex", () => {
    expect(isEvmTxHash(SEPOLIA_HASH)).toBe(true);
    expect(isEvmTxHash(`0x${"A".repeat(64)}`)).toBe(true);
  });

  it("rejects malformed and test-facilitator identifiers", () => {
    expect(isEvmTxHash("")).toBe(false);
    expect(isEvmTxHash("0x")).toBe(false);
    expect(isEvmTxHash(`0x${"ab".repeat(16)}`)).toBe(false);
    expect(isEvmTxHash(`${SEPOLIA_HASH}0`)).toBe(false);
    expect(isEvmTxHash("0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBe(
      false,
    );
    expect(isEvmTxHash("tf_settle_lst_weather")).toBe(false);
    expect(isEvmTxHash("test:wal_demo_agent")).toBe(false);
    expect(isEvmTxHash(`cdp:wal_abc:${new Date().toISOString()}`)).toBe(false);
  });
});

describe("explorerTxBaseUrl", () => {
  it("maps Base Sepolia CAIP-2 to Basescan Sepolia", () => {
    expect(explorerTxBaseUrl(BASE_SEPOLIA_CAIP2)).toBe(BASESCAN_SEPOLIA_TX);
  });

  it("maps stored mainnet CAIP-2 to mainnet Basescan — never Sepolia", () => {
    expect(explorerTxBaseUrl(BASE_CAIP2)).toBe(BASESCAN_MAINNET_TX);
    expect(explorerTxBaseUrl(BASE_CAIP2)).not.toContain("sepolia");
  });

  it("returns undefined for unknown, aliased, or absent networks", () => {
    expect(explorerTxBaseUrl(undefined)).toBeUndefined();
    expect(explorerTxBaseUrl(null)).toBeUndefined();
    expect(explorerTxBaseUrl("")).toBeUndefined();
    expect(explorerTxBaseUrl("   ")).toBeUndefined();
    expect(explorerTxBaseUrl("base-sepolia")).toBeUndefined();
    expect(explorerTxBaseUrl("eip155:1")).toBeUndefined();
    expect(explorerTxBaseUrl("not-a-network")).toBeUndefined();
  });
});

describe("shortenTxId", () => {
  it("shortens a 66-char hash and leaves short ids intact", () => {
    expect(shortenTxId(SEPOLIA_HASH)).toBe("0xdeadbeef…deadbeef");
    expect(shortenTxId("tf_settle_lst_weather")).toBe("tf_settle_lst_weather");
    expect(shortenTxId("")).toBe("");
    expect(shortenTxId("0xabc")).toBe("0xabc");
  });
});

describe("describeReceiptTx", () => {
  it("renders nothing for missing, empty, or whitespace transaction", () => {
    expect(describeReceiptTx({ network: BASE_SEPOLIA_CAIP2 })).toEqual({ kind: "none" });
    expect(describeReceiptTx({ transaction: "", network: BASE_SEPOLIA_CAIP2 })).toEqual({
      kind: "none",
    });
    expect(describeReceiptTx({ transaction: "   ", network: BASE_SEPOLIA_CAIP2 })).toEqual({
      kind: "none",
    });
    expect(describeReceiptTx({ transaction: null, network: BASE_SEPOLIA_CAIP2 })).toEqual({
      kind: "none",
    });
  });

  it("links a Sepolia hash to Basescan Sepolia and keeps the raw hash", () => {
    const view = describeReceiptTx({ transaction: SEPOLIA_HASH, network: BASE_SEPOLIA_CAIP2 });
    expect(view.kind).toBe("explorer");
    if (view.kind !== "explorer") return;
    expect(view.href).toBe(`${BASESCAN_SEPOLIA_TX}/${SEPOLIA_HASH}`);
    expect(view.hash).toBe(SEPOLIA_HASH);
    expect(view.network).toBe(BASE_SEPOLIA_CAIP2);
    expect(view.explorerLabel).toMatch(/Basescan Sepolia/i);
    expect(view.href).toContain("sepolia.basescan.org");
  });

  it("links a stored mainnet hash to mainnet Basescan, never Sepolia", () => {
    const view = describeReceiptTx({ transaction: MAINNET_HASH, network: BASE_CAIP2 });
    expect(view.kind).toBe("explorer");
    if (view.kind !== "explorer") return;
    expect(view.href).toBe(`${BASESCAN_MAINNET_TX}/${MAINNET_HASH}`);
    expect(view.href).toContain("https://basescan.org/tx/");
    expect(view.href).not.toContain("sepolia");
    expect(view.network).toBe(BASE_CAIP2);
  });

  it("shows a test-facilitator id without an explorer link", () => {
    const view = describeReceiptTx({
      transaction: "tf_settle_lst_weather",
      network: BASE_SEPOLIA_CAIP2,
    });
    expect(view.kind).toBe("offchain");
    if (view.kind !== "offchain") return;
    expect(view.id).toBe("tf_settle_lst_weather");
    expect(view.label).toBe(TEST_FACILITATOR_TX_COPY);
    expect(view.label).toMatch(/did not touch a chain/i);
  });

  it("does not dress a short 0x uuid up as an on-chain link", () => {
    const fake = `0x${"ab".repeat(16)}`;
    const view = describeReceiptTx({ transaction: fake, network: BASE_SEPOLIA_CAIP2 });
    expect(view.kind).toBe("offchain");
    if (view.kind !== "offchain") return;
    expect(view.id).toBe(fake);
    expect(view.label).toMatch(/did not touch a chain/i);
  });

  it("shows a valid hash with unknown or absent network without an explorer link", () => {
    const unknown = describeReceiptTx({ transaction: SEPOLIA_HASH, network: "eip155:1" });
    expect(unknown.kind).toBe("unlinked");
    if (unknown.kind !== "unlinked") return;
    expect(unknown.hash).toBe(SEPOLIA_HASH);
    expect(unknown.label).toBe(UNKNOWN_NETWORK_TX_COPY);

    const absent = describeReceiptTx({ transaction: SEPOLIA_HASH });
    expect(absent.kind).toBe("unlinked");
    if (absent.kind !== "unlinked") return;
    expect(absent.network).toBe("");
    expect(absent.label).toMatch(/not rewritten to Sepolia/i);
  });
});

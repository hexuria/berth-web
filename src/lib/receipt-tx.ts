import { BASE_CAIP2, BASE_SEPOLIA_CAIP2 } from "./types";
import type { Receipt } from "./types";

/** EVM transaction hash: 0x + 32 bytes. TestFacilitator ids are not this shape. */
export const EVM_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const BASESCAN_SEPOLIA_TX = "https://sepolia.basescan.org/tx";
export const BASESCAN_MAINNET_TX = "https://basescan.org/tx";

const EXPLORER_TX_BY_CAIP2: Record<string, string> = {
  [BASE_SEPOLIA_CAIP2]: BASESCAN_SEPOLIA_TX,
  [BASE_CAIP2]: BASESCAN_MAINNET_TX,
};

const EXPLORER_LABEL_BY_CAIP2: Record<string, string> = {
  [BASE_SEPOLIA_CAIP2]: "View on Basescan Sepolia",
  [BASE_CAIP2]: "View on Basescan",
};

export const TEST_FACILITATOR_TX_COPY =
  "Test facilitator / MemoryWallet identifier. This settle did not touch a chain.";

export const UNKNOWN_NETWORK_TX_COPY =
  "No explorer for this network. Hash shown as stored — not rewritten to Sepolia.";

export interface ReceiptTxFields {
  transaction?: Receipt["transaction"] | null;
  network?: Receipt["network"] | null;
}

export type ReceiptTxView =
  | { kind: "none" }
  | {
      kind: "explorer";
      hash: string;
      shortened: string;
      href: string;
      network: string;
      explorerLabel: string;
    }
  | {
      kind: "offchain";
      id: string;
      shortened: string;
      label: string;
    }
  | {
      kind: "unlinked";
      hash: string;
      shortened: string;
      network: string;
      label: string;
    };

export function isEvmTxHash(value: string): boolean {
  return EVM_TX_HASH_RE.test(value);
}

/** Explorer `/tx` base for a stored CAIP-2. Unknown networks stay unlinked. */
export function explorerTxBaseUrl(network: string | undefined | null): string | undefined {
  const trimmed = network?.trim();
  if (!trimmed) return undefined;
  return EXPLORER_TX_BY_CAIP2[trimmed];
}

export function explorerLabelFor(network: string): string {
  return EXPLORER_LABEL_BY_CAIP2[network] ?? "View on explorer";
}

/** Shorten a 64-hex hash. Test-facilitator ids stay intact. */
export function shortenTxId(value: string, head = 10, tail = 8): string {
  if (!isEvmTxHash(value)) return value;
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Decide how to show `receipt.transaction`.
 *
 * berth-market stores either a facilitator settle hash or a test-facilitator /
 * MemoryWallet identifier in the same string field. This UI does not invent a
 * settledOnChain flag. A 64-hex hash on a known CAIP-2 gets that network's
 * explorer (8453 stays mainnet). Anything else is shown without a chain link.
 */
export function describeReceiptTx(receipt: ReceiptTxFields): ReceiptTxView {
  const transaction = typeof receipt.transaction === "string" ? receipt.transaction.trim() : "";
  if (!transaction) return { kind: "none" };

  const network = typeof receipt.network === "string" ? receipt.network.trim() : "";
  const shortened = shortenTxId(transaction);

  if (!isEvmTxHash(transaction)) {
    return {
      kind: "offchain",
      id: transaction,
      shortened,
      label: TEST_FACILITATOR_TX_COPY,
    };
  }

  const explorerBase = explorerTxBaseUrl(network);
  if (explorerBase) {
    return {
      kind: "explorer",
      hash: transaction,
      shortened,
      href: `${explorerBase}/${transaction}`,
      network,
      explorerLabel: explorerLabelFor(network),
    };
  }

  return {
    kind: "unlinked",
    hash: transaction,
    shortened,
    network,
    label: UNKNOWN_NETWORK_TX_COPY,
  };
}

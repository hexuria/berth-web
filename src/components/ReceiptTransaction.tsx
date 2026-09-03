import { describeReceiptTx, type ReceiptTxFields } from "../lib/receipt-tx";

interface ReceiptTransactionProps {
  receipt: ReceiptTxFields;
  /** Prefix for test ids: `receipt-tx` (buyer) or `host-receipt-tx`. */
  testId?: string;
}

export function ReceiptTransaction({ receipt, testId = "receipt-tx" }: ReceiptTransactionProps) {
  const view = describeReceiptTx(receipt);
  if (view.kind === "none") return null;

  return (
    <>
      <dt>transaction</dt>
      <dd data-testid={testId}>
        {view.kind === "explorer" && (
          <>
            <a
              data-testid={`${testId}-link`}
              href={view.href}
              target="_blank"
              rel="noreferrer"
            >
              {view.explorerLabel}
            </a>
            <span className="mono" data-testid={`${testId}-hash`} title={view.hash}>
              {view.hash}
            </span>
          </>
        )}
        {view.kind === "offchain" && (
          <>
            <span className="mono" data-testid={`${testId}-id`} title={view.id}>
              {view.id}
            </span>
            <p className="meta" data-testid={`${testId}-offchain`}>
              {view.label}
            </p>
          </>
        )}
        {view.kind === "unlinked" && (
          <>
            <span className="mono" data-testid={`${testId}-hash`} title={view.hash}>
              {view.hash}
            </span>
            <p className="meta" data-testid={`${testId}-unlinked`}>
              {view.label}
            </p>
          </>
        )}
      </dd>
    </>
  );
}

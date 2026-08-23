import { berthosUrl } from "./config";
import type { EligibilityAttestation, ViewUrl } from "./types";

export async function fetchEligibility(): Promise<
  { ok: true; report: EligibilityAttestation } | { ok: false; message: string }
> {
  const base = berthosUrl();
  if (!base) {
    return {
      ok: false,
      message:
        "No Berthos URL. Set VITE_BERTHOS_URL to the node loopback (default http://127.0.0.1:7432) to read GET /v1/eligibility. This UI does not start the node.",
    };
  }
  try {
    const response = await fetch(`${base}/v1/eligibility`);
    if (!response.ok) {
      return { ok: false, message: `GET /v1/eligibility → ${response.status}` };
    }
    const report = (await response.json()) as EligibilityAttestation;
    return { ok: true, report };
  } catch {
    return {
      ok: false,
      message: `Berthos unreachable at ${base}. Park the node with berth doctor / berth node up — this repo does not run Docker.`,
    };
  }
}

export async function fetchViewUrl(leaseId: string): Promise<ViewUrl | undefined> {
  const base = berthosUrl();
  if (!base || !leaseId) return undefined;
  try {
    const response = await fetch(`${base}/v1/leases/${leaseId}/view`);
    if (!response.ok) return undefined;
    return (await response.json()) as ViewUrl;
  } catch {
    return undefined;
  }
}

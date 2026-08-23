/**
 * Same hard rejects as hexuria/berth-market (`src/domain/listing.ts`
 * + `src/domain/eligibility.ts`). A laptop or host desktop is never a
 * public listing — refuse here even if a catalog row leaked through.
 */

export const FORBIDDEN_KINDS = [
  "laptop",
  "host-desktop",
  "host_desktop",
  "hostdesktop",
  "desktop.laptop",
  "desktop.host",
  "desktop.host-desktop",
] as const;

export const FORBIDDEN_CLASSES = new Set([
  "laptop",
  "host-desktop",
  "host_desktop",
  "hostdesktop",
]);

export const LISTING_KINDS = ["http", "mcp", "desktop.linux"] as const;

export const ELIGIBLE_CLASSES = [
  "vm-guest",
  "dedicated-server",
  "vm",
  "server",
  "guest",
] as const;

export interface ListingLike {
  kind?: string;
  class?: string;
  eligibility?: { class?: string; ok?: boolean };
}

export interface ListingRefusal {
  ok: false;
  code: "forbidden_class" | "unsupported_kind" | "eligibility_failed";
  message: string;
  field: "kind" | "class" | "eligibility.class";
}

export interface ListingAllowed {
  ok: true;
}

export type ListingDecision = ListingAllowed | ListingRefusal;

export function isForbiddenKind(kind: string): boolean {
  return (FORBIDDEN_KINDS as readonly string[]).includes(kind) || FORBIDDEN_CLASSES.has(kind);
}

export function isForbiddenClass(value: string | undefined): boolean {
  if (!value) return false;
  return FORBIDDEN_CLASSES.has(value);
}

export function forbiddenClassMessage(field: string, value: string): string {
  return `${field}=${value} is forbidden. Hard rule: only VM/server guests, never a laptop or host desktop`;
}

export function forbiddenKindMessage(kind: string): string {
  return `listings that claim kind=${kind} are rejected — only VM/server guests, never a laptop or host desktop`;
}

/** Fail-closed decision matching the market API's `forbidden_class` / kind checks. */
export function decideListing(input: ListingLike): ListingDecision {
  const kind = input.kind?.trim();
  if (kind && isForbiddenKind(kind)) {
    return {
      ok: false,
      code: "forbidden_class",
      message: forbiddenKindMessage(kind),
      field: "kind",
    };
  }
  if (kind && !(LISTING_KINDS as readonly string[]).includes(kind)) {
    return {
      ok: false,
      code: "unsupported_kind",
      message: `unsupported listing kind "${kind}". v1 kinds: ${LISTING_KINDS.join(", ")}`,
      field: "kind",
    };
  }
  if (isForbiddenClass(input.class)) {
    return {
      ok: false,
      code: "forbidden_class",
      message: forbiddenClassMessage("class", input.class ?? ""),
      field: "class",
    };
  }
  if (isForbiddenClass(input.eligibility?.class)) {
    return {
      ok: false,
      code: "forbidden_class",
      message: forbiddenClassMessage("eligibility.class", input.eligibility?.class ?? ""),
      field: "eligibility.class",
    };
  }
  if (kind?.startsWith("desktop.") && input.eligibility && input.eligibility.ok === false) {
    return {
      ok: false,
      code: "eligibility_failed",
      message: "desktop listings fail closed when the stored doctor attestation is not ok",
      field: "eligibility.class",
    };
  }
  return { ok: true };
}

export function isPublicListingAllowed(input: ListingLike): boolean {
  return decideListing(input).ok;
}

import { describe, expect, it } from "vitest";
import {
  decideListing,
  forbiddenClassMessage,
  forbiddenKindMessage,
  isForbiddenClass,
  isForbiddenKind,
} from "../src/lib/listing-guard";

describe("listing-guard (same rejects as berth-market)", () => {
  it("refuses laptop and host-desktop kinds", () => {
    for (const kind of ["laptop", "host-desktop", "desktop.laptop", "desktop.host-desktop"]) {
      expect(isForbiddenKind(kind)).toBe(true);
      const decision = decideListing({ kind });
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        expect(decision.code).toBe("forbidden_class");
        expect(decision.message).toBe(forbiddenKindMessage(kind));
      }
    }
  });

  it("refuses laptop and host-desktop classes", () => {
    for (const cls of ["laptop", "host-desktop", "host_desktop"]) {
      expect(isForbiddenClass(cls)).toBe(true);
      const decision = decideListing({ kind: "desktop.linux", class: cls });
      expect(decision.ok).toBe(false);
      if (!decision.ok) {
        expect(decision.code).toBe("forbidden_class");
        expect(decision.message).toBe(forbiddenClassMessage("class", cls));
      }
    }
  });

  it("refuses eligibility.class=laptop even when kind is desktop.linux", () => {
    const decision = decideListing({
      kind: "desktop.linux",
      class: "vm-guest",
      eligibility: { class: "laptop", ok: true },
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.field).toBe("eligibility.class");
      expect(decision.code).toBe("forbidden_class");
    }
  });

  it("allows http and eligible desktop.linux", () => {
    expect(decideListing({ kind: "http" }).ok).toBe(true);
    expect(
      decideListing({
        kind: "desktop.linux",
        class: "vm-guest",
        eligibility: { class: "vm-guest", ok: true },
      }).ok,
    ).toBe(true);
  });

  it("fails closed when a desktop attestation is not ok", () => {
    const decision = decideListing({
      kind: "desktop.linux",
      eligibility: { class: "vm-guest", ok: false },
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("eligibility_failed");
  });
});

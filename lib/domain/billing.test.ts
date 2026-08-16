import { describe, expect, it } from "vitest";
import { monthRange } from "./billing";

describe("monthRange", () => {
  it("returns first and last day of the month in UTC", () => {
    const { periodStart, periodEnd } = monthRange(2026, 2);
    expect(periodStart.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(periodEnd.getUTCDate()).toBe(28); // 2026 غير كبيسة
  });

  it("handles leap years correctly", () => {
    const { periodEnd } = monthRange(2028, 2);
    expect(periodEnd.getUTCDate()).toBe(29);
  });
});

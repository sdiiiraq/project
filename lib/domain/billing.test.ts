import { describe, expect, it } from "vitest";
import { monthRange, prorateAmount } from "./billing";

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

describe("prorateAmount", () => {
  it("charges the full price when starting on the first day of the month", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    expect(prorateAmount(31000, start)).toBe(31000);
  });

  it("charges for the remaining days including the start day", () => {
    const start = new Date(Date.UTC(2026, 0, 16)); // 16 يومًا متبقية من أصل 31 (شامل يوم 16)
    expect(prorateAmount(31000, start)).toBe(16000);
  });

  it("never charges more than the full monthly price", () => {
    const start = new Date(Date.UTC(2026, 3, 1));
    expect(prorateAmount(90000, start)).toBeLessThanOrEqual(90000);
  });
});

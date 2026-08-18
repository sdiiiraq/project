import { describe, expect, it } from "vitest";
import { computeFuelConsumption } from "./fuel";

describe("computeFuelConsumption", () => {
  it("multiplies operating hours by the hourly rate", () => {
    expect(computeFuelConsumption(5, 1)).toBe(5);
  });

  it("replaces the value on recompute rather than adding to it", () => {
    const first = computeFuelConsumption(5, 1);
    const second = computeFuelConsumption(6, 1);
    expect(first).toBe(5);
    expect(second).toBe(6); // ليس 5 + 6
  });

  it("returns null when no rate is configured", () => {
    expect(computeFuelConsumption(5, null)).toBeNull();
    expect(computeFuelConsumption(5, undefined)).toBeNull();
    expect(computeFuelConsumption(5, 0)).toBeNull();
  });

  it("rounds to 2 decimal places", () => {
    expect(computeFuelConsumption(1 / 3, 1)).toBe(0.33);
  });

  it("handles zero operating hours", () => {
    expect(computeFuelConsumption(0, 1)).toBe(0);
  });
});

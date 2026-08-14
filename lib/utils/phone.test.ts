import { describe, expect, it } from "vitest";
import { isIraqiPhone, normalizeIraqiPhone, isEmail } from "./phone";

describe("isIraqiPhone", () => {
  it("accepts local format", () => {
    expect(isIraqiPhone("07701234567")).toBe(true);
  });
  it("accepts international format", () => {
    expect(isIraqiPhone("+9647701234567")).toBe(true);
  });
  it("rejects invalid numbers", () => {
    expect(isIraqiPhone("12345")).toBe(false);
    expect(isIraqiPhone("0870123456")).toBe(false);
  });
});

describe("normalizeIraqiPhone", () => {
  it("converts local format to international", () => {
    expect(normalizeIraqiPhone("07701234567")).toBe("+9647701234567");
  });
  it("keeps international format unchanged", () => {
    expect(normalizeIraqiPhone("+9647701234567")).toBe("+9647701234567");
  });
});

describe("isEmail", () => {
  it("validates a normal email", () => {
    expect(isEmail("user@example.com")).toBe(true);
  });
  it("rejects a phone number", () => {
    expect(isEmail("07701234567")).toBe(false);
  });
});

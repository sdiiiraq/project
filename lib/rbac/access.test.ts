import { describe, expect, it } from "vitest";
import { roleHasPermission } from "./access";

describe("roleHasPermission", () => {
  it("allows OWNER to manage billing", () => {
    expect(roleHasPermission("OWNER", "billing.manage")).toBe(true);
  });

  it("denies COLLECTOR from managing team", () => {
    expect(roleHasPermission("COLLECTOR", "team.manage")).toBe(false);
  });

  it("allows COLLECTOR to create payments", () => {
    expect(roleHasPermission("COLLECTOR", "payments.create")).toBe(true);
  });

  it("denies VIEWER from creating payments", () => {
    expect(roleHasPermission("VIEWER", "payments.create")).toBe(false);
  });
});

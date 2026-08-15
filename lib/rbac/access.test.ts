import { describe, expect, it } from "vitest";
import { roleHasPermission } from "./access";
import type { PermissionKey } from "./permissions";

const ALL = new Set(["billing.manage", "payments.create", "team.manage"] as PermissionKey[]);
const EMPTY = new Set<PermissionKey>();
const COLLECTOR_LIKE = new Set<PermissionKey>(["payments.create"]);

describe("roleHasPermission", () => {
  it("allows a member whose permission set includes the key", () => {
    expect(roleHasPermission(ALL, "billing.manage")).toBe(true);
  });

  it("denies a member without team.manage", () => {
    expect(roleHasPermission(COLLECTOR_LIKE, "team.manage")).toBe(false);
  });

  it("allows a member explicitly granted payments.create", () => {
    expect(roleHasPermission(COLLECTOR_LIKE, "payments.create")).toBe(true);
  });

  it("denies a member with no granted permissions", () => {
    expect(roleHasPermission(EMPTY, "payments.create")).toBe(false);
  });
});

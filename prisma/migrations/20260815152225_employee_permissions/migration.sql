-- Remove the old role -> permission defaults table. It was never read at runtime (permission
-- checks used a static map in code), and is superseded by per-employee grants below. All existing
-- workspace_members rows are currently 'OWNER' (verified before writing this migration), so no
-- member's effective access changes.
DROP TABLE "role_permissions";

-- Narrow MemberRole to OWNER/EMPLOYEE — removes ADMIN/ACCOUNTANT/COLLECTOR/MAINTENANCE/VIEWER as
-- account roles. No existing row uses those values, so this is a safe, lossless type swap.
ALTER TYPE "MemberRole" RENAME TO "MemberRole_old";
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'EMPLOYEE');
ALTER TABLE "workspace_members" ALTER COLUMN "role" TYPE "MemberRole" USING ("role"::text::"MemberRole");
DROP TYPE "MemberRole_old";

-- Per-employee permission grants, replacing role-based defaults.
CREATE TABLE "workspace_member_permissions" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_member_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_member_permissions_memberId_permissionKey_key" ON "workspace_member_permissions"("memberId", "permissionKey");
CREATE INDEX "workspace_member_permissions_memberId_idx" ON "workspace_member_permissions"("memberId");

ALTER TABLE "workspace_member_permissions" ADD CONSTRAINT "workspace_member_permissions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "workspace_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_member_permissions" ADD CONSTRAINT "workspace_member_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

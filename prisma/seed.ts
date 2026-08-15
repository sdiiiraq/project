import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../lib/rbac/permissions";

const db = new PrismaClient();

const SYSTEM_EXPENSE_CATEGORIES = [
  "صيانة",
  "قطع غيار",
  "رواتب",
  "أجور جباية",
  "إيجار",
  "نقل",
  "كهرباء",
  "أخرى",
];

async function main() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  for (const name of SYSTEM_EXPENSE_CATEGORIES) {
    const exists = await db.expenseCategory.findFirst({ where: { name, isSystem: true, workspaceId: null } });
    if (!exists) {
      await db.expenseCategory.create({ data: { name, isSystem: true, workspaceId: null } });
    }
  }

  console.log("Seed completed: permissions, system expense categories.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

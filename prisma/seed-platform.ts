import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const FEATURES = [
  { key: "FEATURE_AI", name: "المساعد الذكي" },
  { key: "FEATURE_ADVANCED_ANALYTICS", name: "التحليلات المتقدمة" },
  { key: "FEATURE_FUEL", name: "إدارة الوقود" },
  { key: "FEATURE_MAINTENANCE", name: "الصيانة" },
  { key: "FEATURE_COLLECTORS", name: "الجباة" },
  { key: "FEATURE_EXPORT", name: "تصدير البيانات" },
  { key: "FEATURE_PDF_REPORTS", name: "تقارير PDF" },
  { key: "FEATURE_MULTI_GENERATOR", name: "تعدد المولدات" },
  { key: "FEATURE_NOTIFICATIONS", name: "الإشعارات" },
  { key: "FEATURE_ADVANCED_REPORTS", name: "التقارير المتقدمة" },
];

const PLANS = [
  {
    slug: "starter",
    name: "Starter",
    price: 25000,
    customerLimit: 100,
    userLimit: 3,
    collectorLimit: 1,
    features: ["FEATURE_FUEL", "FEATURE_MAINTENANCE", "FEATURE_EXPORT", "FEATURE_NOTIFICATIONS"],
  },
  {
    slug: "business",
    name: "Business",
    price: 50000,
    customerLimit: 500,
    userLimit: 10,
    collectorLimit: 5,
    features: [
      "FEATURE_FUEL", "FEATURE_MAINTENANCE", "FEATURE_COLLECTORS", "FEATURE_EXPORT",
      "FEATURE_PDF_REPORTS", "FEATURE_NOTIFICATIONS", "FEATURE_ADVANCED_REPORTS",
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price: 90000,
    customerLimit: null,
    userLimit: null,
    collectorLimit: null,
    features: FEATURES.map((f) => f.key),
  },
];

async function main() {
  for (const feature of FEATURES) {
    await db.feature.upsert({ where: { key: feature.key }, update: { name: feature.name }, create: feature });
  }

  for (const plan of PLANS) {
    const created = await db.platformPlan.upsert({
      where: { slug: plan.slug },
      update: { name: plan.name, price: plan.price, customerLimit: plan.customerLimit, userLimit: plan.userLimit, collectorLimit: plan.collectorLimit },
      create: {
        slug: plan.slug,
        name: plan.name,
        price: plan.price,
        customerLimit: plan.customerLimit,
        userLimit: plan.userLimit,
        collectorLimit: plan.collectorLimit,
      },
    });

    for (const featureKey of plan.features) {
      await db.planFeature.upsert({
        where: { planId_featureKey: { planId: created.id, featureKey } },
        update: { enabled: true },
        create: { planId: created.id, featureKey, enabled: true },
      });
    }
  }

  console.log("Seed completed: platform features and plans (Starter/Business/Pro).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

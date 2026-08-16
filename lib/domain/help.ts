import { db } from "@/lib/db";

export async function getPageHelpGuide(pageKey: string) {
  return db.helpGuide.findFirst({
    where: { pageKey, enabled: true },
    select: {
      id: true,
      title: true,
      description: true,
      mobileVideoId: true,
      desktopVideoId: true,
    },
  });
}

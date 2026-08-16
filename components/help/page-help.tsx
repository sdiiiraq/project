import { getPageHelpGuide } from "@/lib/domain/help";
import { HelpTrigger } from "@/components/help/help-trigger";
import type { HelpPageKey } from "@/lib/help-pages";

export async function PageHelp({ pageKey }: { pageKey: HelpPageKey }) {
  const guide = await getPageHelpGuide(pageKey);
  return <HelpTrigger pageKey={pageKey} guide={guide} />;
}

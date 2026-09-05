import { loadSiteContent } from "@arayeshgar/core";
import { db } from "@/lib/db";
import { currentTenant } from "@/lib/tenant";
import { renderTheme } from "@/themes";

export const dynamic = "force-dynamic";

export default async function Home() {
  const r = await currentTenant();
  if (r.kind === "platform") {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">پنل پلتفرم</h1>
        <p className="mt-2 opacity-70">در فاز ۵ ساخته می‌شود.</p>
      </main>
    );
  }
  if (!r.tenant) return null; // layout renders the "not connected" page
  const content = await loadSiteContent(db(), r.tenant);
  return renderTheme(content);
}

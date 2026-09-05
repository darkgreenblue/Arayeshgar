import { headers } from "next/headers";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Home() {
  const host = (await headers()).get("host") ?? "";
  const r = await resolveTenant(host);
  if (r.kind === "platform") {
    return (
      <main className="p-8">
        <h1 className="text-2xl">پنل پلتفرم (فاز ۵)</h1>
      </main>
    );
  }
  if (!r.tenant) {
    return (
      <main className="p-8">
        <h1 className="text-2xl">این آدرس هنوز به آرایشگری متصل نیست</h1>
        <p className="mt-2 text-neutral-400">host: {host}</p>
      </main>
    );
  }
  return (
    <main className="p-8">
      <h1 className="text-3xl">{r.tenant.branding.displayName}</h1>
      <p className="mt-2 text-neutral-400">{r.tenant.branding.tagline}</p>
      <p className="mt-6 text-sm text-neutral-500">سایت کامل در فاز ۲ ساخته می‌شود.</p>
    </main>
  );
}

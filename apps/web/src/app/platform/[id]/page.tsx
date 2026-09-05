import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { tenants } from "@arayeshgar/db";
import {
  FEATURES,
  formatInstantFa,
  getEnv,
  tenantPublicUrl,
  toPersianDigits,
} from "@arayeshgar/core";
import { TenantControls } from "@/components/platform/TenantControls";
import { db } from "@/lib/db";
import { requirePlatformPage } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const t = await db().query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!t) notFound();
  const url = tenantPublicUrl(getEnv(), t);
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black">{t.branding.displayName}</h1>
        <Link href="/platform" className="text-sm opacity-70 hover:opacity-100">
          ← لیست
        </Link>
      </div>
      <div className="mb-4 rounded-2xl bg-white p-4 text-sm shadow-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            سایت:{" "}
            <a className="underline" href={url} target="_blank" rel="noreferrer" dir="ltr">
              {url}
            </a>
          </span>
          <span>
            پنل:{" "}
            <a className="underline" href={`${url}/admin`} target="_blank" rel="noreferrer">
              {url}/admin
            </a>
          </span>
          <span className="fa-nums opacity-60">ساخت: {formatInstantFa(t.createdAt)}</span>
          <span className="opacity-60">حالت: {t.mode}</span>
          <span className="opacity-60">قالب: {t.theme}</span>
        </div>
      </div>
      <TenantControls
        id={t.id}
        status={t.status}
        customDomain={t.customDomain}
        features={t.features}
        featureMeta={Object.entries(FEATURES).map(([key, v]) => ({
          key,
          label: v.label,
          description: v.description,
          mvp: v.mvp,
        }))}
        hasTelegram={Boolean(t.telegramBotToken)}
        hasBale={Boolean(t.baleBotToken)}
        baseDomainHint={`${t.slug}.${getEnv().BASE_DOMAIN}`}
      />
      <p className="mt-4 text-xs opacity-50">
        شناسه: <span dir="ltr">{t.id}</span> · نوتیف‌های ارسال‌نشده در جدول outbox قابل بررسی‌اند (
        {toPersianDigits(0)}).
      </p>
    </main>
  );
}

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
  // A demo tenant is reached through the shared bot with a `?start=t_<slug>` payload that
  // tells it which barber this chat is for; a sold one has its own bot and needs none.
  // The username is written by the bots process once it knows it, so it is missing only
  // before that process has run at least once — in which case there is no link to show.
  const botLinks = (
    [
      { label: "تلگرام", username: t.telegramBotUsername, host: "https://t.me" },
      { label: "بله", username: t.baleBotUsername, host: "https://ble.ir" },
    ] as const
  )
    .filter((b) => Boolean(b.username))
    .map((b) => ({
      label: b.label,
      url:
        t.status === "demo"
          ? `${b.host}/${b.username}?start=t_${t.slug}`
          : `${b.host}/${b.username}`,
    }));
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
      {botLinks.length > 0 && (
        <div className="mb-4 rounded-2xl bg-white p-4 text-sm shadow-sm">
          <h2 className="mb-2 font-bold">لینک ربات برای نمایش به مشتری</h2>
          <p className="mb-3 text-xs opacity-60">
            {t.status === "demo"
              ? "این لینک ربات دموی مشترک را روی همین آرایشگاه تنظیم می‌کند. هر مشتری با لینک خودش وارد شود."
              : "ربات اختصاصی این آرایشگاه."}
          </p>
          <ul className="space-y-2">
            {botLinks.map((b) => (
              <li key={b.label} className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 opacity-70">{b.label}:</span>
                <a
                  className="break-all underline"
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                >
                  {b.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
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

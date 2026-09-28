import Link from "next/link";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { requireTenant } from "@/lib/tenant";
import { themeShell } from "@/themes";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const Shell = themeShell(tenant.theme);
  const rezaDemo = tenant.slug === "reza-hosseini" && tenant.theme === "night-portrait";
  return (
    <Shell tenant={tenant} title="رزرو وقت">
      <div
        className={
          rezaDemo
            ? "mx-auto grid max-w-7xl gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-24 lg:py-16"
            : "mx-auto max-w-xl px-4 py-6"
        }
      >
        <div className={rezaDemo ? "min-w-0 max-w-xl" : ""}>
          <div className="mb-6 flex items-center justify-between gap-5">
            <h1
              className={
                rezaDemo ? "font-heading text-3xl font-[760] sm:text-4xl" : "text-2xl font-bold"
              }
            >
              رزرو وقت
            </h1>
            <Link
              href="/"
              className="text-sm opacity-70 underline-offset-4 hover:underline hover:opacity-100"
            >
              بازگشت به سایت
            </Link>
          </div>
          <BookingWizard initialServiceId={sp.service} />
        </div>
        {rezaDemo && tenant.branding.heroImageUrl && (
          <aside className="hidden self-start lg:sticky lg:top-28 lg:block">
            <img
              src={tenant.branding.heroImageUrl}
              alt="نمونه‌کار اصلاح مو توسط رضا حسینی"
              className="max-h-[680px] w-full rounded-xl object-cover grayscale"
            />
            <p className="mt-3 text-xs text-[#aaa8b7]">نمونه‌کار رضا حسینی</p>
          </aside>
        )}
      </div>
    </Shell>
  );
}

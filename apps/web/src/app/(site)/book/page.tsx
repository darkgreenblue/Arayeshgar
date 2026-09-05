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
  return (
    <Shell tenant={tenant} title="رزرو وقت">
      <div className="mx-auto max-w-xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">رزرو وقت</h1>
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            ← بازگشت
          </Link>
        </div>
        <BookingWizard initialServiceId={sp.service} />
      </div>
    </Shell>
  );
}

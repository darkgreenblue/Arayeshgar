import Link from "next/link";
import { formatInstantFa, listPlatformAdmins } from "@arayeshgar/core";
import { AdminRoster, type AdminRow } from "@/components/platform/AdminRoster";
import { db } from "@/lib/db";
import { requirePlatformPage } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const me = await requirePlatformPage();
  const rows = await listPlatformAdmins(db());
  // Dates are turned into Persian text here, on the server, so the client component never
  // has to carry a calendar — and so a hydration mismatch on the boundary is impossible.
  const mapped: AdminRow[] = rows.map((a) => ({
    id: a.id,
    displayName: a.displayName,
    username: a.username,
    telegramChatId: a.telegramChatId,
    baleChatId: a.baleChatId,
    isActive: a.isActive,
    createdAtFa: formatInstantFa(a.createdAt),
    pendingInvite: a.pendingInvite
      ? {
          code: a.pendingInvite.code,
          expiresAtFa: formatInstantFa(a.pendingInvite.expiresAt),
          expired: a.pendingInvite.expired,
        }
      : null,
  }));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black">ادمین‌ها</h1>
        <Link href="/platform" className="text-sm opacity-70 hover:opacity-100">
          ← بازگشت
        </Link>
      </div>
      <p className="mb-4 text-sm opacity-70">
        ادمین پلتفرم به همه‌ی آرایشگرها دسترسی کامل دارد. هر کاری که اینجا می‌کنید با نام خودتان در
        گزارش تغییرات ثبت می‌شود.
      </p>
      <AdminRoster rows={mapped} meId={me.id} />
    </main>
  );
}

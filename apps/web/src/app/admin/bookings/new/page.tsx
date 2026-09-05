import { listServices, listStaff } from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewBooking() {
  const ctx = await requireAdminPage();
  const [svc, people] = await Promise.all([
    listServices(db(), ctx.tenant.id),
    listStaff(db(), ctx.tenant.id),
  ]);
  const staffOptions = people
    .filter((p) => p.isActive && (ctx.user.role !== "staff" || p.id === ctx.user.staffId))
    .map((p) => ({ id: p.id, name: p.name }));
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">رزرو جدید (حضوری / تلفنی)</h1>
      <NewBookingForm
        services={svc
          .filter((s) => s.isActive)
          .map((s) => ({ id: s.id, name: s.name, staffIds: s.staffIds }))}
        staff={staffOptions}
      />
    </AdminShell>
  );
}

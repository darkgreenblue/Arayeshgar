import { listServices, listStaff } from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { ServicesEditor } from "@/components/admin/ServicesEditor";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export default async function ServicesPage() {
  const ctx = await requireAdminPage();
  const [svc, people] = await Promise.all([
    listServices(db(), ctx.tenant.id),
    listStaff(db(), ctx.tenant.id),
  ]);
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">خدمات و قیمت‌ها</h1>
      <ServicesEditor
        services={svc.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          durationMin: s.durationMin,
          price: s.price,
          sortOrder: s.sortOrder,
          isActive: s.isActive,
          staffIds: s.staffIds,
        }))}
        staff={
          ctx.tenant.mode === "solo"
            ? []
            : people.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))
        }
      />
    </AdminShell>
  );
}

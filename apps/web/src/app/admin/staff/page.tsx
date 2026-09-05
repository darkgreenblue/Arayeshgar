import { listStaff } from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { StaffEditor } from "@/components/admin/StaffEditor";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const ctx = await requireAdminPage();
  const people = await listStaff(db(), ctx.tenant.id);
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">آرایشگرها</h1>
      <StaffEditor
        mode={ctx.tenant.mode}
        staff={people.map((p) => ({
          id: p.id,
          name: p.name,
          bio: p.bio,
          photoUrl: p.photoUrl,
          sortOrder: p.sortOrder,
          isActive: p.isActive,
          depositSettings: p.depositSettings ?? null,
          loginUsername: p.login?.username ?? null,
        }))}
      />
    </AdminShell>
  );
}

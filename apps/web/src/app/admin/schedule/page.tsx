import {
  getWeekly,
  isEnabled,
  isoDate,
  listManualSlots,
  listOverrides,
  listStaff,
  localDateOf,
  visibleStaffIds,
} from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { ScheduleEditor } from "@/components/admin/ScheduleEditor";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  const ctx = await requireAdminPage();
  const { staff: q } = await searchParams;
  const all = (await listStaff(db(), ctx.tenant.id)).filter((s) => s.isActive);
  const allowed = visibleStaffIds(ctx.user, ctx.tenant);
  const people = allowed ? all.filter((s) => allowed.includes(s.id)) : all;
  const current = people.find((s) => s.id === q) ?? people[0];
  if (!current)
    return (
      <AdminShell ctx={ctx}>
        <p className="rounded-2xl bg-white p-6 text-center">اول یک آرایشگر تعریف کنید.</p>
      </AdminShell>
    );
  const today = isoDate(localDateOf(new Date(), ctx.tenant.timezone));
  const manual = isEnabled(ctx.tenant, "manual_slots");
  const [weekly, overrides, slots] = await Promise.all([
    getWeekly(db(), current.id),
    listOverrides(db(), ctx.tenant.id, today),
    manual ? listManualSlots(db(), ctx.tenant.id, new Date()) : Promise.resolve([]),
  ]);
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">ساعت کاری</h1>
      <ScheduleEditor
        staff={people.map((p) => ({ id: p.id, name: p.name }))}
        staffId={current.id}
        weekly={weekly.map((w) => ({ weekday: w.weekday, startMin: w.startMin, endMin: w.endMin }))}
        overrides={overrides
          .filter((o) => o.staffId === current.id)
          .map((o) => ({
            id: o.id,
            day: o.day,
            kind: o.kind,
            startMin: o.startMin,
            endMin: o.endMin,
            reason: o.reason,
          }))}
        manual={manual}
        manualSlots={slots
          .filter((s) => s.staffId === current.id)
          .map((s) => ({
            id: s.id,
            startAt: s.startAt.toISOString(),
            endAt: s.endAt.toISOString(),
          }))}
        timezone={ctx.tenant.timezone}
      />
    </AdminShell>
  );
}

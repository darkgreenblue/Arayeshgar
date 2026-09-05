/**
 * Single admin action endpoint: { action, payload }. Each action checks authz via `can()` and
 * delegates to @arayeshgar/core. Keeping mutations here (not server actions) means the same core
 * functions are reused verbatim by the bots' admin commands.
 */
import { z } from "zod";
import {
  addManualSlot,
  addOverride,
  cancelByAdmin,
  changePassword,
  createBooking,
  deactivateService,
  issueBotLinkCode,
  loadBookingContext,
  markCompleted,
  markNoShow,
  removeManualSlot,
  removeOverride,
  rescheduleBooking,
  setCustomerBlocked,
  setCustomerNotes,
  setStaffLogin,
  setTheme,
  setWeekly,
  unlinkBot,
  updateBranding,
  updateDeposit,
  updateRules,
  upsertService,
  upsertStaff,
  Errors,
  logger,
  type Action,
} from "@arayeshgar/core";
import { requireAdminApi, type AdminCtx } from "@/lib/admin";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

type Handler = (ctx: AdminCtx, payload: unknown) => Promise<unknown>;
const uuid = z.string().uuid();

async function bookingScoped(ctx: AdminCtx, bookingId: string, action: Action) {
  const b = await loadBookingContext(db(), ctx.tenant.id, bookingId);
  if (!b) throw Errors.bookingNotFound();
  await requireAdminApi(action, b.booking.staffId);
  return b;
}

const handlers: Record<string, Handler> = {
  "booking.create": async (ctx, p) => {
    const d = z
      .object({
        staffId: uuid,
        serviceId: uuid,
        startAt: z.string().datetime(),
        name: z.string().min(2),
        phone: z.string().min(10),
        notes: z.string().max(500).optional(),
      })
      .parse(p);
    await requireAdminApi("manage_booking", d.staffId);
    return createBooking(db(), {
      tenant: ctx.tenant,
      staffId: d.staffId,
      serviceId: d.serviceId,
      startAt: new Date(d.startAt),
      customer: { name: d.name, phone: d.phone },
      notes: d.notes,
      source: "admin",
      byAdminUserId: ctx.user.id,
    });
  },
  "booking.cancel": async (ctx, p) => {
    const d = z.object({ id: uuid, reason: z.string().max(300).optional() }).parse(p);
    await bookingScoped(ctx, d.id, "manage_booking");
    return {
      status: (await cancelByAdmin(db(), ctx.tenant.id, d.id, ctx.user.id, d.reason)).booking
        .status,
    };
  },
  "booking.reschedule": async (ctx, p) => {
    const d = z
      .object({ id: uuid, startAt: z.string().datetime(), staffId: uuid.optional() })
      .parse(p);
    await bookingScoped(ctx, d.id, "manage_booking");
    if (d.staffId) await requireAdminApi("manage_booking", d.staffId);
    const r = await rescheduleBooking(db(), ctx.tenant.id, d.id, {
      startAt: new Date(d.startAt),
      staffId: d.staffId,
      userId: ctx.user.id,
    });
    return { startAt: r.booking.startAt };
  },
  "booking.complete": async (ctx, p) => {
    const { id } = z.object({ id: uuid }).parse(p);
    await bookingScoped(ctx, id, "manage_booking");
    return { status: (await markCompleted(db(), ctx.tenant.id, id, ctx.user.id)).status };
  },
  "booking.noShow": async (ctx, p) => {
    const { id } = z.object({ id: uuid }).parse(p);
    await bookingScoped(ctx, id, "manage_booking");
    return { status: (await markNoShow(db(), ctx.tenant.id, id, ctx.user.id)).status };
  },

  "service.upsert": async (ctx, p) => {
    await requireAdminApi("manage_services");
    return { id: await upsertService(db(), ctx.tenant.id, p as never) };
  },
  "service.deactivate": async (ctx, p) => {
    await requireAdminApi("manage_services");
    await deactivateService(db(), ctx.tenant.id, z.object({ id: uuid }).parse(p).id);
    return {};
  },

  "schedule.setWeekly": async (ctx, p) => {
    const d = z.object({ staffId: uuid, rows: z.array(z.any()) }).parse(p);
    await requireAdminApi("manage_schedule", d.staffId);
    await setWeekly(db(), ctx.tenant.id, d.staffId, d.rows);
    return {};
  },
  "override.add": async (ctx, p) => {
    const d = p as { staffId?: string };
    await requireAdminApi("manage_schedule", d.staffId ?? null);
    return addOverride(db(), ctx.tenant.id, p as never);
  },
  "override.remove": async (ctx, p) => {
    await requireAdminApi("manage_schedule");
    await removeOverride(db(), ctx.tenant.id, z.object({ id: uuid }).parse(p).id);
    return {};
  },
  "manualSlot.add": async (ctx, p) => {
    const d = p as { staffId?: string };
    await requireAdminApi("manage_schedule", d.staffId ?? null);
    return addManualSlot(db(), ctx.tenant.id, p as never);
  },
  "manualSlot.remove": async (ctx, p) => {
    await requireAdminApi("manage_schedule");
    await removeManualSlot(db(), ctx.tenant.id, z.object({ id: uuid }).parse(p).id);
    return {};
  },

  "staff.upsert": async (ctx, p) => {
    const d = p as { id?: string };
    // independent barbers may edit their own profile/card; owners/managers edit anyone
    if (d.id && ctx.user.role === "staff") await requireAdminApi("manage_deposit", d.id);
    else await requireAdminApi("manage_staff");
    return upsertStaff(db(), ctx.tenant.id, p as never);
  },
  "staff.setLogin": async (ctx, p) => {
    const d = z.object({ staffId: uuid, username: z.string(), password: z.string() }).parse(p);
    await requireAdminApi("manage_staff");
    return { userId: await setStaffLogin(db(), ctx.tenant.id, d.staffId, d.username, d.password) };
  },

  "customer.setBlocked": async (ctx, p) => {
    const d = z.object({ id: uuid, blocked: z.boolean() }).parse(p);
    await requireAdminApi("manage_booking");
    await setCustomerBlocked(db(), ctx.tenant.id, d.id, d.blocked);
    return {};
  },
  "customer.setNotes": async (ctx, p) => {
    const d = z.object({ id: uuid, notes: z.string().max(1000) }).parse(p);
    await requireAdminApi("view_bookings");
    await setCustomerNotes(db(), ctx.tenant.id, d.id, d.notes);
    return {};
  },

  "settings.deposit": async (ctx, p) => {
    await requireAdminApi("manage_deposit");
    await updateDeposit(db(), ctx.tenant.id, p);
    return {};
  },
  "settings.rules": async (ctx, p) => {
    await requireAdminApi("manage_schedule");
    await updateRules(db(), ctx.tenant.id, p);
    return {};
  },
  "settings.branding": async (ctx, p) => {
    await requireAdminApi("manage_branding");
    return updateBranding(db(), ctx.tenant, p);
  },
  "settings.theme": async (ctx, p) => {
    await requireAdminApi("manage_branding");
    await setTheme(db(), ctx.tenant.id, z.object({ theme: z.string() }).parse(p).theme);
    return {};
  },
  "settings.password": async (ctx, p) => {
    await changePassword(db(), ctx.user.id, p as never);
    return {};
  },
  "bot.issueLinkCode": async (ctx) => issueBotLinkCode(db(), ctx.user.id),
  "bot.unlink": async (ctx, p) => {
    await unlinkBot(
      db(),
      ctx.user.id,
      z.object({ platform: z.enum(["telegram", "bale"]) }).parse(p).platform,
    );
    return {};
  },
};

export async function POST(req: Request) {
  let action = "?";
  try {
    const ctx = await requireAdminApi();
    const body = z
      .object({ action: z.string(), payload: z.unknown().optional() })
      .parse(await req.json());
    action = body.action;
    const h = handlers[action];
    if (!h) throw Errors.validation(`اکشن ناشناخته: ${action}`);
    const result = await h(ctx, body.payload ?? {});
    logger.info({ tenantId: ctx.tenant.id, userId: ctx.user.id, action }, "admin action");
    return Response.json({ ok: true, result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return Response.json(
        {
          error: {
            code: "VALIDATION",
            message: `ورودی نامعتبر${first ? `: ${first.path.join(".")} ${first.message}` : ""}`,
          },
        },
        { status: 400 },
      );
    }
    logger.warn({ action, err: String(err) }, "admin action failed");
    return jsonError(err);
  }
}

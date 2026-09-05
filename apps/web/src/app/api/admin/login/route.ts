import { and, eq } from "drizzle-orm";
import { users } from "@arayeshgar/db";
import { verifyPassword, Errors, logger } from "@arayeshgar/core";
import { db } from "@/lib/db";
import { clientIp, jsonError, rateLimit } from "@/lib/http";
import { getSession } from "@/lib/session";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant();
    const ip = clientIp(req);
    if (!rateLimit(`login:${ip}`, 10, 15 * 60_000))
      throw Errors.validation("تلاش زیاد. چند دقیقه بعد دوباره امتحان کنید.");
    const { username, password } = (await req.json()) as { username?: string; password?: string };
    if (!username || !password) throw Errors.validation("نام کاربری و رمز را وارد کنید.");
    const u = await db().query.users.findFirst({
      where: and(eq(users.tenantId, tenant.id), eq(users.username, username.trim().toLowerCase())),
    });
    if (!u || !u.isActive || !verifyPassword(password, u.passwordHash)) {
      logger.warn({ tenantId: tenant.id, username, ip }, "admin login failed");
      throw Errors.validation("نام کاربری یا رمز اشتباه است.");
    }
    const s = await getSession();
    s.userId = u.id;
    s.tenantId = u.tenantId;
    await s.save();
    logger.info({ tenantId: tenant.id, userId: u.id, ip }, "admin login");
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

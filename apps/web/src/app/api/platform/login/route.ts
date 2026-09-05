import { and, eq, isNull } from "drizzle-orm";
import { users } from "@arayeshgar/db";
import { Errors, logger, verifyPassword } from "@arayeshgar/core";
import { db } from "@/lib/db";
import { clientIp, jsonError, rateLimit } from "@/lib/http";
import { getSession } from "@/lib/session";
import { currentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const host = await currentTenant();
    if (host.kind !== "platform") throw Errors.forbidden();
    const ip = clientIp(req);
    if (!rateLimit(`plogin:${ip}`, 10, 15 * 60_000))
      throw Errors.validation("تلاش زیاد. چند دقیقه بعد دوباره امتحان کنید.");
    const { username, password } = (await req.json()) as { username?: string; password?: string };
    if (!username || !password) throw Errors.validation("نام کاربری و رمز را وارد کنید.");
    const u = await db().query.users.findFirst({
      where: and(
        isNull(users.tenantId),
        eq(users.role, "platform_admin"),
        eq(users.username, username.trim().toLowerCase()),
      ),
    });
    if (!u || !u.isActive || !verifyPassword(password, u.passwordHash)) {
      logger.warn({ username, ip }, "platform login failed");
      throw Errors.validation("نام کاربری یا رمز اشتباه است.");
    }
    const s = await getSession();
    s.userId = u.id;
    s.tenantId = null;
    await s.save();
    logger.info({ userId: u.id, ip }, "platform login");
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

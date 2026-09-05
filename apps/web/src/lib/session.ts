import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { eq } from "drizzle-orm";
import { users, type User } from "@arayeshgar/db";
import { getEnv } from "@arayeshgar/core";
import { db } from "./db";

export type AdminSession = { userId?: string; tenantId?: string | null };

function options(): SessionOptions {
  const env = getEnv();
  return {
    cookieName: "ar_admin",
    password: env.SESSION_SECRET,
    ttl: 60 * 60 * 24 * 14,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.PUBLIC_URL_SCHEME === "https",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<AdminSession>(await cookies(), options());
}

/** Logged-in admin user for the current tenant (or null). Platform admins are accepted on any host. */
export async function currentUser(tenantId: string | null): Promise<User | null> {
  const s = await getSession();
  if (!s.userId) return null;
  const u = await db().query.users.findFirst({ where: eq(users.id, s.userId) });
  if (!u || !u.isActive) return null;
  if (u.role === "platform_admin") return u;
  if (tenantId && u.tenantId === tenantId) return u;
  return null;
}

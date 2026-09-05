import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@arayeshgar/db";
import { Errors } from "@arayeshgar/core";
import { currentUser } from "./session";
import { currentTenant } from "./tenant";

/** Platform pages live on platform.<BASE_DOMAIN> and require the platform_admin role. */
export async function requirePlatformPage(): Promise<User> {
  const r = await currentTenant();
  if (r.kind !== "platform") redirect("/");
  const user = await currentUser(null);
  if (!user || user.role !== "platform_admin") redirect("/platform/login");
  return user;
}

export async function requirePlatformApi(): Promise<User> {
  const r = await currentTenant();
  if (r.kind !== "platform") throw Errors.forbidden();
  const user = await currentUser(null);
  if (!user || user.role !== "platform_admin") throw Errors.forbidden();
  return user;
}

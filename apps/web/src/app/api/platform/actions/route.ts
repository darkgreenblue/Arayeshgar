/**
 * Platform-owner actions (create tenants, toggle flags, domains, tokens, AI copy).
 * Mirrors /api/admin/actions but gated on the platform_admin role and the platform host.
 */
import { z } from "zod";
import {
  createTenant,
  generateCopy,
  logger,
  onboardingSchema,
  platformResetOwnerPassword,
  platformSetBotTokens,
  platformSetCustomDomain,
  platformSetFeatures,
  platformSetStatus,
  slugAvailable,
  suggestSlug,
  tenantPublicUrl,
  getEnv,
  Errors,
} from "@arayeshgar/core";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requirePlatformApi } from "@/lib/platform";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {
  "tenant.create": async (p) => {
    const parsed = onboardingSchema.safeParse(p);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw Errors.validation(
        `ورودی نامعتبر${first ? `: ${first.path.join(".")} ${first.message}` : ""}`,
      );
    }
    const { tenant, adminUsername } = await createTenant(db(), parsed.data);
    return {
      id: tenant.id,
      slug: tenant.slug,
      url: tenantPublicUrl(getEnv(), tenant),
      adminUsername,
    };
  },
  "tenant.slugCheck": async (p) => {
    const { slug } = z.object({ slug: z.string() }).parse(p);
    return { available: await slugAvailable(db(), slug) };
  },
  "tenant.suggestSlug": async (p) => {
    const { displayName, instagram } = z
      .object({ displayName: z.string(), instagram: z.string().optional() })
      .parse(p);
    return { slug: await suggestSlug(db(), displayName, instagram) };
  },
  "tenant.setFeatures": async (p) => {
    const { id, features } = z
      .object({ id: uuid, features: z.record(z.string(), z.boolean()) })
      .parse(p);
    return platformSetFeatures(db(), id, features);
  },
  "tenant.setStatus": async (p) => {
    const { id, status } = z
      .object({ id: uuid, status: z.enum(["demo", "active", "suspended"]) })
      .parse(p);
    const t = await platformSetStatus(db(), id, status);
    return { status: t.status };
  },
  "tenant.setDomain": async (p) => {
    const { id, domain } = z.object({ id: uuid, domain: z.string().nullable() }).parse(p);
    const t = await platformSetCustomDomain(db(), id, domain);
    return { customDomain: t.customDomain };
  },
  "tenant.setTokens": async (p) => {
    const { id, telegram, bale } = z
      .object({
        id: uuid,
        telegram: z.string().nullable().optional(),
        bale: z.string().nullable().optional(),
      })
      .parse(p);
    const t = await platformSetBotTokens(db(), id, { telegram, bale });
    return { telegram: Boolean(t.telegramBotToken), bale: Boolean(t.baleBotToken) };
  },
  "tenant.resetOwnerPassword": async (p) => {
    const { id, password } = z.object({ id: uuid, password: z.string().min(8) }).parse(p);
    return { username: await platformResetOwnerPassword(db(), id, password) };
  },
  "ai.copy": async (p) => {
    const input = z
      .object({
        displayName: z.string().min(2),
        mode: z.enum(["solo", "salon_central", "salon_independent"]).default("solo"),
        city: z.string().optional(),
        specialties: z.string().optional(),
        yearsOfExperience: z.number().int().optional(),
        services: z.array(z.object({ name: z.string() })).default([]),
      })
      .parse(p);
    return generateCopy(input);
  },
};

export async function POST(req: Request) {
  let action = "?";
  try {
    const user = await requirePlatformApi();
    const body = z
      .object({ action: z.string(), payload: z.unknown().optional() })
      .parse(await req.json());
    action = body.action;
    const h = handlers[action];
    if (!h) throw Errors.validation(`اکشن ناشناخته: ${action}`);
    const result = await h(body.payload ?? {});
    logger.info({ userId: user.id, action }, "platform action");
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
    logger.warn({ action, err: String(err) }, "platform action failed");
    return jsonError(err);
  }
}

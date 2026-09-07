/**
 * A second, genuinely separate process that books the same slot as the test.
 *
 * The in-process write queue cannot help here — that is the point. This half of the
 * anti-double-booking guarantee rests only on BEGIN IMMEDIATE plus busy_timeout, and
 * it is the half that matters in production, where the site and the bots are two pm2
 * apps writing to one file.
 *
 * Writes a single JSON line to stdout so the parent can assert on the outcome.
 */
import { eq } from "drizzle-orm";
import { createDb, tenants } from "@arayeshgar/db";
import { createBooking } from "../../src/booking/create";

const [dbUrl, tenantId, staffId, serviceId, startAtIso, phone] = process.argv.slice(2);
if (!dbUrl || !tenantId || !staffId || !serviceId || !startAtIso || !phone) {
  throw new Error(
    "usage: booking-worker <dbUrl> <tenantId> <staffId> <serviceId> <startAt> <phone>",
  );
}

process.env.DATABASE_URL = dbUrl;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.BASE_DOMAIN ??= "localhost";

async function main() {
  const db = createDb(dbUrl);
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId!) });
  if (!tenant) throw new Error("worker: tenant not found");
  const res = await createBooking(db, {
    tenant,
    staffId: staffId!,
    serviceId: serviceId!,
    startAt: new Date(startAtIso!),
    customer: { name: "مشتری پروسه دوم", phone: phone! },
    source: "telegram",
  });
  return { ok: true as const, bookingId: res.bookingId };
}

const emit = (payload: unknown) => process.stdout.write(`${JSON.stringify(payload)}\n`);

main()
  .then(emit)
  .catch((err: unknown) => {
    const e = err as { code?: string; message?: string };
    emit({ ok: false, code: e.code ?? null, message: e.message ?? String(err) });
  })
  .finally(() => process.exit(0));

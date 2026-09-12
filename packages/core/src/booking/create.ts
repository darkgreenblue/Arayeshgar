/**
 * createBooking: the single entry point used by web, Telegram and Bale.
 *
 * 1. validate + upsert customer, apply anti-abuse rules
 * 2. resolve service for staff (duration/price snapshot), compute deposit
 * 3. re-check the slot and insert inside one BEGIN IMMEDIATE transaction, so the check is
 *    authoritative: no other process can take the slot between it and the insert
 * 4. for "any" staff: try candidates in order, moving on when one is lost to a race
 * 5. create payment row when a deposit is due, enqueue notifications
 */
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db, Platform, Tenant } from "@arayeshgar/db";
import { bookings, customers, payments, staff } from "@arayeshgar/db";
import {
  availableSlots,
  isSlotBookable,
  resolveServiceForStaff,
} from "../availability/availability";
import { findOrCreateCustomer, linkIdentity } from "../customers/customers";
import { DomainError, Errors, isUniqueViolation } from "../errors/domain";
import { syntheticUserId, track } from "../analytics/events";
import { logger } from "../logger";
import { adminRecipients, customerRecipient, enqueue } from "../notifications/enqueue";
import { computeDeposit } from "../payments/deposit";
import { effectiveDeposit, effectiveRules, payToCard } from "../tenant/config";
import { getEnv, tenantPublicUrl } from "../env";
import { localDateOf, localToInstant, addDays } from "../utils/jalali";
import { generateBookingCode } from "./codes";
import { toPayload } from "./payload";
import { loadBookingContext } from "./transitions";

export type CreateBookingInput = {
  tenant: Tenant;
  staffId: string | "any";
  serviceId: string;
  startAt: Date;
  customer: { name: string; phone: string };
  source: "web" | "telegram" | "bale" | "admin";
  /** chat identity when booked from a bot (so the customer receives push updates) */
  identity?: { platform: Platform; platformUserId: string };
  notes?: string;
  now?: Date;
  /** admin-created bookings skip abuse limits and are confirmed immediately */
  byAdminUserId?: string;
};

export type CreateBookingResult = {
  bookingId: string;
  code: string;
  status: string;
  staffId: string;
  depositAmount: number;
  expiresAt: Date | null;
  payTo: { cardNumber?: string; cardHolder?: string; bankName?: string } | null;
};

export async function createBooking(
  db: Db,
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const { tenant } = input;
  const now = input.now ?? new Date();
  const rules = effectiveRules(tenant);
  const deposit = effectiveDeposit(tenant);
  const log = logger.child({ tenantId: tenant.id, source: input.source });

  const customer = await findOrCreateCustomer(db, tenant.id, input.customer);
  if (input.identity)
    await linkIdentity(
      db,
      tenant.id,
      customer.id,
      input.identity.platform,
      input.identity.platformUserId,
    );

  if (!input.byAdminUserId) await assertAbuseLimits(db, tenant, customer.id, rules, now);

  const candidates =
    input.staffId === "any"
      ? await rankCandidates(db, tenant, input.serviceId, input.startAt, now)
      : [input.staffId];
  if (candidates.length === 0) throw Errors.slotUnavailable();

  let lastErr: unknown;
  for (const staffId of candidates) {
    const svc = await resolveServiceForStaff(db, staffId, input.serviceId);
    if (!svc) continue;
    const endAt = new Date(input.startAt.getTime() + svc.durationMin * 60_000);
    if (
      !input.byAdminUserId &&
      !(await isSlotBookable(db, tenant, staffId, svc.durationMin, input.startAt, now))
    ) {
      lastErr = Errors.slotUnavailable();
      continue;
    }

    const depositAmount = input.byAdminUserId ? 0 : computeDeposit(deposit, svc.price);
    const status = input.byAdminUserId
      ? "confirmed"
      : depositAmount > 0
        ? "pending_payment"
        : rules.autoConfirmWithoutDeposit
          ? "confirmed"
          : "pending_approval";
    const expiresAt =
      status === "pending_payment"
        ? new Date(
            Math.min(
              now.getTime() + rules.paymentDeadlineMin * 60_000,
              input.startAt.getTime() - rules.minLeadMin * 60_000,
            ),
          )
        : null;

    try {
      const result = await db.transaction(async (tx) => {
        // The transaction opened with BEGIN IMMEDIATE, so this process now holds the
        // single write lock. That makes this check authoritative in a way the one above
        // is not: nobody can slip a booking in between here and the insert below. This
        // is what replaces the Postgres EXCLUDE constraint, and unlike that constraint
        // it also covers manual slots and schedule overrides.
        if (!(await isSlotBookable(tx, tenant, staffId, svc.durationMin, input.startAt, now))) {
          throw Errors.slotTaken();
        }
        const code = await uniqueCode(tx, tenant.id);
        const [b] = await tx
          .insert(bookings)
          .values({
            tenantId: tenant.id,
            staffId,
            customerId: customer.id,
            serviceId: svc.serviceId,
            code,
            startAt: input.startAt,
            endAt,
            status,
            source: input.source,
            priceSnapshot: svc.price,
            depositAmount,
            expiresAt,
            notes: input.notes?.slice(0, 500),
          })
          .returning();
        if (!b) throw new Error("booking insert returned nothing");

        let payTo: CreateBookingResult["payTo"] = null;
        if (depositAmount > 0) {
          const staffRow = await tx.query.staff.findFirst({ where: eq(staff.id, staffId) });
          payTo = payToCard(tenant, staffRow ?? null);
          await tx.insert(payments).values({
            tenantId: tenant.id,
            bookingId: b.id,
            amount: depositAmount,
            status: "awaiting_receipt",
            payToCardNumber: payTo.cardNumber,
            payToCardHolder: payTo.cardHolder,
          });
        }
        return { b, payTo };
      });

      log.info({ bookingId: result.b.id, code: result.b.code, staffId, status }, "booking created");
      // `first_value` is the shared vocabulary's "the user got what they came for the
      // first time"; every later booking is only the product-specific event.
      const [{ n: bookingCount } = { n: 0 }] = await db
        .select({ n: count() })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenant.id), eq(bookings.customerId, customer.id)));
      const analyticsUser = syntheticUserId(customer.id);
      if (Number(bookingCount) <= 1) {
        await track(db, {
          event: "first_value",
          userId: analyticsUser,
          tenantId: tenant.id,
          props: { booking_id: result.b.id, source: input.source },
        });
      }
      await track(db, {
        event: "booking_created",
        userId: analyticsUser,
        tenantId: tenant.id,
        props: {
          booking_id: result.b.id,
          source: input.source,
          status,
          deposit_amount: depositAmount,
        },
      });
      await notifyCreated(db, tenant, result.b.id);
      return {
        bookingId: result.b.id,
        code: result.b.code,
        status,
        staffId,
        depositAmount,
        expiresAt,
        payTo: result.payTo,
      };
    } catch (err) {
      const lostRace =
        (err instanceof DomainError && err.code === "SLOT_TAKEN") || isUniqueViolation(err);
      if (lostRace) {
        // Either the in-transaction re-check saw the slot gone, or bookings_staff_start_uq
        // rejected an exact-start duplicate. Same meaning: this candidate is no longer free.
        lastErr = Errors.slotTaken();
        log.info(
          { staffId, startAt: input.startAt.toISOString() },
          "slot race lost, trying next candidate",
        );
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? Errors.slotUnavailable();
}

async function uniqueCode(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  tenantId: string,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateBookingCode();
    const clash = await tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.code, code)))
      .limit(1);
    if (!clash.length) return code;
  }
  return generateBookingCode(8);
}

/** Staff who actually have this exact start free, least-loaded first (simple fairness for "any"). */
async function rankCandidates(
  db: Db,
  tenant: Tenant,
  serviceId: string,
  startAt: Date,
  now: Date,
): Promise<string[]> {
  const day = localDateOf(startAt, tenant.timezone);
  const perStaff = await availableSlots(db, tenant, { staffId: "any", serviceId, day, now });
  const ms = startAt.getTime();
  const free = perStaff.filter((s) => s.starts.some((d) => d.getTime() === ms));
  // fewer bookings that day => earlier in the list
  const dayStart = localToInstant(day, 0, tenant.timezone);
  const dayEnd = localToInstant(addDays(day, 1), 0, tenant.timezone);
  const loads = await Promise.all(
    free.map(async (s) => {
      const [r] = await db
        .select({ n: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.staffId, s.staffId),
            gte(bookings.startAt, dayStart),
            lt(bookings.startAt, dayEnd),
            inArray(bookings.status, [
              "confirmed",
              "pending_payment",
              "receipt_submitted",
              "pending_approval",
            ]),
          ),
        );
      return { staffId: s.staffId, n: Number(r?.n ?? 0) };
    }),
  );
  return loads.sort((a, b) => a.n - b.n).map((l) => l.staffId);
}

async function assertAbuseLimits(
  db: Db,
  tenant: Tenant,
  customerId: string,
  rules: ReturnType<typeof effectiveRules>,
  now: Date,
) {
  const [c] = await db
    .select({ blocked: customers.blocked })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (c?.blocked) throw Errors.customerBlocked();

  const [unpaid] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.customerId, customerId), eq(bookings.status, "pending_payment")));
  if (Number(unpaid?.n ?? 0) >= rules.maxActiveBookingsPerPhone) throw Errors.tooManyActive();

  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [today] = await db
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.customerId, customerId), gte(bookings.createdAt, since)));
  if (Number(today?.n ?? 0) >= rules.maxBookingsPerPhonePerDay) throw Errors.dailyLimit();
}

async function notifyCreated(db: Db, tenant: Tenant, bookingId: string) {
  const ctx = await loadBookingContext(db, tenant.id, bookingId);
  if (!ctx) return;
  const siteUrl = tenantPublicUrl(getEnv(), tenant);
  await enqueue(
    db,
    tenant.id,
    "booking_created",
    await adminRecipients(db, tenant, ctx.booking.staffId),
    toPayload(ctx, "admin", siteUrl),
  );
  const cust = customerRecipient(ctx.booking, ctx.identityChatId);
  if (cust)
    await enqueue(db, tenant.id, "booking_created", [cust], toPayload(ctx, "customer", siteUrl));
}

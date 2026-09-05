import { and, eq } from "drizzle-orm";
import { customerIdentities, customers, type Customer, type Platform } from "@arayeshgar/db";
import type { DbLike } from "../availability/availability";
import { Errors } from "../errors/domain";
import { normalizeIranMobile } from "../utils/phone";

/** Upsert by (tenant, normalized phone). Keeps the latest name the customer typed. */
export async function findOrCreateCustomer(
  db: DbLike,
  tenantId: string,
  input: { name: string; phone: string },
): Promise<Customer> {
  const phone = normalizeIranMobile(input.phone);
  if (!phone) throw Errors.invalidPhone();
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw Errors.validation("نام باید حداقل ۲ حرف باشد.");

  const [row] = await db
    .insert(customers)
    .values({ tenantId, name, phone })
    .onConflictDoUpdate({ target: [customers.tenantId, customers.phone], set: { name } })
    .returning();
  if (!row) throw new Error("customer upsert returned nothing");
  if (row.blocked) throw Errors.customerBlocked();
  return row;
}

export async function findCustomerByIdentity(
  db: DbLike,
  tenantId: string,
  platform: Platform,
  platformUserId: string,
): Promise<Customer | null> {
  const rows = await db
    .select({ c: customers })
    .from(customerIdentities)
    .innerJoin(customers, eq(customers.id, customerIdentities.customerId))
    .where(
      and(
        eq(customerIdentities.tenantId, tenantId),
        eq(customerIdentities.platform, platform),
        eq(customerIdentities.platformUserId, platformUserId),
      ),
    )
    .limit(1);
  return rows[0]?.c ?? null;
}

/** Link a chat identity to a customer (idempotent; re-links if the phone owner changed). */
export async function linkIdentity(
  db: DbLike,
  tenantId: string,
  customerId: string,
  platform: Platform,
  platformUserId: string,
): Promise<void> {
  await db
    .insert(customerIdentities)
    .values({ tenantId, customerId, platform, platformUserId })
    .onConflictDoUpdate({
      target: [
        customerIdentities.tenantId,
        customerIdentities.platform,
        customerIdentities.platformUserId,
      ],
      set: { customerId },
    });
}

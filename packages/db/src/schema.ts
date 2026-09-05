/**
 * Single source of truth for the whole platform (web, Telegram bot, Bale bot, admin panels).
 *
 * Multi-tenancy: every business table carries `tenant_id`. Application code must always
 * query through the tenant-scoped repositories in @arayeshgar/core (never raw cross-tenant).
 * Keeping everything keyed by tenant_id is what makes "extract one big customer to their own
 * server" a plain `COPY ... WHERE tenant_id = X` later.
 *
 * Time: all instants are `timestamptz`. Business-day logic is computed in the tenant timezone
 * (default Asia/Tehran, no DST). Weekdays use the Persian week: 0 = Saturday ... 6 = Friday.
 * Money: integer Toman (no decimals).
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const tenantModeEnum = pgEnum("tenant_mode", ["solo", "salon_central", "salon_independent"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["demo", "active", "suspended"]);
export const userRoleEnum = pgEnum("user_role", ["platform_admin", "owner", "manager", "staff"]);
export const platformEnum = pgEnum("platform", ["telegram", "bale"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment", // deposit enabled: waiting for customer to pay + upload receipt
  "receipt_submitted", // receipt uploaded, waiting for admin review
  "pending_approval", // deposit disabled and auto-confirm off: waiting for admin
  "confirmed",
  "completed",
  "cancelled",
  "rejected", // receipt rejected by admin; slot freed
  "expired", // payment deadline passed; slot freed
  "no_show",
]);
export const bookingSourceEnum = pgEnum("booking_source", ["web", "telegram", "bale", "admin"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "awaiting_receipt",
  "submitted",
  "approved",
  "rejected",
]);
export const overrideKindEnum = pgEnum("override_kind", ["closed", "open"]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "customer", "system"]);

// ---------------------------------------------------------------------------
// JSONB shapes (validated with zod in @arayeshgar/core; stored loosely here)
// ---------------------------------------------------------------------------
export type TenantBranding = {
  displayName: string;
  tagline?: string;
  about?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  gallery: string[];
  primaryColor: string;
  accentColor?: string;
  fontHeading: "estedad" | "vazirmatn" | "sahel";
  fontBody: "vazirmatn" | "sahel";
  phone?: string;
  address?: string;
  mapUrl?: string;
  instagram?: string;
  telegram?: string;
  bale?: string;
  faq: { q: string; a: string }[];
  seo?: { title?: string; description?: string };
};

export type TenantFeatures = Record<string, boolean>;

export type BookingRules = {
  slotStepMin: number; // granularity of offered start times (default 15)
  bufferMin: number; // gap after each appointment (default 0)
  minLeadMin: number; // earliest bookable start from now (default 60)
  horizonDays: number; // how far ahead customers can book (default 14)
  paymentDeadlineMin: number; // time to pay deposit before hold expires (default 30)
  cancelBeforeHours: number; // customer self-cancel cutoff (default 4)
  autoConfirmWithoutDeposit: boolean; // default true
  maxActiveBookingsPerPhone: number; // default 1 unpaid hold
  maxBookingsPerPhonePerDay: number; // default 3
};

export type DepositSettings = {
  enabled: boolean;
  cardNumber?: string; // 16 digits, displayed grouped
  cardHolder?: string;
  bankName?: string;
  mode: "fixed" | "percent";
  amount: number; // Toman when fixed, 0-100 when percent
  policyText?: string; // shown to the customer (e.g. deposit forfeited if late cancel)
};

export type StaffDepositSettings = Partial<
  Pick<DepositSettings, "cardNumber" | "cardHolder" | "bankName">
>;

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(), // <slug>.<BASE_DOMAIN>
    customDomain: text("custom_domain").unique(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("Asia/Tehran"),
    mode: tenantModeEnum("mode").notNull().default("solo"),
    status: tenantStatusEnum("status").notNull().default("demo"),
    theme: text("theme").notNull().default("night-gold"), // night-gold | light-editorial | bold-modern
    branding: jsonb("branding").$type<TenantBranding>().notNull(),
    features: jsonb("features").$type<TenantFeatures>().notNull().default({}),
    bookingRules: jsonb("booking_rules").$type<BookingRules>().notNull(),
    depositSettings: jsonb("deposit_settings").$type<DepositSettings>().notNull(),
    telegramBotToken: text("telegram_bot_token"),
    telegramBotUsername: text("telegram_bot_username"),
    baleBotToken: text("bale_bot_token"),
    baleBotUsername: text("bale_bot_username"),
    webhookSecret: text("webhook_secret").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenants_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Staff (barbers). Solo tenants have exactly one.
// ---------------------------------------------------------------------------
export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    photoUrl: text("photo_url"),
    bio: text("bio"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // salon_independent: each barber may receive deposits on their own card
    depositSettings: jsonb("deposit_settings").$type<StaffDepositSettings>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_tenant_idx").on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Users = people who log in to a panel (platform owner, tenant owner/manager/staff)
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // NULL for platform_admin
    role: userRoleEnum("role").notNull(),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }),
    baleChatId: bigint("bale_chat_id", { mode: "number" }),
    botLinkCode: text("bot_link_code"), // one-time code typed into the bot to link a chat
    botLinkCodeExpiresAt: timestamp("bot_link_code_expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_tenant_username_uq").on(t.tenantId, t.username).nullsNotDistinct(),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Services & prices
// ---------------------------------------------------------------------------
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull(),
    price: bigint("price", { mode: "number" }).notNull(), // Toman
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("services_tenant_idx").on(t.tenantId)],
);

export const staffServices = pgTable(
  "staff_services",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    priceOverride: bigint("price_override", { mode: "number" }),
    durationOverrideMin: integer("duration_override_min"),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
);

// ---------------------------------------------------------------------------
// Working hours (weekly), overrides (holiday / extra hours), manual slots
// ---------------------------------------------------------------------------
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 0 = Saturday ... 6 = Friday
    startMin: smallint("start_min").notNull(), // minutes from local midnight
    endMin: smallint("end_min").notNull(),
  },
  (t) => [
    unique("schedules_staff_weekday_start_uq").on(t.staffId, t.weekday, t.startMin),
    index("schedules_staff_idx").on(t.staffId),
  ],
);

export const scheduleOverrides = pgTable(
  "schedule_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    day: date("day").notNull(), // local calendar day (Gregorian in DB, Jalali in UI)
    kind: overrideKindEnum("kind").notNull(),
    startMin: smallint("start_min"), // NULL + kind=closed => whole day closed
    endMin: smallint("end_min"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedule_overrides_staff_day_idx").on(t.staffId, t.day)],
);

export const manualSlots = pgTable(
  "manual_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("manual_slots_staff_start_idx").on(t.staffId, t.startAt)],
);

// ---------------------------------------------------------------------------
// Customers and their chat identities
// ---------------------------------------------------------------------------
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(), // normalized 09xxxxxxxxx
    notes: text("notes"),
    blocked: boolean("blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("customers_tenant_phone_uq").on(t.tenantId, t.phone)],
);

export const customerIdentities = pgTable(
  "customer_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformUserId: text("platform_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("customer_identities_uq").on(t.tenantId, t.platform, t.platformUserId),
    index("customer_identities_customer_idx").on(t.customerId),
  ],
);

// ---------------------------------------------------------------------------
// Bookings. The anti-double-booking guarantee lives in the DB:
//   EXCLUDE USING gist (staff_id WITH =, tstzrange(start_at,end_at) WITH &&)
//   WHERE (status NOT IN ('cancelled','rejected','expired','no_show'))
// (added in a custom migration because drizzle-kit does not model EXCLUDE constraints)
// ---------------------------------------------------------------------------
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    code: text("code").notNull(), // 6-char human code, unique per tenant
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull(),
    source: bookingSourceEnum("source").notNull(),
    priceSnapshot: bigint("price_snapshot", { mode: "number" }).notNull(),
    depositAmount: bigint("deposit_amount", { mode: "number" }).notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // for pending_payment
    notes: text("notes"),
    cancelledBy: text("cancelled_by"), // 'customer' | 'system' | user id
    cancelReason: text("cancel_reason"),
    reminder24hSentAt: timestamp("reminder_24h_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("bookings_tenant_code_uq").on(t.tenantId, t.code),
    index("bookings_staff_start_idx").on(t.staffId, t.startAt),
    index("bookings_tenant_start_idx").on(t.tenantId, t.startAt),
    index("bookings_customer_idx").on(t.customerId),
    index("bookings_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Card-to-card deposit payments
// ---------------------------------------------------------------------------
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    status: paymentStatusEnum("status").notNull().default("awaiting_receipt"),
    // Card the customer was told to pay to (snapshot; staff card in salon_independent)
    payToCardNumber: text("pay_to_card_number"),
    payToCardHolder: text("pay_to_card_holder"),
    receiptPath: text("receipt_path"), // storage key of the uploaded image
    trackingNo: text("tracking_no"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Durable notification outbox (worker drains with FOR UPDATE SKIP LOCKED + retries)
// ---------------------------------------------------------------------------
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    channel: platformEnum("channel").notNull(),
    recipientChatId: text("recipient_chat_id").notNull(),
    kind: text("kind").notNull(), // booking_created | receipt_submitted | ... | reminder_24h
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextTryAt: timestamp("next_try_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_pending_idx").on(t.sentAt, t.nextTryAt)],
);

// ---------------------------------------------------------------------------
// Audit log: who did what (cancel, reschedule, approve receipt, change prices...)
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Bot conversation state (only "awaiting phone" / "awaiting receipt photo"; the rest is
// encoded in callback_data). Persisted so restarts never lose a customer mid-flow.
// ---------------------------------------------------------------------------
export const botSessions = pgTable(
  "bot_sessions",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformUserId: text("platform_user_id").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.platform, t.platformUserId] })],
);

// ---------------------------------------------------------------------------
// Relations (for drizzle relational queries)
// ---------------------------------------------------------------------------
export const tenantsRelations = relations(tenants, ({ many }) => ({
  staff: many(staff),
  users: many(users),
  services: many(services),
  bookings: many(bookings),
}));
export const staffRelations = relations(staff, ({ one, many }) => ({
  tenant: one(tenants, { fields: [staff.tenantId], references: [tenants.id] }),
  schedules: many(schedules),
  staffServices: many(staffServices),
}));
export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, { fields: [services.tenantId], references: [tenants.id] }),
  staffServices: many(staffServices),
}));
export const staffServicesRelations = relations(staffServices, ({ one }) => ({
  staff: one(staff, { fields: [staffServices.staffId], references: [staff.id] }),
  service: one(services, { fields: [staffServices.serviceId], references: [services.id] }),
}));
export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  tenant: one(tenants, { fields: [bookings.tenantId], references: [tenants.id] }),
  staff: one(staff, { fields: [bookings.staffId], references: [staff.id] }),
  customer: one(customers, { fields: [bookings.customerId], references: [customers.id] }),
  service: one(services, { fields: [bookings.serviceId], references: [services.id] }),
  payments: many(payments),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
}));
export const customersRelations = relations(customers, ({ many }) => ({
  identities: many(customerIdentities),
  bookings: many(bookings),
}));
export const customerIdentitiesRelations = relations(customerIdentities, ({ one }) => ({
  customer: one(customers, { fields: [customerIdentities.customerId], references: [customers.id] }),
}));

// Handy inferred types
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type User = typeof users.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type ScheduleOverride = typeof scheduleOverrides.$inferSelect;
export type ManualSlot = typeof manualSlots.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type OutboxRow = typeof notificationOutbox.$inferSelect;
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type Platform = (typeof platformEnum.enumValues)[number];

// Statuses that keep a slot occupied (mirrors the EXCLUDE constraint predicate)
export const ACTIVE_BOOKING_STATUSES = [
  "pending_payment",
  "receipt_submitted",
  "pending_approval",
  "confirmed",
  "completed",
] as const satisfies readonly BookingStatus[];

export const activeBookingPredicateSql = sql`status NOT IN ('cancelled','rejected','expired','no_show')`;

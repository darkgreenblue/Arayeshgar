-- Two guarantees drizzle-kit cannot express, both partial (WHERE-clause) indexes.
-- Kept hand-written and versioned so they are applied on every deploy, exactly once.

-- 1) Anti-double-booking backstop.
--
-- Postgres had:
--   EXCLUDE USING gist (staff_id WITH =, tstzrange(start_at,end_at) WITH &&)
--   WHERE (status NOT IN ('cancelled','rejected','expired','no_show'))
-- SQLite has no EXCLUDE and no range type, so the guarantee is rebuilt in two halves.
--
-- The first half is BEGIN IMMEDIATE: every booking write takes the single writer lock
-- before it reads, so two processes cannot both observe the slot as free. That is what
-- catches partial overlaps (09:00-09:30 against 09:15-09:45), together with the explicit
-- overlap query in booking/create.ts.
--
-- This index is the second half: even if some future caller forgets the transaction, two
-- live bookings can never share a barber and a start time. Cancelled, rejected, expired
-- and no-show rows are excluded so a freed slot can be booked again — the same predicate
-- the EXCLUDE constraint used, and the same one ACTIVE_BOOKING_STATUSES mirrors.
CREATE UNIQUE INDEX `bookings_staff_start_uq` ON `bookings` (`staff_id`, `start_at`)
  WHERE `status` NOT IN ('cancelled', 'rejected', 'expired', 'no_show');
--> statement-breakpoint

-- 2) One username per tenant, platform admins included.
--
-- Postgres had UNIQUE (tenant_id, username) NULLS NOT DISTINCT, so the platform admins
-- (whose tenant_id is NULL) were covered too. SQLite always treats NULLs as distinct,
-- which would silently allow two platform admins to share a username and make login
-- ambiguous. COALESCE restores the Postgres behaviour.
CREATE UNIQUE INDEX `users_tenant_username_uq` ON `users` (COALESCE(`tenant_id`, ''), `username`);

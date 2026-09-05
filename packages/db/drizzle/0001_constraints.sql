-- Custom constraints drizzle-kit cannot express.

-- 1) Anti double-booking: no two occupying bookings for the same staff may overlap in time.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'rejected', 'expired', 'no_show'));

-- 2) Sanity checks
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_order_chk" CHECK ("end_at" > "start_at");
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_weekday_chk" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_minutes_chk" CHECK ("start_min" >= 0 AND "end_min" <= 1440 AND "end_min" > "start_min");
ALTER TABLE "manual_slots" ADD CONSTRAINT "manual_slots_time_order_chk" CHECK ("end_at" > "start_at");
ALTER TABLE "services" ADD CONSTRAINT "services_duration_chk" CHECK ("duration_min" > 0);

-- 3) Manual slots for one staff must not overlap each other either.
ALTER TABLE "manual_slots"
  ADD CONSTRAINT "manual_slots_no_overlap"
  EXCLUDE USING gist ("staff_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&);

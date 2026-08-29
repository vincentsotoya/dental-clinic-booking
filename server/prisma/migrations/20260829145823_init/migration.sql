-- HAND-EDITED. See the block at the end of this file.
-- Required by the exclusion constraints below: plain GiST has no equality
-- operator for uuid, so `provider_id WITH =` cannot be indexed without this.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('DENTIST', 'HYGIENIST');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "type" "ProviderType" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "title" TEXT,
    "bio" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "date_of_birth" DATE,
    "recall_interval_months" INTEGER NOT NULL DEFAULT 6,
    "insurance_provider" TEXT,
    "insurance_member_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operatories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "operatories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "duration_mins" INTEGER NOT NULL,
    "buffer_mins" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "provider_type" "ProviderType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_off" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_closures" (
    "id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "clinic_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "operatory_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "blocked_until" TIMESTAMPTZ(6) NOT NULL,
    "buffer_mins" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "providers_type_is_active_idx" ON "providers"("type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "patients_email_key" ON "patients"("email");

-- CreateIndex
CREATE UNIQUE INDEX "operatories_name_key" ON "operatories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_provider_type_is_active_idx" ON "services"("provider_type", "is_active");

-- CreateIndex
CREATE INDEX "working_hours_provider_id_weekday_idx" ON "working_hours"("provider_id", "weekday");

-- CreateIndex
CREATE INDEX "time_off_provider_id_starts_at_idx" ON "time_off"("provider_id", "starts_at");

-- CreateIndex
CREATE INDEX "clinic_closures_starts_at_idx" ON "clinic_closures"("starts_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_starts_at_idx" ON "appointments"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_provider_id_starts_at_idx" ON "appointments"("provider_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_operatory_id_fkey" FOREIGN KEY ("operatory_id") REFERENCES "operatories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- HAND-EDITED SECTION — everything below was written by hand, not generated.
--
-- Prisma has no syntax for EXCLUDE or CHECK constraints; `prisma db pull`
-- reports outright that it cannot represent them. Anyone who regenerates this
-- migration from schema.prisma will silently drop all of it, and the database
-- will go back to allowing double-booking with no error anywhere.
-- See docs/adr/0001 and docs/adr/0004.
-- ===========================================================================

-- Ordinary sanity: an appointment cannot end before it starts, and the blocked
-- range cannot finish before treatment does.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_time_order"
  CHECK ("ends_at" > "starts_at" AND "blocked_until" >= "ends_at");

-- blocked_until must equal ends_at plus the buffer snapshotted onto this row.
-- blocked_until is written by the application, so without this the application
-- could claim any blocked range it liked and the exclusion constraints below
-- would faithfully enforce a lie. This is the honesty guard from ADR-0004.
--
-- Postgres only *assumes* CHECK conditions are immutable and does not verify
-- it at DDL time, which is why `timestamptz + interval` is accepted here but
-- refused inside the index expressions below.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_blocked_until_honest"
  CHECK ("blocked_until" = "ends_at" + make_interval(mins => "buffer_mins"));

-- The central invariant: one provider cannot be in two appointments at once.
--
-- Ranges over blocked_until rather than ends_at, so turnover time is enforced
-- by the same constraint and needs no application code. Partial on status, so
-- a cancelled appointment leaves the index and frees its slot immediately —
-- no cleanup job, and the row survives for history.
--
-- tstzrange bounds default to '[)', so an appointment starting exactly at a
-- previous one's blocked_until does NOT overlap. Back-to-back bookings stay
-- legal; without that the schedule would leak the buffer after every visit.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_provider_no_overlap"
  EXCLUDE USING gist (
    "provider_id" WITH =,
    tstzrange("starts_at", "blocked_until") WITH &&
  ) WHERE ("status" = 'CONFIRMED');

-- The same for the room. A provider being free is not enough — the chair is a
-- finite physical resource and two providers cannot use one at the same time.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_operatory_no_overlap"
  EXCLUDE USING gist (
    "operatory_id" WITH =,
    tstzrange("starts_at", "blocked_until") WITH &&
  ) WHERE ("status" = 'CONFIRMED');

-- Working hours are minutes from midnight, so 0..1440 with a non-empty window.
ALTER TABLE "working_hours"
  ADD CONSTRAINT "working_hours_valid_window"
  CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute");

ALTER TABLE "time_off"
  ADD CONSTRAINT "time_off_time_order" CHECK ("ends_at" > "starts_at");

ALTER TABLE "clinic_closures"
  ADD CONSTRAINT "clinic_closures_time_order" CHECK ("ends_at" > "starts_at");

ALTER TABLE "services"
  ADD CONSTRAINT "services_sane_amounts"
  CHECK ("duration_mins" > 0 AND "buffer_mins" >= 0 AND "price_cents" >= 0);

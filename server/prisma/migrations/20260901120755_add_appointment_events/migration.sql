-- CreateEnum
CREATE TYPE "AppointmentEventType" AS ENUM ('BOOKED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('PATIENT', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "appointment_events" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "type" "AppointmentEventType" NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus",
    "from_starts_at" TIMESTAMPTZ(6),
    "to_starts_at" TIMESTAMPTZ(6),
    "from_provider_id" UUID,
    "to_provider_id" UUID,
    "actor_user_id" TEXT,
    "actor_role" "ActorRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_events_appointment_id_created_at_idx" ON "appointment_events"("appointment_id", "created_at");

-- AddForeignKey
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-edited. Everything above this line is generated.
-- ---------------------------------------------------------------------------

-- DELETED FROM THE GENERATED SQL, and this will recur:
--
--   ALTER TABLE "patients" DROP CONSTRAINT "patients_user_id_fkey";
--
-- Prisma proposes dropping that foreign key on every migration, because it
-- cannot see it: patients.user_id is a plain column by design (ADR-0006), so
-- the constraint exists only in migration SQL and reads to the generator as
-- drift. Deleting the DROP is the correct edit — keeping it would silently
-- remove the rule that stops a chart pointing at a login that no longer
-- exists. Check for this line in every future migration.

-- Prisma does not emit this one either, for the same reason: user ids are
-- minted by Better Auth and the other half of a relation would be a field on
-- the regenerated User.
--
-- ON DELETE SET NULL. An event is a record of something that happened, and it
-- stays true after the account that did it is deleted — the row then says an
-- ADMIN cancelled this appointment, without saying which one, which is a
-- smaller loss than losing the event.
ALTER TABLE "appointment_events"
  ADD CONSTRAINT appointment_events_actor_user_id_fkey
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- An event describes a change, so it must name at least one side of one. Cheap
-- insurance against a writer that fills in nothing and leaves a row saying only
-- that something happened.
ALTER TABLE "appointment_events"
  ADD CONSTRAINT appointment_events_describes_a_change
  CHECK (
    "from_status" IS NOT NULL
    OR "to_status" IS NOT NULL
    OR "to_starts_at" IS NOT NULL
  );

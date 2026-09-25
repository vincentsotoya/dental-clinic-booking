-- CreateEnum
CREATE TYPE "ToothCondition" AS ENUM ('HEALTHY', 'WATCH', 'DECAYED', 'FILLED', 'CROWNED', 'ROOT_CANAL', 'MISSING', 'EXTRACTION_NEEDED');

-- CreateTable
CREATE TABLE "treatment_records" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "notes" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" "ActorRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "treatment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tooth_chart_entries" (
    "id" UUID NOT NULL,
    "treatment_record_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "tooth" INTEGER NOT NULL,
    "condition" "ToothCondition" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tooth_chart_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatment_records_appointment_id_key" ON "treatment_records"("appointment_id");

-- CreateIndex
CREATE INDEX "tooth_chart_entries_patient_id_tooth_created_at_idx" ON "tooth_chart_entries"("patient_id", "tooth", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tooth_chart_entries_treatment_record_id_tooth_key" ON "tooth_chart_entries"("treatment_record_id", "tooth");

-- AddForeignKey
ALTER TABLE "treatment_records" ADD CONSTRAINT "treatment_records_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooth_chart_entries" ADD CONSTRAINT "tooth_chart_entries_treatment_record_id_fkey" FOREIGN KEY ("treatment_record_id") REFERENCES "treatment_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooth_chart_entries" ADD CONSTRAINT "tooth_chart_entries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-edited. Everything above this line is generated.
-- ---------------------------------------------------------------------------

-- DELETED FROM THE GENERATED SQL, and this will recur (docs/database-design.md
-- "A hazard in every future migration"):
--
--   ALTER TABLE "appointment_events" DROP CONSTRAINT "appointment_events_actor_user_id_fkey";
--   ALTER TABLE "patients" DROP CONSTRAINT "patients_user_id_fkey";
--
-- Both foreign keys are hand-written in earlier migrations and invisible to
-- Prisma, which reads them as drift on every generate. Deleting the DROPs is
-- the correct edit — keeping either would silently remove the rule that stops
-- a chart, or an event, pointing at a login that no longer exists.

-- Same reasoning as appointment_events.actor_user_id: user ids are minted by
-- Better Auth, so the other half of this relation would be a field on the
-- regenerated User (ADR-0006). ON DELETE SET NULL — a treatment record stays
-- true after the account that wrote it is deleted; it says an ADMIN recorded
-- this, without saying which one, rather than losing the record.
ALTER TABLE "treatment_records"
  ADD CONSTRAINT treatment_records_actor_user_id_fkey
  FOREIGN KEY ("actor_user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Universal numbering (CONTEXT.md), never generated: Prisma has no CHECK
-- syntax (docs/database-design.md).
ALTER TABLE "tooth_chart_entries"
  ADD CONSTRAINT tooth_chart_entries_tooth_in_range
  CHECK ("tooth" BETWEEN 1 AND 32);

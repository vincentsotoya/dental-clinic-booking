-- Links a chart to a login, and stops treating a patient's email as an identity.

-- A patient's email is contact detail, not identity. Dropping this is what
-- makes ADR-0007's rule possible: a walk-in the front desk charted and the
-- account that same person later registers are two rows sharing one address,
-- because signup never adopts a chart on an unverified email. Identity is
-- "user".email, which Better Auth keeps unique.
-- DropIndex
DROP INDEX "patients_email_key";

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");

-- CreateIndex
CREATE INDEX "patients_email_idx" ON "patients"("email");

-- ---------------------------------------------------------------------------
-- Hand-added. Everything above this line is generated.
-- ---------------------------------------------------------------------------

-- Prisma does not emit this foreign key because patients.user_id is modelled
-- as a plain column: the other half of a Prisma relation would be a field on
-- User, and `npx auth generate` rewrites that model (ADR-0006). The constraint
-- is real regardless — it just lives where a regenerate cannot reach it.
--
-- ON DELETE SET NULL, emphatically not CASCADE. Deleting a login must never
-- delete a medical record; the chart outlives the account and reverts to what
-- it was before the patient registered.
ALTER TABLE "patients"
  ADD CONSTRAINT patients_user_id_fkey
  FOREIGN KEY ("user_id") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

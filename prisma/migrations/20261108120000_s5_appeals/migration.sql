-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'resolved');

-- CreateEnum
CREATE TYPE "AppealOutcome" AS ENUM ('uphold', 'overturn', 'modify');

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "evidenceLinks" TEXT[],
    "evidenceNote" TEXT,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "assignedReviewerId" TEXT,
    "brief" JSONB,
    "briefAiRunId" TEXT,
    "outcome" "AppealOutcome",
    "finalAction" "ModAction",
    "resolverId" TEXT,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_decisionId_key" ON "Appeal"("decisionId");

-- CreateIndex
CREATE INDEX "Appeal_status_createdAt_idx" ON "Appeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Appeal_assignedReviewerId_status_idx" ON "Appeal"("assignedReviewerId", "status");

-- CreateIndex
CREATE INDEX "Appeal_caseId_idx" ON "Appeal"("caseId");

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_resolverId_fkey" FOREIGN KEY ("resolverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_briefAiRunId_fkey" FOREIGN KEY ("briefAiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Hand-written (APP-5): a resolved appeal always carries its outcome, final action, rationale and time; a pending
-- one carries none of them.
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_resolution_complete" CHECK (
  ("status" = 'pending' AND "outcome" IS NULL AND "finalAction" IS NULL AND "rationale" IS NULL
     AND "resolvedAt" IS NULL)
  OR ("status" = 'resolved' AND "outcome" IS NOT NULL AND "finalAction" IS NOT NULL AND "rationale" IS NOT NULL
     AND "resolvedAt" IS NOT NULL)
);

-- Hand-written (APP-5): the second review is final. Once an appeal is resolved its outcome cannot change and it
-- cannot be deleted. The AI brief may still arrive after the resolution (the job can finish late), so brief and
-- briefAiRunId stay writable. A new function, so forbid_mutation() is left exactly as defined before.
CREATE OR REPLACE FUNCTION keep_appeal_resolution() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'appeals are kept: DELETE on "Appeal" is not allowed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'resolved' AND (
       NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."outcome" IS DISTINCT FROM OLD."outcome"
    OR NEW."finalAction" IS DISTINCT FROM OLD."finalAction"
    OR NEW."resolverId" IS DISTINCT FROM OLD."resolverId"
    OR NEW."rationale" IS DISTINCT FROM OLD."rationale"
    OR NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt") THEN
    RAISE EXCEPTION 'appeal % is already resolved', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Appeal_resolution_final"
  BEFORE UPDATE OR DELETE ON "Appeal"
  FOR EACH ROW EXECUTE FUNCTION keep_appeal_resolution();

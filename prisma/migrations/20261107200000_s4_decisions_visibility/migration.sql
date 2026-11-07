-- CreateEnum
CREATE TYPE "ModAction" AS ENUM ('none', 'label', 'limit', 'remove');

-- CreateEnum
CREATE TYPE "DecisionKind" AS ENUM ('approve', 'reject', 'modify');

-- CreateEnum
CREATE TYPE "ReasonCategory" AS ENUM ('false_positive', 'missing_context', 'wrong_clause', 'severity_too_high', 'severity_too_low', 'policy_gap', 'other');

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "deciderId" TEXT NOT NULL,
    "kind" "DecisionKind" NOT NULL,
    "recommendedAction" "ModAction" NOT NULL,
    "finalAction" "ModAction" NOT NULL,
    "clauseCodes" TEXT[],
    "reasonCategory" "ReasonCategory",
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Decision_caseId_createdAt_idx" ON "Decision"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Case_currentAnalysisId_key" ON "Case"("currentAnalysisId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_currentAnalysisId_fkey" FOREIGN KEY ("currentAnalysisId") REFERENCES "Analysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_deciderId_fkey" FOREIGN KEY ("deciderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written (docs/02-system-design.md sec. 3, item 2): decisions are insert-only (AUD-2, HUM-5). The function
-- is shared: S3 attaches the same trigger to "Analysis" and "AiRun", S7 to "AuditEvent". CREATE OR REPLACE keeps
-- the migrations independent of the order they are applied in.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is insert-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Decision_insert_only"
  BEFORE UPDATE OR DELETE ON "Decision"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Hand-written (docs/02-system-design.md sec. 3, item 3): defence in depth for HUM-1. Content visibility changes
-- only inside a transaction where services/visibility.ts#setVisibility ran
-- set_config('app.actor_type', 'human', true). Any other writer (a job, the AI path, a stray UPDATE) is refused
-- by the database even if the application check were bypassed. New content always starts visible.
CREATE OR REPLACE FUNCTION require_human_visibility_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."visibility" <> 'visible' AND coalesce(current_setting('app.actor_type', true), '') <> 'human' THEN
      RAISE EXCEPTION 'HUM-1: new content must start visible'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW."visibility" IS DISTINCT FROM OLD."visibility"
        AND coalesce(current_setting('app.actor_type', true), '') <> 'human' THEN
    RAISE EXCEPTION 'HUM-1: content visibility can only be changed by a human decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Content_visibility_human_only"
  BEFORE INSERT OR UPDATE OF "visibility" ON "Content"
  FOR EACH ROW EXECUTE FUNCTION require_human_visibility_change();

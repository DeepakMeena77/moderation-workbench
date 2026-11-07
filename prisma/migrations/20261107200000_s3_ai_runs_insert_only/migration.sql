-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelsTried" TEXT[],
    "promptVersion" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "policyVersion" INTEGER,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "thinkingTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL,
    "repairUsed" BOOLEAN NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL,
    "parseStrategy" TEXT,
    "trimmedContext" BOOLEAN NOT NULL,
    "status" "AiStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_createdAt_idx" ON "AiRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AUD-2 (docs/02-system-design.md sec. 3, hand-written): analyses and AI runs are insert-only. Any UPDATE or
-- DELETE raises. S4 (Decision) and S7 (AuditEvent) attach the same function to their tables. TRUNCATE does not
-- fire row triggers, so the integration test cleanup still works.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'insert-only table: % on "%" is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Analysis_insert_only"
  BEFORE UPDATE OR DELETE ON "Analysis"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER "AiRun_insert_only"
  BEFORE UPDATE OR DELETE ON "AiRun"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

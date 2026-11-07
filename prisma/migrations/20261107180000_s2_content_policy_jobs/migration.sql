-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('post', 'comment');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('visible', 'labeled', 'limited', 'removed');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('pending_analysis', 'auto_cleared', 'awaiting_review', 'resolved', 'appealed', 'appeal_resolved');

-- CreateEnum
CREATE TYPE "CaseTrigger" AS ENUM ('new_content', 'report', 'reopen');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('active', 'retired');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('analyze', 'appeal_brief');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('ok', 'timeout', 'rate_limited', 'invalid_output', 'invalid_input', 'provider_error', 'budget_exhausted', 'unavailable');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('human', 'system', 'ai');

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PolicyStatus" NOT NULL,
    "clauses" JSONB NOT NULL,
    "notes" TEXT,
    "contentHash" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'visible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL,
    "trigger" "CaseTrigger" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "currentAnalysisId" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ruleFindings" JSONB NOT NULL,
    "aiFindings" JSONB,
    "recommendation" JSONB NOT NULL,
    "aiStatus" "AiStatus" NOT NULL,
    "aiRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "policyVersion" INTEGER,
    "requestId" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Policy_version_key" ON "Policy"("version");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_contentHash_key" ON "Policy"("contentHash");

-- CreateIndex
CREATE INDEX "Content_type_createdAt_idx" ON "Content"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Content_parentId_createdAt_idx" ON "Content"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "Content_authorId_createdAt_idx" ON "Content"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_contentId_reporterId_key" ON "Report"("contentId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_contentId_key" ON "Case"("contentId");

-- CreateIndex
CREATE INDEX "Case_status_priority_createdAt_idx" ON "Case"("status", "priority" DESC, "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_caseId_seq_key" ON "Analysis"("caseId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "Job"("status", "runAfter");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (docs/02-system-design.md sec. 3, item 1): exactly one active policy, enforced by the
-- database so two concurrent publishes can never both win (POL-1).
CREATE UNIQUE INDEX "Policy_one_active" ON "Policy"("status") WHERE "status" = 'active';

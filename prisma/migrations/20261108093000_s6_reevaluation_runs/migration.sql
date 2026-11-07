-- CreateTable
CREATE TABLE "ReevaluationRun" (
    "id" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ReevaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReevaluationRun_toVersion_idx" ON "ReevaluationRun"("toVersion");

-- CreateIndex
CREATE INDEX "Job_runId_status_idx" ON "Job"("runId", "status");

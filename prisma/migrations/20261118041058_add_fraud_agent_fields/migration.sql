-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'pending_review';

-- AlterTable
ALTER TABLE "fraud_alerts" ADD COLUMN     "agentConfidence" INTEGER,
ADD COLUMN     "agentReasoning" TEXT,
ADD COLUMN     "autoReviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

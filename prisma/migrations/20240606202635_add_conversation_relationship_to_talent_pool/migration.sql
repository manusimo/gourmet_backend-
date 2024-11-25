-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_jobOfferId_fkey";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "talentPoolId" INTEGER,
ALTER COLUMN "jobOfferId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_talentPoolId_fkey" FOREIGN KEY ("talentPoolId") REFERENCES "TalentPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

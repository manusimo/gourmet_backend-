-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "TalentPool" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pendent';

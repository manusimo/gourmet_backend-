-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

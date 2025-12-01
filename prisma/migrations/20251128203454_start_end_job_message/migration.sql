-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Hiring" ADD COLUMN     "endMessageSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startMessageSent" BOOLEAN NOT NULL DEFAULT false;

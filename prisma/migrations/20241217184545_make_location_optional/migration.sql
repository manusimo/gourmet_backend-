-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "location" DROP NOT NULL,
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

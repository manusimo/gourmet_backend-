-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "description" TEXT NOT NULL DEFAULT 'No description to show',
ADD COLUMN     "legalName" TEXT NOT NULL DEFAULT 'No legal name to show',
ADD COLUMN     "rut" TEXT NOT NULL DEFAULT 'No rut to show';

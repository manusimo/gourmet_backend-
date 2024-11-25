-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "comuna" TEXT NOT NULL DEFAULT 'No hay',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'No hay',
ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "comuna" TEXT NOT NULL DEFAULT 'No hay',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT 'No hay';

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "prerequisites" TEXT NOT NULL DEFAULT 'No hay requisitos para mostrar',
ADD COLUMN     "responsabilities" TEXT NOT NULL DEFAULT 'No hay responsabilidades para mostrar';

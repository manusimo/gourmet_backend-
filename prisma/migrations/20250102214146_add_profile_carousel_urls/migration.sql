-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "profileCarouselUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

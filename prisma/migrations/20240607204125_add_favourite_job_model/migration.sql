-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- CreateTable
CREATE TABLE "FavouriteJob" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "jobOfferId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavouriteJob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FavouriteJob" ADD CONSTRAINT "FavouriteJob_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavouriteJob" ADD CONSTRAINT "FavouriteJob_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

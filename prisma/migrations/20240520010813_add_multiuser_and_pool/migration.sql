-- DropIndex
DROP INDEX "RestaurantUser_userId_key";

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "birthDate" SET DEFAULT timestamp '1996-02-02 00:00:00';

-- AlterTable
ALTER TABLE "JobOffer" ADD COLUMN     "restaurantUserId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Juanito',
ADD COLUMN     "phoneNumber" TEXT NOT NULL DEFAULT '+56976212644';

-- CreateTable
CREATE TABLE "TalentPool" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "addedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentPool_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_restaurantUserId_fkey" FOREIGN KEY ("restaurantUserId") REFERENCES "RestaurantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "RestaurantUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

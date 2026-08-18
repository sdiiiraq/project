-- AlterTable
ALTER TABLE "generators" ADD COLUMN     "fuelConsumptionPerHour" DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_usages_operatingSessionId_key" ON "fuel_usages"("operatingSessionId");

-- AddForeignKey
ALTER TABLE "fuel_usages" ADD CONSTRAINT "fuel_usages_operatingSessionId_fkey" FOREIGN KEY ("operatingSessionId") REFERENCES "operating_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

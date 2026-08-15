-- CreateIndex
CREATE INDEX "invoices_workspaceId_periodStart_idx" ON "invoices"("workspaceId", "periodStart");

-- CreateIndex
CREATE INDEX "maintenance_records_workspaceId_nextMaintenanceDate_idx" ON "maintenance_records"("workspaceId", "nextMaintenanceDate");

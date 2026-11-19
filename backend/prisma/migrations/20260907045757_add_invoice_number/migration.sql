-- Add a human-readable sequential invoice number, backfilled for existing
-- rows via the new sequence's nextval() (Postgres evaluates a volatile
-- column default per existing row on ADD COLUMN).
ALTER TABLE "invoices" ADD COLUMN "invoiceNumber" SERIAL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

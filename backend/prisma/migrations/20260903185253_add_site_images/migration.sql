-- CreateTable
CREATE TABLE "site_images" (
    "id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_images_slot_key" ON "site_images"("slot");

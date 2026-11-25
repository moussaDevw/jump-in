-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_organizer_id_fkey";

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


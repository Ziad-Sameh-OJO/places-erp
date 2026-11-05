-- AlterTable: each notification's type, for the bell's filter (M-14 5.1 · 5.3)
ALTER TABLE "system"."Notification" ADD COLUMN "event" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_event_idx" ON "system"."Notification"("userId", "event");

-- Real-time bell (12.11): every new notification, from the API or the worker, is announced to the API, which pushes
-- it to that person's open pages. The payload is «userId:notificationId»: the page then asks for its own list.
CREATE OR REPLACE FUNCTION "system"."notification_created"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_created', NEW."userId" || ':' || NEW."id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "notification_created" AFTER INSERT ON "system"."Notification"
  FOR EACH ROW EXECUTE FUNCTION "system"."notification_created"();

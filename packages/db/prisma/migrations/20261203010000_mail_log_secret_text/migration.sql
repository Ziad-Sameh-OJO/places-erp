-- S2: the send log keeps a masked copy of a mail that carries a secret; the real text only until it is sent
ALTER TABLE "system"."MailLog" ADD COLUMN "secretText" TEXT;

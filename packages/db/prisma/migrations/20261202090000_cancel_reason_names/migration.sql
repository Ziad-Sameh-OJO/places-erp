-- client, 25 Nov: «No Budget» is «Low Budget», «Rented» is «Rent Outside» (and «Buy Outside» is new)
UPDATE "sales"."Lead" SET "cancelReason" = 'Low Budget' WHERE "cancelReason" = 'No Budget';
UPDATE "sales"."Lead" SET "cancelReason" = 'Rent Outside' WHERE "cancelReason" = 'Rented';

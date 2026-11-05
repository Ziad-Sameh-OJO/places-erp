-- 3.2 · M-10 4.1: sales «يسجّل تواصل» on their clients' files (POST /clients/:id/interactions needs clients:create).
-- The seed only builds a role once, so databases seeded before this get it here — only where the sales role still has
-- the seed's clients matrix (just «view»): a matrix the admin changed is left as it is.
UPDATE "access"."RolePermission" rp
SET "actions" = ARRAY['view', 'create']::TEXT[]
FROM "access"."Role" r
WHERE rp."roleId" = r."id" AND r."key" = 'sales' AND rp."module" = 'clients' AND rp."actions" = ARRAY['view']::TEXT[];

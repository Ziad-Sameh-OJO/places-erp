-- 3.5 · M-10 4.1: finance reads the clients' files and balances, without changing anything (clients: view only).
-- The seed builds a role once, so seeded databases get it here; a matrix where the admin already set clients stays.
INSERT INTO "access"."RolePermission" ("roleId", "module", "actions")
SELECT r."id", 'clients', ARRAY['view']::TEXT[]
FROM "access"."Role" r
WHERE r."key" = 'accountant'
ON CONFLICT ("roleId", "module") DO NOTHING;

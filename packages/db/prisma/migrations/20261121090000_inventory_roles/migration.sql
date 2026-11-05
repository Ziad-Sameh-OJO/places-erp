-- 2.24 · the 5 Nov demo: the Inventory Manager has no M-10 (clients) at all; the Inventory Specialists open units (view).
-- The seed builds a role once, so seeded databases change here; more than view stays a per-person override (PermissionOverride).
DELETE FROM "access"."RolePermission"
WHERE "module" = 'clients' AND "roleId" IN (SELECT "id" FROM "access"."Role" WHERE "key" = 'inventory');

INSERT INTO "access"."RolePermission" ("roleId", "module", "actions")
SELECT r."id", 'inventory', ARRAY['view']::TEXT[]
FROM "access"."Role" r
WHERE r."key" = 'inventory_staff'
ON CONFLICT ("roleId", "module") DO NOTHING;

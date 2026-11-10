-- 2.36 · the unit's owner (Contact / Number) and Agent are the Inventory Manager's only (demo seesUnitPrivate): every
-- other role, the Super Admin's too, starts with them hidden (M-09 field rules; the admin can show them in the matrix).
-- A rule the admin already set for these fields is kept.
INSERT INTO "access"."RoleFieldRule" ("roleId", "module", "field", "mode")
SELECT r."id", 'inventory', f.field, 'hide'
FROM "access"."Role" r CROSS JOIN (VALUES ('ownerName'), ('ownerPhone'), ('agent')) AS f(field)
WHERE r."key" <> 'inventory'
ON CONFLICT ("roleId", "module", "field") DO NOTHING;

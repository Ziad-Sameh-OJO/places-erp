-- M-11 4.1 · 2.2: Finance records payments and prints receipts («edit»), but is «ممنوع من: تعديل قيمة العقد»; asking for
-- a new value («create»), approving it and terminating («approve») are the salespeople's and management's. The seed
-- only builds a role once, so databases seeded before this get it here — only where the accountant still has the
-- seed's old contracts matrix: a matrix the admin changed is left as it is.
UPDATE "access"."RolePermission" rp
SET "actions" = ARRAY['view', 'edit', 'export']::TEXT[]
FROM "access"."Role" r
WHERE rp."roleId" = r."id" AND r."key" = 'accountant' AND rp."module" = 'contracts'
  AND rp."actions" = ARRAY['view', 'create', 'edit', 'approve', 'export']::TEXT[];

-- 12.7 · Lists in the settings become {value, active} (M-13 2.1 · 3.3): a value is switched off, never deleted, so
-- old records keep it. Every list saved as plain text is converted with all its values active; nothing is lost.
UPDATE "system"."Setting" s
SET "value" = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('value', elem #>> '{}', 'active', true) ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(s."value") WITH ORDINALITY AS t(elem, ord)
)
WHERE s."key" IN ('areas', 'channels', 'companyCategories', 'vendors', 'paymentPlans', 'finishings', 'interactionTypes', 'receiveSources', 'mkTaskTypes', 'ticketDepts')
  AND jsonb_typeof(s."value") = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(s."value") e WHERE jsonb_typeof(e) = 'string');

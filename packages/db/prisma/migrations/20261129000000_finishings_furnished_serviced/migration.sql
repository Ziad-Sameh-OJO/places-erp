-- M-13 «التشطيبات» (the leads' and units' Condition): Furnished and Serviced join the list (client, 11 Nov) where it was
-- saved already; an unsaved list reads its defaults (@places/contracts LIST_DEFAULTS), which have them now.
UPDATE "system"."Setting"
SET "value" = "value" || (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('value', v, 'active', true)), '[]'::jsonb)
  FROM unnest(ARRAY['Furnished', 'Serviced']) AS v
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements("Setting"."value") e WHERE e->>'value' = v OR e #>> '{}' = v)
)
WHERE "key" = 'finishings' AND jsonb_typeof("value") = 'array';

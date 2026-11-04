-- Lead codes L-1001, L-1002… (ARCHITECTURE §7: serial codes come from Postgres sequences, so two leads created at once never share a code).
-- LeadsRepository.nextCode() has always read this sequence, but no migration created it, so POST /leads failed.
CREATE SEQUENCE IF NOT EXISTS "sales"."lead_code_seq" START WITH 1001;

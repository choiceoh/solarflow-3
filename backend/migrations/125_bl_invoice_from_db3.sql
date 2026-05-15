-- M125: bl_shipments.invoice_number 보강 — DB-3 Invoice No. (NULL 가드)
BEGIN;
UPDATE bl_shipments SET invoice_number = 'LS2503994178&79' WHERE bl_number = 'SHACYR14644' AND invoice_number IS NULL;
UPDATE bl_shipments SET invoice_number = 'CNLONGIS0004P' WHERE bl_number = 'DFS815002441' AND invoice_number IS NULL;
UPDATE bl_shipments SET invoice_number = 'CNLONGIS0004P' WHERE bl_number = 'DFS815002442' AND invoice_number IS NULL;
UPDATE bl_shipments SET invoice_number = 'CNLONGIS0004P' WHERE bl_number = 'DFS815002443' AND invoice_number IS NULL;
UPDATE bl_shipments SET invoice_number = 'CNLONGIS0004P' WHERE bl_number = 'DFS815002444' AND invoice_number IS NULL;

INSERT INTO schema_migrations(filename) VALUES ('125_bl_invoice_from_db3.sql') ON CONFLICT DO NOTHING;
COMMIT;
NOTIFY pgrst, 'reload schema';

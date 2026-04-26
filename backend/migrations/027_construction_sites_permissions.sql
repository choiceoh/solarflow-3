-- 027_construction_sites_permissions.sql
-- Go API uses the PostgREST anon role locally. The construction_sites table was
-- added after the broad RLS/grant cleanup, so site list/create calls failed with
-- "permission denied for table construction_sites".

ALTER TABLE construction_sites DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES
ON TABLE construction_sites
TO anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES
    ON TABLE construction_sites
    TO authenticated;
  END IF;
END $$;

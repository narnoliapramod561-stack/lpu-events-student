-- Migration: 20261119000004_grant_postgres_diagnostics.sql
-- Description: Grant execute to postgres role on diagnostics RPC for CLI monitoring

GRANT EXECUTE ON FUNCTION public.get_operations_database_diagnostics() TO postgres, authenticated, service_role;

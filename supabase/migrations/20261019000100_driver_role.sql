-- =====================================================================
-- Adds the Driver staff role.
-- Kept in its own migration on purpose: Postgres only allows a new enum
-- value to be used after the transaction that added it has committed.
-- Run this file on its own before 20261019000200.
-- =====================================================================
alter type public.admin_role add value if not exists 'driver';

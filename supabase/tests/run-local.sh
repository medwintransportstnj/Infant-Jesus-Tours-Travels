#!/usr/bin/env bash
# Runs every migration + seed + the test suite against a throwaway local Postgres database.
# Usage: PGHOST=... PGUSER=postgres ./supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-ijt_test}"
PSQL="psql -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists ijt_test" -c "drop database if exists ijt_e2e" -c "create database $DB"
for r in anon authenticated service_role authenticator; do $PSQL -d postgres -c "drop role if exists $r"; done
$PSQL -d "$DB" -f tests/00_supabase_stubs.sql
for f in migrations/*.sql; do echo "migrating $f"; $PSQL -d "$DB" -f "$f"; done
$PSQL -d "$DB" -f seed.sql
$PSQL -d "$DB" -f seed.sql   # idempotency check
for f in tests/01_security_and_booking.sql tests/02_customers.sql tests/03_staff_roles.sql; do $PSQL -d "$DB" -f "$f" 2>&1 | grep -E "PASS|FAIL|ERROR|ALL "; done

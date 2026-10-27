#!/usr/bin/env bash
# Boots the local test stack: Postgres (migrations + seed + fixtures) -> PostgREST -> gateway -> built site.
# Requires: a local Postgres superuser reachable via psql, the postgrest binary on PATH (or $POSTGREST_BIN).
set -euo pipefail
cd "$(dirname "$0")/.."
export JWT_SECRET="local-test-secret-at-least-32-characters-long"
DB=ijt_e2e
PSQL="psql -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists ijt_test" -c "drop database if exists ijt_e2e" -c "create database $DB"
for r in anon authenticated service_role authenticator; do $PSQL -d postgres -c "drop role if exists $r"; done
$PSQL -d "$DB" -f supabase/tests/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do $PSQL -d "$DB" -f "$f" 2>&1 | grep -v "wal_level\|HINT\|pg_net" || true; done
$PSQL -d "$DB" -f supabase/seed.sql -f e2e/fixtures.sql -f e2e/realtime-emulator.sql
$PSQL -d "$DB" -c "create role authenticator login noinherit password 'authenticator'" -c "grant anon, authenticated to authenticator"

#!/bin/sh
set -eu
mkdir -p /app/data/sqlite /app/data/uploads /app/data/sessions
# Seed only a new volume. Never reapply sample content over an existing database.
if [ ! -f /app/data/sqlite/emdash.db ]; then
  if [ -f /app/data/sqlite/emdash.db-wal ] || [ -f /app/data/sqlite/emdash.db-shm ]; then
    echo "SQLite sidecars exist without the database; restore the database first." >&2
    exit 1
  fi
  node node_modules/emdash/dist/cli/index.mjs seed seed/seed.json \
    --database /app/data/sqlite/emdash.db --uploads-dir /app/data/uploads
fi
exec "$@"

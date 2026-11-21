#!/bin/sh
set -eu
# Seed only a new volume. Never reapply sample content over an existing database.
if [ ! -f /app/data/emdash.db ]; then
  if [ -f /app/data/emdash.db-wal ] || [ -f /app/data/emdash.db-shm ]; then
    echo "SQLite sidecars exist without the database; restore the database first." >&2
    exit 1
  fi
  node node_modules/emdash/dist/cli/index.mjs seed seed/seed.json \
    --database /app/data/emdash.db --uploads-dir /app/uploads
fi
exec "$@"

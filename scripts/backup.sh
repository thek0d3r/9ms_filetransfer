#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/srv/9ms/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
docker compose exec -T postgres pg_dump -U 9ms -d 9ms -Fc > "$BACKUP_DIR/postgres-$STAMP.dump"
find "$BACKUP_DIR" -type f -name 'postgres-*.dump' -mtime +14 -delete
echo "Database backup written to $BACKUP_DIR/postgres-$STAMP.dump"

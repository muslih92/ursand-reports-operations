#!/usr/bin/env bash
# Daily database backup. Add to crontab:
#   0 2 * * * /bin/bash /opt/ursand/deploy/backup.sh >> /var/log/ursand-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="/var/backups/ursand"
KEEP_DAYS=30
STAMP="$(date +%F_%H%M)"

mkdir -p "$BACKUP_DIR"

# DATABASE_URL example:
# postgresql://postgres:PASSWORD@HOST:5432/postgres
: "${DATABASE_URL:?Set DATABASE_URL before running this script}"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/db_$STAMP.sql.gz"
find "$BACKUP_DIR" -name 'db_*.sql.gz' -mtime +$KEEP_DAYS -delete

echo "Backup complete: $BACKUP_DIR/db_$STAMP.sql.gz"

#!/usr/bin/env sh
# Nightly Postgres dump + uploads tarball, 14-day retention. Install via cron on the VPS:
#   0 3 * * * /opt/arayeshgar/deploy/backup.sh >> /var/log/arayeshgar-backup.log 2>&1
set -eu
BACKUP_DIR="${BACKUP_DIR:-/opt/arayeshgar-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cd "$(dirname "$0")"
docker compose -f docker-compose.yml exec -T db pg_dump -U "${POSTGRES_USER:-arayeshgar}" "${POSTGRES_DB:-arayeshgar}" | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
docker run --rm -v arayeshgar_uploads:/data -v "$BACKUP_DIR":/backup alpine tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "[backup] $STAMP ok"

#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/home/user/shoyu-chat/data}"
BACKUP_DIR="$DATA_DIR/backups"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d)

tar -czf "$BACKUP_DIR/data-$DATE.tar.gz" \
  -C "$(dirname "$DATA_DIR")" \
  --ignore-failed-read \
  "$(basename "$DATA_DIR")/user.json" \
  "$(basename "$DATA_DIR")/usage.json" \
  "$(basename "$DATA_DIR")/conversations" \
  "$(basename "$DATA_DIR")/summaries" \
  "$(basename "$DATA_DIR")/chats" \
  "$(basename "$DATA_DIR")/insights" \
  2>/dev/null || true

# Prune backups older than 30 days
find "$BACKUP_DIR" -name "data-*.tar.gz" -mtime +30 -delete

echo "Backup complete: $DATE"

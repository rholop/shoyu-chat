#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/home/user/shoyu-chat/data}"
BACKUP_DIR="$DATA_DIR/backups"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d)

# SQLite backup
cp "$DATA_DIR/db/chat.db" "$BACKUP_DIR/chat.db.$DATE"

# Summaries + chat files backup
tar -czf "$BACKUP_DIR/summaries-$DATE.tar.gz" \
  -C "$DATA_DIR" summaries chats 2>/dev/null || true

# Prune backups older than 30 days
find "$BACKUP_DIR" -name "chat.db.*" -mtime +30 -delete
find "$BACKUP_DIR" -name "summaries-*.tar.gz" -mtime +30 -delete

echo "Backup complete: $DATE"

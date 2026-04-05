#!/bin/bash
BACKUP_DIR="$HOME/solarflow-backups"
GDRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-chnopsinc@gmail.com/내 드라이브/SolarFlow-Backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="solarflow_$DATE.sql"
/opt/homebrew/opt/postgresql@16/bin/pg_dump solarflow > "$BACKUP_DIR/$FILENAME"
cp "$BACKUP_DIR/$FILENAME" "$GDRIVE_DIR/$FILENAME"
echo "$(date): 백업 완료 - $FILENAME (로컬 + Google Drive)"

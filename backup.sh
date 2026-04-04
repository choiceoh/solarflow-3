#!/bin/bash
BACKUP_DIR="$HOME/solarflow-backups"
DATE=$(date +%Y%m%d_%H%M%S)
/opt/homebrew/opt/postgresql@16/bin/pg_dump solarflow > "$BACKUP_DIR/solarflow_$DATE.sql"
echo "$(date): 백업 완료 - solarflow_$DATE.sql"

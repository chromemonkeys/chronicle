# Local Stack Runbook

## Prerequisites
- Docker + Docker Compose plugin
- Node.js 20+
- Go 1.22+ (for local API development outside containers)

## First-time setup
1. Copy `.env.example` to `.env` and set secrets.
2. Start services:
   ```bash
   ./scripts/dev-up.sh
   ```
3. Verify services:
   ```bash
   curl -s http://localhost:8787/api/health
   curl -s http://localhost:8787/api/ready
   curl -s http://localhost:8788/health
   ```
4. Open app via Caddy proxy: `http://localhost:8080`

## Reset environment
```bash
./scripts/dev-reset.sh
```

## Backup and restore
- Backup Postgres:
  ```bash
  ./scripts/dev-backup.sh
  ```
- Restore Postgres:
  ```bash
  ./scripts/dev-restore.sh ./backups/<file>.sql
  ```

## Notes
- API boot applies SQL migrations from `db/migrations` on startup.
- Git repositories (one per document) persist in Docker volume `repos_data`.
- Decision log is append-only in DB (`decision_log_no_update` / `decision_log_no_delete` rules).

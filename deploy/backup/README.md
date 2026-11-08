# JavaRouters backups

`backup.sh` runs on the VPS every 6 hours (`javarouters-backup.timer`). Each run:

1. Dumps the Postgres database `new-api` (`pg_dump --format=custom`) and checks it with `pg_restore --list`.
2. Adds `config.tar` (`.env`, `docker-compose.yml`, `Caddyfile`, `inferhub-sync.env`, `inferhub-sync/`, `docs-sync.sh`, `auto-deploy.sh`, `backup.sh`) and a `manifest.txt`.
3. Encrypts everything into one `backup-<UTC stamp>.tar.gpg` (GnuPG, AES-256), then checks that it decrypts.
4. Uploads it to Cloudflare R2 (`javarouters-backup/javarouters/`) and deletes copies older than `RETENTION_DAYS` (30). Old copies are deleted only after a new upload succeeds.

The last successful run is recorded in `/opt/javarouters/.backup/last-success`; logs are in `journalctl -u javarouters-backup`.

## Secrets on the server

| File | Contents | Backed up? |
| --- | --- | --- |
| `/opt/javarouters/backup.env` | R2 credentials and settings (template: `backup.env.example`) | No |
| `/opt/javarouters/backup.key` | Encryption passphrase | No. The owner keeps a copy in a password manager. |

Without `backup.key`, no backup can be decrypted. If R2 credentials leak, delete the R2 API token in Cloudflare and create a new one.

## Commands (on the VPS, in `/opt/javarouters`)

```bash
./backup.sh list                      # backups in R2
./backup.sh verify                    # restore the newest into a throwaway Postgres and count rows
./backup.sh fetch latest ~/restore    # download + decrypt into ~/restore (must not exist)
sudo systemctl start javarouters-backup.service   # back up now
```

## Restore on the same server

```bash
cd /opt/javarouters
./backup.sh fetch latest ~/restore
docker compose stop new-api
docker exec -i javarouters-postgres pg_restore -U javarouters -d new-api --clean --if-exists --no-owner < ~/restore/new-api.dump
docker compose start new-api
```

## Restore on a new server

1. Install Docker and create `/opt/javarouters` owned by `ubuntu`.
2. Copy `backup.sh` from this folder, create `backup.env` from `backup.env.example` (new R2 token) and `backup.key` from the password manager, all `chmod 600`.
3. `./backup.sh fetch latest ~/restore`, then `tar -C /opt/javarouters -xf ~/restore/config.tar`. `.env` holds `SESSION_SECRET` and `CRYPTO_SECRET`; keep them, or stored secrets and sessions stop working.
4. `docker compose up -d postgres`, wait until healthy, then run the `pg_restore` command above and `docker compose up -d`.
5. Reinstall the systemd units from `deploy/auto-deploy/` and this folder, and point DNS at the new server.

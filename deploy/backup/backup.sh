#!/usr/bin/env bash
# Encrypted off-site backups of the JavaRouters database and server config to Cloudflare R2.
#
#   backup.sh [backup]          dump Postgres + config, encrypt, upload, prune old copies (timer)
#   backup.sh list              list the backups in R2
#   backup.sh fetch NAME DIR    download NAME ("latest" for the newest), decrypt and unpack into DIR
#   backup.sh verify [NAME]     restore NAME (default latest) into a throwaway Postgres and count rows;
#                               production is not touched
#
# Each backup is one file, backup-<UTC stamp>.tar.gpg (AES-256, passphrase in BACKUP_PASSPHRASE_FILE),
# holding new-api.dump (pg_dump custom format), config.tar (.env, compose, Caddyfile, sync configs)
# and manifest.txt. Settings and secrets come from /opt/javarouters/backup.env (see
# backup.env.example). Installed as /opt/javarouters/backup.sh; run by javarouters-backup.timer.
set -euo pipefail
umask 077

COMPOSE_DIR=/opt/javarouters
ENV_FILE=${BACKUP_ENV_FILE:-$COMPOSE_DIR/backup.env}
STATE_DIR=$COMPOSE_DIR/.backup
DB_CONTAINER=javarouters-postgres
DB_USER=javarouters
DB_NAME=new-api
POSTGRES_IMAGE=postgres:15-alpine
RCLONE_IMAGE=rclone/rclone:1.68.2
CONFIG_FILES=(.env docker-compose.yml Caddyfile inferhub-sync.env inferhub-sync docs-sync.sh auto-deploy.sh backup.sh)

# shellcheck source=/dev/null
source "$ENV_FILE"
: "${R2_ACCOUNT_ID:?set in $ENV_FILE}" "${R2_ACCESS_KEY_ID:?set in $ENV_FILE}"
: "${R2_SECRET_ACCESS_KEY:?set in $ENV_FILE}" "${R2_BUCKET:?set in $ENV_FILE}"
: "${BACKUP_PASSPHRASE_FILE:?set in $ENV_FILE}"
RETENTION_DAYS=${RETENTION_DAYS:-30}
REMOTE="r2:$R2_BUCKET/${R2_PREFIX:-javarouters}"

# Passed to docker by name only, so the secrets never appear in a process list.
export RCLONE_CONFIG_R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY

WORK=$(mktemp -d)
export GNUPGHOME=$WORK/gnupg
mkdir -m 700 "$GNUPGHOME"
RESTORE_CONTAINER=
cleanup() {
	if [ -n "$RESTORE_CONTAINER" ]; then
		docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
	fi
	rm -rf "$WORK"
}
trap cleanup EXIT

rclone() {
	docker run --rm -v "$WORK:/work" \
		-e RCLONE_CONFIG=/dev/null \
		-e RCLONE_CONFIG_R2_TYPE=s3 \
		-e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
		-e RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
		-e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
		-e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
		"$RCLONE_IMAGE" "$@"
}

# Downloads and decrypts one backup into $WORK/<name>/ and prints that directory.
fetch_backup() {
	local name=$1
	if [ "$name" = latest ]; then
		name=$(rclone lsf "$REMOTE/" --include 'backup-*.tar.gpg' | sort | tail -1)
		if [ -z "$name" ]; then
			echo "no backups in $REMOTE" >&2
			return 1
		fi
	fi
	rclone copyto "$REMOTE/$name" "/work/$name" >&2
	gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
		--decrypt "$WORK/$name" | tar -C "$WORK" -xf -
	echo "$WORK/${name%.tar.gpg}"
}

cmd=${1:-backup}
case "$cmd" in
backup)
	mkdir -p "$STATE_DIR"
	exec 9>"$STATE_DIR/lock"
	if ! flock -n 9; then
		echo "another backup is still running"
		exit 1
	fi

	stamp=$(date -u +%Y%m%dT%H%M%SZ)
	dir=$WORK/backup-$stamp
	mkdir "$dir"
	docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom >"$dir/new-api.dump"
	# A dump pg_restore cannot read is not a backup.
	docker exec -i "$DB_CONTAINER" pg_restore --list <"$dir/new-api.dump" >/dev/null
	tar -C "$COMPOSE_DIR" -cf "$dir/config.tar" "${CONFIG_FILES[@]}"
	{
		echo "created_utc=$stamp"
		echo "host=$(hostname)"
		echo "gateway_revision=$(cat "$COMPOSE_DIR/.auto-deploy/deployed-revision" 2>/dev/null || echo unknown)"
		echo "postgres=$(docker exec "$DB_CONTAINER" pg_dump --version)"
	} >"$dir/manifest.txt"

	archive=backup-$stamp.tar.gpg
	tar -C "$WORK" -cf - "backup-$stamp" |
		gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
			--symmetric --cipher-algo AES256 --output "$WORK/$archive"
	gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
		--decrypt "$WORK/$archive" | tar -tf - >/dev/null

	rclone copyto "/work/$archive" "$REMOTE/$archive"
	# Old copies are pruned only after a new one has been uploaded.
	rclone delete "$REMOTE/" --include 'backup-*.tar.gpg' --min-age "${RETENTION_DAYS}d"

	size=$(stat -c %s "$WORK/$archive")
	echo "$stamp $archive $size" >"$STATE_DIR/last-success"
	echo "uploaded $archive ($size bytes)"
	if [ -n "${BACKUP_PING_URL:-}" ]; then
		curl -fsS -m 10 --retry 3 "$BACKUP_PING_URL" >/dev/null || echo "ping to BACKUP_PING_URL failed"
	fi
	;;
list)
	rclone lsl "$REMOTE/" --include 'backup-*.tar.gpg' | sort -k2,3
	;;
fetch)
	name=${2:?usage: backup.sh fetch NAME|latest DIR}
	dest=${3:?usage: backup.sh fetch NAME|latest DIR}
	if [ -e "$dest" ]; then
		echo "$dest already exists" >&2
		exit 1
	fi
	dir=$(fetch_backup "$name")
	mv "$dir" "$dest"
	ls -l "$dest"
	cat "$dest/manifest.txt"
	;;
verify)
	dir=$(fetch_backup "${2:-latest}")
	cat "$dir/manifest.txt"
	tar -tf "$dir/config.tar" >/dev/null

	RESTORE_CONTAINER=javarouters-restore-check-$$
	docker run -d --name "$RESTORE_CONTAINER" --network none \
		-e POSTGRES_USER="$DB_USER" -e POSTGRES_DB="$DB_NAME" -e POSTGRES_PASSWORD=restore-check \
		"$POSTGRES_IMAGE" >/dev/null
	for _ in $(seq 1 60); do
		if docker exec "$RESTORE_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" -q; then
			break
		fi
		sleep 1
	done
	# The image's init script restarts the server once; wait for it to accept queries again.
	sleep 3
	docker exec "$RESTORE_CONTAINER" sh -c "until pg_isready -U $DB_USER -d $DB_NAME -q; do sleep 1; done"
	docker exec -i "$RESTORE_CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --exit-on-error <"$dir/new-api.dump"
	docker exec "$RESTORE_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -Atc \
		"select 'tables=' || count(*) from information_schema.tables where table_schema = 'public'
		 union all select 'users=' || count(*) from users
		 union all select 'tokens=' || count(*) from tokens
		 union all select 'channels=' || count(*) from channels
		 union all select 'logs=' || count(*) from logs"
	echo "restore check passed"
	;;
*)
	echo "usage: backup.sh [backup|list|fetch NAME DIR|verify [NAME]]" >&2
	exit 2
	;;
esac

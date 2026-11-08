#!/usr/bin/env bash
# Pull-based auto-deploy for the JavaRouters gateway on the VPS.
#
# CI publishes ghcr.io/bigbang-69/javarouters:latest only after typecheck, lint, tests and the
# Go build pass on main. This script, run every 2 minutes by javarouters-auto-deploy.timer,
# pulls that tag and, when it is a new image, recreates the API container and waits for its
# Docker health check. If the new image does not become healthy in time, the previous image is
# restored and the failed one is remembered, so it is not retried until a newer image appears.
# No SSH access or credentials are needed in GitHub.
#
# Installed as /opt/javarouters/auto-deploy.sh (see the unit files next to this script).
set -euo pipefail

COMPOSE_DIR=/opt/javarouters
SERVICE=new-api
CONTAINER=javarouters-api
IMAGE=ghcr.io/bigbang-69/javarouters:latest
ROLLBACK_TAG=javarouters-rollback:previous
STATE_DIR=$COMPOSE_DIR/.auto-deploy
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-180}

cd "$COMPOSE_DIR"
mkdir -p "$STATE_DIR"

# One run at a time; a run still waiting on a health check makes the next one exit quietly.
exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then
	exit 0
fi

wait_until_healthy() {
	local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
	local status
	while true; do
		status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
		if [ "$status" = healthy ]; then
			return 0
		fi
		if [ "$SECONDS" -ge "$deadline" ]; then
			echo "health check did not pass in ${HEALTH_TIMEOUT_SECONDS}s (last status: $status)"
			return 1
		fi
		sleep 5
	done
}

running_id=$(docker inspect -f '{{.Image}}' "$CONTAINER" 2>/dev/null || true)
docker pull -q "$IMAGE" >/dev/null
latest_id=$(docker image inspect -f '{{.Id}}' "$IMAGE")

if [ "$latest_id" = "$running_id" ]; then
	exit 0
fi
if [ -f "$STATE_DIR/failed-image" ] && [ "$(cat "$STATE_DIR/failed-image")" = "$latest_id" ]; then
	# This image already failed its health check; wait for CI to publish a newer one.
	exit 0
fi

revision=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")
echo "deploying ${revision:0:9} (${latest_id:7:12}), replacing ${running_id:7:12}"

if [ -n "$running_id" ]; then
	docker tag "$running_id" "$ROLLBACK_TAG"
fi
docker compose up -d --no-deps "$SERVICE"

if wait_until_healthy; then
	echo "deployed ${revision:0:9}: healthy"
	rm -f "$STATE_DIR/failed-image"
	echo "$revision" >"$STATE_DIR/deployed-revision"
	# Remove only untagged layers left by earlier deploys; tagged images are kept.
	docker image prune -f >/dev/null
	exit 0
fi

echo "rolling back: ${revision:0:9} is unhealthy"
echo "$latest_id" >"$STATE_DIR/failed-image"
if [ -z "$running_id" ]; then
	echo "no previous image to roll back to"
	exit 1
fi
docker tag "$ROLLBACK_TAG" "$IMAGE"
docker compose up -d --no-deps "$SERVICE"
if wait_until_healthy; then
	echo "rolled back to ${running_id:7:12}: healthy"
else
	echo "rollback did not become healthy either; manual attention needed"
fi
exit 1

#!/bin/bash
set -e
cd ~/code/platform
TAG=$(git rev-parse --short HEAD)
echo "==> Building platform-app:$TAG"
docker build -t platform-app:latest -t platform-app:$TAG .
echo "==> Recreating the platform container"
cd /srv/platform/infra
docker compose up -d --force-recreate platform
sleep 5
echo "==> Running version"
docker exec platform sh -c 'echo ok' >/dev/null && docker inspect platform --format '{{.Config.Image}} started {{.State.StartedAt}}'
docker logs platform --tail 3

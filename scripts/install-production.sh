#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || $EUID -ne 0 ]]; then
  printf 'Usage (as root): bash scripts/install-production.sh PUBLIC_ORIGIN BACKEND_ORIGIN\n' >&2
  exit 1
fi
if [[ ! -t 0 || ! -t 1 ]]; then
  printf 'Run interactively to create the administrator.\n' >&2
  exit 1
fi
if [[ ! -f compose.production.yml || ! -f scripts/setup-production.mjs ]]; then
  printf 'Run from the installation directory.\n' >&2
  exit 1
fi
if [[ -e .env || -e .secrets || -e .cloudflare ]]; then
  printf 'Existing installation settings detected; use the upgrade procedure.\n' >&2
  exit 1
fi
for directory in data sites artifacts/production dumps/production; do
  if [[ -e "$directory" ]]; then
    printf 'Existing installation data detected: %s\n' "$directory" >&2
    exit 1
  fi
done
if [[ -n "${COMPOSE_FILE:-}" ]]; then
  printf 'Unset COMPOSE_FILE before creating this installation.\n' >&2
  exit 1
fi
if [[ -n "${COMPOSE_PROJECT_NAME:-}" && "$COMPOSE_PROJECT_NAME" != cms-zarya ]]; then
  printf 'Unset COMPOSE_PROJECT_NAME before creating this installation.\n' >&2
  exit 1
fi
export COMPOSE_PROJECT_NAME=cms-zarya
docker info >/dev/null
if [[ -n "$(docker ps -aq --filter label=com.docker.compose.project=cms-zarya)" ]]; then
  printf 'Existing Compose project detected; use the upgrade procedure.\n' >&2
  exit 1
fi
for volume in cms-zarya_mongo-data cms-zarya_caddy-data cms-zarya_caddy-config; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    printf 'Existing installation volume detected: %s\n' "$volume" >&2
    exit 1
  fi
done

docker run --rm -v "$PWD:/work" -w /work node:26.7.0-bookworm-slim \
  node scripts/setup-production.mjs --public-origin "$1" --backend-origin "$2"
install -d -m 0700 .secrets
openssl rand -base64 756 > .secrets/mongo-keyfile
chown 999:999 .secrets/mongo-keyfile
chmod 0400 .secrets/mongo-keyfile
install -d -o 1000 -g 1000 data sites artifacts/production dumps/production
install -d -m 0700 -o 1000 -g 1000 dumps/production/.coordination
install -d -m 0700 -o 1000 -g 1000 .cloudflare
cpu_budget="$(docker info --format '{{.NCPU}}')"
docker run --rm -v "$PWD:/work" -w /work \
  -e "ZARYA_INSTALLATION_CPU_BUDGET=$cpu_budget" node:26.7.0-bookworm-slim node scripts/prepare-compose.mjs
chown -R 1000:1000 .secrets/resources
docker compose up -d --wait mongo
docker compose build app cloudflare
cms_version="$(docker run --rm -v "$PWD/package.json:/work/package.json:ro" node:26.7.0-bookworm-slim \
  node -p "require('/work/package.json').version")"
docker run --rm -v "$PWD:/work:ro" -v /var/run/docker.sock:/var/run/docker.sock -w /work \
  node:26.7.0-bookworm-slim node scripts/release-consistency.mjs
# Verify the package actually built into both images before migrations or installation.
for service in app cloudflare; do
  image="$(docker compose config --format json | docker run --rm -i node:26.7.0-bookworm-slim \
    node --input-type=module -e 'let data=""; for await (const chunk of process.stdin) data+=chunk; \
    console.log(JSON.parse(data).services[process.argv[1]].image)' "$service")"
  [[ "$image" == *":$cms_version" ]] || { printf 'Image tag mismatch.\\n' >&2; exit 1; }
  built_version="$(docker run --rm --network none --entrypoint node "$image" -p "require('/app/package.json').version")"
  [[ "$built_version" == "$cms_version" ]] || { printf 'Image version mismatch.\\n' >&2; exit 1; }
done
docker compose run --rm --no-deps app node dist/migrate.js
docker compose run --rm --no-deps app node dist/migrate.js --verify
docker compose run --rm --no-deps app bash scripts/create-admin.sh
docker compose up -d --wait app proxy

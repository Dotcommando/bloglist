#!/usr/bin/env bash
set +x
set -euo pipefail

if [[ ! -t 0 || ! -t 1 ]] || [[ $# -ne 0 && ( $# -ne 2 || $1 != --site-id ) ]]; then
  printf 'Run interactively: bash scripts/create-admin.sh [--site-id SITE_ID]\n' >&2
  exit 1
fi

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$repository_root"

if [[ ! -f dist/create-admin.js ]]; then
  printf 'Run npm run build before creating an administrator.\n' >&2
  exit 1
fi

trap 'unset admin_email admin_password' EXIT
IFS= read -r -p 'Admin email: ' admin_email
IFS= read -r -s -p 'Password: ' admin_password
printf '\n'

node_options=()
if [[ -f .env ]]; then
  node_options=(--env-file=.env)
fi

printf '%s\n%s\n' "$admin_email" "$admin_password" |
  node "${node_options[@]}" dist/create-admin.js "$@"

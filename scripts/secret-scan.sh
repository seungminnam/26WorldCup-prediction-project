#!/usr/bin/env bash
set -euo pipefail

pattern='(service_role\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=.+|SPORTMONKS_API_TOKEN\s*=.+|postgres://|postgresql://|DATABASE_URL\s*=.+|API[_-]?KEY\s*=.+|SECRET\s*=.+|PASSWORD\s*=.+|Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]{20,})'

if git grep -nE "$pattern" -- \
  . \
  ':(exclude)package-lock.json' \
  ':(exclude)scripts/secret-scan.sh' \
  ':(exclude)docs/superpowers/plans/**'; then
  echo "Potential secret pattern detected."
  exit 1
fi

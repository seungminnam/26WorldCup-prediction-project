#!/usr/bin/env bash
set -euo pipefail

pattern='(service_role\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=.+|SPORTMONKS_API_TOKEN\s*=.+|postgres://|postgresql://|DATABASE_URL\s*=.+|API[_-]?KEY\s*=.+|SECRET\s*=.+|PASSWORD\s*=.+|Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]{20,})'

if grep -RInE "$pattern" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=.temp \
  --exclude-dir=plans \
  --exclude=package-lock.json \
  --exclude=secret-scan.sh; then
  echo "Potential secret pattern detected."
  exit 1
fi

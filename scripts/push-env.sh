#!/usr/bin/env bash
# Push selected env vars from .env.local to Vercel (production+preview+development).
# Usage: bash scripts/push-env.sh
set -euo pipefail

ENV_FILE=".env.local"
VARS=(VITE_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY DATABASE_URL)
TARGETS=(production preview development)

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"; exit 1
fi

read_value() {
  # Extract the value for KEY=... from .env.local, stripping surrounding quotes.
  local key="$1"
  local raw
  raw=$(grep -E "^${key}=" "$ENV_FILE" | head -n1 | sed -E "s/^${key}=//")
  # Strip leading/trailing double quotes if present.
  raw="${raw#\"}"; raw="${raw%\"}"
  printf '%s' "$raw"
}

for VAR in "${VARS[@]}"; do
  VALUE=$(read_value "$VAR")
  if [ -z "$VALUE" ]; then
    echo "SKIP $VAR (not found in $ENV_FILE)"; continue
  fi
  for ENV in "${TARGETS[@]}"; do
    # Remove existing entry (ignore errors), then add fresh.
    yes y 2>/dev/null | vercel env rm "$VAR" "$ENV" >/dev/null 2>&1 || true
    printf '%s' "$VALUE" | vercel env add "$VAR" "$ENV" >/dev/null
    echo "SET $VAR -> $ENV"
  done
done

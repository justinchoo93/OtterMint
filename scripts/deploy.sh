#!/usr/bin/env bash
#
# OtterMint → OtterHolt deploy. See docs/DEPLOYMENT.md for the full runbook and
# the host source of truth (OtterHolt.md, in the Obsidian "life" vault).
#
# What it does:
#   1. Ensures your local HEAD is on origin/main (the NAS builds origin/main).
#   2. Fast-forwards the NAS build checkout (…/ottermint/repo).
#   3. Rebuilds + recreates ONLY the app container via the Dockhand compose
#      executor (the Unraid host has no docker-compose CLI). db is left running.
#   4. Prints the /api/health probe.
#
# `up --build` builds before swapping, so a failed build leaves prod running.
#
# Usage:  scripts/deploy.sh
# Env:    NAS_SSH   ssh target (default: otterholt; e.g. root@10.0.0.48)
set -euo pipefail

NAS_SSH="${NAS_SSH:-otterholt}"
REPO_DIR=/mnt/user/appdata/autobot/ottermint/repo
DEPLOY_DIR=/mnt/user/appdata/autobot/ottermint/deploy
PROJECT=ottermint

# 1. Guard: local HEAD must match origin/main (that's what the NAS will build).
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "!! local HEAD != origin/main. Push to main first — the NAS builds origin/main." >&2
  echo "   local:  $(git rev-parse --short HEAD)   origin/main: $(git rev-parse --short origin/main)" >&2
  exit 1
fi

echo "==> [1/2] Fast-forward repo + rebuild app on ${NAS_SSH}"
ssh "$NAS_SSH" bash -se <<EOF
set -euo pipefail
git -C "$REPO_DIR" pull --ff-only origin main
echo "    repo now at: \$(git -C "$REPO_DIR" log --oneline -1)"
docker exec -w "$DEPLOY_DIR" Dockhand docker-compose -p "$PROJECT" up -d --build ottermint
EOF

echo "==> [2/2] Health check"
for i in 1 2 3 4 5 6; do
  if health=$(ssh "$NAS_SSH" 'docker exec ottermint-ottermint-1 wget -qO- http://127.0.0.1:3000/api/health' 2>/dev/null); then
    echo "    $health"
    case "$health" in
      *'"status":"ok"'*) echo "==> Deployed: https://ottermint.otterholt.net"; exit 0 ;;
    esac
  fi
  echo "    waiting for app to become healthy ($i/6)…"
  sleep 5
done
echo "!! app did not report healthy — check: ssh $NAS_SSH docker logs --tail 50 ottermint-ottermint-1" >&2
exit 1

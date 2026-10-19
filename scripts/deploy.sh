#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git pull --ff-only
npm ci --no-audit --no-fund
npm run build
sudo systemctl restart rollcore
sudo systemctl --no-pager --lines=5 status rollcore

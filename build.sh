#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$project_root/frontend"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build
cd "$project_root/backend"
mvn clean package
printf '%s\n' "Built: $project_root/build/backend/hiai-menu-cart-checkout-1.0.0.jar"

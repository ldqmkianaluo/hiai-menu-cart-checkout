#!/usr/bin/env sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
build_stamp=$(date +%Y%m%d-%H%M%S)
build_dir="$project_root/build/packages/$build_stamp"
cd "$project_root/frontend"
if [ -f package-lock.json ]; then npm ci; else npm install; fi
npm run build
cd "$project_root/backend"
mvn clean package "-Dhiai.build.directory=$build_dir"
printf '%s\n' "$build_dir/hiai-menu-cart-checkout-1.0.0.jar" > "$project_root/build/latest.txt"
printf '%s\n' "Built: $build_dir/hiai-menu-cart-checkout-1.0.0.jar"

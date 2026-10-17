#!/usr/bin/env bash
# Runs the CLI on the fixture project under one runtime, from a packed SDK the
# way a project installs it: pull the contracts, type-check, and compare what a
# push would send with the snapshot.
#
#   scripts/check-runtime.sh <node|bun> <packed .tgz> [--update]
#
# `--update` rewrites the snapshot instead of comparing with it.
set -euo pipefail

runtime=$1
tarball=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
update=${3:-}

root=$(cd "$(dirname "$0")/.." && pwd)
snapshot=$root/test/fixtures/project.specification.json

project=$(mktemp -d)
trap 'rm -rf "$project"' EXIT
cp -R "$root/test/fixtures/project/." "$project"
cd "$project"

case $runtime in
  node)
    npm install --silent --no-audit --no-fund "$tarball" typescript@5
    zodiac() { npx --no-install zodiac "$@"; }
    tsc() { npx --no-install tsc "$@"; }
    ;;
  bun)
    # `file:`, or Bun takes the published release of the same version.
    bun add --silent "@zodiaceco/sdk@file:$tarball" typescript@5
    # `--bun`, or the CLI's `node` shebang has Node run it.
    zodiac() { bun run --bun zodiac "$@"; }
    tsc() { bun run --bun tsc "$@"; }
    ;;
  *)
    echo "unknown runtime: $runtime" >&2
    exit 1
    ;;
esac

zodiac pull-contracts
tsc --noEmit -p .
zodiac push --dry-run > specification.json

if [ "$update" = "--update" ]; then
  cp specification.json "$snapshot"
  echo "Updated $snapshot"
elif ! diff -u "$snapshot" specification.json; then
  echo "What $runtime would push differs from $snapshot." >&2
  exit 1
fi

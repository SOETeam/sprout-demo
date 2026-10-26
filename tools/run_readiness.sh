#!/bin/bash
# SPROUT P0.4 readiness runner — structural gates + 63-grade-month matrix
# Usage: bash tools/run_readiness.sh [--strict] [--no-write]
# Exit 0 = structural gates (b–e) clean; --strict also requires the beta bar
# (every K-6 grade-month >= T1) and zero warnings.
set -e
cd "$(dirname "$0")/.."

echo "== P0.4 runner: syntax =="
node --check tools/validate_readiness.js
echo "node --check OK: tools/validate_readiness.js"

echo
echo "== P0.4 runner: existing structural validator (skill tree/items/events/mastery) =="
node tools/validate_engine.js

echo
echo "== P0.4 runner: readiness matrix v2 (7 grades x 9 months x 4 weeks) =="
node tools/validate_readiness.js "$@"
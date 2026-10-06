#!/usr/bin/env bash
# Save a dated copy of the public-domain FDA drug-interaction page that
# crates/engine/data/fda_roles.csv is extracted from (only needed to
# regenerate the CSV — the reviewed CSV itself is committed).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
ua="drug-interaction-visualizer (research; contact via repository)"
curl -fsSL -A "$ua" -o data/raw/fda_hcp_cyp_transporter.html \
  "https://www.fda.gov/drugs/drug-interactions-labeling/healthcare-professionals-fdas-examples-drugs-interact-cyp-enzymes-and-transporter-systems"
echo "saved to data/raw/ — next: uv run --no-project scripts/extract_fda_roles.py"

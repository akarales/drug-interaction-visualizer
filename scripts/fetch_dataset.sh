#!/usr/bin/env bash
# Fetch the real DrugBank-derived DDI dataset from Kaggle.
#
# Requires: kaggle CLI configured (https://www.kaggle.com/docs/api)
#
# The dataset is downloaded under YOUR Kaggle account at setup time and is
# NOT redistributed in this repository (DrugBank-derived data; each user
# accepts Kaggle's terms on download).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW_DIR="$REPO_ROOT/data/raw"

mkdir -p "$RAW_DIR"
kaggle datasets download -d mghobashy/drug-drug-interactions -p "$RAW_DIR" --unzip

echo ""
echo "Downloaded to: $RAW_DIR/db_drug_interactions.csv"
echo "Next: cd backend && uv run python scripts/build_dataset.py"

#!/usr/bin/env bash
set -euo pipefail
# Jalankan OpenMausBot (OMB) sebagai service UI :8799.
# Wajib di-set di environment / .env sebelum panggil:
#   NINEROUTER_API_KEY  — API key 9Router (engine openaiCompat)
export PATH="$NODE_DIR:$PATH"
export OMB_DATA_DIR="${OMB_DATA_DIR:-$HOME/.openmausbot}"
export OMB_DUCKDB_DIR="${OMB_DUCKDB_DIR:-$NODE_LIB_DIR}"
exec openmausbot serve --port "${OMB_PORT:-8799}" --no-pair

#!/usr/bin/env bash
# SolarFlow 전체 검증 스크립트
# 사용법: ./scripts/verify_all.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_step() {
  local title="$1"
  shift
  echo ""
  echo "==> ${title}"
  "$@"
}

skip_step() {
  local title="$1"
  local reason="$2"
  echo ""
  echo "==> ${title}"
  echo "skip: ${reason}"
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "missing command: ${name}" >&2
    exit 1
  fi
}

run_worktree_setup() {
  if [[ "${SKIP_WORKTREE_SETUP:-0}" == "1" ]]; then
    skip_step "Worktree setup" "SKIP_WORKTREE_SETUP=1"
    return
  fi

  if [[ -x "${ROOT_DIR}/scripts/setup_worktree.sh" ]]; then
    run_step "Worktree setup" "${ROOT_DIR}/scripts/setup_worktree.sh"
    export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"
  else
    skip_step "Worktree setup" "scripts/setup_worktree.sh not found"
  fi
}

echo "SolarFlow full verification"
echo "root: ${ROOT_DIR}"

run_worktree_setup

require_cmd go
require_cmd cargo
require_cmd bun

run_step "Go build" bash -lc "cd '${ROOT_DIR}/backend' && go build ./..."
run_step "Go vet" bash -lc "cd '${ROOT_DIR}/backend' && go vet ./..."

if [[ "${SKIP_GO_TEST:-0}" == "1" ]]; then
  skip_step "Go test" "SKIP_GO_TEST=1"
else
  run_step "Go test" bash -lc "cd '${ROOT_DIR}/backend' && go test ./..."
fi

if [[ "${SKIP_RULES_LINT:-0}" == "1" ]]; then
  skip_step "Backend RULES lint" "SKIP_RULES_LINT=1"
elif [[ "${STRICT_RULES:-0}" == "1" ]]; then
  run_step "Backend RULES lint" bash -lc "cd '${ROOT_DIR}/backend' && ./scripts/lint_rules.sh"
else
  echo ""
  echo "==> Backend RULES lint (advisory)"
  set +e
  (cd "${ROOT_DIR}/backend" && ./scripts/lint_rules.sh)
  rules_status=$?
  set -e
  if [[ ${rules_status} -ne 0 ]]; then
    echo "advisory: existing RULES lint issues were found; set STRICT_RULES=1 to make this step blocking."
  fi
fi

if [[ "${SKIP_SCHEMA:-0}" == "1" ]]; then
  skip_step "Request struct schema check" "SKIP_SCHEMA=1"
elif command -v psql >/dev/null 2>&1; then
  run_step "Request struct schema check" bash -lc "cd '${ROOT_DIR}/backend' && ./scripts/check_schema.sh"
else
  skip_step "Request struct schema check" "psql command not found"
fi

if [[ "${SKIP_RUST_TEST:-0}" == "1" ]]; then
  skip_step "Rust test" "SKIP_RUST_TEST=1"
else
  run_step "Rust test" bash -lc "cd '${ROOT_DIR}/engine' && cargo test"
fi

if [[ "${SKIP_FRONTEND:-0}" == "1" ]]; then
  skip_step "Frontend build" "SKIP_FRONTEND=1"
else
  run_step "Frontend build" bash -lc "cd '${ROOT_DIR}/frontend' && bun run build"
fi

if [[ "${RUN_GRAPHIFY:-0}" == "1" ]]; then
  if command -v graphify >/dev/null 2>&1; then
    run_step "Graphify update" bash -lc "cd '${ROOT_DIR}' && graphify update ."
  else
    skip_step "Graphify update" "graphify command not found"
  fi
fi

echo ""
echo "All requested verification steps completed."

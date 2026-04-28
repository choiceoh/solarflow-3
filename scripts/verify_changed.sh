#!/usr/bin/env bash
# 변경 파일 기준 선택 검증 스크립트
# 사용법: ./scripts/verify_changed.sh
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

default_base() {
  if [[ -n "${VERIFY_BASE:-}" ]]; then
    echo "${VERIFY_BASE}"
    return
  fi
  local upstream
  if upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)"; then
    echo "${upstream}"
    return
  fi
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    echo "origin/main"
    return
  fi
  echo "HEAD"
}

collect_changed_files() {
  local base="$1"
  local tmp
  tmp="$(mktemp)"
  git diff --name-only "${base}...HEAD" >> "${tmp}" 2>/dev/null || true
  git diff --name-only >> "${tmp}"
  git diff --cached --name-only >> "${tmp}"
  git ls-files --others --exclude-standard >> "${tmp}"
  sort -u "${tmp}" | sed '/^$/d'
  rm -f "${tmp}"
}

run_backend_checks() {
  require_cmd go
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
    local rules_status=$?
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
}

run_engine_checks() {
  require_cmd cargo
  if [[ "${SKIP_RUST_TEST:-0}" == "1" ]]; then
    skip_step "Rust test" "SKIP_RUST_TEST=1"
  else
    run_step "Rust test" bash -lc "cd '${ROOT_DIR}/engine' && cargo test"
  fi
}

run_frontend_checks() {
  require_cmd npm
  if [[ "${SKIP_FRONTEND:-0}" == "1" ]]; then
    skip_step "Frontend build" "SKIP_FRONTEND=1"
  else
    run_step "Frontend build" bash -lc "cd '${ROOT_DIR}/frontend' && npm run build"
  fi
}

run_shell_checks() {
  local files=("$@")
  if [[ ${#files[@]} -eq 0 ]]; then
    return
  fi
  local file
  for file in "${files[@]}"; do
    if [[ -f "${ROOT_DIR}/${file}" ]]; then
      run_step "Shell syntax: ${file}" bash -n "${ROOT_DIR}/${file}"
    else
      skip_step "Shell syntax: ${file}" "file deleted"
    fi
  done
}

cd "${ROOT_DIR}"

BASE_REF="$(default_base)"
mapfile -t CHANGED_FILES < <(collect_changed_files "${BASE_REF}")

echo "SolarFlow changed-file verification"
echo "root: ${ROOT_DIR}"
echo "base: ${BASE_REF}"

if [[ ${#CHANGED_FILES[@]} -eq 0 ]]; then
  echo ""
  echo "No changed files detected."
  exit 0
fi

echo ""
echo "Changed files:"
printf '  - %s\n' "${CHANGED_FILES[@]}"

NEED_BACKEND=0
NEED_ENGINE=0
NEED_FRONTEND=0
NEED_FULL=0
SHELL_FILES=()

for file in "${CHANGED_FILES[@]}"; do
  case "${file}" in
    backend/*|go.mod|go.sum)
      NEED_BACKEND=1
      ;;
    engine/*|Cargo.toml|Cargo.lock)
      NEED_ENGINE=1
      ;;
    frontend/*|package.json|package-lock.json|vite.config.*|tsconfig*.json|components.json)
      NEED_FRONTEND=1
      ;;
    scripts/*.sh|*.sh|backend/scripts/*.sh|engine/scripts/*.sh)
      SHELL_FILES+=("${file}")
      ;;
    harness/*|*.md|AGENTS.md|CLAUDE.md|*.conf|*.sql|local-Caddyfile)
      ;;
    *)
      NEED_FULL=1
      ;;
  esac
done

if [[ "${FORCE_ALL:-0}" == "1" || ${NEED_FULL} -eq 1 ]]; then
  echo ""
  echo "Full verification selected."
  if [[ ${NEED_FULL} -eq 1 ]]; then
    echo "reason: an unknown path changed"
  fi
  exec "${ROOT_DIR}/scripts/verify_all.sh"
fi

run_shell_checks "${SHELL_FILES[@]}"

if [[ ${NEED_BACKEND} -eq 1 ]]; then
  run_backend_checks
else
  skip_step "Backend checks" "no backend changes"
fi

if [[ ${NEED_ENGINE} -eq 1 ]]; then
  run_engine_checks
else
  skip_step "Rust checks" "no engine changes"
fi

if [[ ${NEED_FRONTEND} -eq 1 ]]; then
  run_frontend_checks
else
  skip_step "Frontend checks" "no frontend changes"
fi

if [[ "${RUN_GRAPHIFY:-0}" == "1" ]]; then
  if command -v graphify >/dev/null 2>&1; then
    run_step "Graphify update" bash -lc "cd '${ROOT_DIR}' && graphify update ."
  else
    skip_step "Graphify update" "graphify command not found"
  fi
fi

echo ""
echo "Changed-file verification completed."

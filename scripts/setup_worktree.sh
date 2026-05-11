#!/usr/bin/env bash
# SolarFlow worktree bootstrap. Codex Local Environment runs this in fresh worktrees.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${ROOT_DIR}/frontend"

log() {
  printf '==> %s\n' "$1"
}

warn() {
  printf 'warning: %s\n' "$1" >&2
}

require_cmd() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    printf 'missing command: %s\n' "${name}" >&2
    exit 1
  fi
}

package_bun_version() {
  if command -v node >/dev/null 2>&1 && [[ -f "${FRONTEND_DIR}/package.json" ]]; then
    node -e "const p=require(process.argv[1]); const m=/^bun@(.+)$/.exec(p.packageManager || ''); process.stdout.write(m ? m[1] : '1.3.13')" "${FRONTEND_DIR}/package.json"
    return
  fi
  printf '1.3.13'
}

bun_version_matches() {
  local bun_bin="$1"
  local required_version="$2"
  [[ -x "${bun_bin}" ]] || return 1
  [[ "$("${bun_bin}" --version 2>/dev/null || true)" == "${required_version}" ]]
}

install_bun() {
  local required_version="$1"
  export BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"

  require_cmd curl
  log "Install Bun ${required_version}"
  curl -fsSL https://bun.sh/install | bash -s "bun-v${required_version}"

  if ! bun_version_matches "${BUN_INSTALL}/bin/bun" "${required_version}"; then
    printf 'Bun install did not produce expected version %s\n' "${required_version}" >&2
    exit 1
  fi
}

ensure_bun() {
  local required_version="$1"
  export BUN_INSTALL="${BUN_INSTALL:-${HOME}/.bun}"
  export PATH="${BUN_INSTALL}/bin:${HOME}/.local/bin:${PATH}"

  local bun_bin="${BUN_INSTALL}/bin/bun"
  local local_bin="${HOME}/.local/bin/bun"
  local existing_bin
  existing_bin="$(command -v bun 2>/dev/null || true)"

  if bun_version_matches "${bun_bin}" "${required_version}"; then
    log "Bun ${required_version} already installed"
  elif [[ -n "${existing_bin}" ]] && bun_version_matches "${existing_bin}" "${required_version}"; then
    bun_bin="${existing_bin}"
    log "Bun ${required_version} already available"
  else
    install_bun "${required_version}"
    bun_bin="${BUN_INSTALL}/bin/bun"
  fi

  mkdir -p "${HOME}/.local/bin"
  if [[ "${bun_bin}" != "${local_bin}" ]]; then
    ln -sfn "${bun_bin}" "${local_bin}"
  fi
  export PATH="${BUN_INSTALL}/bin:${HOME}/.local/bin:${PATH}"
}

frontend_install_needed() {
  local stamp="${FRONTEND_DIR}/node_modules/.solarflow-bun-install.stamp"

  [[ -d "${FRONTEND_DIR}/node_modules" ]] || return 0
  [[ -x "${FRONTEND_DIR}/node_modules/.bin/vite" ]] || return 0
  [[ -x "${FRONTEND_DIR}/node_modules/.bin/tsc" ]] || return 0
  [[ -f "${stamp}" ]] || return 0

  local file
  for file in package.json bun.lock bunfig.toml; do
    if [[ "${FRONTEND_DIR}/${file}" -nt "${stamp}" ]]; then
      return 0
    fi
  done

  return 1
}

ensure_frontend_dependencies() {
  if [[ ! -d "${FRONTEND_DIR}" ]]; then
    warn "frontend directory not found; skipping frontend dependency install"
    return
  fi

  if frontend_install_needed; then
    log "Install frontend dependencies"
    (cd "${FRONTEND_DIR}" && bun install --frozen-lockfile)
    mkdir -p "${FRONTEND_DIR}/node_modules"
    touch "${FRONTEND_DIR}/node_modules/.solarflow-bun-install.stamp"
  else
    log "Frontend dependencies already installed"
  fi
}

ensure_graphify_index() {
  if [[ "${SKIP_GRAPHIFY_SETUP:-0}" == "1" ]]; then
    log "Skip graphify setup"
    return
  fi

  if [[ -f "${ROOT_DIR}/graphify-out/GRAPH_REPORT.md" ]]; then
    log "Graphify index already present"
    return
  fi

  if command -v graphify >/dev/null 2>&1; then
    log "Build graphify index"
    (cd "${ROOT_DIR}" && graphify update .)
  else
    warn "graphify command not found; skipping graphify index"
  fi
}

check_toolchain_hints() {
  local name
  for name in go cargo; do
    if ! command -v "${name}" >/dev/null 2>&1; then
      warn "${name} command not found; related verification steps will fail until it is installed"
    fi
  done
}

main() {
  log "SolarFlow worktree setup"
  local bun_version
  bun_version="$(package_bun_version)"

  ensure_bun "${bun_version}"
  check_toolchain_hints
  ensure_frontend_dependencies
  ensure_graphify_index

  log "Worktree setup completed"
}

main "$@"

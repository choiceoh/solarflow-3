// scripts/codemod/lib/registry.mjs
// registry.yaml + harness/domains/*.yaml 파서. 모든 codemod 의 공통 입력 로더.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 프로젝트 루트 — scripts/codemod/lib/ 에서 3단 위.
 */
export const ROOT = join(__dirname, '..', '..', '..')

/**
 * @typedef {object} Tenant
 * @property {string} id
 * @property {string} display_name
 * @property {string[]} host_patterns
 * @property {string[]} groups
 * @property {boolean} [is_default]
 */

/**
 * @typedef {object} Group
 * @property {string} id
 * @property {string} description
 */

/**
 * @typedef {object} Pack
 * @property {string} id
 * @property {string} label
 * @property {string} description
 */

/**
 * @typedef {object} DomainRef
 * @property {string} id
 * @property {string} display_name
 * @property {string} visible_to
 * @property {string} feature_id
 * @property {string} pack
 * @property {string} [manifest]
 */

/**
 * @typedef {object} Registry
 * @property {number} schema_version
 * @property {Tenant[]} tenants
 * @property {Group[]} groups
 * @property {Pack[]} packs
 * @property {DomainRef[]} domains
 */

/**
 * @typedef {object} BlastRadiusEntry
 * @property {string} description
 * @property {string[]} must_check
 */

/**
 * @typedef {object} VerifyScript
 * @property {string} command
 * @property {string} when
 */

/**
 * @typedef {object} DomainManifest
 * @property {number} schema_version
 * @property {string} id
 * @property {string} display_name
 * @property {string} pack
 * @property {string} feature_id
 * @property {string} visible_to
 * @property {{backend?: string[], frontend?: string[], migrations?: string[], tests?: string[]}} paths
 * @property {string[]} [tables]
 * @property {string[]} [views]
 * @property {string[]} [depends_on]
 * @property {BlastRadiusEntry[]} [blast_radius]
 * @property {VerifyScript[]} [verify_scripts]
 * @property {string[]} [api_routes]
 * @property {{script: string, purpose: string}[]} [maintenance_scripts]
 * @property {string[]} [owners]
 * @property {string[]} [decisions]
 */

/**
 * registry.yaml 로드. 단일 정본.
 * @returns {Registry}
 */
export function loadRegistry() {
  const path = join(ROOT, 'harness', 'registry.yaml')
  const raw = readFileSync(path, 'utf8')
  return parse(raw)
}

/**
 * 한 도메인의 manifest 로드. 없으면 null.
 * @param {string} id
 * @returns {DomainManifest | null}
 */
export function loadDomainManifest(id) {
  const path = join(ROOT, 'harness', 'domains', `${id}.yaml`)
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf8')
  return parse(raw)
}

/**
 * harness/domains/*.yaml 모두 로드 (id 키로 맵 반환).
 * README.md 같은 비-yaml 은 자동 제외.
 * @returns {Map<string, DomainManifest>}
 */
export function loadAllDomainManifests() {
  const dir = join(ROOT, 'harness', 'domains')
  const out = new Map()
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yaml')) continue
    const id = file.replace(/\.yaml$/, '')
    const m = loadDomainManifest(id)
    if (m) out.set(id, m)
  }
  return out
}

/**
 * 그룹 ID 에 속한 테넌트 ID 정렬 목록 (Go IDsInGroup 의 동작과 동일).
 * @param {Registry} reg
 * @param {string} groupId
 * @returns {string[]}
 */
export function tenantsInGroup(reg, groupId) {
  return reg.tenants
    .filter((t) => t.groups.includes(groupId))
    .map((t) => t.id)
    .sort()
}

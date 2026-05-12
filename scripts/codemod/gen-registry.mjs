#!/usr/bin/env node
// gen-registry.mjs — harness/registry.yaml → backend/internal/tenant/registry.go
//
// 동작:
//  - registry.yaml 의 tenants 섹션을 두 마커 사이에 생성:
//    * AUTOGEN BEGIN/END: tenant_ids   (const 블록 안의 ID 상수)
//    * AUTOGEN BEGIN/END: tenants      (defaultRegistry.tenants slice)
//  - 마커 없으면 에러 + 미변경 (안전).
//  - 행동 보존: 현재 코드와 byte-equal (gofmt alignment 손으로 재현).
//
// 사용: `node gen-registry.mjs` (cwd 무관, ROOT 는 import.meta 로 자동).

import { join } from 'node:path'
import { ROOT, loadRegistry } from './lib/registry.mjs'
import { replaceMarkedSection } from './lib/util.mjs'

const TARGET = join(ROOT, 'backend', 'internal', 'tenant', 'registry.go')

/**
 * snake_case / kebab-case → PascalCase.
 * @param {string} s
 */
function toPascalCase(s) {
  return s
    .split(/[_-]/)
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}

/** @param {string} id */
const tenantConst = (id) => `ID${toPascalCase(id)}`
/** @param {string} id */
const groupConst = (id) => `Group${toPascalCase(id)}`

/**
 * 호스트 정규식을 Go raw string (backtick) 으로.
 * @param {string} s
 */
function goRawString(s) {
  if (s.includes('`')) throw new Error(`backtick in pattern unsupported: ${s}`)
  return '`' + s + '`'
}

/**
 * @typedef {{key: string, val: string}} AlignRow
 * @param {AlignRow[]} rows
 * @param {string} indent
 * @returns {string}
 */
function alignFields(rows, indent) {
  const maxKey = Math.max(...rows.map((r) => r.key.length))
  return rows
    .map((r) => `${indent}${r.key}${' '.repeat(maxKey - r.key.length + 1)}${r.val}`)
    .join('\n')
}

/**
 * Tenant ID 상수 블록 (들여쓰기 \t).
 * @param {import('./lib/registry.mjs').Registry} reg
 */
function genTenantIDs(reg) {
  const rows = reg.tenants.map((t) => ({
    key: tenantConst(t.id),
    val: `ID = "${t.id}"`,
  }))
  const maxName = Math.max(...rows.map((r) => r.key.length))
  return rows
    .map((r) => `\t${r.key}${' '.repeat(maxName - r.key.length + 1)}${r.val}`)
    .join('\n')
}

/**
 * defaultRegistry.tenants slice 의 element 들 (들여쓰기 \t\t, field \t\t\t).
 * @param {import('./lib/registry.mjs').Registry} reg
 */
function genTenants(reg) {
  return reg.tenants
    .map((t) => {
      /** @type {AlignRow[]} */
      const rows = [
        { key: 'ID:', val: `${tenantConst(t.id)},` },
        { key: 'DisplayName:', val: `"${t.display_name}",` },
        {
          key: 'HostPatterns:',
          val: `[]string{${t.host_patterns.map(goRawString).join(', ')}},`,
        },
        { key: 'Groups:', val: `[]Group{${t.groups.map(groupConst).join(', ')}},` },
      ]
      if (t.is_default) rows.push({ key: 'IsDefault:', val: 'true,' })

      const fields = alignFields(rows, '\t\t\t')
      return `\t\t{\n${fields}\n\t\t},`
    })
    .join('\n')
}

function main() {
  const reg = loadRegistry()
  const idsBlock = genTenantIDs(reg)
  const tenantsBlock = genTenants(reg)

  let changedAny = false
  try {
    if (replaceMarkedSection(TARGET, 'tenant_ids', idsBlock)) {
      console.log(`gen-registry: ${TARGET} 의 tenant_ids 블록 갱신`)
      changedAny = true
    }
    if (replaceMarkedSection(TARGET, 'tenants', tenantsBlock)) {
      console.log(`gen-registry: ${TARGET} 의 tenants 블록 갱신`)
      changedAny = true
    }
  } catch (e) {
    console.error(`gen-registry: 실패 — ${e.message}`)
    process.exit(1)
  }
  if (!changedAny) console.log(`gen-registry: ${TARGET} 변동 없음 (byte-equal)`)
}

main()

// scripts/codemod/lib/util.mjs
// 파일 IO + 마커 사이 교체 헬퍼.

import { readFileSync, writeFileSync } from 'node:fs'

/**
 * 파일 안의 `// AUTOGEN BEGIN: <name>` ~ `// AUTOGEN END: <name>` 사이만 교체.
 * 마커가 없으면 에러 (안전 — 코드 위치 명확해야 적용).
 *
 * @param {string} filePath
 * @param {string} markerName
 * @param {string} newContent — begin/end 사이에 들어갈 텍스트. 자동으로 양 끝 newline 정렬.
 * @returns {boolean} — 변경 여부 (이미 동일하면 false)
 */
export function replaceMarkedSection(filePath, markerName, newContent) {
  const beginPat = new RegExp(`(// AUTOGEN BEGIN: ${escapeRegExp(markerName)}[^\\n]*\\n)`)
  const endPat = new RegExp(`(\\n[ \\t]*// AUTOGEN END: ${escapeRegExp(markerName)}[^\\n]*)`)

  const src = readFileSync(filePath, 'utf8')
  const beginMatch = src.match(beginPat)
  const endMatch = src.match(endPat)

  if (!beginMatch || !endMatch) {
    throw new Error(
      `[replaceMarkedSection] marker '${markerName}' not found in ${filePath}\n` +
        `  insert:\n` +
        `    // AUTOGEN BEGIN: ${markerName}\n` +
        `    ...\n` +
        `    // AUTOGEN END: ${markerName}`,
    )
  }

  const beginIdx = beginMatch.index + beginMatch[0].length
  const endIdx = endMatch.index

  const before = src.slice(0, beginIdx)
  const after = src.slice(endIdx)

  // 정규화: newContent 끝의 trailing newline 제거 (after 가 \n 시작)
  const trimmed = newContent.replace(/\n+$/, '')
  const updated = before + trimmed + after

  if (updated === src) return false
  writeFileSync(filePath, updated, 'utf8')
  return true
}

/**
 * @param {string} s
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 파일 내용 읽기 (UTF-8).
 * @param {string} filePath
 */
export function readUtf8(filePath) {
  return readFileSync(filePath, 'utf8')
}

/**
 * 파일 쓰기 — 기존과 동일하면 skip (mtime 보존, 워치 노이즈 방지).
 * @param {string} filePath
 * @param {string} content
 * @returns {boolean} — 실제 쓴 경우 true
 */
export function writeIfChanged(filePath, content) {
  let prev = ''
  try {
    prev = readFileSync(filePath, 'utf8')
  } catch {
    // 파일 없음 — 새로 씀
  }
  if (prev === content) return false
  writeFileSync(filePath, content, 'utf8')
  return true
}

/**
 * Tailwind 클래스 스케일 — 액션 칩 ↑↓ 동작에 사용.
 * 사용자가 코드/Tailwind 를 모르므로 한국어 라벨로 노출, 내부적으로 클래스 교체.
 *
 * pseudoState (hover/focus/active/disabled) 를 받으면 해당 prefix 가 붙은
 * 클래스만 detect/apply 한다. default 면 prefix 없이 그대로.
 */

import { buildPrefixedPattern, PSEUDO_PREFIX, type PseudoState, withPseudoPrefix } from './pseudoState';

export type ScaleCategory = 'spacing' | 'shape' | 'typography';

export interface ClassNameScale {
  id: string;
  label: string;
  category: ScaleCategory;
  /** 스케일 항목들. 첫 항목 = 가장 작은/약한, 마지막 = 가장 큰/강한 */
  values: string[];
  /** 클래스 매칭 정규식 (escalate 시 *기존 일치 항목 제거* 에 사용) */
  pattern: RegExp;
  /** ↑/↓ 표기 (시각적 hint) */
  unitLabel?: string;
}

export const SCALE_CATEGORIES: Array<{ id: ScaleCategory; label: string }> = [
  { id: 'spacing', label: '여백·간격' },
  { id: 'shape', label: '모양' },
  { id: 'typography', label: '글자' },
];

export const SCALES: ClassNameScale[] = [
  {
    id: 'padding',
    label: '여백 (안쪽)',
    category: 'spacing',
    values: ['p-0', 'p-0.5', 'p-1', 'p-1.5', 'p-2', 'p-2.5', 'p-3', 'p-3.5', 'p-4', 'p-5', 'p-6', 'p-7', 'p-8', 'p-9', 'p-10', 'p-12', 'p-14', 'p-16', 'p-20', 'p-24'],
    pattern: /\bp-(?:0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9|10|12|14|16|20|24)\b/g,
  },
  {
    id: 'margin',
    label: '여백 (바깥쪽)',
    category: 'spacing',
    values: ['m-0', 'm-0.5', 'm-1', 'm-1.5', 'm-2', 'm-2.5', 'm-3', 'm-3.5', 'm-4', 'm-5', 'm-6', 'm-7', 'm-8', 'm-9', 'm-10', 'm-12', 'm-14', 'm-16', 'm-20', 'm-24'],
    pattern: /\bm-(?:0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|7|8|9|10|12|14|16|20|24)\b/g,
  },
  {
    id: 'gap',
    label: '항목 간격',
    category: 'spacing',
    values: ['gap-0', 'gap-0.5', 'gap-1', 'gap-1.5', 'gap-2', 'gap-3', 'gap-4', 'gap-5', 'gap-6', 'gap-8', 'gap-10', 'gap-12'],
    pattern: /\bgap-(?:0|0\.5|1|1\.5|2|3|4|5|6|8|10|12)\b/g,
  },
  {
    id: 'rounded',
    label: '모서리 둥글기',
    category: 'shape',
    values: ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full'],
    pattern: /\brounded(?:-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?\b/g,
  },
  {
    id: 'border',
    label: '보더 굵기',
    category: 'shape',
    values: ['border-0', 'border', 'border-2', 'border-4', 'border-8'],
    pattern: /\bborder(?:-0|-2|-4|-8)?\b/g,
  },
  {
    id: 'shadow',
    label: '그림자',
    category: 'shape',
    values: ['shadow-none', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl'],
    pattern: /\bshadow(?:-none|-sm|-md|-lg|-xl|-2xl)?\b/g,
  },
  {
    id: 'fontSize',
    label: '글자 크기',
    category: 'typography',
    values: ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl'],
    pattern: /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b/g,
  },
  {
    id: 'fontWeight',
    label: '글자 굵기',
    category: 'typography',
    values: ['font-thin', 'font-extralight', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold', 'font-black'],
    pattern: /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
  },
];

interface ScaleState {
  index: number;
  current: string | null;
}

export const detectInScale = (
  className: string,
  scale: ClassNameScale,
  pseudoState: PseudoState = 'default',
): ScaleState => {
  const pattern = buildPrefixedPattern(scale.pattern, pseudoState);
  const match = className.match(pattern);
  if (!match || match.length === 0) return { index: -1, current: null };
  // 마지막 매칭을 기준으로 (여러 개 있으면 마지막 것이 적용된 값)
  const last = match[match.length - 1];
  // prefix 떼고 base value 매칭 (예: "hover:p-4" → "p-4")
  const prefix = PSEUDO_PREFIX[pseudoState];
  const baseValue = prefix && last.startsWith(prefix) ? last.slice(prefix.length) : last;
  const idx = scale.values.indexOf(baseValue);
  return { index: idx, current: last };
};

export const applyScaleStep = (
  className: string,
  scale: ClassNameScale,
  delta: number,
  pseudoState: PseudoState = 'default',
): string => {
  const state = detectInScale(className, scale, pseudoState);
  let nextIdx: number;
  if (state.index === -1) {
    // 미적용 상태에서 ↑ 누르면 첫 항목, ↓ 누르면 마지막 항목 (대칭)
    nextIdx = delta > 0 ? 0 : scale.values.length - 1;
  } else {
    nextIdx = Math.max(0, Math.min(scale.values.length - 1, state.index + delta));
  }
  // 기존 동일 패턴 (prefix 포함) 클래스 제거 후 신규 추가
  const pattern = buildPrefixedPattern(scale.pattern, pseudoState);
  const cleaned = className.replace(pattern, '').replace(/\s+/g, ' ').trim();
  const baseValue = scale.values[nextIdx];
  const next = withPseudoPrefix(baseValue, pseudoState);
  return cleaned ? `${cleaned} ${next}` : next;
};


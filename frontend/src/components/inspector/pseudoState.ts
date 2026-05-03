/**
 * Tailwind variant prefix 매핑.
 * 인스펙터의 상태 토글이 활성된 동안, 액션 칩 / 토큰 / className textarea 가
 * 그 prefix 가 붙은 클래스만 편집한다.
 *
 * 예: pseudoState='hover' + 안쪽 여백 ↑ → "hover:p-5" 추가/교체.
 */

export type PseudoState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';

export const PSEUDO_STATES: Array<{ id: PseudoState; label: string }> = [
  { id: 'default', label: '기본' },
  { id: 'hover', label: '마우스 위' },
  { id: 'focus', label: '포커스' },
  { id: 'active', label: '눌림' },
  { id: 'disabled', label: '비활성' },
];

export const PSEUDO_PREFIX: Record<PseudoState, string> = {
  default: '',
  hover: 'hover:',
  focus: 'focus:',
  active: 'active:',
  disabled: 'disabled:',
};

/** RegExp source 에 prefix 를 삽입한 새 RegExp 생성. */
export const buildPrefixedPattern = (basePattern: RegExp, state: PseudoState): RegExp => {
  const prefix = PSEUDO_PREFIX[state];
  if (!prefix) return basePattern;
  // basePattern 의 source 가 '\b...' 로 시작 — 그 앞 \b 다음에 prefix 삽입.
  // 예: '\bp-(?:0|...)\b' → '\bhover:p-(?:0|...)\b'
  const escapedPrefix = prefix.replace(/:/g, '\\:');
  const newSource = basePattern.source.replace(/^\\b/, `\\b${escapedPrefix}`);
  return new RegExp(newSource, basePattern.flags);
};

/** className 에 prefix 가 붙은 형태로 toString. default 면 그대로. */
export const withPseudoPrefix = (cls: string, state: PseudoState): string => {
  const prefix = PSEUDO_PREFIX[state];
  return prefix ? `${prefix}${cls}` : cls;
};

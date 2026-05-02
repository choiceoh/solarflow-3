export type TokenCategory = 'brand' | 'bg' | 'ink' | 'line' | 'state' | 'radius';
export type TokenType = 'color' | 'rem';

export interface DesignToken {
  key: string;
  label: string;
  category: TokenCategory;
  type: TokenType;
  defaultValue: string;
  /** rem 타입에서만 사용 */
  min?: number;
  max?: number;
  step?: number;
}

export const DESIGN_TOKENS: DesignToken[] = [
  // 브랜드
  { key: '--sf-solar', label: '브랜드 메인', category: 'brand', type: 'color', defaultValue: '#f5b800' },
  { key: '--sf-solar-2', label: '브랜드 강조', category: 'brand', type: 'color', defaultValue: '#f08a1c' },
  { key: '--sf-solar-3', label: '브랜드 어두운', category: 'brand', type: 'color', defaultValue: '#b34800' },
  // 배경
  { key: '--sf-bg', label: '페이지 배경', category: 'bg', type: 'color', defaultValue: '#fbfaf7' },
  { key: '--sf-bg-2', label: '배경 보조', category: 'bg', type: 'color', defaultValue: '#f4f1ea' },
  { key: '--sf-surface', label: '카드 표면', category: 'bg', type: 'color', defaultValue: '#ffffff' },
  // 텍스트
  { key: '--sf-ink', label: '본문 텍스트', category: 'ink', type: 'color', defaultValue: '#14110c' },
  { key: '--sf-ink-2', label: '제목 텍스트', category: 'ink', type: 'color', defaultValue: '#2e2924' },
  { key: '--sf-ink-3', label: '보조 텍스트', category: 'ink', type: 'color', defaultValue: '#5a544c' },
  { key: '--sf-ink-4', label: '약한 텍스트', category: 'ink', type: 'color', defaultValue: '#8a8278' },
  // 라인
  { key: '--sf-line', label: '연한 보더', category: 'line', type: 'color', defaultValue: '#ebe7df' },
  { key: '--sf-line-2', label: '중간 보더', category: 'line', type: 'color', defaultValue: '#d8d2c7' },
  // 상태
  { key: '--sf-pos', label: '양수/성공', category: 'state', type: 'color', defaultValue: '#2c7a3e' },
  { key: '--sf-neg', label: '음수/오류', category: 'state', type: 'color', defaultValue: '#b8331f' },
  { key: '--sf-warn', label: '경고', category: 'state', type: 'color', defaultValue: '#a86518' },
  { key: '--sf-info', label: '정보', category: 'state', type: 'color', defaultValue: '#1f5f87' },
  // 모서리
  { key: '--radius', label: '기본 모서리', category: 'radius', type: 'rem', defaultValue: '0.625rem', min: 0, max: 2, step: 0.05 },
];

export const CATEGORY_LABEL: Record<TokenCategory, string> = {
  brand: '브랜드',
  bg: '배경',
  ink: '텍스트',
  line: '보더',
  state: '상태',
  radius: '모서리',
};

export const CATEGORY_ORDER: TokenCategory[] = ['brand', 'bg', 'ink', 'line', 'state', 'radius'];

export const remToNumber = (value: string): number => {
  const m = value.match(/^([\d.]+)rem$/);
  return m ? Number.parseFloat(m[1]) : 0;
};

export const numberToRem = (n: number): string => `${n}rem`;

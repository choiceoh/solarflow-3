/**
 * HTML 태그명 → 한국어 라벨.
 * 코드 비독해 사용자에게 영문 태그명은 의미가 없어 직관 라벨로 변환.
 */

const TAG_LABEL: Record<string, string> = {
  button: '버튼',
  a: '링크',
  div: '박스',
  span: '글자 조각',
  p: '단락',
  h1: '큰 제목',
  h2: '제목',
  h3: '소제목',
  h4: '소제목',
  h5: '소제목',
  h6: '소제목',
  input: '입력 칸',
  textarea: '텍스트 영역',
  select: '드롭다운',
  table: '표',
  tr: '표 행',
  td: '표 칸',
  th: '표 머리글',
  img: '이미지',
  svg: '아이콘',
  label: '라벨',
  ul: '목록',
  ol: '번호 목록',
  li: '목록 항목',
  nav: '내비게이션',
  header: '헤더',
  footer: '푸터',
  section: '섹션',
  article: '글',
  aside: '사이드 영역',
  main: '본문',
  form: '폼',
  fieldset: '필드 묶음',
  legend: '범례',
  details: '펼침 영역',
  summary: '요약',
  iframe: '내장 프레임',
  video: '동영상',
  audio: '오디오',
  canvas: '캔버스',
  hr: '구분선',
  br: '줄바꿈',
  strong: '강조 (굵게)',
  em: '강조 (기울임)',
  code: '코드',
  pre: '서식 그대로',
  kbd: '키 입력 표시',
  blockquote: '인용',
  figure: '그림 영역',
  figcaption: '그림 설명',
};

export const tagLabel = (tag: string): string => {
  const lower = tag.toLowerCase();
  return TAG_LABEL[lower] ?? lower;
};

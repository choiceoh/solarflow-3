// 외부 양식 변환 레지스트리.
// 새 외부 양식이 추가될 때 이 파일에 entry 한 줄 + 별도 변환기 파일을 추가하면
// ImportHubPage 의 "외부 양식 변환" 탭에 자동으로 카드가 노출된다.

import type { TemplateType } from '@/types/excel';
import type { ConvertResult } from './topsolarOutbound';

export interface ExternalFormat {
  id: string;
  label: string;
  sub: string;
  // 변환 후 어느 SolarFlow 표준 양식으로 흘려보낼지
  targetType: TemplateType;
  // 변환기 — File → ParsedRow[] + 변환 단계 경고
  convert: (file: File) => Promise<ConvertResult>;
}

export const EXTERNAL_FORMATS: ExternalFormat[] = [
  {
    id: 'topsolar_group_outbound',
    label: '탑솔라 그룹 모듈 출고현황',
    sub: '탑/디원/화신 월별 누적 양식 → 출고 표준 양식으로 변환',
    targetType: 'outbound',
    convert: async (file) => {
      const { convertTopsolarOutbound } = await import('./topsolarOutbound');
      return convertTopsolarOutbound(file);
    },
  },
];

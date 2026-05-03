// 공사 현장 master 상세 — bank 패턴 복제. 2 tabs (기본 / 진척).
//
// 메타 인프라 검증:
// - tabs[] (기본 / 진척)
// - inlineEdit (notes / location 자주 갱신)
// - rendererId (site_type_badge 재사용)
// - placeholder content block (lc_usage 와 같은 패턴 — capacity 분포 위젯 향후)

import type { MetaDetailConfig } from '@/templates/types';

const constructionSiteDetailConfig: MetaDetailConfig = {
  id: 'construction_site_detail',
  source: { hookId: 'useConstructionSiteDetail' },
  header: {
    title: '공사 현장 상세',
  },
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/construction-sites/:id',
    idField: 'site_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'name', label: '발전소명', span: 2 },
        { key: 'site_type', label: '유형', rendererId: 'site_type_badge' },
        {
          key: 'is_active',
          label: '활성',
          formatter: 'enum',
          enumKey: 'BANK_ACTIVE_LABEL',
        },
      ],
    },
  ],
  tabs: [
    {
      key: 'basic',
      label: '기본 정보',
      sections: [
        {
          title: '발전소',
          cols: 4,
          fields: [
            { key: 'name', label: '발전소명', span: 2 },
            { key: 'site_type', label: '유형', rendererId: 'site_type_badge' },
            {
              key: 'is_active',
              label: '활성',
              formatter: 'enum',
              enumKey: 'BANK_ACTIVE_LABEL',
            },
            {
              key: 'location',
              label: '위치',
              span: 4,
              inlineEditable: true,
              inlineEditType: 'text',
            },
            { key: 'capacity_mw', label: '용량 (MW)', formatter: 'number', suffix: ' MW' },
          ],
        },
        {
          title: '메모',
          cols: 1,
          fields: [
            {
              key: 'notes',
              label: '메모',
              inlineEditable: true,
              inlineEditType: 'text',
              fallback: '메모 없음 — 클릭하여 추가',
            },
          ],
        },
      ],
    },
    {
      key: 'progress',
      label: '진척',
      sections: [
        {
          title: '일정',
          cols: 2,
          fields: [
            { key: 'started_at', label: '착공일', formatter: 'date' },
            { key: 'completed_at', label: '준공일', formatter: 'date' },
          ],
        },
        {
          title: '향후 위젯',
          contentBlock: { blockId: 'site_progress_placeholder' },
        },
      ],
    },
  ],
  defaultTab: 'basic',
};

export default constructionSiteDetailConfig;

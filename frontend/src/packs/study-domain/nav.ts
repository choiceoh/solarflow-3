// study-domain pack — study.topworks.ltd 신입 교육 전용 화면.
//
// ERP 메뉴와 분리된 학습 도메인. study 테넌트는 study.learning feature 하나로
// 학습 도메인/플랜을 탐색한다.
import { GraduationCap } from 'lucide-react';

import type { Pack } from '../types';

export const STUDY_DOMAIN_PACK: Pack = {
  id: 'study-domain',
  label: 'TopWorks Study',
  description: '신입사원 교육 도메인과 온보딩 학습 플랜',
  navItems: [
    {
      key: 'study-learning',
      label: '학습 플랜',
      abbr: '학습',
      path: '/study/learning',
      icon: GraduationCap,
      menu: 'study_learning',
      group: 'home',
      feature: 'study.learning',
      tenants: ['study'],
    },
  ],
};

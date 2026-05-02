import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { DESIGN_TOKENS } from './designTokens';

/**
 * tokenOverrides 를 documentElement 의 inline style 에 적용한다.
 * 빈 키는 제거 (기본값으로 복귀).
 */
export const useDesignTokens = () => {
  const tokenOverrides = useAppStore((s) => s.tokenOverrides);

  useEffect(() => {
    const root = document.documentElement;
    const allKeys = new Set(DESIGN_TOKENS.map((t) => t.key));
    for (const key of allKeys) {
      const v = tokenOverrides[key];
      if (v) root.style.setProperty(key, v);
      else root.style.removeProperty(key);
    }
  }, [tokenOverrides]);
};

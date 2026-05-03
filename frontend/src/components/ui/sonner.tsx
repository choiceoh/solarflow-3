import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

/**
 * SolarFlow 토스트 — sonner 위에 SF 토큰을 입힌 단일 진입점.
 * 사용 규칙은 harness/UI_STANDARDS.md "## 1. 에러/토스트" 섹션 참조.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={3000}
      visibleToasts={3}
      expand
      closeButton
      richColors
      style={
        {
          '--normal-bg': 'var(--sf-surface)',
          '--normal-text': 'var(--sf-ink)',
          '--normal-border': 'var(--sf-line-2)',
          '--success-bg': 'var(--sf-pos-bg)',
          '--success-text': 'var(--sf-pos)',
          '--success-border': 'var(--sf-pos)',
          '--error-bg': 'var(--sf-neg-bg)',
          '--error-text': 'var(--sf-neg)',
          '--error-border': 'var(--sf-neg)',
          '--warning-bg': 'var(--sf-warn-bg)',
          '--warning-text': 'var(--sf-warn)',
          '--warning-border': 'var(--sf-warn)',
          '--info-bg': 'var(--sf-info-bg)',
          '--info-text': 'var(--sf-info)',
          '--info-border': 'var(--sf-info)',
        } as CSSProperties
      }
      {...props}
    />
  );
}

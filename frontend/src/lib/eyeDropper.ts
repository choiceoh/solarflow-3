/**
 * Eye Dropper API — 화면 픽셀 색 추출.
 * Chromium 95+ 만 지원 (Safari/Firefox 미지원). 미지원 시 null 반환 → 호출 측 fallback.
 *
 * 사용:
 *   const hex = await pickColor();
 *   if (hex) setTokenOverride('--sf-solar', hex);
 */

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new (): { open(): Promise<EyeDropperResult> };
}

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

export const isEyeDropperSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.EyeDropper === 'function';

export const pickColor = async (): Promise<string | null> => {
  if (!isEyeDropperSupported() || !window.EyeDropper) return null;
  try {
    const ed = new window.EyeDropper();
    const result = await ed.open();
    return result.sRGBHex;
  } catch {
    // 사용자가 cancel (Esc) 또는 권한 거부
    return null;
  }
};

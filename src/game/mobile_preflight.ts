// Classifies the phone platform/display mode and builds the "install to home
// screen" preflight copy shown before entering the world on a phone. Pure,
// DOM-adjacent logic (reads navigator/window only), no mutation, so main.ts
// stays a thin caller of showMobilePreflightPrompt.

import { t } from '../ui/i18n';

function mobilePlatform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1))
    return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function mobilePreflightCopy(): { detail: string; steps: string[] } {
  const standalone = isStandaloneDisplay();
  const base = [t('mobilePreflight.baseLandscape'), t('mobilePreflight.basePerformance')];
  if (mobilePlatform() === 'ios') {
    return {
      detail: standalone
        ? t('mobilePreflight.iosStandaloneDetail')
        : t('mobilePreflight.iosInstallDetail'),
      steps: standalone
        ? base
        : [t('mobilePreflight.iosShareStep'), t('mobilePreflight.iosOpenStep'), ...base],
    };
  }
  if (mobilePlatform() === 'android') {
    return {
      detail: standalone
        ? t('mobilePreflight.androidStandaloneDetail')
        : t('mobilePreflight.androidInstallDetail'),
      steps: standalone
        ? base
        : [t('mobilePreflight.androidInstallStep'), t('mobilePreflight.androidOpenStep'), ...base],
    };
  }
  return {
    detail: standalone
      ? t('mobilePreflight.otherStandaloneDetail')
      : t('mobilePreflight.otherInstallDetail'),
    steps: base,
  };
}

export { isStandaloneDisplay, mobilePlatform, mobilePreflightCopy };

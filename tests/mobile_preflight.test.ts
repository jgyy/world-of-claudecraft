import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isStandaloneDisplay,
  mobilePlatform,
  mobilePreflightCopy,
} from '../src/game/mobile_preflight';
import { t } from '../src/ui/i18n';

function stubNavigator(overrides: Record<string, unknown>): void {
  vi.stubGlobal('navigator', {
    userAgent: '',
    platform: '',
    maxTouchPoints: 0,
    ...overrides,
  });
}

function stubMatchMedia(standalone: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: standalone }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mobilePlatform', () => {
  it('classifies an iPhone user agent as ios', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(mobilePlatform()).toBe('ios');
  });

  it('classifies an iPad user agent as ios', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPad',
      maxTouchPoints: 5,
    });
    expect(mobilePlatform()).toBe('ios');
  });

  it('classifies an iPod user agent as ios', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPod touch; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPod',
      maxTouchPoints: 5,
    });
    expect(mobilePlatform()).toBe('ios');
  });

  it('classifies a MacIntel platform with multitouch as ios (iPadOS desktop-class UA)', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(mobilePlatform()).toBe('ios');
  });

  it('does not classify a genuine MacIntel desktop (no multitouch) as ios', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(mobilePlatform()).toBe('other');
  });

  it('classifies an Android user agent as android', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    expect(mobilePlatform()).toBe('android');
  });

  it('classifies anything else as other', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
    });
    expect(mobilePlatform()).toBe('other');
  });
});

describe('isStandaloneDisplay', () => {
  it('is true when matchMedia reports the standalone display mode', () => {
    stubNavigator({});
    stubMatchMedia(true);
    expect(isStandaloneDisplay()).toBe(true);
  });

  it('is true when navigator.standalone (iOS home-screen app) is set', () => {
    stubNavigator({ standalone: true });
    stubMatchMedia(false);
    expect(isStandaloneDisplay()).toBe(true);
  });

  it('is false when neither signal reports standalone', () => {
    stubNavigator({});
    stubMatchMedia(false);
    expect(isStandaloneDisplay()).toBe(false);
  });
});

describe('mobilePreflightCopy', () => {
  const base = [t('mobilePreflight.baseLandscape'), t('mobilePreflight.basePerformance')];

  it('returns the iOS install detail and share steps when not running standalone', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    stubMatchMedia(false);
    expect(mobilePreflightCopy()).toEqual({
      detail: t('mobilePreflight.iosInstallDetail'),
      steps: [t('mobilePreflight.iosShareStep'), t('mobilePreflight.iosOpenStep'), ...base],
    });
  });

  it('returns the iOS standalone detail and just the base steps when already installed', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: true,
    });
    stubMatchMedia(false);
    expect(mobilePreflightCopy()).toEqual({
      detail: t('mobilePreflight.iosStandaloneDetail'),
      steps: base,
    });
  });

  it('returns the Android install detail and install steps when not running standalone', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    stubMatchMedia(false);
    expect(mobilePreflightCopy()).toEqual({
      detail: t('mobilePreflight.androidInstallDetail'),
      steps: [
        t('mobilePreflight.androidInstallStep'),
        t('mobilePreflight.androidOpenStep'),
        ...base,
      ],
    });
  });

  it('returns the Android standalone detail and just the base steps when already installed', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    stubMatchMedia(true);
    expect(mobilePreflightCopy()).toEqual({
      detail: t('mobilePreflight.androidStandaloneDetail'),
      steps: base,
    });
  });

  it('returns the other-platform install detail and only the base steps when not standalone', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
    });
    stubMatchMedia(false);
    expect(mobilePreflightCopy()).toEqual({
      detail: t('mobilePreflight.otherInstallDetail'),
      steps: base,
    });
  });

  it('returns the other-platform standalone detail and only the base steps when standalone', () => {
    stubNavigator({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
    });
    stubMatchMedia(true);
    expect(mobilePreflightCopy()).toEqual({
      detail: t('mobilePreflight.otherStandaloneDetail'),
      steps: base,
    });
  });
});

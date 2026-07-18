import { describe, expect, it, vi } from 'vitest'

const { registerSWMock } = vi.hoisted(() => ({
  registerSWMock: vi.fn(),
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: registerSWMock,
}));

import { registerAppServiceWorker, shouldReloadForUpdate } from './registerServiceWorker'

describe('service worker auto-reload guard', () => {
  it('allows a reload when no previous reload was recorded', () => {
    expect(shouldReloadForUpdate(null, 100_000)).toBe(true);
  });

  it('blocks an immediate repeat reload', () => {
    expect(shouldReloadForUpdate('95000', 100_000)).toBe(false);
  });

  it('allows a later release to reload the same tab', () => {
    expect(shouldReloadForUpdate('85000', 100_000)).toBe(true);
  });

  it('recovers from a malformed storage value', () => {
    expect(shouldReloadForUpdate('not-a-time', 100_000)).toBe(true);
  });

  it('recovers when the device clock moves backwards', () => {
    expect(shouldReloadForUpdate('105000', 100_000)).toBe(true);
  });
});

describe('service worker registration', () => {
  it('registers immediately with automatic reload and update monitoring hooks', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    registerAppServiceWorker();

    expect(registerSWMock).toHaveBeenCalledOnce();
    expect(registerSWMock).toHaveBeenCalledWith(expect.objectContaining({
      immediate: true,
      onNeedReload: expect.any(Function),
      onRegisteredSW: expect.any(Function),
      onRegisterError: expect.any(Function),
    }));

    Reflect.deleteProperty(navigator, 'serviceWorker');
  });
});

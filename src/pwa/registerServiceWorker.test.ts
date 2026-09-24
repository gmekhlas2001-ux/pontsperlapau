import { describe, expect, it, vi } from 'vitest'

const { registerSWMock, infoMock, updateMock } = vi.hoisted(() => ({
  registerSWMock: vi.fn(),
  infoMock: vi.fn(),
  updateMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('sonner', () => ({ toast: { info: infoMock, error: vi.fn() } }));

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
  it('waits for the user to accept an update and monitors future releases', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });

    registerSWMock.mockReturnValue(updateMock);
    registerAppServiceWorker();

    expect(registerSWMock).toHaveBeenCalledOnce();
    expect(registerSWMock).toHaveBeenCalledWith(expect.objectContaining({
      immediate: true,
      onNeedRefresh: expect.any(Function),
      onNeedReload: expect.any(Function),
      onRegisteredSW: expect.any(Function),
      onRegisterError: expect.any(Function),
    }));

    const options = registerSWMock.mock.calls[0][0];
    options.onNeedRefresh();
    expect(infoMock).toHaveBeenCalledOnce();
    expect(updateMock).not.toHaveBeenCalled();
    infoMock.mock.calls[0][1].action.onClick();
    expect(updateMock).toHaveBeenCalledWith(true);

    Reflect.deleteProperty(navigator, 'serviceWorker');
  });
});

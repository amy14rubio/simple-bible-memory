import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ on: false }));
const launcher = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: launcher }));

import { openExternal } from './openExternal';

beforeEach(() => { vi.clearAllMocks(); native.on = false; launcher.openUrl.mockResolvedValue({ completed: true }); });

describe('opening a web page', () => {
  it('in a browser: a new tab with no access back and no referrer', () => {
    const open = vi.fn();
    expect(openExternal('https://ebible.org/study/?w1=bible', open as never)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://ebible.org/study/?w1=bible', '_blank', 'noopener,noreferrer');
    expect(launcher.openUrl).not.toHaveBeenCalled();
  });

  it('in the Android app: asks the phone to open it in its own browser', async () => {
    native.on = true;
    const open = vi.fn();
    expect(openExternal('https://simple-bible-memory.web.app/terms', open as never)).toBe(true);
    await vi.waitFor(() => expect(launcher.openUrl).toHaveBeenCalledWith({ url: 'https://simple-bible-memory.web.app/terms' }));
    expect(open).not.toHaveBeenCalled();
  });

  it('never opens anything but https, in either place', () => {
    for (const on of [false, true]) {
      native.on = on;
      const open = vi.fn();
      for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,hi', 'file:///etc/passwd', 'not a url', '']) expect(openExternal(bad, open as never)).toBe(false);
      expect(open).not.toHaveBeenCalled();
      expect(launcher.openUrl).not.toHaveBeenCalled();
    }
  });

  it('a phone that cannot open the link does not crash the app', async () => {
    native.on = true;
    launcher.openUrl.mockRejectedValue(new Error('no browser'));
    expect(openExternal('https://example.com')).toBe(true);
    await new Promise((r) => setTimeout(r, 20)); // nothing thrown
  });
});

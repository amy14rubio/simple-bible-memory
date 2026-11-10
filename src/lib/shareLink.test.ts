import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ on: false }));
const share = vi.hoisted(() => ({ share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock('@capacitor/share', () => ({ Share: share }));

import { shareLink } from './shareLink';

const link = { title: 'Family', text: 'Family: a Bible memory deck', url: 'https://simple-bible-memory.web.app/d/abc' };
const writeText = vi.fn();

beforeEach(() => {
  native.on = false;
  share.share.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText }, share: vi.fn() });
});

describe('sharing a deck link', () => {
  it('in a phone app, opens the phone\'s Share sheet with the title, a sentence and the link', async () => {
    native.on = true;
    share.share.mockResolvedValue({});
    expect(await shareLink(link)).toBe('shared');
    expect(share.share).toHaveBeenCalledWith({ title: 'Family', text: link.text, url: link.url, dialogTitle: 'Family' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('in a phone app, closing the sheet is not an error', async () => {
    native.on = true;
    share.share.mockRejectedValue(new Error('Share canceled'));
    expect(await shareLink(link)).toBe('cancelled');
  });

  it('in a phone app, a real failure is passed on', async () => {
    native.on = true;
    share.share.mockRejectedValue(new Error('no share targets'));
    await expect(shareLink(link)).rejects.toThrow('no share targets');
  });

  it('in a web browser, copies the link and does not open the browser\'s own share menu', async () => {
    expect(await shareLink(link)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(link.url);
    expect(navigator.share).not.toHaveBeenCalled();
    expect(share.share).not.toHaveBeenCalled();
  });
});

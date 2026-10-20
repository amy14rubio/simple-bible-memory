import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ on: false }));
const fs = vi.hoisted(() => ({ writeFile: vi.fn(), rmdir: vi.fn() }));
const share = vi.hoisted(() => ({ share: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: fs, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: share }));

import { downloadTextFile } from './download';

beforeEach(() => {
  vi.clearAllMocks();
  native.on = true;
  fs.rmdir.mockResolvedValue(undefined);
  fs.writeFile.mockResolvedValue({ uri: 'file:///cache/exports/decks.json' });
  share.share.mockResolvedValue({ activityName: 'x' });
});

describe('saving a file in the Android app', () => {
  it('writes it to the temporary exports folder and opens the Share panel with it', async () => {
    const saved = await downloadTextFile('decks.json', '{"a":1}');
    expect(saved).toBe(true);
    expect(fs.writeFile).toHaveBeenCalledWith({ path: 'exports/decks.json', data: '{"a":1}', directory: 'CACHE', encoding: 'utf8', recursive: true });
    expect(share.share).toHaveBeenCalledWith({ title: 'decks.json', files: ['file:///cache/exports/decks.json'] });
  });

  it('clears earlier exports first, and carries on if there were none', async () => {
    fs.rmdir.mockRejectedValue(new Error('no such folder'));
    await expect(downloadTextFile('decks.json', '{}')).resolves.toBe(true);
    expect(fs.rmdir).toHaveBeenCalledWith({ path: 'exports', directory: 'CACHE', recursive: true });
  });

  it('closing the Share panel without choosing is not an error and claims nothing', async () => {
    share.share.mockRejectedValue(new Error('Share canceled'));
    await expect(downloadTextFile('decks.json', '{}')).resolves.toBe(false);
  });

  it('a real failure is passed on, so the person is told', async () => {
    share.share.mockRejectedValue(new Error('No app can share this'));
    await expect(downloadTextFile('decks.json', '{}')).rejects.toThrow('No app can share this');
    fs.writeFile.mockRejectedValue(new Error('disk full'));
    await expect(downloadTextFile('decks.json', '{}')).rejects.toThrow('disk full');
  });
});

describe('saving a file in a browser', () => {
  it('uses an ordinary download and never touches the phone plugins', async () => {
    native.on = false;
    const click = vi.fn();
    const link = { href: '', download: '', click, remove: vi.fn() } as unknown as HTMLAnchorElement;
    vi.stubGlobal('document', { createElement: () => link, body: { append: vi.fn() } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() });
    await expect(downloadTextFile('decks.json', '{}')).resolves.toBe(true);
    expect(link.download).toBe('decks.json');
    expect(click).toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPassageSource, PassageError } from './youversion';
import { sourceFor } from '../domain/bible/sources';

const nasb = sourceFor('NASB2020')!;
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

afterEach(() => vi.unstubAllGlobals());

describe('asking YouVersion for a passage', () => {
  it('sends the key and gives back the text', async () => {
    const fetchMock = vi.fn(async () => reply(200, { id: 'PHP.4.6-7', content: ' Be anxious for nothing. ', reference: 'Philippians 4:6-7' }));
    vi.stubGlobal('fetch', fetchMock);
    const text = await createPassageSource('k').fetchPassage(nasb, 'Philippians 4:6-7');
    expect(text).toBe('Be anxious for nothing.');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.youversion.com/v1/bibles/2692/passages/PHP.4.6-7');
    expect((init.headers as Record<string, string>)['X-YVP-App-Key']).toBe('k');
  });

  it('asks for a list of verses in pieces and joins them', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => reply(200, { content: url.endsWith('PHP.4.13') ? 'I can do all things.' : 'Be anxious for nothing.' })));
    expect(await createPassageSource('k').fetchPassage(nasb, 'Philippians 4:6-7,13')).toBe('Be anxious for nothing. I can do all things.');
  });

  it('looks up how long a chapter is, once, for a stretch across chapters', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/verses')) return reply(200, { data: Array.from({ length: 39 }, (_, i) => ({ id: String(i + 1) })) });
      return reply(200, { content: url.split('/passages/')[1] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const source = createPassageSource('k');
    expect(await source.fetchPassage(nasb, 'Romans 8:38-9:2')).toBe('ROM.8.38-39 ROM.9.1-2');
    await source.fetchPassage(nasb, 'Romans 8:30-9:1');
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/verses'))).toHaveLength(1);
  });

  it.each([
    [404, 'not-found'], [422, 'not-found'], [401, 'not-allowed'], [403, 'not-allowed'], [500, 'failed'],
  ])('a %i answer is "%s"', async (status, problem) => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(status, { message: 'no' })));
    await expect(createPassageSource('k').fetchPassage(nasb, 'John 3:16')).rejects.toMatchObject({ problem });
  });

  it('no connection is "offline"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(createPassageSource('k').fetchPassage(nasb, 'John 3:16')).rejects.toMatchObject({ problem: 'offline' });
  });

  it('waits and tries again when asked too often, then gives up', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => reply(429, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = createPassageSource('k').fetchPassage(nasb, 'John 3:16').catch((e: PassageError) => e.problem);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toBe('busy');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('is not available without a key, and says so', async () => {
    const source = createPassageSource(undefined);
    expect(source.available()).toBe(false);
    await expect(source.fetchPassage(nasb, 'John 3:16')).rejects.toMatchObject({ problem: 'not-configured' });
  });

  it('something that is not a reference is "not-found", without asking', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createPassageSource('k').fetchPassage(nasb, 'hello')).rejects.toMatchObject({ problem: 'not-found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

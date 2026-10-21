import { describe, expect, it } from 'vitest';
import { descriptionPreview } from './descriptionPreview';

describe('descriptionPreview()', () => {
  it('gives nothing for an empty or missing description', () => {
    expect(descriptionPreview(null)).toBeNull();
    expect(descriptionPreview(undefined)).toBeNull();
    expect(descriptionPreview('  \n \n')).toBeNull();
  });
  it('gives a one-line description as it is', () => {
    expect(descriptionPreview('The shepherd psalm')).toEqual({ text: 'The shepherd psalm', more: false });
  });
  it('keeps only the first line and says there is more', () => {
    expect(descriptionPreview('First line.\nSecond line.\nThird.')).toEqual({ text: 'First line.', more: true });
    expect(descriptionPreview('First line.\r\nSecond line.')).toEqual({ text: 'First line.', more: true });
  });
  it('skips blank lines at the start, and does not count trailing blank lines as more', () => {
    expect(descriptionPreview('\n\n  Start here  \n\n')).toEqual({ text: 'Start here', more: false });
  });
});

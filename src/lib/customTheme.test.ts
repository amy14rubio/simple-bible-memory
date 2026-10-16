import { describe, it, expect } from 'vitest';
import { CUSTOM_VAR_NAMES, DARK_START, LIGHT_START, customThemeVars, isCustomTheme, isDarkBackground, isHex, luminance } from './customTheme';

describe('custom theme', () => {
  it('accepts only 6-digit hex colours', () => {
    expect(isHex('#a1B2c3')).toBe(true);
    for (const bad of ['a1b2c3', '#abc', '#12345g', '#1234567', '', 'red']) expect(isHex(bad)).toBe(false);
  });

  it('recognises a saved theme, and rejects anything else', () => {
    expect(isCustomTheme(LIGHT_START)).toBe(true);
    expect(isCustomTheme({ background: '#fff', text: '#000', accent: '#f00' })).toBe(false);
    expect(isCustomTheme(null)).toBe(false);
    expect(isCustomTheme({ background: '#000000' })).toBe(false);
  });

  it('measures luminance: white is 1, black is 0', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#808080')).toBeGreaterThan(0.2);
  });

  it('treats the built-in palettes as light and dark', () => {
    expect(isDarkBackground(LIGHT_START.background)).toBe(false);
    expect(isDarkBackground(DARK_START.background)).toBe(true);
    expect(customThemeVars(DARK_START).dark).toBe(true);
  });

  it('sets the three chosen colours directly and works the rest out from them', () => {
    const { vars } = customThemeVars({ background: '#102030', text: '#e0f0ff', accent: '#ff8800' });
    expect(vars['--background']).toBe('#102030');
    expect(vars['--foreground']).toBe('#e0f0ff');
    expect(vars['--accent']).toBe('#ff8800');
    expect(vars['--primary']).toBe('#e0f0ff'); // buttons: text colour on a background-coloured label
    expect(vars['--primary-foreground']).toBe('#102030');
    expect(vars['--muted']).toContain('#e0f0ff');
    expect(vars['--muted']).toContain('#102030');
    expect(Object.keys(vars).sort()).toEqual([...CUSTOM_VAR_NAMES].sort());
  });
});

import { describe, expect, it } from 'vitest';
import { EVERYTHING_ON, isSwitchedOff, parseSwitch } from './switch';

describe('the off switch for licensed translations', () => {
  it('no document, or nonsense, means everything is on', () => {
    for (const data of [null, undefined, 'x', 3, [], {}, { off: 'NASB2020' }, { all: 'yes' }]) expect(parseSwitch(data)).toEqual(EVERYTHING_ON);
  });

  it('reads the list of codes that are off, and the "all" switch', () => {
    expect(parseSwitch({ off: ['NASB2020', 'YV93'] })).toEqual({ all: false, off: ['NASB2020', 'YV93'] });
    expect(parseSwitch({ all: true })).toEqual({ all: true, off: [] });
  });

  it('ignores anything in the list that is not a plausible code', () => {
    expect(parseSwitch({ off: ['AMP', 7, null, '', 'x'.repeat(41), 'LBLA'] })).toEqual({ all: false, off: ['AMP', 'LBLA'] });
  });

  it('turns off the translations named, and only licensed ones', () => {
    const state = { all: false, off: ['NASB2020', 'KJV'] };
    expect(isSwitchedOff('NASB2020', state)).toBe(true);
    expect(isSwitchedOff('AMP', state)).toBe(false);
    expect(isSwitchedOff('KJV', state)).toBe(false); // an open text can never be switched off
    expect(isSwitchedOff(null, state)).toBe(false);
  });

  it('"all" turns off every licensed translation, and still no open one', () => {
    const state = { all: true, off: [] };
    expect(isSwitchedOff('NASB2020', state)).toBe(true);
    expect(isSwitchedOff('YV12345', state)).toBe(true);
    expect(isSwitchedOff('WEB', state)).toBe(false);
    expect(isSwitchedOff('OWN', state)).toBe(false);
  });
});

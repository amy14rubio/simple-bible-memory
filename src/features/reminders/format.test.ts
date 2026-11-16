import { describe, expect, it } from 'vitest';
import { formatTime } from './format';

describe('the time of a reminder', () => {
  it('is written as 8:00 PM in Spanish too, not as a 24-hour clock', () => {
    expect(formatTime('es', '20:00')).toBe('8:00 PM');
    expect(formatTime('es', '09:05')).toBe('9:05 AM');
    expect(formatTime('es', '12:00')).toBe('12:00 PM'); // noon
    expect(formatTime('es', '00:30')).toBe('12:30 AM'); // just after midnight
    expect(formatTime('es', '23:59')).toBe('11:59 PM');
  });
  it('is unchanged in English', () => {
    expect(formatTime('en', '20:00').replace(/\s/g, ' ')).toBe('8:00 PM');
    expect(formatTime('en', '09:05').replace(/\s/g, ' ')).toBe('9:05 AM');
  });
});

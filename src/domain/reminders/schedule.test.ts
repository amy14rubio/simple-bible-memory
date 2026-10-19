import { describe, expect, it } from 'vitest';
import { MAX_REMINDERS, PLAN_PER_REMINDER_MAX, PLAN_TOTAL, newReminder, planNotifications, type Reminder } from './schedule';

const at = (iso: string) => new Date(iso); // local time, e.g. '2026-03-02T10:00:00'
const base = (over: Partial<Reminder>): Reminder => ({ ...newReminder(at('2026-03-02T09:00:00'), 'a'), ...over });
const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('planNotifications', () => {
  it('daily: tonight if it is still ahead, otherwise tomorrow, every day after', () => {
    const r = base({ repeat: 'daily', time: '20:00' });
    expect(planNotifications([r], at('2026-03-02T10:00:00'), 'hi').slice(0, 3).map((n) => stamp(n.at))).toEqual(['2026-03-02 20:00', '2026-03-03 20:00', '2026-03-04 20:00']);
    expect(planNotifications([r], at('2026-03-02T21:00:00'), 'hi')[0]!.at).toEqual(at('2026-03-03T20:00:00'));
  });

  it('every 2 days keeps its rhythm from the day it was made, however often we re-plan', () => {
    const r = base({ repeat: 'every2days', time: '08:00', startDay: '2026-03-02' });
    expect(planNotifications([r], at('2026-03-02T07:00:00'), 'hi').slice(0, 3).map((n) => stamp(n.at))).toEqual(['2026-03-02 08:00', '2026-03-04 08:00', '2026-03-06 08:00']);
    expect(planNotifications([r], at('2026-03-03T07:00:00'), 'hi').slice(0, 2).map((n) => stamp(n.at))).toEqual(['2026-03-04 08:00', '2026-03-06 08:00']);
  });

  it('weekly: only on the chosen weekday', () => {
    const r = base({ repeat: 'weekly', weekday: 5, time: '18:30' }); // Friday
    const days = planNotifications([r], at('2026-03-02T10:00:00'), 'hi').slice(0, 3).map((n) => stamp(n.at));
    expect(days).toEqual(['2026-03-06 18:30', '2026-03-13 18:30', '2026-03-20 18:30']);
  });

  it('uses the app message when the reminder has none, and the person\'s own when it has', () => {
    const plain = base({ message: '' });
    const own = base({ id: 'b', message: '  Read Psalm 23  ' });
    const plan = planNotifications([plain, own], at('2026-03-02T10:00:00'), 'App message');
    expect(plan.find((n) => n.reminderId === 'a')!.body).toBe('App message');
    expect(plan.find((n) => n.reminderId === 'b')!.body).toBe('Read Psalm 23');
  });

  it('merges two reminders soonest first, each planned a long way ahead', () => {
    const morning = base({ id: 'm', time: '08:00' });
    const evening = base({ id: 'e', time: '20:00' });
    const plan = planNotifications([morning, evening], at('2026-03-02T07:00:00'), 'hi');
    expect(plan.slice(0, 3).map((n) => n.reminderId)).toEqual(['m', 'e', 'm']);
    expect(plan.length).toBe(PLAN_PER_REMINDER_MAX * 2);
    expect(plan.every((n, i) => i === 0 || plan[i - 1]!.at <= n.at)).toBe(true);
  });

  it('allows ten reminders, and shares one budget between them so the phone never holds too many alarms', () => {
    expect(MAX_REMINDERS).toBe(10);
    const ten = Array.from({ length: MAX_REMINDERS }, (_, i) => base({ id: `r${i}`, time: `${String(8 + i).padStart(2, '0')}:00` }));
    const plan = planNotifications(ten, at('2026-03-02T07:00:00'), 'hi');
    expect(plan.length).toBe(PLAN_TOTAL);
    expect(plan.length).toBeLessThan(500); // Android's limit is about 500 pending alarms
    for (const r of ten) expect(plan.filter((n) => n.reminderId === r.id).length).toBe(PLAN_TOTAL / MAX_REMINDERS);
  });

  it('a single reminder is planned about a hundred firings ahead', () => {
    expect(planNotifications([base({})], at('2026-03-02T07:00:00'), 'hi').length).toBe(PLAN_PER_REMINDER_MAX);
  });
});

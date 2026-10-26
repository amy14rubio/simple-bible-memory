import { Capacitor } from '@capacitor/core';

/**
 * Phone notifications, behind a small interface so the rest of the app never touches a plugin.
 * - In the Android app: real notifications, scheduled on the phone itself (no server).
 * - In a browser: not available (a website cannot schedule notifications reliably), so `available` is false.
 * - In browser tests: a stand-in that "schedules" into localStorage so a test can look at what would have fired.
 */
export type NotificationPermission = 'granted' | 'denied' | 'prompt';

export interface ScheduledNotification {
  title: string;
  body: string;
  at: Date;
}

export interface Notifier {
  available: boolean;
  /** How many upcoming notifications the phone can hold at once (iOS keeps only 64; Android roughly 500). */
  maxPending: number;
  permission(): Promise<NotificationPermission>;
  /** Shows the phone's "Allow notifications?" question (once; after a refusal the person must use the phone's settings). */
  requestPermission(): Promise<NotificationPermission>;
  /** Throws away everything scheduled before and schedules exactly these. */
  replaceAll(items: ScheduledNotification[]): Promise<void>;
}

const CHANNEL = 'study-reminders';

/** iOS keeps only the soonest 64 pending local notifications and drops the rest, so ask for a bit fewer than that. */
const IOS_MAX_PENDING = 60;

function nativeNotifier(): Notifier {
  // Wrapped in an object on purpose: a Capacitor plugin must never be returned straight from a promise (JavaScript would try to call its .then()).
  const plugin = () => import('@capacitor/local-notifications').then((m) => ({ ln: m.LocalNotifications }));
  const toState = (s: string): NotificationPermission => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt');
  const ios = Capacitor.getPlatform() === 'ios';
  return {
    available: true,
    maxPending: ios ? IOS_MAX_PENDING : 400,
    async permission() {
      return toState((await (await plugin()).ln.checkPermissions()).display);
    },
    async requestPermission() {
      return toState((await (await plugin()).ln.requestPermissions()).display);
    },
    async replaceAll(items) {
      const { ln } = await plugin();
      const pending = await ln.getPending();
      if (pending.notifications.length) await ln.cancel({ notifications: pending.notifications });
      if (!items.length) return;
      // Android 8+ groups notifications into channels the person can tune in the phone's settings.
      if (!ios) await ln.createChannel({ id: CHANNEL, name: 'Study reminders', importance: 4 }); // (channels are an Android idea; iOS has none)
      await ln.schedule({
        notifications: items.map((n, i) => ({
          id: i + 1,
          title: n.title,
          body: n.body,
          channelId: CHANNEL,
          // Not "exact": a study nudge can be a few minutes late, and exact timing would send the person to an extra
          // "Alarms & reminders" settings screen to approve it.
          isExactNotification: false,
          schedule: { at: n.at, allowWhileIdle: true },
        })),
      });
    },
  };
}

export const FAKE_SCHEDULE_KEY = 'sbm-fake-scheduled';
export const FAKE_PERMISSION_KEY = 'sbm-fake-permission';
export const FAKE_UNAVAILABLE_KEY = 'sbm-notifications-unavailable';

function fakeNotifier(): Notifier {
  const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
  return {
    available: read(FAKE_UNAVAILABLE_KEY) === null,
    maxPending: 400,
    async permission() { return (read(FAKE_PERMISSION_KEY) as NotificationPermission | null) ?? 'prompt'; },
    async requestPermission() {
      const answer = (read(FAKE_PERMISSION_KEY) as NotificationPermission | null) === 'denied' ? 'denied' : 'granted';
      try { localStorage.setItem(FAKE_PERMISSION_KEY, answer); } catch { /* ignore */ }
      return answer;
    },
    async replaceAll(items) {
      try { localStorage.setItem(FAKE_SCHEDULE_KEY, JSON.stringify(items.map((n) => ({ title: n.title, body: n.body, at: n.at.toISOString() })))); } catch { /* ignore */ }
    },
  };
}

const unavailable: Notifier = {
  available: false,
  maxPending: 0,
  permission: async () => 'denied',
  requestPermission: async () => 'denied',
  replaceAll: async () => {},
};

let notifier: Notifier | undefined;
export function getNotifier(): Notifier {
  notifier ??= import.meta.env.VITE_FAKE_NOTIFICATIONS === 'true' ? fakeNotifier() : Capacitor.isNativePlatform() ? nativeNotifier() : unavailable;
  return notifier;
}

import { useEffect, useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { Button, FormRow, GrowingTextarea, rowInput } from '../../components/ui';
import { MESSAGE_MAX, REPEATS, dayKey, type Reminder, type Repeat } from '../../domain/reminders/schedule';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { TimeField } from './TimeField';
import { weekdayName } from './format';

/** How long after the last key press a typed message is saved (the time, repeat and day are saved at once). */
export const MESSAGE_SAVE_MS = 600;

/**
 * Where one reminder is set up: how often, at what time, and what it says.
 * A reminder that already exists is saved as it is changed (the time, repeat and day at once; the message a moment after typing stops, and when the
 * sheet is closed), so there is no Save button. A new one is only added when "Add" is pressed: until then it does not exist.
 */
export function ReminderDrawer({ reminder, isNew, onChange, onAdd, onDelete, onClose }: {
  /** null = closed */
  reminder: Reminder | null;
  isNew: boolean;
  /** An existing reminder was changed: save it now. */
  onChange: (r: Reminder) => void;
  /** The new reminder was confirmed with "Add". */
  onAdd: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const open = reminder !== null;
  const [draft, setDraft] = useState<Reminder | null>(reminder);
  const latest = useRef<Reminder | null>(reminder); // the newest values, for a save that was put off a moment
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const save = () => {
    clearTimeout(pending.current);
    pending.current = undefined;
    const r = latest.current;
    if (r && !isNew) onChangeRef.current({ ...r, message: r.message.trim() });
  };
  // Closing (the X, Escape, swiping down, Back) first saves a message that was still waiting its moment.
  const close = () => { if (pending.current !== undefined) save(); onClose(); };
  const closeRef = useRef(close);
  closeRef.current = close;
  usePopupHistory(open, () => closeRef.current());

  useEffect(() => { if (reminder) { setDraft(reminder); latest.current = reminder; } }, [reminder]);
  useEffect(() => () => { if (pending.current !== undefined) save(); }, []); // leaving the screen with a message still waiting

  const r = draft ?? reminder;
  /** `typed`: a message being typed is saved when typing pauses; anything else is saved straight away. */
  const set = (patch: Partial<Reminder>, typed = false) => {
    const next = { ...(latest.current ?? draft ?? reminder!), ...patch };
    latest.current = next;
    setDraft(next);
    if (isNew) return;
    if (typed) { clearTimeout(pending.current); pending.current = setTimeout(save, MESSAGE_SAVE_MS); } else save();
  };
  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) close(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]" closeLabel={t(isNew ? 'common.cancel' : 'common.close')}>
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t(isNew ? 'reminders.new' : 'reminders.edit')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('reminders.help')}</DrawerDescription>
        </DrawerHeader>
        {r && (
          <div className="max-h-[70dvh] space-y-4 overflow-y-auto px-6 pb-2">
            <div>
              <FormRow label={t('reminders.repeat')}>
                {(id) => (
                  <select id={id} value={r.repeat} onChange={(e) => set({ repeat: e.target.value as Repeat, startDay: dayKey(new Date()) })} className={`${rowInput} border-0`}>
                    {REPEATS.map((v) => <option key={v} value={v}>{t(`reminders.repeat.${v}` as MessageKey)}</option>)}
                  </select>
                )}
              </FormRow>
              {r.repeat === 'weekly' && (
                <FormRow label={t('reminders.day')}>
                  {(id) => (
                    <select id={id} value={r.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className={`${rowInput} border-0`}>
                      {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{weekdayName(language, d)}</option>)}
                    </select>
                  )}
                </FormRow>
              )}
              <FormRow label={t('reminders.time')}>{(id) => <TimeField id={id} label={t('reminders.time')} value={r.time} onChange={(v) => set({ time: v })} />}</FormRow>
              <div className="space-y-1 pt-3">
                <label htmlFor="reminder-message" className="text-[0.9375rem] font-medium">{t('reminders.message')}</label>
                <GrowingTextarea id="reminder-message" value={r.message} maxLength={MESSAGE_MAX} placeholder={t('reminders.defaultMessage')} onChange={(e) => set({ message: e.target.value }, true)} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {isNew && <Button onClick={() => draft && onAdd({ ...draft, message: draft.message.trim() })}>{t('reminders.addButton')}</Button>}
              {!isNew && <Button variant="danger" onClick={() => onDelete(r.id)}>{t('reminders.delete')}</Button>}
            </div>
          </div>
        )}
        <div className="h-6" />
      </DrawerContent>
    </Drawer>
  );
}

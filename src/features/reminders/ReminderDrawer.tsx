import { useEffect, useState } from 'react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { Button, FormRow, GrowingTextarea, HiddenClose, rowInput } from '../../components/ui';
import { MESSAGE_MAX, REPEATS, dayKey, type Reminder, type Repeat } from '../../domain/reminders/schedule';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { TimeField } from './TimeField';
import { weekdayName } from './format';

/** Where one reminder is set up: how often, at what time, and what it says. */
export function ReminderDrawer({ reminder, isNew, onSave, onDelete, onClose }: {
  /** null = closed */
  reminder: Reminder | null;
  isNew: boolean;
  onSave: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const open = reminder !== null;
  const [draft, setDraft] = useState<Reminder | null>(reminder);
  usePopupHistory(open, onClose);

  useEffect(() => { if (reminder) setDraft(reminder); }, [reminder]);

  const r = draft ?? reminder;
  const set = (patch: Partial<Reminder>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[var(--safe-bottom)]">
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
                <GrowingTextarea id="reminder-message" value={r.message} maxLength={MESSAGE_MAX} placeholder={t('reminders.defaultMessage')} onChange={(e) => set({ message: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => draft && onSave({ ...draft, message: draft.message.trim() })}>{t('reminders.save')}</Button>
              {!isNew && <Button variant="danger" onClick={() => onDelete(r.id)}>{t('reminders.delete')}</Button>}
            </div>
          </div>
        )}
        <div className="h-6" />
        <DrawerClose render={<HiddenClose label={t('common.cancel')} />} />
      </DrawerContent>
    </Drawer>
  );
}

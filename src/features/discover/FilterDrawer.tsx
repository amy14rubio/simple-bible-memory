import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { Button, FormRow, HiddenClose } from '../../components/ui';
import { OptionPicker } from '../../components/OptionPicker';
import { OPEN_TRANSLATIONS, OWN_WORDS, SHARING_LANGUAGES } from '../../domain/sharing/translations';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';
import { NO_FILTERS, type DiscoverFilters } from './types';
import { LANGUAGE_NAME } from './names';

/** Narrow Discover by language and translation. Choices apply straight away. */
export function FilterDrawer({ open, onClose, filters, onChange }: { open: boolean; onClose: () => void; filters: DiscoverFilters; onChange: (f: DiscoverFilters) => void }) {
  const { t } = useI18n();
  usePopupHistory(open, onClose);
  const none = filters.language === 'all' && filters.translation === 'all';

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[calc(0.75rem+var(--safe-bottom))]">
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t('discover.filter')}</DrawerTitle>
          <DrawerDescription className="sr-only">{t('discover.filterHelp')}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 px-6 pb-2">
          <div>
            <FormRow label={t('settings.language')}>
              {(id) => (
                <OptionPicker
                  id={id}
                  variant="field"
                  label={t('settings.language')}
                  value={filters.language}
                  options={[{ value: 'all', label: t('discover.all') }, ...SHARING_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAME[l] }))]}
                  onChange={(v) => onChange({ ...filters, language: v as DiscoverFilters['language'] })}
                  popupTitle={t('settings.language')}
                  searchLabel={t('translation.search')}
                  noMatch={(query) => t('translation.noMatch', { query })}
                />
              )}
            </FormRow>
            <FormRow label={t('translation.label')}>
              {(id) => (
                <OptionPicker
                  id={id}
                  variant="field"
                  label={t('translation.label')}
                  value={filters.translation}
                  options={[
                    { value: 'all', label: t('discover.all') },
                    ...OPEN_TRANSLATIONS.map((o) => ({ value: o.code, label: `${o.name} (${o.code})` })),
                    { value: OWN_WORDS, label: t('translation.own') },
                  ]}
                  onChange={(v) => onChange({ ...filters, translation: v })}
                  popupTitle={t('translation.select')}
                  searchLabel={t('translation.search')}
                  noMatch={(query) => t('translation.noMatch', { query })}
                />
              )}
            </FormRow>
          </div>
          <Button variant="secondary" className="w-full" disabled={none} onClick={() => onChange({ ...NO_FILTERS, query: filters.query })}>{t('discover.clearFilters')}</Button>
        </div>
        <div className="h-6" />
        <DrawerClose render={<HiddenClose label={t('common.close')} />} />
      </DrawerContent>
    </Drawer>
  );
}

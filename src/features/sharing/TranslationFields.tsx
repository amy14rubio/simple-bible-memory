import { FormRow } from '../../components/ui';
import { OptionPicker } from '../../components/OptionPicker';
import { OPEN_TRANSLATIONS, OWN_WORDS, SHARING_LANGUAGES, translationLanguage, type SharingLanguage } from '../../domain/sharing/translations';
import { useI18n } from '../../i18n/I18nProvider';

export interface TranslationValue {
  translation: string | null;
  language: string | null;
}

const NONE = '__none';
const OTHER = 'OTHER';
const LANGUAGE_NAMES: Record<SharingLanguage, string> = { en: 'English', es: 'Español' };

/** What the picker shows for whatever code is stored: an open translation, own words, or "another translation". */
const pickerValue = (code: string | null) => (!code ? NONE : code === OWN_WORDS || OPEN_TRANSLATIONS.some((t) => t.code === code) ? code : OTHER);

/**
 * The deck's Bible translation, and, for "my own words", the language. Only open translations (and your own words) can be
 * published; any other translation can still be chosen here, for your own records.
 */
export function TranslationFields({ value, onChange }: { value: TranslationValue; onChange: (v: TranslationValue) => void }) {
  const { t } = useI18n();
  const shown = pickerValue(value.translation);
  const options = [
    { value: NONE, label: t('translation.none') },
    ...OPEN_TRANSLATIONS.map((o) => ({ value: o.code, label: `${o.name} (${o.code})` })),
    { value: OWN_WORDS, label: t('translation.own') },
    { value: OTHER, label: t('translation.other') },
  ];

  const choose = (v: string) => {
    if (v === NONE) onChange({ translation: null, language: value.language });
    else if (v === OTHER) onChange({ translation: OTHER, language: value.language });
    else onChange({ translation: v, language: translationLanguage(v) ?? value.language });
  };

  return (
    <>
      <FormRow label={t('translation.label')}>
        {(id) => (
          <OptionPicker
            id={id}
            variant="field"
            label={t('translation.label')}
            value={shown}
            options={options}
            onChange={choose}
            popupTitle={t('translation.select')}
            searchLabel={t('translation.search')}
            noMatch={(query) => t('translation.noMatch', { query })}
          />
        )}
      </FormRow>
      {value.translation === OWN_WORDS && (
        <FormRow label={t('settings.language')}>
          {(id) => (
            <OptionPicker
              id={id}
              variant="field"
              label={t('settings.language')}
              value={SHARING_LANGUAGES.find((l) => l === value.language) ?? ''}
              options={SHARING_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
              onChange={(l) => onChange({ translation: value.translation, language: l })}
              popupTitle={t('settings.language')}
              searchLabel={t('translation.search')}
              noMatch={(query) => t('translation.noMatch', { query })}
            />
          )}
        </FormRow>
      )}
    </>
  );
}

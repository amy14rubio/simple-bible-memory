import { FormRow } from '../../components/ui';
import { OptionPicker } from '../../components/OptionPicker';
import { sourceFor } from '../../domain/bible/sources';
import { TranslationPicker, type PickerExtra } from '../bible/TranslationPicker';
import { OPEN_TRANSLATIONS, OWN_WORDS, SHARING_LANGUAGES, translationLanguage, type SharingLanguage } from '../../domain/sharing/translations';
import { useI18n } from '../../i18n/I18nProvider';

export interface TranslationValue {
  translation: string | null;
  language: string | null;
}

const OTHER = 'OTHER';
const LANGUAGE_NAMES: Record<SharingLanguage, string> = { en: 'English', es: 'Español' };
/** Open texts the platform does not offer (the rest of the open ones are in the picker's list with every other translation). */
const OPEN_EXTRAS = ['KJV', 'YLT', 'DARBY'];

/**
 * The deck's Bible translation, and, for "my own words", the language. Any translation can be chosen: an open one is published
 * with its text, a licensed one as references only (whoever imports the deck gets the text from its publisher). "Another
 * translation" is only for your own records and can't be published.
 */
export function TranslationFields({ value, onChange }: { value: TranslationValue; onChange: (v: TranslationValue) => void }) {
  const { t, language: appLanguage } = useI18n();
  const extras: PickerExtra[] = [
    { code: OWN_WORDS, label: t('translation.own') },
    { code: OTHER, label: t('translation.other') },
    ...OPEN_TRANSLATIONS.filter((o) => OPEN_EXTRAS.includes(o.code)).map((o) => ({ code: o.code, label: o.name, note: o.code, language: o.language })),
  ];

  const choose = (code: string) => {
    if (code === OWN_WORDS || code === OTHER) onChange({ translation: code, language: value.language });
    else onChange({ translation: code, language: translationLanguage(code) ?? sourceFor(code)?.language ?? value.language });
  };

  return (
    <>
      <FormRow label={t('translation.label')}>
        {(id) => <TranslationPicker id={id} value={value.translation ?? ''} onChange={choose} initialLanguage={SHARING_LANGUAGES.find((l) => l === value.language) ?? appLanguage} extras={extras} />}
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

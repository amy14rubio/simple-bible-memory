import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { OptionPicker } from './OptionPicker';

/** The deck name in a top bar or a form row, opening the "Select a deck" popup (with search and a + for a new deck). */
export function DeckPicker({ label, value, options, onChange, variant, id }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
  variant?: 'title' | 'field';
  id?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <OptionPicker
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      variant={variant}
      id={id}
      popupTitle={t('picker.title')}
      searchLabel={t('decks.search')}
      noMatch={(query) => t('decks.noMatch', { query })}
      onCreate={{ label: t('common.newDeck'), run: () => navigate('/decks/new', { replace: true }) }}
    />
  );
}

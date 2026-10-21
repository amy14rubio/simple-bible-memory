import { useEffect, useState } from 'react';
import { AppBar, BackButton, CheckList, Page } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { useI18n } from '../../i18n/I18nProvider';
import { chooseVoice, getVoice, pickVoice, speechCode, type VoiceInfo } from '../../platform/voice';

const SAMPLE = { en: 'Here is the verse.', es: 'Aquí está el versículo.' };

/** One voice per language for Speak mode: pick it, hear a sample, and it stays the same from then on. */
function VoiceChoice({ lang }: { lang: 'en' | 'es' }) {
  const { t } = useI18n();
  const [voices, setVoices] = useState<VoiceInfo[]>();
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    void getVoice().voices(lang).then((list) => { setVoices(list); setCurrent(pickVoice(list, lang)?.name); });
  }, [lang]);
  if (!voices) return null;
  // Pressing a voice chooses it and plays a sample of it, even when it is already the chosen one.
  const pick = (name: string) => { chooseVoice(lang, name); setCurrent(name); void getVoice().speak(SAMPLE[lang], { lang: speechCode(lang), rate: 1 }); };
  return (
    <section className="space-y-2 pt-2">
      {voices.length === 0
        ? <p className="text-muted">{t('speak.voiceNone')}</p>
        : <CheckList label={t('settings.voice')} name={`voice-${lang}`} value={current ?? ''} options={voices.map((v) => ({ value: v.name, label: v.name }))} onChange={setCurrent} onSelect={pick} />}
    </section>
  );
}

export function VoicePage() {
  const { t, language } = useI18n();
  return (
    <>
      <AppBar title={<InfoLabel title={t('settings.voice')} info={t('settings.voiceHint')} />} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="py-0">
        {/* Only the voices for the language the app is in (the verses are read in the deck's language, with that language's chosen voice). */}
        <VoiceChoice key={language} lang={language} />
      </Page>
    </>
  );
}

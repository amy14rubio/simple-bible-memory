import { useEffect, useState } from 'react';
import { AppBar, BackButton, Button, CheckList, Page } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { chooseVoice, getVoice, pickVoice, speechCode, type VoiceInfo } from '../../platform/voice';

const LANGUAGES = ['en', 'es'] as const;
const SAMPLE = { en: 'Here is the verse.', es: 'Aquí está el versículo.' };

/** One voice per language for Speak mode: pick it, hear a sample, and it stays the same from then on. */
function VoiceChoice({ lang }: { lang: (typeof LANGUAGES)[number] }) {
  const { t } = useI18n();
  const [voices, setVoices] = useState<VoiceInfo[]>();
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    void getVoice().voices(lang).then((list) => { setVoices(list); setCurrent(pickVoice(list, lang)?.name); });
  }, [lang]);
  if (!voices) return null;
  const pick = (name: string) => { chooseVoice(lang, name); setCurrent(name); void getVoice().speak(SAMPLE[lang], { lang: speechCode(lang), rate: 1 }); };
  return (
    <section className="space-y-2 pt-4">
      <h2 className="font-serif text-xl">{t(`speak.voiceLang.${lang}`)}</h2>
      {voices.length === 0 ? <p className="text-muted">{t('speak.voiceNone')}</p> : (
        <>
          <CheckList label={t(`speak.voiceLang.${lang}`)} name={`voice-${lang}`} value={current ?? ''} options={voices.map((v) => ({ value: v.name, label: v.name }))} onChange={pick} />
          <Button variant="secondary" onClick={() => void getVoice().speak(SAMPLE[lang], { lang: speechCode(lang), rate: 1 })}>{t('speak.voicePlay')}</Button>
        </>
      )}
    </section>
  );
}

export function VoicePage() {
  const { t } = useI18n();
  return (
    <>
      <AppBar title={t('settings.voice')} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="py-0">
        <p className="pt-2 text-muted">{t('settings.voiceHint')}</p>
        {LANGUAGES.map((l) => <VoiceChoice key={l} lang={l} />)}
      </Page>
    </>
  );
}

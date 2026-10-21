import { useEffect, useState } from 'react';
import { AppBar, BackButton, CheckList, Page } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { useI18n } from '../../i18n/I18nProvider';
import { chooseVoice, getVoice, pickVoice, speechCode, type VoiceInfo } from '../../platform/voice';

/** "español (España)" / "Spanish (Spain)": the voice's language and region, in the app's language. Voices that would read the same get a number. */
function labels(voices: VoiceInfo[], appLanguage: string): Map<string, string> {
  let names: Intl.DisplayNames | undefined;
  try { names = new Intl.DisplayNames([appLanguage], { type: 'language' }); } catch { /* the technical name is shown */ }
  const capital = (text: string) => text.charAt(0).toLocaleUpperCase(appLanguage) + text.slice(1); // Spanish writes "español" in lower case
  const base = voices.map((v) => { try { return capital(names?.of(v.lang.replace('_', '-')) ?? v.name); } catch { return v.name; } });
  const seen = new Map<string, number>();
  const result = new Map<string, string>();
  voices.forEach((v, i) => {
    const label = base[i]!;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    result.set(v.name, base.filter((b) => b === label).length > 1 ? `${label} ${n}` : label);
  });
  return result;
}

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
  const names = labels(voices, lang);
  // Pressing a voice chooses it and plays a sample of it, even when it is already the chosen one.
  const pick = (name: string) => { chooseVoice(lang, name); setCurrent(name); void getVoice().speak(SAMPLE[lang], { lang: speechCode(lang), rate: 1 }); };
  return (
    <section className="space-y-2 pt-2">
      {voices.length === 0
        ? <p className="text-muted">{t('speak.voiceNone')}</p>
        : <CheckList label={t('settings.voice')} name={`voice-${lang}`} value={current ?? ''} options={voices.map((v) => ({ value: v.name, label: names.get(v.name) ?? v.name }))} onChange={setCurrent} onSelect={pick} />}
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

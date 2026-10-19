import { useEffect, useState } from 'react';
import { ColorArea, ColorSlider, ColorThumb, I18nProvider, SliderTrack, parseColor, type Color } from 'react-aria-components';
import { useI18n } from '../../i18n/I18nProvider';

const thumb = 'size-7 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.4)] data-[focus-visible]:size-8';

/**
 * The pieces of the colour picker: a square to drag across (saturation across, brightness up), a rainbow slider for the
 * hue (the preview circle is in the dialog's title row). They come from React Aria (the library behind HeroUI's picker) and are drawn with the
 * app's own look. React Aria does the touch dragging and the keyboard and screen reader behaviour.
 * Loaded only when the dialog opens, so the rest of the app does not carry it.
 */
export default function ColorPickerBody({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const { t, language } = useI18n();
  // Kept as hue/saturation/brightness while you drag (a grey has no hue, so a hex round trip would lose it).
  const [color, setColor] = useState<Color>(() => parseColor(value).toFormat('hsb'));

  // Follow a colour typed into the hex box on the page, but not our own changes coming back.
  useEffect(() => {
    if (color.toString('hex').toLowerCase() !== value.toLowerCase()) setColor(parseColor(value).toFormat('hsb'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const change = (next: Color) => {
    setColor(next);
    onChange(next.toString('hex').toLowerCase());
  };

  return (
    <I18nProvider locale={language === 'es' ? 'es-ES' : 'en-US'}>
      <div className="flex flex-col gap-5 px-5 pb-6">
        <ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness" value={color} onChange={change} aria-label={label} className="h-56 w-full rounded-2xl" style={({ defaultStyle }) => defaultStyle}>
          <ColorThumb className={thumb} style={({ defaultStyle }) => ({ ...defaultStyle, backgroundColor: color.toString('hex') })} />
        </ColorArea>
        <ColorSlider colorSpace="hsb" channel="hue" value={color} onChange={change} aria-label={`${label}, ${t('customTheme.hue')}`}>
          <SliderTrack className="h-8 w-full rounded-full" style={({ defaultStyle }) => defaultStyle}>
            <ColorThumb className={`${thumb} top-1/2`} style={({ defaultStyle }) => ({ ...defaultStyle, backgroundColor: `hsl(${Math.round(color.getChannelValue('hue'))}, 100%, 50%)` })} />
          </SliderTrack>
        </ColorSlider>
      </div>
    </I18nProvider>
  );
}

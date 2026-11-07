import { useEffect, useState } from 'react';

/** True when the person asked their device for less motion: the clips are replaced by a still picture. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * A short silent clip of the app, looping like a GIF (a video is a tenth of the size and sharp). It is decoration: the card's
 * title and text say everything, so it is hidden from screen readers. With "reduce motion" on, the last frame is shown still.
 */
export function TourClip({ name, language }: { name: string; language: string }) {
  const reduced = usePrefersReducedMotion();
  const base = `/tutorial/${language === 'es' ? 'es' : 'en'}/${name}`;
  const frame = 'pointer-events-none aspect-[4/3] w-full rounded-2xl border border-border bg-panel object-cover shadow-sm';
  return reduced ? (
    <img src={`${base}.jpg`} alt="" aria-hidden draggable={false} className={frame} />
  ) : (
    <video src={`${base}.mp4`} poster={`${base}.jpg`} aria-hidden tabIndex={-1} autoPlay loop muted playsInline preload="auto" disablePictureInPicture className={frame} />
  );
}

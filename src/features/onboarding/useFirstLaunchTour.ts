import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRepositories } from '../../app/repositories';
import { ONBOARDING_DONE, onboardingDisabledForTests, shouldShowOnboarding } from './onboarding';

/**
 * On the first launch, from the home screen only (never from a link someone opened), takes a brand-new person to the
 * welcome tour. Someone who already has decks is marked as having seen it and left alone.
 */
export function useFirstLaunchTour() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { settings, decks } = useRepositories();

  useEffect(() => {
    if (pathname !== '/' || onboardingDisabledForTests()) return;
    let cancelled = false;
    void (async () => {
      const done = await settings.get<boolean>(ONBOARDING_DONE);
      if (done) return;
      const deckCount = (await decks.list()).length;
      if (cancelled) return;
      if (shouldShowOnboarding({ done, deckCount })) navigate('/welcome', { replace: true });
      else if (deckCount > 0) void settings.set(ONBOARDING_DONE, true); // an existing user: never show it
    })();
    return () => { cancelled = true; };
  }, [pathname, navigate, settings, decks]);
}

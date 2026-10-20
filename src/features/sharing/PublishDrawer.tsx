import { useCallback, useEffect, useState } from 'react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { toast } from '../../components/shadcn/toast';
import { Button, ErrorMessage, HiddenClose } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { useRepositories } from '../../app/repositories';
import { useSharing } from '../../app/sharing';
import { LIMITS, publishBlock, translationLanguage } from '../../domain/sharing/translations';
import type { PublishedDeckRow } from '../../data/repositories/sharingRepository';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { TranslationFields, type TranslationValue } from './TranslationFields';
import type { BlockReason } from './types';
import { TERMS_KEY, TERMS_VERSION } from './terms';
import { CommunityRulesDrawer } from './CommunityRulesDrawer';

const BLOCK_MESSAGE: Record<BlockReason, MessageKey> = {
  'no-translation': 'publish.pickTranslation',
  copyrighted: 'publish.copyrighted',
  'no-language': 'publish.noLanguage',
  'too-many-cards': 'publish.tooMany',
  'newer-format': 'publish.newerFormat',
  rules: 'publish.rulesNeeded',
};

/**
 * The drawer behind "Publish deck" / "Published". It walks through what is needed: sign in (only now, only if needed),
 * a translation that is allowed, and then publishing. After that, changes are sent automatically; here you can see the
 * status or take the deck down.
 */
export function PublishDrawer({ deck, onClose }: { deck: { id: string; title: string } | null; onClose: () => void }) {
  const { t } = useI18n();
  const { decks, cards, sharing, settings } = useRepositories();
  const share = useSharing();
  const open = deck !== null;
  usePopupHistory(open, onClose);

  const [row, setRow] = useState<PublishedDeckRow>();
  const [cardCount, setCardCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [accepted, setAccepted] = useState<boolean>(); // have the community rules been agreed to already? (undefined: not known yet)
  const [rules, setRules] = useState(false); // the separate community-rules drawer, shown the first time someone publishes

  const reload = useCallback(async () => {
    if (!deck) return;
    setRow(await sharing.getDeck(deck.id));
    setCardCount((await cards.listByDeck(deck.id)).length);
  }, [deck, sharing, cards]);

  useEffect(() => {
    if (!deck) return;
    setError(undefined);
    setBusy(false);
    share.ensureLoaded();
    void reload();
  }, [deck, reload, share, settings]);

  // Have the community rules been agreed to? Read again whenever a deck is opened.
  const deckId = deck?.id;
  useEffect(() => {
    if (!deckId) return;
    setRules(false);
    void settings.get<number>(TERMS_KEY).then((v) => setAccepted((v ?? 0) >= TERMS_VERSION));
  }, [deckId, settings]);

  if (!deck) return <Drawer open={false} onOpenChange={() => undefined}><DrawerContent><DrawerTitle className="sr-only">{t('publish.title')}</DrawerTitle></DrawerContent></Drawer>;

  const published = !!row?.publishId;
  const status = share.statusOf(deck.id);
  const block = row ? publishBlock(row.translationCode) : null;
  const translation: TranslationValue = { translation: row?.translationCode ?? null, language: row?.bibleLanguage ?? null };
  const ownLanguageMissing = row?.translationCode === 'OWN' && !(row.bibleLanguage === 'en' || row.bibleLanguage === 'es');
  const tooMany = cardCount > LIMITS.cardsPerDeck;
  const reason: BlockReason | null = block ?? (ownLanguageMissing ? 'no-language' : tooMany ? 'too-many-cards' : null);

  const changeTranslation = async (v: TranslationValue) => {
    if (!row) return;
    await decks.update(deck.id, { title: row.title, description: row.description, translationCode: v.translation, bibleLanguage: translationLanguage(v.translation ?? '') ?? v.language });
    await reload();
  };

  const run = async (action: () => Promise<void>, failed: MessageKey, done: MessageKey) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      toast.add({ title: t(done), type: 'success' });
      await reload();
      return true;
    } catch {
      setError(t(failed));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const publishNow = () => run(() => share.publish(deck!.id), 'publish.failed', 'toast.published').then((ok) => { if (ok) onClose(); });
  // "Agree and publish": the agreement is saved as soon as it is given (even if publishing then fails), the rules drawer goes, and the deck is published.
  const agreeAndPublish = async () => {
    await settings.set(TERMS_KEY, TERMS_VERSION);
    setAccepted(true);
    setRules(false);
    await publishNow();
  };
  // A deck that is already published but was waiting for the agreement: agreeing is enough, syncing resumes by itself (saving the setting triggers it).
  const agreeOnly = async () => {
    await settings.set(TERMS_KEY, TERMS_VERSION);
    setAccepted(true);
    setRules(false);
  };

  const statusText = () => {
    if (status?.state === 'syncing') return t('publish.status.syncing');
    if (status?.state === 'blocked') return t(BLOCK_MESSAGE[status.reason]);
    if (status?.state === 'waiting') return share.user ? t('publish.status.waiting') : t('publish.status.signedOut');
    if (!share.user && share.authLoaded) return t('publish.status.signedOut');
    return t('publish.status.synced');
  };

  return (
    <>
      <Drawer open onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
        <DrawerContent className="mx-auto max-w-2xl pb-[var(--safe-bottom)]">
          <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
            <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{published ? t('publish.titlePublished') : t('publish.title')}</DrawerTitle>
            <DrawerDescription className="sr-only">{deck.title}</DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-6 pb-2">
            <p className="font-serif text-lg">{deck.title}</p>

            {!share.available ? (
              <p className="text-muted">{t('publish.unavailable')}</p>
            ) : !share.user && !published ? (
              <>
                <p>{t('publish.signInIntro')}</p>
                <Button className="w-full" disabled={busy || !share.authLoaded} onClick={() => void run(() => share.signIn(), 'publish.signInFailed', 'toast.signedIn')}>{t('publish.signIn')}</Button>
              </>
            ) : (
              <>
                <div className="-mx-0">
                  <TranslationFields value={translation} onChange={(v) => void changeTranslation(v)} />
                </div>
                <div className="flex"><InfoLabel title={t('publish.why')} info={<p className="text-base">{t('publish.whyBody')}</p>} /></div>

                {published ? (
                  <>
                    <p role="status" className="rounded-lg bg-panel px-4 py-3 text-[0.9375rem]">{statusText()}</p>
                    {status?.state === 'blocked' && status.reason === 'rules' && (
                      <Button className="w-full" disabled={busy} onClick={() => setRules(true)}>{t('publish.reviewRules')}</Button>
                    )}
                    <Button variant="secondary" className="w-full text-danger" disabled={busy} onClick={() => void run(() => share.unpublish(deck.id), 'publish.unpublishFailed', 'toast.unpublished').then((ok) => { if (ok) onClose(); })}>{t('publish.unpublish')}</Button>
                  </>
                ) : (
                  <>
                    {reason && <p role="status" className="text-[0.9375rem] text-danger">{t(BLOCK_MESSAGE[reason])}</p>}
                    <Button
                      className="w-full"
                      disabled={busy || reason !== null || accepted === undefined}
                      onClick={() => { if (accepted) void publishNow(); else setRules(true); }}
                    >{t('publish.button')}</Button>
                  </>
                )}
              </>
            )}
            {error && <ErrorMessage error={error} />}
          </div>
          <div className="h-6" />
          <DrawerClose render={<HiddenClose label={t('common.cancel')} />} />
        </DrawerContent>
      </Drawer>
      <CommunityRulesDrawer
        open={rules}
        busy={busy}
        agreeLabel={published ? 'terms.agree' : 'terms.agreePublish'}
        onAgree={() => void (published ? agreeOnly() : agreeAndPublish())}
        onClose={() => setRules(false)}
      />
    </>
  );
}

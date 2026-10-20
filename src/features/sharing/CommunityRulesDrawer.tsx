import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer';
import { Button, HiddenClose } from '../../components/ui';
import { ExternalLink } from '../../components/ExternalLink';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { legalUrl } from '../../lib/site';
import { useI18n } from '../../i18n/I18nProvider';

const RULES = ['terms.rule1', 'terms.rule2', 'terms.rule3', 'terms.rule4'] as const;

/**
 * The community rules, on their own, shown the first time someone publishes a deck (see PublishDrawer). One button both agrees
 * and publishes; Cancel goes back to the publish drawer without publishing anything.
 */
export function CommunityRulesDrawer({ open, busy, onAgree, onClose }: { open: boolean; busy: boolean; onAgree: () => void; onClose: () => void }) {
  const { t, language } = useI18n();
  usePopupHistory(open, onClose);
  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-2xl pb-[var(--safe-bottom)]">
        <DrawerHeader className="px-6 pb-2 pt-1 group-data-[swipe-axis=y]/drawer-popup:text-left">
          <DrawerTitle className="font-serif text-xl font-medium tracking-tight">{t('terms.title')}</DrawerTitle>
          <DrawerDescription className="text-base text-foreground">{t('terms.intro')}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-6 pb-2">
          <ul className="list-disc space-y-2 pl-5">
            {RULES.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
          <p><ExternalLink href={legalUrl('terms', language)} className="font-medium underline underline-offset-4">{t('terms.read')}</ExternalLink></p>
          <div className="flex flex-col gap-2 pt-1">
            <Button disabled={busy} onClick={onAgree}>{t('terms.agreePublish')}</Button>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </div>
        <div className="h-6" />
        <DrawerClose render={<HiddenClose label={t('common.cancel')} />} />
      </DrawerContent>
    </Drawer>
  );
}

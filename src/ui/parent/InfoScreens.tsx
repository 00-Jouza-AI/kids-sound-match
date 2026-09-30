import type { ContentIssue } from '../../content/types';
import { cloudConfigured } from '../../custom/cloud';
import { useI18n } from '../../i18n/I18n';
import { privacyPolicy } from '../../i18n/privacy';
import { telemetry } from '../../telemetry/telemetry';
import { Screen } from './components';

export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  return (
    <Screen title={t('privacyPolicy')} onBack={onBack}>
      {privacyPolicy(lang, telemetry.available, cloudConfigured).map((s) => (
        <section className="card prose" key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
    </Screen>
  );
}

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <Screen title={t('about')} onBack={onBack}>
      <section className="card prose about">
        <img src="icon.svg" alt="" className="home-logo" />
        <h2>{t('appName')}</h2>
        <p className="hint">{t('aboutVersion', { v: __APP_VERSION__ })}</p>
        <p>{t('aboutBody')}</p>
        <p className="hint">{t('aboutSounds')}</p>
        {__ALLOW_PLACEHOLDERS__ && <p className="note">{t('testBuildNote')}</p>}
      </section>
    </Screen>
  );
}

/** Spec 3.4: development builds stop and list content problems so they get fixed. */
export function ContentProblems({
  issues,
  canContinue,
  onContinue,
}: {
  issues: readonly ContentIssue[];
  canContinue: boolean;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  return (
    <Screen title={t('contentErrorTitle')}>
      <p>{t('contentErrorBody')}</p>
      <ul className="issues" dir="ltr">
        {sorted.map((i, n) => (
          <li key={n} className={i.level}>
            <strong>{i.level}</strong> {i.packId}
            {i.itemKey ? ` / ${i.itemKey}` : ''}: {i.message}
          </li>
        ))}
      </ul>
      {canContinue && (
        <button type="button" className="btn primary wide" onClick={onContinue}>
          {t('continueAnyway')}
        </button>
      )}
    </Screen>
  );
}

export function NothingToPlay({ issues }: { issues: readonly ContentIssue[] }) {
  const { t } = useI18n();
  return (
    <Screen title={t('noPlayableTitle')}>
      <p>{t('noPlayableBody')}</p>
      {import.meta.env.DEV && (
        <ul className="issues" dir="ltr">
          {issues.map((i, n) => (
            <li key={n} className={i.level}>
              {i.packId}
              {i.itemKey ? ` / ${i.itemKey}` : ''}: {i.message}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

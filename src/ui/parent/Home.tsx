import type { LoadedPack } from '../../content/types';
import type { ChoiceCount } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import type { NextLevel } from '../../report/practice';
import { enabledItemKeys, type Settings } from '../../settings/settings';
import { ExploreIcon } from '../kid/icons';
import { ChevronIcon } from './components';

export type HomeLink = 'report' | 'settings' | 'parentsGroup' | 'privacy' | 'about';

/** Spec 5.2: title, settings summary, a large START button, and the parent links. */
export function Home({
  pack,
  settings,
  showParentsGroup,
  nudge,
  onStart,
  onExplore,
  onOpen,
  onNudgeAccept,
  onNudgeDismiss,
}: {
  pack: LoadedPack;
  settings: Settings;
  showParentsGroup: boolean;
  nudge: NextLevel | null;
  onStart: () => void;
  onExplore: () => void;
  onOpen: (link: HomeLink) => void;
  onNudgeAccept: (to: ChoiceCount) => void;
  onNudgeDismiss: (nudge: NextLevel) => void;
}) {
  const { t, lang } = useI18n();
  const animals = enabledItemKeys(pack, settings).length;
  const modeLabel = { SOUND_AND_NAME: t('modeSoundAndName'), SOUND_ONLY: t('modeSoundOnly'), NAME_ONLY: t('modeNameOnly') }[
    settings.mode
  ];
  const languageLabel = { ar: 'العربية', en: 'English', both: 'العربية + English' }[settings.language];
  const summary = [
    pack.name[lang],
    modeLabel,
    languageLabel,
    t('summaryPictures', { n: settings.choiceCount }),
    t('summaryQuestions', { n: settings.questionsPerSession }),
    t('summaryAnimals', { n: animals }),
    ...(settings.toddlerMode ? [t('toddlerMode')] : []),
  ];
  const links: { id: HomeLink; label: string; icon: string }[] = [
    { id: 'report', label: t('report'), icon: '📊' },
    { id: 'settings', label: t('settings'), icon: '⚙️' },
    ...(showParentsGroup ? [{ id: 'parentsGroup' as const, label: t('parentsGroup'), icon: '💬' }] : []),
    { id: 'privacy', label: t('privacyPolicy'), icon: '🔒' },
    { id: 'about', label: t('about'), icon: 'ℹ️' },
  ];

  return (
    <div className="parent home">
      <header className="home-header">
        <img src="icon.svg" alt="" className="home-logo" />
        <h1>{t('appName')}</h1>
        <p className="tagline">{t('appTagline')}</p>
      </header>

      <button type="button" className="start-btn" onClick={onStart}>
        {t('start')}
      </button>
      <button type="button" className="explore-btn" onClick={onExplore}>
        <ExploreIcon />
        <span>
          <strong>{t('explore')}</strong>
          <small>{t('exploreSub')}</small>
        </span>
      </button>

      {nudge && (
        <section className="card nudge-card" role="status">
          <h2>{t('nudgeTitle')}</h2>
          <p>{t('nudgeBody', { p: nudge.percent, from: nudge.from, to: nudge.to })}</p>
          <div className="nudge-actions">
            <button type="button" className="btn primary" onClick={() => onNudgeAccept(nudge.to as ChoiceCount)}>
              {t('nudgeAccept', { to: nudge.to })}
            </button>
            <button type="button" className="btn ghost" onClick={() => onNudgeDismiss(nudge)}>
              {t('nudgeDismiss')}
            </button>
          </div>
        </section>
      )}

      <ul className="summary" aria-label={t('settings')}>
        {summary.map((s) => (
          <li key={s} className="pill">
            {s}
          </li>
        ))}
      </ul>

      {__ALLOW_PLACEHOLDERS__ && <p className="note">{t('testBuildNote')}</p>}

      <nav className="links" aria-label={t('forParents')}>
        <h2>{t('forParents')}</h2>
        {links.map((l) => (
          <button type="button" key={l.id} className="link-row" onClick={() => onOpen(l.id)}>
            <span className="link-icon" aria-hidden="true">
              {l.icon}
            </span>
            <span className="link-label">{l.label}</span>
            <ChevronIcon />
          </button>
        ))}
      </nav>
    </div>
  );
}

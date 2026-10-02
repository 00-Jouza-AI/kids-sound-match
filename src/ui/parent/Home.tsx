import type { LoadedPack } from '../../content/types';
import type { ChoiceCount } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import type { MemoryNext } from '../../report/levels';
import type { NextLevel } from '../../report/practice';
import type { ProfileState } from '../../settings/profiles';
import { effectiveMode, enabledItemKeys, type Settings } from '../../settings/settings';
import { ExploreIcon, MemoryIcon, OddIcon, PeekabooIcon, PointIcon, SceneIcon } from '../kid/icons';
import { ChevronIcon } from './components';
import { ProfileRow } from './ProfileRow';

export type HomeLink = 'report' | 'words' | 'settings' | 'myPacks' | 'flashcards' | 'studio' | 'parentsGroup' | 'privacy' | 'about';

/** Spec 5.2: title, settings summary, a large START button, and the parent links. */
export function Home({
  pack,
  settings,
  canStart,
  canExplore,
  showParentsGroup,
  profiles,
  onProfile,
  nudge,
  memoryNudge,
  canOdd,
  canScene,
  canPoint,
  onStart,
  onExplore,
  onMemory,
  onOdd,
  onPeekaboo,
  onScene,
  onPoint,
  onOpen,
  onNudgeAccept,
  onNudgeDismiss,
  onMemoryNudgeAccept,
  onMemoryNudgeDismiss,
}: {
  /** Undefined when no pack is ready to play yet (the parent can still make one in My packs). */
  pack: LoadedPack | undefined;
  settings: Settings;
  canStart: boolean;
  canExplore: boolean;
  showParentsGroup: boolean;
  profiles: ProfileState;
  onProfile: (id: string) => void;
  nudge: NextLevel | null;
  /** "Ready for more memory cards?" */
  memoryNudge: MemoryNext | null;
  canOdd: boolean;
  /** Find it in the picture: at least one scene has enough things to find. */
  canScene: boolean;
  /** Where's your nose?: the body-part questions exist in the game's language. */
  canPoint: boolean;
  onStart: () => void;
  onExplore: () => void;
  onMemory: () => void;
  onOdd: () => void;
  onPeekaboo: () => void;
  onScene: () => void;
  onPoint: () => void;
  onOpen: (link: HomeLink) => void;
  onNudgeAccept: (to: ChoiceCount) => void;
  onNudgeDismiss: (nudge: NextLevel) => void;
  onMemoryNudgeAccept: (to: number) => void;
  onMemoryNudgeDismiss: (nudge: MemoryNext) => void;
}) {
  const { t, lang } = useI18n();
  const modeLabel = { SOUND_AND_NAME: t('modeSoundAndName'), SOUND_ONLY: t('modeSoundOnly'), NAME_ONLY: t('modeNameOnly') }[
    pack ? effectiveMode(pack, settings.mode) : settings.mode
  ];
  const languageLabel = { ar: 'العربية', en: 'English', both: 'العربية + English' }[settings.language];
  // "Who eats what?" always asks about the animal, and has no Toddler mode.
  const association = pack?.kind === 'association';
  const summary = pack
    ? [
        pack.name[lang],
        ...(association ? [] : [modeLabel]),
        languageLabel,
        t('summaryPictures', { n: settings.choiceCount }),
        t('summaryQuestions', { n: settings.questionsPerSession }),
        t(pack.id === 'animals' ? 'summaryAnimals' : 'summaryItems', { n: enabledItemKeys(pack, settings).length }),
        ...(settings.toddlerMode && !association ? [t('toddlerMode')] : []),
      ]
    : [];
  const links: { id: HomeLink; label: string; icon: string }[] = [
    { id: 'report', label: t('report'), icon: '📊' },
    { id: 'words', label: t('wordsTitle'), icon: '🗣️' },
    { id: 'settings', label: t('settings'), icon: '⚙️' },
    { id: 'myPacks', label: t('myPacks'), icon: '🎨' },
    { id: 'flashcards', label: t('flashcards'), icon: '🖨️' },
    // The recording studio saves into the app's files, so it only exists on the PC's dev server.
    ...(import.meta.env.DEV ? [{ id: 'studio' as const, label: t('studio'), icon: '🎙️' }] : []),
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

      {profiles.profiles.length > 1 && (
        <div className="who-plays">
          <span className="muted">{t('whoIsPlaying')}</span>
          <ProfileRow profiles={profiles.profiles} activeId={profiles.activeId} onSelect={onProfile} />
        </div>
      )}

      <button type="button" className="start-btn" onClick={onStart} disabled={!canStart}>
        {t('start')}
      </button>
      {/* The youngest players' games first. */}
      <div className="games-row">
        <button type="button" className="game-tile" onClick={onPeekaboo} disabled={!canExplore}>
          <PeekabooIcon />
          <strong>{t('peekaboo')}</strong>
          <small>{t('peekabooSub')}</small>
        </button>
        <button type="button" className="game-tile" onClick={onExplore} disabled={!canExplore}>
          <ExploreIcon />
          <strong>{t('explore')}</strong>
          <small>{t('exploreSub')}</small>
        </button>
        <button type="button" className="game-tile" onClick={onScene} disabled={!canScene}>
          <SceneIcon />
          <strong>{t('sceneGame')}</strong>
          <small>{t('sceneSub')}</small>
        </button>
        <button type="button" className="game-tile" onClick={onPoint} disabled={!canPoint}>
          <PointIcon />
          <strong>{t('pointGame')}</strong>
          <small>{t('pointSub')}</small>
        </button>
        <button type="button" className="game-tile" onClick={onMemory} disabled={!canExplore}>
          <MemoryIcon />
          <strong>{t('memoryGame')}</strong>
          <small>{t('memorySub', { n: settings.memoryPairs })}</small>
        </button>
        <button type="button" className="game-tile" onClick={onOdd} disabled={!canOdd}>
          <OddIcon />
          <strong>{t('oddOneOut')}</strong>
          <small>{t('oddSub')}</small>
        </button>
      </div>
      {!pack ? (
        <p className="note">{t('noPackReady')}</p>
      ) : (
        !canStart && <p className="note">{t('needMoreItems')}</p>
      )}

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

      {memoryNudge && (
        <section className="card nudge-card" role="status">
          <h2>{t('memoryNudgeTitle')}</h2>
          <p>{t('memoryNudgeBody', { from: memoryNudge.from, to: memoryNudge.to })}</p>
          <div className="nudge-actions">
            <button type="button" className="btn primary" onClick={() => onMemoryNudgeAccept(memoryNudge.to)}>
              {t('memoryNudgeAccept', { to: memoryNudge.to })}
            </button>
            <button type="button" className="btn ghost" onClick={() => onMemoryNudgeDismiss(memoryNudge)}>
              {t('nudgeDismiss')}
            </button>
          </div>
        </section>
      )}

      {summary.length > 0 && (
        <ul className="summary" aria-label={t('settings')}>
          {summary.map((s) => (
            <li key={s} className="pill">
              {s}
            </li>
          ))}
        </ul>
      )}

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

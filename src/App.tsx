import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from './audio/audioEngine';
import { placeholderPictureUsable } from './content/emojiSupport';
import { loadContent } from './content/loader';
import type { LoadedContent } from './content/types';
import { I18nProvider, useI18n } from './i18n/I18n';
import { enterFullscreen } from './lock/fullscreen';
import { ParentGate } from './lock/ParentGate';
import { loadPinRecord } from './lock/pin';
import { reportStore } from './report/db';
import { practiceWeights, readyForMore, type NextLevel } from './report/practice';
import { enabledItemKeys, loadSettings, saveSettings, spokenLanguages, uiLanguage, type Settings } from './settings/settings';
import { local } from './settings/storage';
import { telemetry } from './telemetry/telemetry';
import { KidMode } from './ui/kid/KidMode';
import { clearKidSnapshot, loadKidSnapshot, type KidConfig, type KidKind, type KidSnapshot } from './ui/kid/kidSnapshot';
import { FirstRun } from './ui/parent/FirstRun';
import { Home, type HomeLink } from './ui/parent/Home';
import { AboutScreen, ContentProblems, NothingToPlay, PrivacyScreen } from './ui/parent/InfoScreens';
import { ReportScreen } from './ui/parent/ReportScreen';
import { SettingsScreen } from './ui/parent/SettingsScreen';
import { StartFlow, type StartStep } from './ui/parent/StartFlow';

type Screen =
  | 'loading'
  | 'problems'
  | 'empty'
  | 'firstRun'
  | 'home'
  | 'settings'
  | 'report'
  | 'privacy'
  | 'about'
  | 'start'
  | 'kid';

/** After a correct PIN, the parent area stays open briefly so Settings -> Report doesn't ask twice. */
const PARENT_UNLOCK_MS = 2 * 60 * 1000;
const LOCK_NOTE_KEY = 'ksm.lockNoteShown.v1';
/** "Not now" on the Ready-for-more card: the level, and how many games had been played at it. */
const NUDGE_DISMISSED_KEY = 'ksm.nudgeDismissed.v1';
/** After "Not now", the suggestion comes back only after this many more games at that level. */
const NUDGE_AGAIN_AFTER_GAMES = 3;
const PARENTS_GROUP_URL = (import.meta.env.VITE_PARENTS_GROUP_URL ?? '').trim();

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const lang = uiLanguage(settings);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
    if (patch.telemetryEnabled === false) telemetry.discard();
  }, []);

  return (
    <I18nProvider lang={lang}>
      <Shell settings={settings} update={update} />
    </I18nProvider>
  );
}

function Shell({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const { t } = useI18n();
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [screen, setScreen] = useState<Screen>('loading');
  const [gate, setGate] = useState<{ run: () => void } | null>(null);
  const [kid, setKid] = useState<{ config: KidConfig; snapshot: KidSnapshot | null } | null>(null);
  const [startStep, setStartStep] = useState<StartStep>('soundCheck');
  const [startKind, setStartKind] = useState<KidKind>('game');
  const [nudge, setNudge] = useState<NextLevel | null>(null);
  const unlockedUntil = useRef(0);
  const soundChecked = useRef(false);

  const pack = content?.packs.find((p) => p.id === settings.packId) ?? content?.packs[0];

  const afterLoad = useCallback((loaded: LoadedContent) => {
    if (!loadPinRecord()) {
      setScreen('firstRun');
      return;
    }
    // A reload during a game returns to that game (the web's version of process death).
    const snap = loadKidSnapshot();
    if (snap && loaded.packs.some((p) => p.id === snap.config.packId)) {
      setKid({ config: snap.config, snapshot: snap });
      setScreen('kid');
      return;
    }
    if (snap) clearKidSnapshot();
    setScreen('home');
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadContent({
      baseUrl: import.meta.env.BASE_URL,
      allowPlaceholders: __ALLOW_PLACEHOLDERS__,
      placeholderPictureUsable,
    })
      .then((loaded) => {
        if (cancelled) return;
        setContent(loaded);
        if (loaded.issues.length) console.warn('[content]', loaded.issues);
        // Spec 3.4: fail loudly in development; in release, skip broken items and carry on.
        if (import.meta.env.DEV && loaded.issues.some((i) => i.level === 'error')) setScreen('problems');
        else if (!loaded.packs.length) setScreen('empty');
        else afterLoad(loaded);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setContent({ packs: [], issues: [{ packId: '?', message: String(e), level: 'error' }] });
        setScreen('empty');
      });
    return () => {
      cancelled = true;
    };
  }, [afterLoad]);

  // The web has no background jobs: telemetry (if enabled) uploads when the app is opened or shown.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'visible') void telemetry.flush(settings.telemetryEnabled);
    };
    flush();
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [settings.telemetryEnabled]);

  // "Ready for more?": look at the Report whenever Home is shown.
  useEffect(() => {
    if (screen !== 'home') return;
    let cancelled = false;
    Promise.all([reportStore.sessions(), reportStore.questions()])
      .then(([sessions, questions]) => {
        if (cancelled) return;
        const next = readyForMore(sessions, questions, settings.choiceCount);
        const dismissed = local.getJson<{ level: number; games: number }>(NUDGE_DISMISSED_KEY);
        const snoozed =
          next && dismissed?.level === next.from && next.gamesAtLevel < dismissed.games + NUDGE_AGAIN_AFTER_GAMES;
        setNudge(next && !snoozed ? next : null);
      })
      .catch(() => setNudge(null));
    return () => {
      cancelled = true;
    };
  }, [screen, settings.choiceCount]);

  /** Settings, Report, outside links and difficulty changes sit behind the parent gate (spec 6.2). */
  const requireParent = (run: () => void) => {
    if (Date.now() < unlockedUntil.current) run();
    else setGate({ run });
  };

  const open = (link: HomeLink) => {
    if (link === 'about') setScreen('about');
    else if (link === 'parentsGroup') requireParent(() => window.open(PARENTS_GROUP_URL, '_blank', 'noopener,noreferrer'));
    else requireParent(() => setScreen(link));
  };

  const startKid = async (kind: KidKind) => {
    if (!pack) return;
    // Adaptive practice: weights come from the Report on this device when the game starts.
    let weights: Record<string, number> = {};
    if (kind === 'game' && settings.adaptive && !settings.toddlerMode) {
      try {
        weights = practiceWeights(await reportStore.sessions(), await reportStore.questions(), pack.id);
      } catch {
        // No history available: every animal equally often.
      }
    }
    unlockedUntil.current = 0;
    setKid({
      config: {
        kind,
        packId: pack.id,
        itemKeys: enabledItemKeys(pack, settings),
        choiceCount: settings.choiceCount,
        questionsPerSession: settings.questionsPerSession,
        toddlerMode: settings.toddlerMode,
        mode: settings.mode,
        language: settings.language,
        repeatIntervalSec: settings.repeatIntervalSec,
        hints: settings.hints,
        weights,
      },
      snapshot: null,
    });
    setScreen('kid');
  };

  /** Runs inside a tap: fullscreen must be requested from a user gesture. */
  const launch = (kind: KidKind) => {
    void enterFullscreen().then((ok) => {
      if (ok || local.get(LOCK_NOTE_KEY)) void startKid(kind);
      else {
        setStartKind(kind);
        setStartStep('lockNote');
        setScreen('start');
      }
    });
  };

  const begin = (kind: KidKind) => {
    audioEngine.unlock(); // browsers only allow sound after a tap
    if (soundChecked.current) launch(kind);
    else {
      setStartKind(kind);
      setStartStep('soundCheck');
      setScreen('start');
    }
  };

  const home = () => setScreen('home');
  let body;
  switch (screen) {
    case 'loading':
      body = <div className="parent center-screen">{t('loading')}</div>;
      break;
    case 'problems':
      body = (
        <ContentProblems
          issues={content?.issues ?? []}
          canContinue={Boolean(content?.packs.length)}
          onContinue={() => content && afterLoad(content)}
        />
      );
      break;
    case 'empty':
      body = <NothingToPlay issues={content?.issues ?? []} />;
      break;
    case 'firstRun':
      body = <FirstRun update={update} onDone={home} />;
      break;
    case 'settings':
      body = content && pack && <SettingsScreen content={content} pack={pack} settings={settings} update={update} onBack={home} />;
      break;
    case 'report':
      body = <ReportScreen packs={content?.packs ?? []} onBack={home} />;
      break;
    case 'privacy':
      body = <PrivacyScreen onBack={home} />;
      break;
    case 'about':
      body = <AboutScreen onBack={home} />;
      break;
    case 'start':
      body = pack && (
        <StartFlow
          pack={pack}
          itemKeys={enabledItemKeys(pack, settings)}
          languages={spokenLanguages(settings.language)}
          step={startStep}
          onStep={setStartStep}
          onGo={() => {
            soundChecked.current = true;
            launch(startKind);
          }}
          onLockNoteDone={() => {
            local.set(LOCK_NOTE_KEY, '1');
            void startKid(startKind);
          }}
          onCancel={home}
        />
      );
      break;
    case 'kid': {
      const kidPack = content?.packs.find((p) => p.id === kid?.config.packId);
      body = kid && kidPack && (
        <KidMode
          pack={kidPack}
          config={kid.config}
          snapshot={kid.snapshot}
          telemetryEnabled={settings.telemetryEnabled}
          onExit={() => {
            setKid(null);
            unlockedUntil.current = Date.now() + PARENT_UNLOCK_MS;
            setScreen('home');
          }}
        />
      );
      break;
    }
    default:
      body = pack && (
        <Home
          pack={pack}
          settings={settings}
          showParentsGroup={PARENTS_GROUP_URL !== ''}
          nudge={nudge}
          onStart={() => begin('game')}
          onExplore={() => begin('explore')}
          onOpen={open}
          onNudgeAccept={(to) =>
            requireParent(() => {
              update({ choiceCount: to });
              setNudge(null);
            })
          }
          onNudgeDismiss={(next) => {
            local.setJson(NUDGE_DISMISSED_KEY, { level: next.from, games: next.gamesAtLevel });
            setNudge(null);
          }}
        />
      );
  }

  return (
    <>
      {body}
      {gate && (
        <ParentGate
          onSuccess={() => {
            unlockedUntil.current = Date.now() + PARENT_UNLOCK_MS;
            setGate(null);
            gate.run();
          }}
          onCancel={() => setGate(null)}
        />
      )}
    </>
  );
}

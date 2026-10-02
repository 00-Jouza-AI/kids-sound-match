import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from './audio/audioEngine';
import { placeholderPictureUsable } from './content/emojiSupport';
import { loadContent } from './content/loader';
import { buildMixedPack } from './content/mixed';
import type { ChoiceCount, MemoryPairs } from './engine';
import { buildOddPack } from './content/odd';
import { MIN_SCENE_THINGS, SCENES, sceneCandidates, sceneCapacity, type SceneDef } from './content/scenes';
import type { ArGender, LoadedContent, LoadedFeedback, LoadedPack } from './content/types';
import { MIN_ITEMS_PER_PACK } from './content/validate';
import { cloud } from './custom/cloud';
import { applyOverrides, overrideMap } from './custom/overrides';
import { customStore } from './custom/store';
import { customToLoaded } from './custom/toLoaded';
import type { AssetOverride, CustomItem, CustomPack } from './custom/types';
import { I18nProvider, useI18n } from './i18n/I18n';
import { enterFullscreen } from './lock/fullscreen';
import { ParentGate } from './lock/ParentGate';
import { loadPinRecord } from './lock/pin';
import { reportStore } from './report/db';
import { memoryReady, oddLevel, type MemoryNext, type OddLevel } from './report/levels';
import { practiceWeights, readyForMore, type NextLevel } from './report/practice';
import {
  forProfile,
  loadProfiles,
  newProfile,
  profileKey,
  saveProfiles,
  type Profile,
  type ProfileState,
} from './settings/profiles';
import { forgetReplays } from './settings/replays';
import { forgetStickers } from './settings/stickers';
import { forgetWordMarks } from './settings/words';
import {
  effectiveMode,
  enabledItemKeys,
  forgetSettings,
  loadSettings,
  saveSettings,
  spokenLanguages,
  uiLanguage,
  type Settings,
} from './settings/settings';
import { local } from './settings/storage';
import { telemetry } from './telemetry/telemetry';
import { KidMode } from './ui/kid/KidMode';
import { pointItems } from './ui/kid/KidPoint';
import { clearKidSnapshot, loadKidSnapshot, type KidConfig, type KidKind, type KidSnapshot } from './ui/kid/kidSnapshot';
import { FirstRun } from './ui/parent/FirstRun';
import { Flashcards } from './ui/parent/Flashcards';
import { Home, type HomeLink } from './ui/parent/Home';
import { AboutScreen, ContentProblems, PrivacyScreen } from './ui/parent/InfoScreens';
import { MyPacks } from './ui/parent/MyPacks';
import { Personalize } from './ui/parent/Personalize';
import { ReportScreen } from './ui/parent/ReportScreen';
import { SettingsScreen } from './ui/parent/SettingsScreen';
import { StartFlow, type StartStep } from './ui/parent/StartFlow';
import { Overlay } from './ui/parent/components';
import { Studio } from './ui/parent/Studio';
import { WordsScreen } from './ui/parent/WordsScreen';

type Screen =
  | 'loading'
  | 'problems'
  | 'firstRun'
  | 'home'
  | 'settings'
  | 'report'
  | 'privacy'
  | 'about'
  | 'myPacks'
  | 'personalize'
  | 'studio'
  | 'flashcards'
  | 'words'
  | 'start'
  | 'kid';

/** After a correct PIN, the parent area stays open briefly so Settings -> Report doesn't ask twice. */
const PARENT_UNLOCK_MS = 2 * 60 * 1000;
const LOCK_NOTE_KEY = 'ksm.lockNoteShown.v1';
/** "Not now" on the Ready-for-more card: the level, and how many games had been played at it. */
const NUDGE_DISMISSED_KEY = 'ksm.nudgeDismissed.v1';
/** After "Not now", the suggestion comes back only after this many more games at that level. */
const NUDGE_AGAIN_AFTER_GAMES = 3;
/** "Not now" on the memory suggestion: the pairs, and how many games had been played with them. */
const MEMORY_NUDGE_DISMISSED_KEY = 'ksm.memoryNudgeDismissed.v1';
/** Find it in the picture: the scene played last, so the next game shows the other one. */
const LAST_SCENE_KEY = 'ksm.lastScene.v1';
/** Where's your nose? needs at least this many body parts it can ask about. */
const MIN_POINT_ITEMS = 3;
const PARENTS_GROUP_URL = (import.meta.env.VITE_PARENTS_GROUP_URL ?? '').trim();
const NO_FEEDBACK: LoadedFeedback = { correct: { en: [], ar: [] }, incorrectTone: null, sessionEnd: { en: null, ar: null } };

/** Everything the parent made on this phone: their packs, and their voice and photos in ours. */
interface CustomData {
  packs: CustomPack[];
  items: CustomItem[];
  overrides: AssetOverride[];
}

const NO_CUSTOM: CustomData = { packs: [], items: [], overrides: [] };

async function readCustom(): Promise<CustomData> {
  const [packs, items, overrides] = await Promise.all([customStore.packs(), customStore.items(), customStore.overrides()]);
  return { packs, items, overrides };
}

/**
 * The packs the app shows, in order: the built-in packs (with the parent's voice and photos swapped
 * in), the Mixed game, then the parent's own packs. Custom packs borrow the built-in praise.
 */
function composePacks(builtin: readonly LoadedPack[], custom: CustomData) {
  const voiced = applyOverrides(builtin, overrideMap(custom.overrides));
  const feedback = voiced[0]?.feedback ?? NO_FEEDBACK;
  const customViews = customToLoaded(custom.packs, custom.items, feedback);
  const own = customViews.map((v) => v.loaded);
  const mixed = buildMixedPack([...voiced, ...own], feedback);
  return { customViews, allPacks: [...voiced, ...(mixed ? [mixed] : []), ...own], oddPack: buildOddPack(voiced, feedback) };
}

/** What the parent screens can do with the children's profiles. */
export interface ProfileControls {
  state: ProfileState;
  /** Switch to another child: their settings, Report and practice. */
  select: (id: string) => void;
  /** A new child, selected straight away so the parent can set them up. */
  add: () => void;
  edit: (profile: Profile) => void;
  /** Also deletes that child's results on this phone. */
  remove: (id: string) => Promise<void>;
}

export function App() {
  const [profiles, setProfiles] = useState<ProfileState>(loadProfiles);
  // Read by `update`, which never changes, so it always saves to the child on screen.
  const activeRef = useRef(profiles.activeId);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(profiles.activeId));
  const lang = uiLanguage(settings);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next, activeRef.current);
      return next;
    });
    if (patch.telemetryEnabled === false) telemetry.discard();
  }, []);

  const change = useCallback((next: ProfileState) => {
    saveProfiles(next);
    setProfiles(next);
    if (next.activeId !== activeRef.current) {
      activeRef.current = next.activeId;
      setSettings(loadSettings(next.activeId));
    }
  }, []);

  const controls: ProfileControls = {
    state: profiles,
    select: (id) => change({ ...profiles, activeId: id }),
    add: () => {
      const child = newProfile(profiles.profiles);
      change({ profiles: [...profiles.profiles, child], activeId: child.id });
    },
    edit: (profile) => change({ ...profiles, profiles: profiles.profiles.map((p) => (p.id === profile.id ? profile : p)) }),
    remove: async (id) => {
      const rest = profiles.profiles.filter((p) => p.id !== id);
      if (!rest.length) return;
      const games = forProfile(await reportStore.sessions(), id);
      await reportStore.deleteSessions(games.map((g) => g.id));
      forgetSettings(id);
      forgetReplays(id);
      forgetStickers(id);
      forgetWordMarks(id);
      local.remove(profileKey(NUDGE_DISMISSED_KEY, id));
      local.remove(profileKey(LAST_SCENE_KEY, id));
      change({ profiles: rest, activeId: profiles.activeId === id ? rest[0].id : profiles.activeId });
    },
  };

  return (
    <I18nProvider lang={lang}>
      <Shell settings={settings} update={update} profiles={controls} />
    </I18nProvider>
  );
}

function Shell({
  settings,
  update,
  profiles,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  profiles: ProfileControls;
}) {
  const profileId = profiles.state.activeId;
  const { t } = useI18n();
  const [builtin, setBuiltin] = useState<LoadedContent | null>(null);
  const [custom, setCustom] = useState<CustomData>(NO_CUSTOM);
  const [screen, setScreen] = useState<Screen>('loading');
  const [gate, setGate] = useState<{ run: () => void } | null>(null);
  const [kid, setKid] = useState<{ config: KidConfig; snapshot: KidSnapshot | null; pack: LoadedPack } | null>(null);
  const [startStep, setStartStep] = useState<StartStep>('soundCheck');
  const [startKind, setStartKind] = useState<KidKind>('game');
  // Where's your nose?: asking a parent once whether the child is a girl or a boy (Arabic grammar).
  const [askGender, setAskGender] = useState(false);
  const pendingGender = useRef<ArGender | null>(null);
  const [nudge, setNudge] = useState<NextLevel | null>(null);
  const [memoryNudge, setMemoryNudge] = useState<MemoryNext | null>(null);
  const unlockedUntil = useRef(0);
  const soundChecked = useRef(false);

  const { customViews, allPacks, oddPack } = useMemo(() => composePacks(builtin?.packs ?? [], custom), [builtin, custom]);
  // Packs with enough finished items to play.
  const playablePacks = useMemo(() => allPacks.filter((p) => p.items.length >= MIN_ITEMS_PER_PACK), [allPacks]);
  const content: LoadedContent = { packs: playablePacks, issues: builtin?.issues ?? [] };
  const pack = playablePacks.find((p) => p.id === settings.packId) ?? playablePacks[0];
  const profile = profiles.state.profiles.find((p) => p.id === profileId);
  const languages = spokenLanguages(settings.language);

  /** Find it in the picture: the things a scene may show, with this child's pictures and sound setting. */
  const sceneKeys = (scene: SceneDef): string[] =>
    scene.packs.flatMap((id) => {
      const p = allPacks.find((x) => x.id === id);
      if (!p) return [];
      const enabled = new Set(enabledItemKeys(p, settings));
      // "Sound only" can't ask for things that make no sound.
      return p.items.filter((i) => enabled.has(i.key) && (settings.mode !== 'SOUND_ONLY' || i.sound)).map((i) => i.key);
    });
  const playableScenes = SCENES.filter((s) => {
    const keys = new Set(sceneKeys(s));
    return sceneCapacity(s, sceneCandidates(s, allPacks, (_, i) => keys.has(i.key))) >= MIN_SCENE_THINGS;
  });
  const bodyPack = allPacks.find((p) => p.id === 'body');
  const canPoint = pointItems(bodyPack, languages, profile?.arGender ?? 'f').length >= MIN_POINT_ITEMS;

  const refreshCustom = useCallback(async () => {
    try {
      setCustom(await readCustom());
    } catch (e) {
      console.warn('[custom] could not read my packs', e);
    }
  }, []);

  /** Settings, Report, My packs, outside links and difficulty changes sit behind the parent gate (spec 6.2). */
  const requireParent = (run: () => void) => {
    if (Date.now() < unlockedUntil.current) run();
    else setGate({ run });
  };

  const afterLoad = (packs: readonly LoadedPack[]) => {
    if (!loadPinRecord()) {
      setScreen('firstRun');
      return;
    }
    // A reload during a game returns to that game (the web's version of process death).
    const snap = loadKidSnapshot();
    const snapPack = snap && packs.find((p) => p.id === snap.config.packId);
    if (snap && snapPack) {
      setKid({ config: snap.config, snapshot: snap, pack: snapPack });
      setScreen('kid');
      return;
    }
    if (snap) clearKidSnapshot();
    setScreen('home');
    // Back from Google's sign-in page: reopen My packs (after the PIN, as always).
    if (cloud.takeReturnToMyPacks()) requireParent(() => setScreen('myPacks'));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded: LoadedContent;
      try {
        loaded = await loadContent({
          baseUrl: import.meta.env.BASE_URL,
          allowPlaceholders: __ALLOW_PLACEHOLDERS__,
          placeholderPictureUsable,
        });
      } catch (e) {
        loaded = { packs: [], issues: [{ packId: '?', message: String(e), level: 'error' }] };
      }
      if (cancelled) return;
      let own = NO_CUSTOM;
      try {
        own = await readCustom();
      } catch (e) {
        console.warn('[custom] could not read my packs', e);
      }
      if (cancelled) return;
      setBuiltin(loaded);
      setCustom(own);
      if (loaded.issues.length) console.warn('[content]', loaded.issues);
      // Spec 3.4: fail loudly in development; in release, skip broken items and carry on.
      if (import.meta.env.DEV && loaded.issues.some((i) => i.level === 'error')) setScreen('problems');
      else {
        const composed = composePacks(loaded.packs, own);
        // A reload during Odd one out finds its game too.
        afterLoad([...composed.allPacks.filter((p) => p.items.length >= MIN_ITEMS_PER_PACK), ...(composed.oddPack ? [composed.oddPack] : [])]);
      }
      // Only contacts the cloud if a parent signed in before, or is coming back from Google.
      void cloud.init(() => void refreshCustom());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        const next = readyForMore(forProfile(sessions, profileId), questions, settings.choiceCount);
        const dismissed = local.getJson<{ level: number; games: number }>(profileKey(NUDGE_DISMISSED_KEY, profileId));
        const snoozed =
          next && dismissed?.level === next.from && next.gamesAtLevel < dismissed.games + NUDGE_AGAIN_AFTER_GAMES;
        setNudge(next && !snoozed ? next : null);
        const memory = memoryReady(forProfile(sessions, profileId), settings.memoryPairs);
        const memoryDismissed = local.getJson<{ level: number; games: number }>(profileKey(MEMORY_NUDGE_DISMISSED_KEY, profileId));
        const memorySnoozed =
          memory && memoryDismissed?.level === memory.from && memory.gamesAtLevel < memoryDismissed.games + NUDGE_AGAIN_AFTER_GAMES;
        setMemoryNudge(memory && !memorySnoozed ? memory : null);
      })
      .catch(() => {
        setNudge(null);
        setMemoryNudge(null);
      });
    return () => {
      cancelled = true;
    };
  }, [screen, settings.choiceCount, settings.memoryPairs, profileId]);

  const open = (link: HomeLink) => {
    if (link === 'about') setScreen('about');
    else if (link === 'parentsGroup') requireParent(() => window.open(PARENTS_GROUP_URL, '_blank', 'noopener,noreferrer'));
    else requireParent(() => setScreen(link));
  };

  /** The other scene than last time, when both can be played. */
  const pickScene = (): SceneDef | undefined => {
    if (!playableScenes.length) return undefined;
    const last = local.get(profileKey(LAST_SCENE_KEY, profileId));
    const fresh = playableScenes.filter((s) => s.id !== last);
    const from = fresh.length ? fresh : playableScenes;
    const scene = from[Math.floor(Math.random() * from.length)];
    local.set(profileKey(LAST_SCENE_KEY, profileId), scene.id);
    return scene;
  };

  const startKid = async (kind: KidKind) => {
    const scene = kind === 'scene' ? pickScene() : undefined;
    const arGender = pendingGender.current ?? profile?.arGender ?? 'f';
    pendingGender.current = null;
    // Odd one out plays with every pack of things, a scene with its own packs, Where's your nose?
    // with the body parts; the other games with the chosen pack.
    const gamePack =
      kind === 'odd'
        ? oddPack
        : kind === 'scene'
          ? scene?.packs.map((id) => allPacks.find((p) => p.id === id)).find((p) => p !== undefined)
          : kind === 'point'
            ? bodyPack
            : pack;
    if (!gamePack) return;
    // Toddler mode is for the matching game: the others have a right answer even for the youngest.
    const toddlerMode = settings.toddlerMode && kind === 'game' && gamePack.kind !== 'association';
    let weights: Record<string, number> = {};
    let level: OddLevel = 'easy';
    try {
      const sessions = forProfile(await reportStore.sessions(), profileId);
      // Adaptive practice: weights come from the Report on this device when the game starts.
      if (kind === 'game' && settings.adaptive && !toddlerMode) {
        const packIds = gamePack.parts ? gamePack.parts.map((p) => p.id) : [gamePack.id];
        weights = practiceWeights(sessions, await reportStore.questions(), packIds);
      }
      if (kind === 'odd') level = oddLevel(sessions, await reportStore.questions());
    } catch {
      // No history available: every animal equally often, and an easy Odd one out.
    }
    unlockedUntil.current = 0;
    setKid({
      pack: gamePack,
      config: {
        kind,
        profileId,
        packId: gamePack.id,
        itemKeys:
          kind === 'odd'
            ? gamePack.items.map((i) => i.key)
            : kind === 'scene' && scene
              ? sceneKeys(scene)
              : kind === 'point'
                ? pointItems(gamePack, languages, arGender).map((i) => i.key)
                : enabledItemKeys(gamePack, settings),
        // Odd one out always shows at least three: two alike and the different one.
        choiceCount: kind === 'odd' ? (Math.max(3, settings.choiceCount) as ChoiceCount) : settings.choiceCount,
        questionsPerSession: settings.questionsPerSession,
        memoryPairs: settings.memoryPairs,
        oddLevel: level,
        toddlerMode,
        // Packs without sounds (Food, Colours...) are played by name whatever the setting says. A scene
        // mixes packs, so it keeps the setting (things without a sound are asked for by name).
        mode: kind === 'scene' ? settings.mode : effectiveMode(gamePack, settings.mode),
        ...(scene ? { sceneId: scene.id } : {}),
        ...(kind === 'point' ? { arGender } : {}),
        language: settings.language,
        repeatIntervalSec: settings.repeatIntervalSec,
        hints: settings.hints,
        replaysPerDay: settings.replaysPerDay,
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

  const onCustomChanged = async () => {
    await refreshCustom();
    cloud.scheduleSync();
  };

  const home = () => setScreen('home');
  const playableCount = pack ? enabledItemKeys(pack, settings).length : 0;
  let body;
  switch (screen) {
    case 'loading':
      body = <div className="parent center-screen">{t('loading')}</div>;
      break;
    case 'problems':
      body = (
        <ContentProblems
          issues={content.issues}
          canContinue={playablePacks.length > 0}
          onContinue={() => afterLoad(playablePacks)}
        />
      );
      break;
    case 'firstRun':
      body = <FirstRun update={update} onDone={home} />;
      break;
    case 'settings':
      body = pack ? (
        <SettingsScreen content={content} pack={pack} settings={settings} update={update} profiles={profiles} onBack={home} />
      ) : null;
      break;
    case 'report':
      body = <ReportScreen packs={allPacks} profiles={profiles.state} onBack={home} onWords={() => setScreen('words')} />;
      break;
    case 'privacy':
      body = <PrivacyScreen onBack={home} />;
      break;
    case 'about':
      body = <AboutScreen onBack={home} />;
      break;
    case 'myPacks':
      body = (
        <MyPacks
          views={customViews}
          onBack={home}
          onPersonalize={() => setScreen('personalize')}
          onChanged={onCustomChanged}
        />
      );
      break;
    case 'personalize':
      body = (
        <Personalize
          packs={builtin?.packs ?? []}
          overrides={custom.overrides}
          onChanged={onCustomChanged}
          onBack={() => setScreen('myPacks')}
        />
      );
      break;
    case 'studio':
      body = <Studio packs={builtin?.packs ?? []} onBack={home} />;
      break;
    case 'flashcards':
      body = <Flashcards packs={playablePacks.filter((p) => !p.parts)} initialPackId={pack?.id} onBack={home} />;
      break;
    case 'words':
      body = <WordsScreen packs={allPacks} profiles={profiles.state} onBack={home} />;
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
    case 'kid':
      body = kid && (
        <KidMode
          pack={kid.pack}
          packs={allPacks}
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
    default:
      body = (
        <Home
          pack={pack}
          settings={settings}
          canStart={playableCount >= MIN_ITEMS_PER_PACK}
          // Explore is for hearing things; "Who eats what?" is only a question game.
          canExplore={playableCount > 0 && pack?.kind !== 'association'}
          showParentsGroup={PARENTS_GROUP_URL !== ''}
          profiles={profiles.state}
          onProfile={profiles.select}
          nudge={nudge}
          onStart={() => begin('game')}
          onExplore={() => begin('explore')}
          onMemory={() => begin('memory')}
          onOdd={() => begin('odd')}
          canOdd={oddPack !== null}
          onPeekaboo={() => begin('peekaboo')}
          onScene={() => begin('scene')}
          canScene={playableScenes.length > 0}
          onPoint={() => {
            // Arabic needs to know: "أين أنفُكِ؟" for a girl, "أين أنفُكَ؟" for a boy.
            if (languages.includes('ar') && !profile?.arGender) setAskGender(true);
            else begin('point');
          }}
          canPoint={canPoint}
          memoryNudge={memoryNudge}
          onMemoryNudgeAccept={(to) =>
            requireParent(() => {
              update({ memoryPairs: to as MemoryPairs });
              setMemoryNudge(null);
            })
          }
          onMemoryNudgeDismiss={(next) => {
            local.setJson(profileKey(MEMORY_NUDGE_DISMISSED_KEY, profileId), { level: next.from, games: next.gamesAtLevel });
            setMemoryNudge(null);
          }}
          onOpen={open}
          onNudgeAccept={(to) =>
            requireParent(() => {
              update({ choiceCount: to });
              setNudge(null);
            })
          }
          onNudgeDismiss={(next) => {
            local.setJson(profileKey(NUDGE_DISMISSED_KEY, profileId), { level: next.from, games: next.gamesAtLevel });
            setNudge(null);
          }}
        />
      );
  }

  return (
    <>
      {body}
      {askGender && profile && (
        <Overlay label={t('genderTitle')} onDismiss={() => setAskGender(false)}>
          <h2>{t('genderTitle')}</h2>
          <p>{t('genderBody')}</p>
          <div className="gender-pick">
            {(['f', 'm'] as const).map((g) => (
              <button
                type="button"
                key={g}
                className="btn wide big"
                onClick={() => {
                  profiles.edit({ ...profile, arGender: g });
                  pendingGender.current = g;
                  setAskGender(false);
                  begin('point');
                }}
              >
                {g === 'f' ? `👧 ${t('girl')}` : `👦 ${t('boy')}`}
              </button>
            ))}
          </div>
          <p className="hint">{t('genderPrivacy')}</p>
        </Overlay>
      )}
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

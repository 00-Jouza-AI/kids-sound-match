import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import type { LoadedPack } from '../../content/types';
import { decodeToMono, MAX_RECORDING_SEC, type MonoAudio } from '../../custom/audioTools';
import { recordingProblem, startRecording, type ActiveRecording } from '../../custom/recorder';
import { useI18n } from '../../i18n/I18n';
import { choosePictures } from '../kid/layout';
import { Row, Screen, Segmented, Toggle } from './components';
import { Trimmer } from './SoundEditor';
import { LINES, studioClips, studioSavePath, type StudioClip } from './studioClips';

type Phase = { kind: 'ready' } | { kind: 'recording'; since: number } | { kind: 'review'; audio: MonoAudio } | { kind: 'saving' };

/** Above this the microphone hears a voice; below the quiet level for a moment, the word is over. */
const VOICE_LEVEL = 0.18;
const QUIET_LEVEL = 0.06;
const QUIET_MS = 750;

/**
 * The recording studio (development only, on this PC): every name, sound and line the app still
 * plays with a stand-in voice, one after another. Record (Space), check the trim, save (Enter): the
 * clip is written straight into the app's files with the right name, and the next one comes up.
 */
export function Studio({ packs, onBack }: { packs: readonly LoadedPack[]; onBack: () => void }) {
  const { t, lang } = useI18n();
  const clips = useMemo(() => studioClips(packs), [packs]);
  const [packId, setPackId] = useState('all');
  const [kind, setKind] = useState<StudioClip['kind']>('ar');
  const [showDone, setShowDone] = useState(false);
  const [autoStop, setAutoStop] = useState(true);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [position, setPosition] = useState(0);

  const done = (c: StudioClip) => c.real || saved.has(c.path);
  const inFilter = clips.filter((c) => (packId === 'all' || c.packId === packId) && c.kind === kind);
  const list = showDone ? inFilter : inFilter.filter((c) => !done(c));
  const at = Math.min(position, Math.max(0, list.length - 1));
  const current = list[at] ?? null;

  const choose = (patch: () => void) => {
    patch();
    setPosition(0);
  };

  const save = async (clip: StudioClip, wav: Blob) => {
    const res = await fetch(`/__studio/save?path=${encodeURIComponent(studioSavePath(clip.path))}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav,
    });
    if (!res.ok) throw new Error(await res.text());
    setSaved((s) => new Set(s).add(clip.path));
    // A saved clip leaves the "still to record" list, so the next one takes its place.
    if (showDone) setPosition(at + 1);
  };

  return (
    <Screen title={t('studio')} onBack={onBack}>
      <p className="hint">{t('studioIntro')}</p>
      <div className="chips">
        {[{ id: 'all', name: t('presetAll') }, ...packs.map((p) => ({ id: p.id, name: p.name[lang] })), { id: LINES, name: t('gameLines') }].map(
          (c) => (
            <button
              type="button"
              key={c.id}
              className={packId === c.id ? 'chip on' : 'chip'}
              onClick={() => choose(() => setPackId(c.id))}
            >
              {c.name}
            </button>
          ),
        )}
      </div>
      <section className="card">
        <Segmented
          label={t('studio')}
          value={kind}
          options={[
            { value: 'ar', label: t('langArabic') },
            { value: 'en', label: t('langEnglish') },
            { value: 'sound', label: t('studioSounds') },
          ]}
          onChange={(k) => choose(() => setKind(k))}
        />
        <Row label={t('studioShowDone')}>
          <Toggle label={t('studioShowDone')} checked={showDone} onChange={(v) => choose(() => setShowDone(v))} />
        </Row>
        <Row label={t('studioAutoStop')}>
          <Toggle label={t('studioAutoStop')} checked={autoStop} onChange={setAutoStop} />
        </Row>
        <p className="muted">{t('studioProgress', { n: inFilter.filter(done).length, m: inFilter.length })}</p>
      </section>

      {current ? (
        <Take
          key={`${current.path}:${saved.has(current.path)}`}
          clip={current}
          number={at + 1}
          total={list.length}
          recorded={done(current)}
          autoStop={autoStop}
          onSave={(wav) => save(current, wav)}
          onPrev={() => setPosition(Math.max(0, at - 1))}
          onNext={() => setPosition(Math.min(list.length - 1, at + 1))}
        />
      ) : (
        <p className="empty">{t('studioAllDone')}</p>
      )}
      <p className="hint">{t('studioKeys')}</p>
    </Screen>
  );
}

function Take({
  clip,
  number,
  total,
  recorded,
  autoStop,
  onSave,
  onPrev,
  onNext,
}: {
  clip: StudioClip;
  number: number;
  total: number;
  recorded: boolean;
  autoStop: boolean;
  onSave: (wav: Blob) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [problem, setProblem] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const recording = useRef<ActiveRecording | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const picture = clip.item ? choosePictures([clip.item], () => 0)[clip.item.key] : null;

  const open = async (blob: Blob) => {
    try {
      setPhase({ kind: 'review', audio: await decodeToMono(blob) });
      setProblem(null);
    } catch {
      setProblem(t('audioUnreadable'));
      setPhase({ kind: 'ready' });
    }
  };

  const record = async () => {
    audioEngine.stopAll();
    const found = recordingProblem();
    if (found) {
      setProblem(t(found === 'insecure' ? 'micNeedsSecure' : found === 'unsupported' ? 'micUnsupported' : 'micBlocked'));
      return;
    }
    try {
      recording.current = await startRecording();
      setProblem(null);
      setPhase({ kind: 'recording', since: performance.now() });
    } catch {
      setProblem(t('micBlocked'));
    }
  };

  const stop = async () => {
    const active = recording.current;
    recording.current = null;
    if (active) await open(await active.stop());
  };

  const use = async (wav: Blob) => {
    setPhase({ kind: 'saving' });
    try {
      await onSave(wav);
    } catch (e) {
      console.warn('[studio] save failed', e);
      setProblem(t('studioSaveFailed'));
      setPhase({ kind: 'ready' });
    }
  };

  // Live meter; stops by itself after the word, or at the time limit.
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    let heard = false;
    let quietSince = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      const l = recording.current?.level() ?? 0;
      setLevel(l);
      if (l > VOICE_LEVEL) {
        heard = true;
        quietSince = 0;
      } else if (heard && l < QUIET_LEVEL) {
        quietSince ||= now;
        if (autoStop && now - quietSince > QUIET_MS) void stop();
      } else {
        quietSince = 0;
      }
      if ((now - phase.since) / 1000 >= MAX_RECORDING_SEC) void stop();
    }, 50);
    return () => window.clearInterval(id);
  }, [phase, autoStop]);

  // Space records and stops; the arrows move between clips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (phase.kind === 'ready') void record();
        else if (phase.kind === 'recording') void stop();
      } else if (phase.kind !== 'recording' && phase.kind !== 'saving') {
        if (e.key === 'ArrowRight') onNext();
        else if (e.key === 'ArrowLeft') onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onNext, onPrev]);

  useEffect(() => () => recording.current?.cancel(), []);

  const kindLabel = { ar: t('langArabic'), en: t('langEnglish'), sound: t('studioSounds') }[clip.kind];
  return (
    <section className="card studio-take">
      <div className="studio-head">
        {picture && <img src={picture} alt="" />}
        <div className="studio-words">
          <span className="muted">
            {kindLabel} · {number} / {total}
            {recorded ? ` · ✓ ${t('recorded')}` : ''}
          </span>
          <p className="studio-say" dir={clip.kind === 'ar' ? 'rtl' : 'ltr'} lang={clip.kind === 'ar' ? 'ar' : 'en'}>
            {clip.kind === 'sound' ? t('studioSoundOf', { name: clip.say }) : clip.say}
          </p>
          <code className="studio-path" dir="ltr">
            {studioSavePath(clip.path)}
          </code>
        </div>
      </div>

      {phase.kind === 'ready' && (
        <div className="sound-ready">
          <button type="button" className="record-btn" onClick={() => void record()}>
            <span className="rec-dot" aria-hidden="true" />
            {t('record')}
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            📁 {t('chooseAudioFile')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void open(file);
            }}
          />
        </div>
      )}
      {phase.kind === 'recording' && (
        <div className="sound-recording">
          <p>{t('recordingNow')}</p>
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <button type="button" className="record-btn stop" onClick={() => void stop()}>
            <span className="stop-square" aria-hidden="true" />
            {t('stop')}
          </button>
        </div>
      )}
      {phase.kind === 'review' && (
        <Trimmer
          audio={phase.audio}
          keyboard
          useLabel={t('studioSave')}
          onRetry={() => setPhase({ kind: 'ready' })}
          onUse={(wav) => void use(wav)}
        />
      )}
      {phase.kind === 'saving' && <p className="hint">{t('studioSaving')}</p>}
      {problem && (
        <p className="msg error" role="alert">
          {problem}
        </p>
      )}
      <div className="nudge-actions">
        <button type="button" className="btn ghost" onClick={onPrev} disabled={phase.kind === 'recording'}>
          ← {t('studioPrev')}
        </button>
        <button type="button" className="btn ghost" onClick={onNext} disabled={phase.kind === 'recording'}>
          {t('studioSkip')} →
        </button>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { clipToWav, decodeToMono, MAX_RECORDING_SEC, suggestTrim, waveformPeaks, type MonoAudio } from '../../custom/audioTools';
import { recordingProblem, startRecording, type ActiveRecording, type RecorderProblem } from '../../custom/recorder';
import { blobUrl } from '../../custom/toLoaded';
import { useI18n } from '../../i18n/I18n';
import type { StringKey } from '../../i18n/strings';
import { Overlay } from './components';

const BARS = 90;
const MIN_LENGTH_SEC = 0.15;

type Phase = { kind: 'ready' } | { kind: 'recording'; since: number } | { kind: 'trim'; audio: MonoAudio };

const PROBLEM_TEXT: Record<RecorderProblem, StringKey> = {
  insecure: 'micNeedsSecure',
  unsupported: 'micUnsupported',
  blocked: 'micBlocked',
  failed: 'micBlocked',
};

/**
 * Record (or choose a file), then cut it: drag the two handles so only the word or sound is left,
 * and play the selection to check. Saves a short WAV.
 */
export function SoundEditor({
  title,
  existing,
  onUse,
  onClose,
}: {
  title: string;
  existing: Blob | null;
  onUse: (clip: Blob) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [problem, setProblem] = useState<RecorderProblem | 'unreadable' | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const recording = useRef<ActiveRecording | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openAudio = async (blob: Blob) => {
    try {
      setPhase({ kind: 'trim', audio: await decodeToMono(blob) });
      setProblem(null);
    } catch {
      setProblem('unreadable');
      setPhase({ kind: 'ready' });
    }
  };

  // Re-trim an existing recording straight away.
  useEffect(() => {
    if (existing) void openAudio(existing);
    return () => recording.current?.cancel();
  }, []);

  // Live meter and the automatic stop.
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const id = window.setInterval(() => {
      setLevel(recording.current?.level() ?? 0);
      const secs = (performance.now() - phase.since) / 1000;
      setElapsed(secs);
      if (secs >= MAX_RECORDING_SEC) void stop();
    }, 80);
    return () => window.clearInterval(id);
  }, [phase]);

  const record = async () => {
    audioEngine.stopAll();
    const found = recordingProblem();
    if (found) {
      setProblem(found);
      return;
    }
    try {
      recording.current = await startRecording();
      setProblem(null);
      setPhase({ kind: 'recording', since: performance.now() });
    } catch (e) {
      setProblem((e as { problem?: RecorderProblem }).problem ?? 'failed');
    }
  };

  const stop = async () => {
    const active = recording.current;
    recording.current = null;
    if (active) await openAudio(await active.stop());
  };

  return (
    <Overlay label={title} onDismiss={onClose}>
      <h2>{title}</h2>
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
              if (file) void openAudio(file);
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
          <p className="hint">
            {elapsed.toFixed(1)} / {MAX_RECORDING_SEC} s
          </p>
          <button type="button" className="record-btn stop" onClick={() => void stop()}>
            <span className="stop-square" aria-hidden="true" />
            {t('stop')}
          </button>
        </div>
      )}
      {phase.kind === 'trim' && (
        <Trimmer
          audio={phase.audio}
          onRetry={() => setPhase({ kind: 'ready' })}
          onUse={onUse}
        />
      )}
      {problem && (
        <p className="msg error" role="alert">
          {t(problem === 'unreadable' ? 'audioUnreadable' : PROBLEM_TEXT[problem])}
        </p>
      )}
      <div className="pin-footer">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </Overlay>
  );
}

function Trimmer({ audio, onRetry, onUse }: { audio: MonoAudio; onRetry: () => void; onUse: (clip: Blob) => void }) {
  const { t } = useI18n();
  const duration = audio.samples.length / audio.sampleRate;
  const peaks = useMemo(() => waveformPeaks(audio.samples, BARS), [audio]);
  const tallest = Math.max(0.05, ...peaks);
  const [range, setRange] = useState(() => suggestTrim(audio));
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<'start' | 'end' | null>(null);

  const timeAt = (clientX: number) => {
    const box = track.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - box.left) / box.width) * duration));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const at = timeAt(e.clientX);
    setRange((r) =>
      dragging.current === 'start'
        ? { ...r, start: Math.min(at, r.end - MIN_LENGTH_SEC) }
        : { ...r, end: Math.max(at, r.start + MIN_LENGTH_SEC) },
    );
  };
  const grab = (which: 'start' | 'end') => (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    track.current!.setPointerCapture(e.pointerId);
    dragging.current = which;
  };

  const play = () => {
    audioEngine.unlock();
    audioEngine.stopAll();
    const clip = clipToWav(audio, range.start, range.end);
    void audioEngine.play({ kind: 'file', url: blobUrl(clip), category: 'name', label: 'trim-preview' }, () => false);
  };

  const pct = (s: number) => `${(s / duration) * 100}%`;
  return (
    <div className="trimmer">
      <p className="hint">{t('trimHint')}</p>
      <div
        className="wave"
        ref={track}
        onPointerMove={move}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      >
        {peaks.map((p, i) => (
          <i key={i} style={{ height: `${Math.max(4, (p / tallest) * 100)}%` }} />
        ))}
        <span className="shade" style={{ left: 0, width: pct(range.start) }} />
        <span className="shade" style={{ left: pct(range.end), right: 0 }} />
        <div className="handle" style={{ left: pct(range.start) }} onPointerDown={grab('start')} role="slider" aria-valuenow={range.start} />
        <div className="handle" style={{ left: pct(range.end) }} onPointerDown={grab('end')} role="slider" aria-valuenow={range.end} />
      </div>
      <p className="hint trim-times" dir="ltr">
        {range.start.toFixed(2)} s → {range.end.toFixed(2)} s ({(range.end - range.start).toFixed(2)} s)
      </p>
      <div className="stack">
        <button type="button" className="btn" onClick={play}>
          ▶ {t('play')}
        </button>
        <button type="button" className="btn primary" onClick={() => onUse(clipToWav(audio, range.start, range.end))}>
          {t('useRecording')}
        </button>
        <button type="button" className="btn ghost" onClick={onRetry}>
          {t('recordAgain')}
        </button>
      </div>
    </div>
  );
}

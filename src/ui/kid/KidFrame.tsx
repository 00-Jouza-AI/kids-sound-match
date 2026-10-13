import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { useI18n } from '../../i18n/I18n';
import { enterFullscreen, exitFullscreen, isFullscreen } from '../../lock/fullscreen';
import { GateButton } from '../../lock/GateButton';
import { engageKidLock } from '../../lock/kidLock';
import { loadLockPrefs } from '../../lock/lockPrefs';
import { ParentGate } from '../../lock/ParentGate';
import { PictureGate } from '../../lock/PicturePad';
import { PlayIcon } from './icons';
import { onQuestionDone, REST_GRACE_MS, useSitting } from './sitting';

/** Screens with no question in progress: a rest that is due starts straight away. */
const BETWEEN_QUESTIONS = new Set(['idle', 'paused', 'explore']);

/**
 * What every Kid Mode screen shares (spec 6): the device lock, the parent's low-contrast corner
 * circle (3-second hold), the PIN gate, and the play-time timer's rest screen. Everything inside
 * is pictures, motion and sound only.
 */
export function KidFrame({
  stage,
  left,
  onGateOpen,
  onGateCancel,
  onExit,
  children,
}: {
  stage: string;
  left?: ReactNode;
  onGateOpen: () => void;
  onGateCancel: () => void;
  onExit: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [gateOpen, setGateOpen] = useState(false);
  // How long to hold the corner, and whether leaving asks for the PIN or the 4 pictures (Settings).
  const [prefs] = useState(loadLockPrefs);
  const [usePin, setUsePin] = useState(false);
  const wantFullscreen = useRef(isFullscreen());

  // The play-time timer: once the time is up, the next pause between questions (or the end
  // screen) becomes the rest screen. It pauses the game like the gate does, and only the gate
  // (hold, then the PIN or the pictures) leads out of it.
  const { restAt, restClips } = useSitting();
  const [resting, setResting] = useState(false);
  const restingRef = useRef(false);
  const restDueRef = useRef(false);
  const latest = useRef({ stage, onGateOpen, restClips });
  latest.current = { stage, onGateOpen, restClips };
  const sayRest = () => {
    audioEngine.stopAll();
    void (async () => {
      for (const clip of latest.current.restClips) {
        if (!restingRef.current) return;
        await audioEngine.play(clip, () => !restingRef.current);
      }
    })();
  };
  const rest = () => {
    if (restingRef.current) return;
    restingRef.current = true;
    setResting(true);
    latest.current.onGateOpen();
    sayRest();
  };

  useEffect(() => {
    if (restAt === null) return;
    let grace: number | undefined;
    const due = window.setTimeout(
      () => {
        restDueRef.current = true;
        if (BETWEEN_QUESTIONS.has(latest.current.stage)) rest();
        else grace = window.setTimeout(rest, REST_GRACE_MS);
      },
      Math.max(0, restAt - Date.now()),
    );
    const off = onQuestionDone(() => {
      if (restDueRef.current) rest();
    });
    return () => {
      window.clearTimeout(due);
      window.clearTimeout(grace);
      off();
    };
  }, [restAt]);

  useEffect(() => {
    if (restDueRef.current && BETWEEN_QUESTIONS.has(stage)) rest();
  }, [stage]);

  useEffect(() => engageKidLock(), []);

  useEffect(() => {
    const onChange = () => {
      if (isFullscreen()) wantFullscreen.current = true;
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /** Any tap is also a chance to get sound and fullscreen back if the system took them away. */
  const onAnyClick = () => {
    if (!audioEngine.running) audioEngine.unlock();
    if (wantFullscreen.current && !isFullscreen()) void enterFullscreen();
  };

  return (
    <div className={`kid stage-${stage}${resting ? ' resting' : ''}`} onClick={onAnyClick}>
      <div className="kid-top">
        {resting ? <span /> : (left ?? <span />)}
        <GateButton
          label={t('parentExit')}
          holdMs={prefs.holdSec * 1000}
          onUnlock={() => {
            setGateOpen(true);
            onGateOpen();
          }}
        />
      </div>
      {children}
      {resting && (
        <div className="rest-screen" role="img" aria-label={t('restTitle')} onPointerDown={sayRest}>
          <RestArt />
        </div>
      )}
      {gateOpen &&
        (prefs.exitLock === 'pictures' && !usePin ? (
          <PictureGate
            onSuccess={() => {
              void exitFullscreen();
              onExit();
            }}
            onCancel={() => {
              setGateOpen(false);
              // Resting: the game stays paused under the rest screen.
              if (!restingRef.current) onGateCancel();
            }}
            onUsePin={() => setUsePin(true)}
          />
        ) : (
          <ParentGate
            onSuccess={() => {
              void exitFullscreen();
              onExit();
            }}
            onCancel={() => {
              setGateOpen(false);
              setUsePin(false);
              if (!restingRef.current) onGateCancel();
            }}
          />
        ))}
    </div>
  );
}

/** Time to rest: a sleepy moon among the stars. Tapping it says "time to rest" again. */
function RestArt() {
  return (
    <svg className="rest-art" viewBox="0 0 400 400" aria-hidden="true">
      {[
        [70, 90, 10],
        [320, 70, 13],
        [350, 210, 9],
        [60, 260, 12],
        [140, 340, 8],
        [300, 330, 11],
      ].map(([x, y, r], i) => (
        <path
          key={i}
          className="rest-star"
          style={{ animationDelay: `${i * 0.4}s` }}
          d={`M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z`}
          fill="#FFE27A"
        />
      ))}
      <path d="M250 80 A120 120 0 1 0 290 300 A100 100 0 1 1 250 80 Z" fill="#FFE27A" stroke="#E0B640" strokeWidth="6" strokeLinejoin="round" />
      <path d="M150 190 q14 12 28 0" fill="none" stroke="#7A5A1E" strokeWidth="7" strokeLinecap="round" />
      <ellipse cx="146" cy="222" rx="13" ry="8" fill="#F59A92" opacity="0.6" />
      <path d="M168 250 q14 8 26 -2" fill="none" stroke="#7A5A1E" strokeWidth="6" strokeLinecap="round" />
      <g className="rest-z" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M262 150 h30 l-30 34 h30" />
        <path d="M306 104 h22 l-22 26 h22" opacity="0.8" />
      </g>
    </svg>
  );
}

/** After a reload: one big play button. A tap is needed before the browser allows sound again. */
export function PausedScreen({ label, onResume }: { label: string; onResume: () => void }) {
  return (
    <div className="kid-center">
      <button
        type="button"
        className="resume"
        aria-label={label}
        onClick={() => {
          audioEngine.unlock();
          void enterFullscreen();
          onResume();
        }}
      >
        <PlayIcon />
      </button>
    </div>
  );
}

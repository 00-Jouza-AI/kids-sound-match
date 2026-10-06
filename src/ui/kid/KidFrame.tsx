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

/**
 * What every Kid Mode screen shares (spec 6): the device lock, the parent's low-contrast corner
 * circle (3-second hold) and the PIN gate. Everything inside is pictures, motion and sound only.
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
    <div className={`kid stage-${stage}`} onClick={onAnyClick}>
      <div className="kid-top">
        {left ?? <span />}
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
      {gateOpen &&
        (prefs.exitLock === 'pictures' && !usePin ? (
          <PictureGate
            onSuccess={() => {
              void exitFullscreen();
              onExit();
            }}
            onCancel={() => {
              setGateOpen(false);
              onGateCancel();
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
              onGateCancel();
            }}
          />
        ))}
    </div>
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

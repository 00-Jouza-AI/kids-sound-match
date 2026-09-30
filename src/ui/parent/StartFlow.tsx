import { useEffect, useMemo, useRef } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { ClipResolver, type Clip } from '../../audio/clips';
import type { Lang, LoadedPack } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import { Screen } from './components';

export type StartStep = 'soundCheck' | 'noSound' | 'lockNote';

/**
 * Spec 5.4 on the web. Browsers can't read the ringer or media volume, so instead of a silent-mode
 * check the parent hears a real animal sound and confirms. If fullscreen isn't available, a
 * one-time note explains the phone's own lock (App pinning / Guided Access).
 */
export function StartFlow({
  pack,
  itemKeys,
  languages,
  step,
  onStep,
  onGo,
  onLockNoteDone,
  onCancel,
}: {
  pack: LoadedPack;
  itemKeys: readonly string[];
  languages: readonly Lang[];
  step: StartStep;
  onStep: (step: StartStep) => void;
  /** Called from the tap, so fullscreen can still be requested. */
  onGo: () => void;
  onLockNoteDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const testItem = useMemo(() => {
    const enabled = pack.items.filter((i) => itemKeys.includes(i.key));
    return enabled.find((i) => i.sound?.real) ?? enabled.find((i) => i.sound) ?? enabled[0] ?? pack.items[0];
  }, [pack, itemKeys]);
  // A real animal sound when there is one; for packs without sounds, the first name.
  const testClip = useMemo<Clip>(
    () =>
      testItem.sound
        ? { kind: 'file', url: testItem.sound.url, category: 'sound', label: 'sound-check' }
        : new ClipResolver(pack, languages).names(testItem)[0],
    [pack, languages, testItem],
  );

  // Each play cancels the previous one, so "Play again" can never stack two sounds.
  const playing = useRef<{ cancelled: boolean } | null>(null);
  const stopTest = () => {
    if (playing.current) playing.current.cancelled = true;
    audioEngine.stopAll();
  };
  const playTest = () => {
    stopTest();
    const token = { cancelled: false };
    playing.current = token;
    void audioEngine.play(testClip, () => token.cancelled);
  };

  useEffect(() => {
    if (step === 'soundCheck') playTest();
    return stopTest;
  }, []);

  const replay = () => {
    audioEngine.unlock();
    playTest();
  };

  if (step === 'lockNote') {
    return (
      <Screen title={t('lockNoteTitle')} onBack={onCancel}>
        <section className="card prose">
          <p>{t('lockNoteBody')}</p>
          <p className="callout">{t('lockNoteAndroid')}</p>
          <p className="callout">{t('lockNoteIos')}</p>
        </section>
        <button type="button" className="btn primary wide" onClick={onLockNoteDone}>
          {t('lockNoteOk')}
        </button>
      </Screen>
    );
  }

  if (step === 'noSound') {
    return (
      <Screen title={t('noSoundTitle')} onBack={onCancel}>
        <section className="card prose">
          <ul className="tips">
            <li>{t('noSoundVolume')}</li>
            <li>{t('noSoundSilent')}</li>
            <li>{t('noSoundBluetooth')}</li>
          </ul>
        </section>
        <div className="stack">
          <button type="button" className="btn wide" onClick={replay}>
            🔊 {t('soundCheckReplay')}
          </button>
          <button type="button" className="btn primary wide" onClick={onGo}>
            {t('startAnyway')}
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title={t('soundCheckTitle')} onBack={onCancel}>
      <section className="sound-check">
        <button type="button" className="sound-check-art" onClick={replay} aria-label={t('soundCheckReplay')}>
          <img src={testItem.images[0].url} alt="" />
          <span className="waves" aria-hidden="true" />
        </button>
        <h2>{t('soundCheckQuestion')}</h2>
      </section>
      <div className="stack">
        <button type="button" className="btn primary wide big" onClick={onGo}>
          {t('soundCheckYes')}
        </button>
        <button type="button" className="btn wide" onClick={replay}>
          🔊 {t('soundCheckReplay')}
        </button>
        <button type="button" className="btn ghost wide" onClick={() => onStep('noSound')}>
          {t('soundCheckNo')}
        </button>
      </div>
    </Screen>
  );
}

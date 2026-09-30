import { useState } from 'react';
import type { LoadedContent, LoadedPack } from '../../content/types';
import { MIN_ITEMS_PER_PACK } from '../../content/validate';
import type { ChoiceCount } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import { ParentGate } from '../../lock/ParentGate';
import { PinSetup } from '../../lock/PinSetup';
import {
  CHOICE_COUNTS,
  enabledItemKeys,
  QUESTIONS_PER_SESSION,
  REPEAT_INTERVALS,
  usableInMode,
  type Settings,
} from '../../settings/settings';
import { telemetry } from '../../telemetry/telemetry';
import { Overlay, Row, Screen, Segmented, Toggle } from './components';

export function SettingsScreen({
  content,
  pack,
  settings,
  update,
  onBack,
}: {
  content: LoadedContent;
  pack: LoadedPack;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [pinStep, setPinStep] = useState<'verify' | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);

  const enabled = enabledItemKeys(pack, settings);
  const allKeys = pack.items.map((i) => i.key);

  const setEnabled = (keys: string[]) => {
    if (keys.length < MIN_ITEMS_PER_PACK) {
      setNudge(true);
      window.setTimeout(() => setNudge(false), 600);
      return;
    }
    update({ enabledItems: { ...settings.enabledItems, [pack.id]: keys } });
  };
  const toggleItem = (key: string) =>
    setEnabled(enabled.includes(key) ? enabled.filter((k) => k !== key) : allKeys.filter((k) => k === key || enabled.includes(k)));

  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
  const presets = [
    { id: 'all', label: t('presetAll'), keys: allKeys },
    { id: 'sound', label: t('presetWithSound'), keys: pack.items.filter((i) => i.sound?.real).map((i) => i.key) },
    ...pack.groups.map((g) => ({ id: g.id, label: g.name[lang], keys: g.items })),
  ];

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  };

  return (
    <Screen title={t('settings')} onBack={onBack}>
      <section className="card featured">
        <h2>{t('settingsPictures')}</h2>
        <div className="choice-cards" role="radiogroup" aria-label={t('settingsPictures')}>
          {CHOICE_COUNTS.map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={settings.choiceCount === n}
              className={settings.choiceCount === n ? 'choice-card on' : 'choice-card'}
              onClick={() => update({ choiceCount: n as ChoiceCount })}
            >
              <LayoutPreview count={n} />
              <span className="choice-num">{n}</span>
            </button>
          ))}
        </div>
        <p className="hint">{t('settingsPicturesHint')}</p>
      </section>

      <section className={nudge ? 'card nudge' : 'card'}>
        <div className="card-head">
          <h2>{t('settingsAnimals')}</h2>
          <span className="muted">{t('animalsSelected', { n: enabled.length })}</span>
        </div>
        <div className="chips">
          {presets.map((p) => (
            <button
              type="button"
              key={p.id}
              className={sameSet(p.keys, enabled) ? 'chip on' : 'chip'}
              disabled={p.keys.length < MIN_ITEMS_PER_PACK}
              onClick={() => setEnabled(allKeys.filter((k) => p.keys.includes(k)))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="animal-grid">
          {pack.items.map((item) => {
            const on = enabled.includes(item.key);
            const usable = usableInMode(item, settings.mode);
            return (
              <button
                type="button"
                key={item.key}
                className={on ? 'animal on' : 'animal'}
                aria-pressed={on}
                disabled={!usable}
                onClick={() => toggleItem(item.key)}
              >
                <img src={item.images[0].url} alt="" draggable={false} />
                <span className="animal-name">{item.name[lang]}</span>
                {!item.sound ? (
                  <span className="tag">{t('nameOnlyTag')}</span>
                ) : (
                  !item.sound.real && <span className="tag">{t('noSoundYet')}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="hint">{t('settingsAnimalsHint', { min: MIN_ITEMS_PER_PACK })}</p>
      </section>

      <section className="card">
        <Row label={t('settingsHears')}>
          <Segmented
            label={t('settingsHears')}
            value={settings.mode}
            options={[
              { value: 'SOUND_AND_NAME', label: t('modeSoundAndName') },
              { value: 'SOUND_ONLY', label: t('modeSoundOnly') },
              { value: 'NAME_ONLY', label: t('modeNameOnly') },
            ]}
            onChange={(mode) => update({ mode })}
          />
        </Row>
        <Row label={t('settingsLanguage')}>
          <Segmented
            label={t('settingsLanguage')}
            value={settings.language}
            options={[
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
              { value: 'both', label: t('langBoth') },
            ]}
            onChange={(language) => update({ language })}
          />
        </Row>
        <Row label={t('settingsQuestions')}>
          <Segmented
            label={t('settingsQuestions')}
            value={settings.questionsPerSession}
            options={QUESTIONS_PER_SESSION.map((n) => ({ value: n, label: String(n) }))}
            onChange={(questionsPerSession) => update({ questionsPerSession })}
          />
        </Row>
        <Row label={t('settingsRepeat')}>
          <Segmented
            label={t('settingsRepeat')}
            value={settings.repeatIntervalSec}
            options={REPEAT_INTERVALS.map((n) => ({ value: n, label: t('secondsShort', { n }) }))}
            onChange={(repeatIntervalSec) => update({ repeatIntervalSec })}
          />
        </Row>
      </section>

      <section className="card">
        <Row label={t('settingsToddler')} hint={t('settingsToddlerHint')}>
          <Toggle label={t('settingsToddler')} checked={settings.toddlerMode} onChange={(toddlerMode) => update({ toddlerMode })} />
        </Row>
        <Row label={t('settingsHints')} hint={t('settingsHintsHint')}>
          <Toggle label={t('settingsHints')} checked={settings.hints} onChange={(hints) => update({ hints })} />
        </Row>
        <Row label={t('settingsAdaptive')} hint={t('settingsAdaptiveHint')}>
          <Toggle label={t('settingsAdaptive')} checked={settings.adaptive} onChange={(adaptive) => update({ adaptive })} />
        </Row>
      </section>

      {telemetry.available && (
        <section className="card">
          <Row label={t('settingsTelemetry')} hint={t('telemetryConsent')}>
            <Toggle
              label={t('settingsTelemetry')}
              checked={settings.telemetryEnabled}
              onChange={(telemetryEnabled) => update({ telemetryEnabled })}
            />
          </Row>
        </section>
      )}

      <section className="card">
        <Row label={t('settingsAppLanguage')}>
          <Segmented
            label={t('settingsAppLanguage')}
            value={settings.uiLanguageOverride}
            options={[
              { value: 'system', label: t('settingsAppLanguageSystem') },
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(uiLanguageOverride) => update({ uiLanguageOverride })}
          />
        </Row>
        {content.packs.length > 1 && (
          <Row label={t('settingsPack')}>
            <Segmented
              label={t('settingsPack')}
              value={pack.id}
              options={content.packs.map((p) => ({ value: p.id, label: p.name[lang] }))}
              onChange={(packId) => update({ packId })}
            />
          </Row>
        )}
        <Row label={t('settingsPin')}>
          <button type="button" className="btn" onClick={() => setPinStep('verify')}>
            {t('changePin')}
          </button>
        </Row>
      </section>

      {pinStep === 'verify' && (
        <ParentGate
          title={t('gateEnterCurrentPin')}
          allowForgot={false}
          onSuccess={() => setPinStep('new')}
          onCancel={() => setPinStep(null)}
        />
      )}
      {pinStep === 'new' && (
        <Overlay label={t('changePin')} onDismiss={() => setPinStep(null)}>
          <PinSetup
            title={t('changePin')}
            onDone={() => {
              setPinStep(null);
              showToast(t('pinChanged'));
            }}
            footer={
              <button type="button" className="btn ghost" onClick={() => setPinStep(null)}>
                {t('cancel')}
              </button>
            }
          />
        </Overlay>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Screen>
  );
}

/** A tiny picture of how 2, 3 or 4 pictures sit on a phone held upright. */
function LayoutPreview({ count }: { count: number }) {
  const cells: [number, number][] =
    count === 2
      ? [[11, 6], [11, 26]]
      : count === 3
        ? [[4, 10], [18, 10], [11, 24]]
        : [[4, 10], [18, 10], [4, 24], [18, 24]];
  const size = count === 2 ? 14 : 11;
  return (
    <svg className="layout-preview" viewBox="0 0 36 46" aria-hidden="true">
      <rect x="1" y="1" width="34" height="44" rx="6" />
      {cells.map(([x, y], i) => (
        <rect key={i} className="cell" x={count === 2 ? x : x + 1} y={y} width={size} height={size} rx="2.5" />
      ))}
    </svg>
  );
}

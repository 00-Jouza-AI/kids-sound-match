import { useState, type CSSProperties } from 'react';
import type { ProfileControls } from '../../App';
import type { LoadedContent, LoadedItem, LoadedPack } from '../../content/types';
import { MIN_ITEMS_PER_PACK } from '../../content/validate';
import { isCustomPackId } from '../../custom/types';
import { MEMORY_PAIRS, type ChoiceCount } from '../../engine';
import { useI18n } from '../../i18n/I18n';
import { ParentGate } from '../../lock/ParentGate';
import { PinSetup } from '../../lock/PinSetup';
import { MAX_PROFILES, PROFILE_ANIMALS, PROFILE_COLORS, type Profile } from '../../settings/profiles';
import {
  CHOICE_COUNTS,
  effectiveMode,
  enabledItemKeys,
  QUESTIONS_PER_SESSION,
  REPEAT_INTERVALS,
  soundModesAvailable,
  usableInMode,
  type Settings,
} from '../../settings/settings';
import { NO_REPLAY_LIMIT, REPLAY_LIMITS } from '../../settings/replays';
import { telemetry } from '../../telemetry/telemetry';
import { choosePictures } from '../kid/layout';
import { Overlay, Row, Screen, Segmented, Toggle } from './components';
import { Avatar, ProfileRow } from './ProfileRow';

export function SettingsScreen({
  content,
  pack,
  settings,
  update,
  profiles,
  onBack,
}: {
  content: LoadedContent;
  pack: LoadedPack;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  profiles: ProfileControls;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [pinStep, setPinStep] = useState<'verify' | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [editingChild, setEditingChild] = useState<Profile | null>(null);
  const association = pack.kind === 'association';
  const byName = !association && !soundModesAvailable(pack);
  const children = profiles.state.profiles;
  const child = children.find((p) => p.id === profiles.state.activeId) ?? children[0];

  /** Too few pictures left: shake the card instead of saving. */
  const refuse = () => {
    setNudge(true);
    window.setTimeout(() => setNudge(false), 600);
  };

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  };

  return (
    <Screen title={t('settings')} onBack={onBack}>
      <section className="card">
        <h2>{t('children')}</h2>
        <ProfileRow profiles={children} activeId={child.id} onSelect={profiles.select} label={t('children')} />
        <div className="nudge-actions">
          <button type="button" className="btn" onClick={() => setEditingChild(child)}>
            ✎ {t('editChild')}
          </button>
          {children.length < MAX_PROFILES && (
            <button type="button" className="btn ghost" onClick={profiles.add}>
              + {t('addChild')}
            </button>
          )}
        </div>
        <p className="hint">{children.length > 1 ? t('childrenHintMany') : t('childrenHintOne')}</p>
      </section>

      {content.packs.length > 1 && (
        <section className="card">
          <h2>{t('settingsPack')}</h2>
          <div className="pack-picker" role="radiogroup" aria-label={t('settingsPack')}>
            {content.packs.map((p) => (
              <button
                type="button"
                key={p.id}
                role="radio"
                aria-checked={p.id === pack.id}
                className={p.id === pack.id ? 'pack-tile on' : 'pack-tile'}
                onClick={() => update({ packId: p.id })}
              >
                <PackThumb pack={p} />
                <span className="pack-tile-name">{p.name[lang]}</span>
                {isCustomPackId(p.id) && <span className="tag">{t('myPackTag')}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

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

      {pack.parts ? (
        <MixCard pack={pack} settings={settings} update={update} nudge={nudge} onRefuse={refuse} />
      ) : (
        <ItemsCard pack={pack} settings={settings} update={update} nudge={nudge} onRefuse={refuse} />
      )}

      <section className="card">
        {byName && <p className="hint">{t('nameOnlyPack')}</p>}
        {!association && !byName && (
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
        )}
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
        <Row
          label={t('settingsToddler')}
          hint={association ? `${t('settingsToddlerHint')} ${t('toddlerNotInAssociation')}` : t('settingsToddlerHint')}
        >
          <Toggle label={t('settingsToddler')} checked={settings.toddlerMode} onChange={(toddlerMode) => update({ toddlerMode })} />
        </Row>
        <Row label={t('settingsHints')} hint={t('settingsHintsHint')}>
          <Toggle label={t('settingsHints')} checked={settings.hints} onChange={(hints) => update({ hints })} />
        </Row>
        <Row label={t('settingsAdaptive')} hint={t('settingsAdaptiveHint')}>
          <Toggle label={t('settingsAdaptive')} checked={settings.adaptive} onChange={(adaptive) => update({ adaptive })} />
        </Row>
        <Row label={t('settingsMemory')} hint={t('settingsMemoryHint')}>
          <Segmented
            label={t('settingsMemory')}
            value={settings.memoryPairs}
            options={MEMORY_PAIRS.map((n) => ({ value: n, label: String(n) }))}
            onChange={(memoryPairs) => update({ memoryPairs })}
          />
        </Row>
        <Row label={t('settingsReplays')} hint={t('settingsReplaysHint')}>
          <Segmented
            label={t('settingsReplays')}
            value={settings.replaysPerDay}
            options={REPLAY_LIMITS.map((n) => ({
              value: n as number,
              label: n === 0 ? t('off') : n >= NO_REPLAY_LIMIT ? t('replayNoLimit') : String(n),
            }))}
            onChange={(replaysPerDay) => update({ replaysPerDay })}
          />
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
      {editingChild && (
        <ChildEditor
          child={editingChild}
          canDelete={children.length > 1}
          onSave={(p) => {
            profiles.edit(p);
            setEditingChild(null);
          }}
          onDelete={async () => {
            await profiles.remove(editingChild.id);
            setEditingChild(null);
          }}
          onClose={() => setEditingChild(null)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Screen>
  );
}

/** A child's animal and colour, and deleting them (with their results on this phone). */
function ChildEditor({
  child,
  canDelete,
  onSave,
  onDelete,
  onClose,
}: {
  child: Profile;
  canDelete: boolean;
  onSave: (child: Profile) => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(child);
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <Overlay label={t('deleteChild')} onDismiss={() => setConfirm(false)}>
        <h2>{t('deleteChild')}</h2>
        <Avatar profile={child} size={64} />
        <p>{t('deleteChildBody')}</p>
        <div className="pin-footer">
          <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>
            {t('cancel')}
          </button>
          <button type="button" className="btn danger" onClick={() => void onDelete()}>
            {t('delete')}
          </button>
        </div>
      </Overlay>
    );
  }
  return (
    <Overlay label={t('editChild')} onDismiss={onClose}>
      <h2>{t('editChild')}</h2>
      <div className="child-preview">
        <Avatar profile={draft} size={84} />
      </div>
      <div className="animal-picker" role="radiogroup" aria-label={t('childAnimal')}>
        {PROFILE_ANIMALS.map((a) => (
          <button
            type="button"
            key={a}
            role="radio"
            aria-checked={draft.animal === a}
            className={draft.animal === a ? 'pick on' : 'pick'}
            onClick={() => setDraft({ ...draft, animal: a })}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="color-picker" role="radiogroup" aria-label={t('childColor')}>
        {PROFILE_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={draft.color === c}
            aria-label={c}
            className={draft.color === c ? 'swatch on' : 'swatch'}
            style={{ '--avatar': c } as CSSProperties}
            onClick={() => setDraft({ ...draft, color: c })}
          />
        ))}
      </div>
      <Row label={t('childArGender')} hint={t('childArGenderHint')}>
        <div className="segmented" role="radiogroup" aria-label={t('childArGender')}>
          {(['f', 'm'] as const).map((g) => (
            <button
              type="button"
              key={g}
              role="radio"
              aria-checked={draft.arGender === g}
              className={draft.arGender === g ? 'on' : undefined}
              onClick={() => setDraft({ ...draft, arGender: g })}
            >
              {g === 'f' ? t('girl') : t('boy')}
            </button>
          ))}
        </div>
      </Row>
      <div className="pin-footer">
        {canDelete && (
          <button type="button" className="btn danger-outline" onClick={() => setConfirm(true)}>
            {t('deleteChild')}
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => onSave(draft)}>
          {t('save')}
        </button>
      </div>
    </Overlay>
  );
}

interface CardProps {
  pack: LoadedPack;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  nudge: boolean;
  onRefuse: () => void;
}

/** The pictures of one pack, with presets. "Who eats what?" lists each food's animals. */
function ItemsCard({ pack, settings, update, nudge, onRefuse }: CardProps) {
  const { t, lang } = useI18n();
  const association = pack.kind === 'association';
  const enabled = enabledItemKeys(pack, settings);
  const mode = effectiveMode(pack, settings.mode);
  // Only pictures that work in the current mode (quiet ones need "Name only").
  const allKeys = pack.items.filter((i) => usableInMode(i, mode)).map((i) => i.key);

  const setEnabled = (keys: string[]) => {
    if (keys.length < MIN_ITEMS_PER_PACK) {
      onRefuse();
      return;
    }
    update({ enabledItems: { ...settings.enabledItems, [pack.id]: keys } });
  };
  const toggleItem = (key: string) =>
    setEnabled(enabled.includes(key) ? enabled.filter((k) => k !== key) : allKeys.filter((k) => k === key || enabled.includes(k)));

  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));
  const presets = [
    { id: 'all', label: t('presetAll'), keys: allKeys },
    ...(association ? [] : [{ id: 'sound', label: t('presetWithSound'), keys: pack.items.filter((i) => i.sound?.real).map((i) => i.key) }]),
    ...pack.groups.map((g) => ({ id: g.id, label: g.name[lang], keys: g.items.filter((k) => allKeys.includes(k)) })),
  ];
  const tag = (item: LoadedItem) => {
    if (item.prompts) return <span className="tag eaters">{eaters(item, lang)}</span>;
    if (mode === 'NAME_ONLY' && !soundModesAvailable(pack)) return null; // the whole pack is played by name
    if (!item.sound) return <span className="tag">{t('nameOnlyTag')}</span>;
    return item.sound.real ? null : <span className="tag">{t('noSoundYet')}</span>;
  };

  return (
    <section className={nudge ? 'card nudge' : 'card'}>
      <div className="card-head">
        <h2>{pack.id === 'animals' ? t('settingsAnimals') : t('settingsItems')}</h2>
        <span className="muted">{t('animalsSelected', { n: enabled.length })}</span>
      </div>
      {association && <p className="hint">{t('associationHint')}</p>}
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
          return (
            <button
              type="button"
              key={item.key}
              className={on ? 'animal on' : 'animal'}
              aria-pressed={on}
              disabled={!usableInMode(item, mode)}
              onClick={() => toggleItem(item.key)}
            >
              <img src={item.images[0].url} alt="" draggable={false} />
              <span className="animal-name">{item.name[lang]}</span>
              {tag(item)}
            </button>
          );
        })}
      </div>
      <p className="hint">
        {pack.id === 'animals' ? t('settingsAnimalsHint', { min: MIN_ITEMS_PER_PACK }) : t('settingsItemsHint', { min: MIN_ITEMS_PER_PACK })}
      </p>
    </section>
  );
}

/** "Carrot": rabbit, donkey, horse. Kept short so the tile stays readable. */
function eaters(item: LoadedItem, lang: 'ar' | 'en'): string {
  const names = (item.prompts ?? []).map((p) => p.name[lang]);
  const shown = names.slice(0, 3).join(lang === 'ar' ? '، ' : ', ');
  return names.length > 3 ? `${shown}…` : shown;
}

/** The Mixed game: which packs join the mix. Each pack keeps its own picture choice. */
function MixCard({ pack, settings, update, nudge, onRefuse }: CardProps) {
  const { t, lang } = useI18n();
  const parts = pack.parts ?? [];
  const toggle = (id: string) => {
    const mixedExcluded = settings.mixedExcluded.includes(id)
      ? settings.mixedExcluded.filter((x) => x !== id)
      : [...settings.mixedExcluded, id];
    if (enabledItemKeys(pack, { ...settings, mixedExcluded }).length < MIN_ITEMS_PER_PACK) {
      onRefuse();
      return;
    }
    update({ mixedExcluded });
  };
  return (
    <section className={nudge ? 'card nudge' : 'card'}>
      <div className="card-head">
        <h2>{t('mixTitle')}</h2>
        <span className="muted">{t('animalsSelected', { n: enabledItemKeys(pack, settings).length })}</span>
      </div>
      {parts.map((p) => {
        const n = enabledItemKeys(p, settings).length;
        const label = isCustomPackId(p.id) ? `${p.name[lang]} (${t('myPackTag')})` : p.name[lang];
        return (
          <Row key={p.id} label={label} hint={n ? t('mixPackCount', { n }) : t('mixPackNone')}>
            <Toggle label={p.name[lang]} checked={!settings.mixedExcluded.includes(p.id)} onChange={() => toggle(p.id)} />
          </Row>
        );
      })}
      <p className="hint">{t('mixHint')}</p>
    </section>
  );
}

/** A small picture for a pack: its first picture, animal + food for "Who eats what?", four for the Mix. */
function PackThumb({ pack }: { pack: LoadedPack }) {
  const firstOf = (p: LoadedPack) => p.items[0];
  const items: LoadedItem[] = pack.parts
    ? pack.parts.slice(0, 4).map(firstOf)
    : pack.kind === 'association' && pack.items[0]?.prompts?.[0]
      ? [pack.items[0].prompts[0], pack.items[0]]
      : [firstOf(pack)];
  // Always the first photo, so the picture doesn't change every time a setting does.
  const pictures = items.filter(Boolean).map((i) => choosePictures([i], () => 0)[i.key]);
  return (
    <span className={`pack-thumb n${pictures.length}`} aria-hidden="true">
      {pictures.map((src, i) => (
        <img key={i} src={src} alt="" draggable={false} />
      ))}
    </span>
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

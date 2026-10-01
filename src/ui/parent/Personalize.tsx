import { useMemo, useRef, useState, type RefObject } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { FEEDBACK_SPEECH, voicedClip, type Clip, type ClipCategory } from '../../audio/clips';
import type { Lang, LoadedItem, LoadedPack, ResolvedAsset } from '../../content/types';
import { loadImage, releaseImage } from '../../custom/imageTools';
import { overrideMap, overrideOps } from '../../custom/overrides';
import { customStore } from '../../custom/store';
import { blobUrl } from '../../custom/toLoaded';
import type { AssetOverride } from '../../custom/types';
import { useI18n } from '../../i18n/I18n';
import { choosePictures } from '../kid/layout';
import { ChevronIcon, Screen } from './components';
import { PictureCropper } from './PictureCropper';
import { SoundEditor } from './SoundEditor';

const ops = overrideOps(customStore);

/** One recording a parent can replace with their own: a name, a sound or a game line. */
interface Line {
  /** The built-in file it replaces (the key of the parent's version). */
  path: string;
  original: ResolvedAsset;
  label: string;
  /** The words, for the stand-in voice while the original is a placeholder. */
  say?: string;
  lang: Lang;
  category: ClipCategory;
}

type Editing = { kind: 'item'; key: string } | { kind: 'lines' } | null;

/**
 * "Your voice and photos": the parent records the names in the built-in packs (and the praise)
 * in their own voice, or uses their own photos (Grandma's photo for "Grandma"). Anything not
 * replaced keeps the original. Saved on this phone, and backed up if they're signed in.
 */
export function Personalize({
  packs,
  overrides,
  onChanged,
  onBack,
}: {
  /** The built-in packs as shipped (the originals). */
  packs: readonly LoadedPack[];
  overrides: readonly AssetOverride[];
  onChanged: () => Promise<void>;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [editing, setEditing] = useState<Editing>(null);
  const mine = useMemo(() => overrideMap(overrides), [overrides]);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];

  const pictureOf = (item: LoadedItem) => {
    const photo = item.picturePath ? mine.get(item.picturePath) : undefined;
    return photo ? blobUrl(photo) : choosePictures([item], () => 0)[item.key];
  };
  const itemLines = (item: LoadedItem): Line[] => [
    { path: item.nameAudio.ar.path, original: item.nameAudio.ar, label: t('recNameAr'), say: item.name.ar, lang: 'ar', category: 'name' },
    { path: item.nameAudio.en.path, original: item.nameAudio.en, label: t('recNameEn'), say: item.name.en, lang: 'en', category: 'name' },
    ...(item.sound ? [{ path: item.sound.path, original: item.sound, label: t('soundLabel'), lang, category: 'sound' as const }] : []),
  ];
  const gameLines = useMemo(() => buildGameLines(packs, t, lang), [packs, t, lang]);

  const editingItem = editing?.kind === 'item' ? pack?.items.find((i) => i.key === editing.key) : undefined;
  if (editingItem) {
    return (
      <ItemVoice
        item={editingItem}
        picture={pictureOf(editingItem)}
        photoIsMine={Boolean(editingItem.picturePath && mine.has(editingItem.picturePath))}
        lines={itemLines(editingItem)}
        mine={mine}
        onChanged={onChanged}
        onBack={() => setEditing(null)}
      />
    );
  }
  if (editing?.kind === 'lines') {
    return (
      <Screen title={t('gameLines')} onBack={() => setEditing(null)}>
        <p className="hint">{t('gameLinesHint')}</p>
        {gameLines.map((section) => (
          <section className="card" key={section.title}>
            <h2>{section.title}</h2>
            <Lines lines={section.lines} mine={mine} onChanged={onChanged} />
          </section>
        ))}
      </Screen>
    );
  }

  const yours = gameLines.flatMap((s) => s.lines).filter((l) => mine.has(l.path)).length;
  const total = gameLines.reduce((n, s) => n + s.lines.length, 0);
  return (
    <Screen title={t('personalizeTitle')} onBack={onBack}>
      <p className="hint">{t('personalizeIntro')}</p>
      <button type="button" className="card pack-card" onClick={() => setEditing({ kind: 'lines' })}>
        <span className="link-icon big" aria-hidden="true">
          🎉
        </span>
        <span className="pack-text">
          <strong>{t('gameLines')}</strong>
          <span className="hint">{t('yoursOf', { n: yours, m: total })}</span>
        </span>
        <ChevronIcon />
      </button>
      {packs.length > 1 && (
        <div className="chips" role="radiogroup" aria-label={t('settingsPack')}>
          {packs.map((p) => (
            <button
              type="button"
              key={p.id}
              role="radio"
              aria-checked={p.id === pack?.id}
              className={p.id === pack?.id ? 'chip on' : 'chip'}
              onClick={() => setPackId(p.id)}
            >
              {p.name[lang]}
            </button>
          ))}
        </div>
      )}
      {pack && (
        <section className="card">
          <div className="item-grid">
            {pack.items.map((item) => {
              const has = (path: string | undefined) => Boolean(path && mine.has(path));
              return (
                <button type="button" key={item.key} className="animal on" onClick={() => setEditing({ kind: 'item', key: item.key })}>
                  <img src={pictureOf(item)} alt="" draggable={false} />
                  <span className="animal-name">{item.name[lang]}</span>
                  <span className="badges" aria-hidden="true">
                    {has(item.picturePath) ? '📷' : ''}
                    {has(item.nameAudio.ar.path) ? 'ع' : ''}
                    {has(item.nameAudio.en.path) ? 'E' : ''}
                    {has(item.sound?.path) ? '♪' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </Screen>
  );
}

/** One built-in item: its picture and its recordings, each "original" or the parent's own. */
function ItemVoice({
  item,
  picture,
  photoIsMine,
  lines,
  mine,
  onChanged,
  onBack,
}: {
  item: LoadedItem;
  picture: string;
  photoIsMine: boolean;
  lines: Line[];
  mine: ReadonlyMap<string, Blob>;
  onChanged: () => Promise<void>;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [cropping, setCropping] = useState<HTMLImageElement | null>(null);
  const [problem, setProblem] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const picturePath = item.picturePath;

  const openPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCropping(await loadImage(file));
      setProblem(false);
    } catch {
      setProblem(true);
    }
  };
  const photoInput = (ref: RefObject<HTMLInputElement | null>, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(capture ? { capture: 'environment' as const } : {})}
      hidden
      onChange={(e) => {
        void openPhoto(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  return (
    <Screen title={item.name[lang]} onBack={onBack}>
      {picturePath && (
        <section className="card">
          <h2>{t('picture')}</h2>
          <div className="picture-row">
            <div className="picture-preview">
              <img src={picture} alt="" />
            </div>
            <div className="stack">
              <button type="button" className="btn" onClick={() => camera.current?.click()}>
                📷 {t('takePhoto')}
              </button>
              <button type="button" className="btn" onClick={() => gallery.current?.click()}>
                🖼️ {t('choosePhoto')}
              </button>
              {photoIsMine && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    await ops.remove(picturePath);
                    await onChanged();
                  }}
                >
                  {t('useOriginal')}
                </button>
              )}
            </div>
          </div>
          {problem && (
            <p className="msg error" role="alert">
              {t('pictureUnreadable')}
            </p>
          )}
          <p className="hint">{t('personalizePhotoHint')}</p>
          {photoInput(camera, true)}
          {photoInput(gallery, false)}
        </section>
      )}

      <section className="card">
        <h2>{t('recordings')}</h2>
        <Lines lines={lines} mine={mine} onChanged={onChanged} />
      </section>

      {cropping && picturePath && (
        <PictureCropper
          image={cropping}
          onClose={() => {
            releaseImage(cropping);
            setCropping(null);
          }}
          onUse={async (photo) => {
            releaseImage(cropping);
            setCropping(null);
            await ops.save(picturePath, photo);
            await onChanged();
          }}
        />
      )}
    </Screen>
  );
}

/** Rows of recordings: play (the parent's version, else the original), record or trim, back to the original. */
function Lines({ lines, mine, onChanged }: { lines: readonly Line[]; mine: ReadonlyMap<string, Blob>; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Line | null>(null);

  const play = (line: Line) => {
    audioEngine.unlock();
    audioEngine.stopAll();
    const blob = mine.get(line.path);
    const clip: Clip = blob
      ? { kind: 'file', url: blobUrl(blob), category: line.category, label: 'personalize' }
      : voicedClip(line.original, line.say, line.lang, line.category, 'personalize-original');
    void audioEngine.play(clip, () => false);
  };

  return (
    <>
      {lines.map((line) => {
        const blob = mine.get(line.path);
        return (
          <div className="rec-row" key={line.path}>
            <div className="row-text">
              <span className="row-label">{line.label}</span>
              {line.say && <span className="say">«{line.say}»</span>}
              <span className={blob ? 'hint done' : 'hint'}>{blob ? `✓ ${t('yourVoice')}` : t('originalVoice')}</span>
            </div>
            <div className="rec-actions">
              <button type="button" className="btn" onClick={() => play(line)} aria-label={t('play')}>
                ▶
              </button>
              <button type="button" className="btn" onClick={() => setOpen(line)}>
                {blob ? `✂ ${t('trim')}` : `● ${t('record')}`}
              </button>
              {blob && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    await ops.remove(line.path);
                    await onChanged();
                  }}
                >
                  {t('useOriginal')}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {open && (
        <SoundEditor
          title={open.say && open.category !== 'sound' ? `${open.label}: «${open.say}»` : open.label}
          existing={mine.get(open.path) ?? null}
          onClose={() => setOpen(null)}
          onUse={async (clip) => {
            const path = open.path;
            setOpen(null);
            await ops.save(path, clip);
            await onChanged();
          }}
        />
      )}
    </>
  );
}

/** Praise, the end-of-game line and the "Who eats what?" lines, from the built-in packs. */
function buildGameLines(packs: readonly LoadedPack[], t: ReturnType<typeof useI18n>['t'], lang: Lang) {
  const feedback = packs[0]?.feedback;
  const line = (asset: ResolvedAsset | null, lang: Lang, label: string, category: ClipCategory = 'feedback'): Line[] =>
    asset ? [{ path: asset.path, original: asset, label, say: FEEDBACK_SPEECH[asset.path], lang, category }] : [];
  const sections: { title: string; lines: Line[] }[] = [];
  if (feedback) {
    sections.push({
      title: t('linesPraise'),
      lines: (['ar', 'en'] as const).flatMap((lang) =>
        feedback.correct[lang].flatMap((a) => line(a, lang, lang === 'ar' ? t('langArabic') : t('langEnglish'))),
      ),
    });
    sections.push({
      title: t('linesEnd'),
      lines: (['ar', 'en'] as const).flatMap((lang) =>
        line(feedback.sessionEnd[lang], lang, lang === 'ar' ? t('langArabic') : t('langEnglish')),
      ),
    });
  }
  // The question of each "Who eats what?"-style game.
  for (const p of packs) {
    const assoc = p.association;
    if (!assoc) continue;
    sections.push({
      title: p.name[lang],
      lines: [
        ...line(assoc.question.ar, 'ar', t('lineQuestionArM')),
        ...line(assoc.questionFeminine.ar, 'ar', t('lineQuestionArF')),
        ...line(assoc.question.en, 'en', t('langEnglish')),
        ...line(assoc.reward, 'ar', t('lineYum'), 'sound'),
      ],
    });
  }
  return sections.filter((s) => s.lines.length);
}

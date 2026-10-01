import { useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { decodeToMono, type MonoAudio } from '../../custom/audioTools';
import { useI18n } from '../../i18n/I18n';
import { choosePictures } from '../kid/layout';
import { Row, Segmented, Toggle } from './components';
import { PictureCropper } from './PictureCropper';
import { Trimmer } from './SoundEditor';
import { studioSavePath } from './studioClips';

/** Found by searching Pixabay (see docs/DECISIONS.md); nothing is saved until a parent approves it. */
interface SoundCandidate {
  page: string;
  mp3: string;
  seconds: number;
}
interface PhotoCandidate {
  page: string;
  /** 1280 px, cropped to a square 720 px picture. */
  image: string;
  /** 640 px, for the list. */
  thumb?: string;
}
interface Candidates {
  sounds: Record<string, { path: string; candidates: SoundCandidate[] }>;
  photos: Record<string, { path: string; candidates: PhotoCandidate[] }>;
}

type Editing =
  | {
      kind: 'sound';
      key: string;
      path: string;
      source: string;
      audio: MonoAudio;
    }
  | {
      kind: 'photo';
      key: string;
      path: string;
      source: string;
      image: HTMLImageElement;
    };

const proxied = (url: string) => `/__studio/proxy?url=${encodeURIComponent(url)}`;
/** "nature-cow-mooing-343423" -> "cow mooing" */
const titleOf = (page: string) =>
  decodeURIComponent(page.replace(/\/$/, '').split('/').pop() ?? '')
    .replace(/-\d+$/, '')
    .replace(/^(nature|animals|household|transportation|musical|instruments|human|people)-/, '')
    .replace(/-/g, ' ');

/**
 * Real sounds and baby photos: candidates from Pixabay (free for apps, no credit needed), listed
 * per picture. Listen or look, then "Use this": trim the sound or crop the photo, and it's saved
 * into the app, with its source noted in public/assets/licenses/sources.csv.
 */
export function StudioFind({ packs }: { packs: readonly LoadedPack[] }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<Candidates | null>(null);
  const [kind, setKind] = useState<'sound' | 'photo'>('sound');
  const [showDone, setShowDone] = useState(false);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void fetch('/__studio/candidates')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ sounds: {}, photos: {} }));
    return () => player.current?.pause();
  }, []);

  const items = useMemo(() => {
    const map = new Map<string, LoadedItem>();
    for (const p of packs) for (const i of p.items) if (!map.has(i.key)) map.set(i.key, i);
    return map;
  }, [packs]);
  const label = (key: string) =>
    items.get(key)?.name[lang] ?? (key === 'yum' ? 'Yum!' : key === 'incorrect_tone' ? t('studioTryAgainTone') : key);
  const picture = (key: string) => {
    const item = items.get(key);
    return item ? choosePictures([item], () => 0)[key] : null;
  };

  const play = (url: string) => {
    player.current?.pause();
    player.current = new Audio(url);
    void player.current.play();
  };

  const useSound = async (key: string, path: string, c: SoundCandidate) => {
    setProblem(null);
    try {
      const blob = await (await fetch(proxied(c.mp3))).blob();
      setEditing({
        kind: 'sound',
        key,
        path,
        source: c.page,
        audio: await decodeToMono(blob),
      });
    } catch {
      setProblem(t('studioFetchFailed'));
    }
  };

  const usePhoto = (key: string, path: string, c: PhotoCandidate) => {
    setProblem(null);
    const img = new Image();
    img.onload = () => setEditing({ kind: 'photo', key, path, source: c.page, image: img });
    img.onerror = () => setProblem(t('studioFetchFailed'));
    img.src = proxied(c.image);
  };

  const save = async (url: string, body: Blob, key: string) => {
    const res = await fetch(url, { method: 'POST', body });
    if (!res.ok) throw new Error(await res.text());
    setSaved((s) => new Set(s).add(key));
    setEditing(null);
  };

  if (!data) return <p className="hint">{t('loading')}</p>;
  const groups = kind === 'sound' ? data.sounds : data.photos;
  const keys = Object.keys(groups).filter((k) => showDone || !saved.has(k));

  return (
    <>
      <section className="card">
        <p className="hint">{t('studioFindIntro')}</p>
        <Segmented
          label={t('studioFind')}
          value={kind}
          options={[
            { value: 'sound', label: t('studioSounds') },
            { value: 'photo', label: t('studioBabyPhotos') },
          ]}
          onChange={setKind}
        />
        <Row label={t('studioShowDone')}>
          <Toggle label={t('studioShowDone')} checked={showDone} onChange={setShowDone} />
        </Row>
        <p className="muted">
          {t('studioProgress', {
            n: Object.keys(groups).filter((k) => saved.has(k)).length,
            m: Object.keys(groups).length,
          })}
        </p>
        {problem && (
          <p className="msg error" role="alert">
            {problem}
          </p>
        )}
      </section>

      {keys.length === 0 && <p className="empty">{t('studioAllDone')}</p>}
      {keys.map((key) => {
        const group = groups[key];
        return (
          <section className="card find-item" key={key}>
            <div className="studio-head">
              {picture(key) && <img src={picture(key)!} alt="" />}
              <div className="studio-words">
                <strong>{label(key)}</strong>
                <code className="studio-path" dir="ltr">
                  {kind === 'sound' ? studioSavePath(group.path) : group.path}
                </code>
                {saved.has(key) && <span className="hint done">✓ {t('recorded')}</span>}
              </div>
            </div>
            {group.candidates.length === 0 && <p className="hint">{t('studioNoCandidates')}</p>}
            {kind === 'sound' ? (
              (group.candidates as SoundCandidate[]).map((c) => (
                <div className="rec-row" key={c.page}>
                  <div className="row-text">
                    <span className="row-label">{titleOf(c.page)}</span>
                    <a className="hint" href={c.page} target="_blank" rel="noreferrer noopener">
                      Pixabay · {c.seconds} s
                    </a>
                  </div>
                  <div className="rec-actions">
                    <button type="button" className="btn" aria-label={t('play')} onClick={() => play(c.mp3)}>
                      ▶
                    </button>
                    <button type="button" className="btn primary" onClick={() => void useSound(key, group.path, c)}>
                      {t('studioUseThis')}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="photo-candidates">
                {(group.candidates as PhotoCandidate[]).map((c) => (
                  <button
                    type="button"
                    key={c.page}
                    className="photo-candidate"
                    onClick={() => usePhoto(key, group.path, c)}
                  >
                    <img src={c.thumb ?? c.image} alt={titleOf(c.page)} />
                    <span>{t('studioUseThis')}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {editing?.kind === 'sound' && (
        <section className="overlay" role="dialog" aria-modal="true" aria-label={label(editing.key)}>
          <div className="dialog">
            <h2>{label(editing.key)}</h2>
            <Trimmer
              audio={editing.audio}
              useLabel={t('save')}
              retryLabel={t('cancel')}
              onRetry={() => setEditing(null)}
              onUse={(wav) =>
                void save(
                  `/__studio/save?path=${encodeURIComponent(studioSavePath(editing.path))}&source=${encodeURIComponent(editing.source)}`,
                  wav,
                  editing.key,
                ).catch(() => setProblem(t('studioSaveFailed')))
              }
            />
          </div>
        </section>
      )}
      {editing?.kind === 'photo' && (
        <PictureCropper
          image={editing.image}
          onClose={() => setEditing(null)}
          onUse={(jpeg) =>
            void save(
              `/__studio/save-image?path=${encodeURIComponent(editing.path)}&source=${encodeURIComponent(editing.source)}`,
              jpeg,
              editing.key,
            ).catch(() => setProblem(t('studioSaveFailed')))
          }
        />
      )}
    </>
  );
}

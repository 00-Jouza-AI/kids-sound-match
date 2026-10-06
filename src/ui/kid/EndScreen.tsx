import { useMemo, useState, type ReactNode } from 'react';
import type { LoadedPack } from '../../content/types';
import { useI18n } from '../../i18n/I18n';
import { activeGroup, groupPlayable, pickPatch } from '../../settings/quickPick';
import type { Settings } from '../../settings/settings';
import { ExploreIcon, MemoryIcon, OddIcon, PeekabooIcon, PlayIcon, PointIcon, SceneIcon } from './icons';
import type { KidKind } from './kidSnapshot';
import { choosePictures } from './layout';
import { AlbumIcon } from './Stickers';

/** What the end screen's quick picker can offer, from App. */
export interface PickerOptions {
  /** Packs with enough pictures to play. */
  packs: readonly LoadedPack[];
  settings: Settings;
  /** The game just played. */
  kind: KidKind;
  /** The games that can be started now. */
  available: readonly KidKind[];
  /** Starts a game (counted against today's play-again limit) after saving the pack and group. */
  onPlay: (kind: KidKind, patch: Partial<Settings>) => void;
}

/** Games that play the chosen pack; the others bring their own pictures. */
const USES_PACK: readonly KidKind[] = ['game', 'peekaboo', 'explore', 'memory'];

/** Four squares: "choose". */
function PickIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" fill="currentColor" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor" opacity="0.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor" />
    </svg>
  );
}

/**
 * After a game: a big play-again button in the middle, the sticker album in one bottom corner and
 * a small "choose" button in the other, for picking another pack, group or game without the PIN.
 * Nothing else can be changed from here, so it's fine if the child taps it.
 */
export function EndScreen({
  canReplay,
  onPlayAgain,
  onAlbum,
  picker,
}: {
  canReplay: boolean;
  onPlayAgain: () => void;
  onAlbum: () => void;
  picker?: PickerOptions;
}) {
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  return (
    <div className="end-screen">
      {canReplay && (
        <button type="button" className="end-play" aria-label={t('playAgain')} onClick={onPlayAgain}>
          <PlayIcon />
        </button>
      )}
      <button type="button" className="album-btn end-album" aria-label={t('stickerAlbum')} onClick={onAlbum}>
        <AlbumIcon />
      </button>
      {canReplay && picker && picker.available.length > 0 && (
        <button type="button" className="end-pick" aria-label={t('quickPick')} onClick={() => setPicking(true)}>
          <PickIcon />
        </button>
      )}
      {picking && picker && <QuickPicker {...picker} onClose={() => setPicking(false)} />}
    </div>
  );
}

function QuickPicker({ packs, settings, kind, available, onPlay, onClose }: PickerOptions & { onClose: () => void }) {
  const { t, lang } = useI18n();
  const [game, setGame] = useState<KidKind>(available.includes(kind) ? kind : available[0]);
  const usesPack = USES_PACK.includes(game);
  // Explore, Peekaboo and Memory show the pictures themselves; "Who eats what?" is a question game.
  const packChoices = useMemo(() => packs.filter((p) => game === 'game' || p.kind !== 'association'), [packs, game]);
  const [packId, setPackId] = useState(settings.packId);
  const pack = packChoices.find((p) => p.id === packId) ?? packChoices[0];
  // null: the group wasn't touched, so the pictures chosen in Settings stay as they are.
  const [group, setGroup] = useState<string | null>(null);
  const shownGroup = group ?? (pack ? activeGroup(pack, settings) : 'all');
  const thumbs = useMemo(
    () => Object.fromEntries(packs.filter((p) => p.items.length).map((p) => [p.id, choosePictures([p.items[0]], () => 0)[p.items[0].key]])),
    [packs],
  );

  const games: { id: KidKind; label: string; icon: ReactNode }[] = [
    { id: 'game', label: t('matchGame'), icon: <PlayIcon /> },
    { id: 'peekaboo', label: t('peekaboo'), icon: <PeekabooIcon /> },
    { id: 'explore', label: t('explore'), icon: <ExploreIcon /> },
    { id: 'scene', label: t('sceneGame'), icon: <SceneIcon /> },
    { id: 'point', label: t('pointGame'), icon: <PointIcon /> },
    { id: 'memory', label: t('memoryGame'), icon: <MemoryIcon /> },
    { id: 'odd', label: t('oddOneOut'), icon: <OddIcon /> },
  ];

  const play = () => {
    onClose();
    onPlay(game, usesPack && pack ? pickPatch(settings, pack, group) : {});
  };

  return (
    <div className="quick-picker" role="dialog" aria-modal="true" aria-label={t('quickPick')} onPointerDown={(e) => e.stopPropagation()}>
      <div className="qp-top">
        <h2>{t('quickPick')}</h2>
        <button type="button" className="album-close" aria-label={t('close')} onClick={onClose}>
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <path d="M8 8l14 14M22 8L8 22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="qp-games" role="radiogroup" aria-label={t('quickPickGame')}>
        {games
          .filter((g) => available.includes(g.id))
          .map((g) => (
            <button
              type="button"
              key={g.id}
              role="radio"
              aria-checked={game === g.id}
              className={game === g.id ? 'qp-game on' : 'qp-game'}
              onClick={() => setGame(g.id)}
            >
              <span className="qp-game-icon">{g.icon}</span>
              <span>{g.label}</span>
            </button>
          ))}
      </div>

      {usesPack && (
        <>
          <div className="qp-packs" role="radiogroup" aria-label={t('settingsPack')}>
            {packChoices.map((p) => (
              <button
                type="button"
                key={p.id}
                role="radio"
                aria-checked={p.id === pack?.id}
                className={p.id === pack?.id ? 'qp-pack on' : 'qp-pack'}
                onClick={() => {
                  setPackId(p.id);
                  setGroup(null);
                }}
              >
                {thumbs[p.id] && <img src={thumbs[p.id]} alt="" />}
                <span>{p.name[lang]}</span>
              </button>
            ))}
          </div>
          {pack && pack.groups.length > 0 && (
            <div className="qp-groups" role="radiogroup" aria-label={t('quickPickGroup')}>
              <button
                type="button"
                role="radio"
                aria-checked={shownGroup === 'all'}
                className={shownGroup === 'all' ? 'chip on' : 'chip'}
                onClick={() => setGroup('all')}
              >
                {t('quickPickAll')}
              </button>
              {pack.groups.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  role="radio"
                  aria-checked={shownGroup === g.id}
                  className={shownGroup === g.id ? 'chip on' : 'chip'}
                  disabled={!groupPlayable(pack, g.items, settings)}
                  onClick={() => setGroup(g.id)}
                >
                  {g.name[lang]}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button type="button" className="qp-play" onClick={play}>
        <PlayIcon />
        <span>{t('quickPickPlay')}</span>
      </button>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { GameAudio } from '../../audio/gameAudio';
import type { LoadedItem, LoadedPack } from '../../content/types';
import { loadStickers, pickSticker, saveStickers, type StickerChoice } from '../../settings/stickers';
import { choosePictures } from './layout';

/** A picture's sticker image: its drawing (or the parent's photo), the same one every time. */
export function stickerPicture(item: LoadedItem): string {
  return choosePictures([item], () => 0)[item.key];
}

/** After a finished game: a sticker of a picture the child found, if there's one they don't have yet. */
export function awardSticker(profileId: string, found: readonly StickerChoice[]): StickerChoice | null {
  const owned = loadStickers(profileId);
  const sticker = pickSticker(owned, found);
  if (sticker) saveStickers(profileId, [...owned, { ...sticker, at: Date.now() }]);
  return sticker;
}

/** The new sticker grows in the middle of the screen, then flies down into the album. */
export function StickerReveal({ picture }: { picture: string }) {
  return (
    <div className="sticker-reveal" aria-hidden="true">
      <span className="sticker big">
        <img src={picture} alt="" draggable={false} />
      </span>
    </div>
  );
}

export function AlbumIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
      <rect x="9" y="7" width="38" height="44" rx="6" fill="#f2894a" />
      <rect x="13" y="7" width="4" height="44" fill="#e0752f" />
      <rect x="21" y="15" width="20" height="16" rx="4" fill="#fff" />
      <path d="M31 18.5l2 4 4.4.6-3.2 3.1.8 4.4-4-2.1-4 2.1.8-4.4-3.2-3.1 4.4-.6z" fill="#ffc94a" />
      <rect x="21" y="35" width="20" height="3" rx="1.5" fill="#fff" opacity="0.7" />
      <rect x="21" y="41" width="13" height="3" rx="1.5" fill="#fff" opacity="0.7" />
    </svg>
  );
}

/**
 * The album: a page per pack, with the stickers found so far in colour and the rest as faint
 * shapes to look forward to. Tapping a sticker plays its sound and name. No text.
 */
export function StickerAlbum({
  profileId,
  packs,
  audio,
  onClose,
}: {
  profileId: string;
  packs: readonly LoadedPack[];
  audio: GameAudio;
  onClose: () => void;
}) {
  const owned = useMemo(() => new Set(loadStickers(profileId).map((s) => `${s.packId}|${s.key}`)), [profileId]);
  // Only pages the child has started.
  const pages = useMemo(() => packs.filter((p) => p.items.some((i) => owned.has(`${p.id}|${i.key}`))), [packs, owned]);
  const [pageId, setPageId] = useState(pages[0]?.id ?? '');
  const page = pages.find((p) => p.id === pageId) ?? pages[0];

  return (
    <div className="album" onPointerDown={(e) => e.stopPropagation()}>
      <div className="album-top">
        <div className="album-tabs">
          {pages.map((p) => (
            <button
              type="button"
              key={p.id}
              className={p.id === page?.id ? 'album-tab on' : 'album-tab'}
              aria-label={p.name.en}
              onClick={() => setPageId(p.id)}
            >
              <img src={stickerPicture(p.items.find((i) => owned.has(`${p.id}|${i.key}`)) ?? p.items[0])} alt="" />
            </button>
          ))}
        </div>
        <button type="button" className="album-close" aria-label="Close" onClick={onClose}>
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <path d="M8 8l14 14M22 8L8 22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {page && (
        <div className="album-page">
          {page.items.map((item) => {
            const has = owned.has(`${page.id}|${item.key}`);
            return (
              <button
                type="button"
                key={item.key}
                className={has ? 'sticker' : 'sticker missing'}
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => {
                  if (has) void audio.explore(item);
                }}
              >
                <img src={stickerPicture(item)} alt="" draggable={false} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

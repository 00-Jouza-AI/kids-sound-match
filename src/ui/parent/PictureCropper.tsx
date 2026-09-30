import { useRef, useState, type PointerEvent } from 'react';
import { centredSquare, clampCrop, cropToBlob, type CropSquare } from '../../custom/imageTools';
import { useI18n } from '../../i18n/I18n';
import { Overlay } from './components';

const VIEW = 300;
const MAX_ZOOM = 4;

/** Square crop: drag the photo to move it, slider to zoom. Saves a 720 x 720 JPEG. */
export function PictureCropper({
  image,
  onUse,
  onClose,
}: {
  image: HTMLImageElement;
  onUse: (picture: Blob) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const base = centredSquare(w, h);
  const [crop, setCrop] = useState<CropSquare>(base);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; crop: CropSquare } | null>(null);
  const scale = VIEW / crop.size;
  const zoom = base.size / crop.size;

  const setZoom = (z: number) => {
    const size = base.size / z;
    const cx = crop.x + crop.size / 2;
    const cy = crop.y + crop.size / 2;
    setCrop(clampCrop({ x: cx - size / 2, y: cy - size / 2, size }, w, h));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, crop };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const k = d.crop.size / VIEW;
    setCrop(clampCrop({ ...d.crop, x: d.crop.x - (e.clientX - d.x) * k, y: d.crop.y - (e.clientY - d.y) * k }, w, h));
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <Overlay label={t('cropTitle')} onDismiss={onClose}>
      <h2>{t('cropTitle')}</h2>
      <p className="hint">{t('cropHint')}</p>
      <div
        className="cropper"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <img
          src={image.src}
          alt=""
          draggable={false}
          style={{ width: w * scale, height: h * scale, left: -crop.x * scale, top: -crop.y * scale }}
        />
      </div>
      <input
        className="zoom"
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        aria-label={t('cropTitle')}
        onChange={(e) => setZoom(Number(e.target.value))}
      />
      <div className="pin-footer">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            onUse(await cropToBlob(image, crop));
          }}
        >
          {t('usePicture')}
        </button>
      </div>
    </Overlay>
  );
}

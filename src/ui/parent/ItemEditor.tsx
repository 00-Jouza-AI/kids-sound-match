import { useRef, useState } from 'react';
import { audioEngine } from '../../audio/audioEngine';
import { iconToBlob, loadImage, releaseImage } from '../../custom/imageTools';
import { customOps } from '../../custom/ops';
import { customStore } from '../../custom/store';
import { blobUrl } from '../../custom/toLoaded';
import { itemComplete, type CustomItem, type CustomPack } from '../../custom/types';
import { useI18n } from '../../i18n/I18n';
import { Overlay, Screen } from './components';
import { IconPicker } from './IconPicker';
import { PictureCropper } from './PictureCropper';
import { SoundEditor } from './SoundEditor';

type Slot = 'ar' | 'en' | 'sound';
const ops = customOps(customStore);

/** One item: a picture (photo or icon), its names, the name spoken in Arabic/English, and an optional sound. */
export function ItemEditor({
  pack,
  item,
  onDone,
  onCancel,
}: {
  pack: CustomPack;
  item: CustomItem | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CustomItem>(() => item ?? ops.emptyItem(pack.id));
  const [mediaChanged, setMediaChanged] = useState(false);
  const [cropping, setCropping] = useState<HTMLImageElement | null>(null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [slotOpen, setSlotOpen] = useState<Slot | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState(false);
  const [saving, setSaving] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const setMedia = (patch: Partial<CustomItem>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMediaChanged(true);
  };
  const slotBlob = (slot: Slot) => (slot === 'sound' ? draft.sound : (draft.nameAudio[slot] ?? null));
  const setSlot = (slot: Slot, blob: Blob | null) => {
    if (slot === 'sound') {
      setMedia({ sound: blob });
      return;
    }
    const nameAudio = { ...draft.nameAudio };
    if (blob) nameAudio[slot] = blob;
    else delete nameAudio[slot];
    setMedia({ nameAudio });
  };

  const openPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCropping(await loadImage(file));
      setProblem(false);
    } catch {
      setProblem(true);
    }
  };

  const play = (blob: Blob) => {
    audioEngine.unlock();
    audioEngine.stopAll();
    void audioEngine.play({ kind: 'file', url: blobUrl(blob), category: 'name', label: 'item-preview' }, () => false);
  };

  const named = Boolean(draft.name.ar.trim() || draft.name.en.trim());
  const complete = named && itemComplete({ ...draft, deleted: false });

  const save = async () => {
    setSaving(true);
    await ops.saveItem({ ...draft, name: { ar: draft.name.ar.trim(), en: draft.name.en.trim() } }, mediaChanged || !item);
    onDone();
  };

  const slots: { slot: Slot; label: string }[] = [
    { slot: 'ar', label: t('recNameAr') },
    { slot: 'en', label: t('recNameEn') },
    { slot: 'sound', label: t('recSound') },
  ];

  return (
    <Screen title={item ? t('editItem') : t('newItem')} onBack={onCancel}>
      <section className="card">
        <h2>{t('picture')}</h2>
        <div className="picture-row">
          <div className="picture-preview">
            {draft.picture ? <img src={blobUrl(draft.picture)} alt="" /> : <span aria-hidden="true">🖼️</span>}
          </div>
          <div className="stack">
            <button type="button" className="btn" onClick={() => camera.current?.click()}>
              📷 {t('takePhoto')}
            </button>
            <button type="button" className="btn" onClick={() => gallery.current?.click()}>
              🖼️ {t('choosePhoto')}
            </button>
            <button type="button" className="btn" onClick={() => setPickingIcon(true)}>
              😀 {t('chooseIcon')}
            </button>
          </div>
        </div>
        {problem && (
          <p className="msg error" role="alert">
            {t('pictureUnreadable')}
          </p>
        )}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void openPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void openPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </section>

      <section className="card">
        <h2>{t('names')}</h2>
        <label className="field">
          <span>{t('nameAr')}</span>
          <input
            dir="rtl"
            lang="ar"
            value={draft.name.ar}
            onChange={(e) => setDraft((d) => ({ ...d, name: { ...d.name, ar: e.target.value } }))}
          />
        </label>
        <label className="field">
          <span>{t('nameEn')}</span>
          <input
            dir="ltr"
            lang="en"
            value={draft.name.en}
            onChange={(e) => setDraft((d) => ({ ...d, name: { ...d.name, en: e.target.value } }))}
          />
        </label>
      </section>

      <section className="card">
        <h2>{t('recordings')}</h2>
        {slots.map(({ slot, label }) => {
          const blob = slotBlob(slot);
          return (
            <div className="rec-row" key={slot}>
              <div className="row-text">
                <span className="row-label">{label}</span>
                <span className={blob ? 'hint done' : 'hint'}>{blob ? `✓ ${t('recorded')}` : t('notRecorded')}</span>
              </div>
              <div className="rec-actions">
                {blob && (
                  <button type="button" className="btn" onClick={() => play(blob)} aria-label={t('play')}>
                    ▶
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setSlotOpen(slot)}>
                  {blob ? `✂ ${t('trim')}` : `● ${t('record')}`}
                </button>
                {blob && (
                  <button type="button" className="btn ghost" onClick={() => setSlot(slot, null)}>
                    {t('removeRecording')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {!complete && <p className="hint">{t('itemNeeds')}</p>}
      <div className="stack">
        <button type="button" className="btn primary wide big" disabled={!complete || saving} onClick={() => void save()}>
          {t('save')}
        </button>
        {item && (
          <button type="button" className="btn danger-outline wide" onClick={() => setConfirmDelete(true)}>
            {t('deleteItem')}
          </button>
        )}
      </div>

      {cropping && (
        <PictureCropper
          image={cropping}
          onClose={() => {
            releaseImage(cropping);
            setCropping(null);
          }}
          onUse={(picture) => {
            releaseImage(cropping);
            setMedia({ picture, pictureKind: 'photo' });
            setCropping(null);
          }}
        />
      )}
      {pickingIcon && (
        <IconPicker
          onClose={() => setPickingIcon(false)}
          onPick={async (icon) => {
            setMedia({ picture: await iconToBlob(icon), pictureKind: 'icon' });
            setPickingIcon(false);
          }}
        />
      )}
      {slotOpen && (
        <SoundEditor
          title={slots.find((s) => s.slot === slotOpen)!.label}
          existing={slotBlob(slotOpen)}
          onClose={() => setSlotOpen(null)}
          onUse={(clip) => {
            setSlot(slotOpen, clip);
            setSlotOpen(null);
          }}
        />
      )}
      {confirmDelete && (
        <Overlay label={t('deleteItem')} onDismiss={() => setConfirmDelete(false)}>
          <h2>{t('deleteItemTitle')}</h2>
          <div className="pin-footer">
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await ops.deleteItem(draft);
                onDone();
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Overlay>
      )}
    </Screen>
  );
}

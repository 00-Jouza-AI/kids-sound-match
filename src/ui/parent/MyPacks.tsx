import { useState } from 'react';
import { MIN_ITEMS_PER_PACK } from '../../content/validate';
import { customOps } from '../../custom/ops';
import { customStore } from '../../custom/store';
import { blobUrl, type CustomPackView } from '../../custom/toLoaded';
import { itemComplete } from '../../custom/types';
import { useI18n } from '../../i18n/I18n';
import { CloudBackup } from './CloudBackup';
import { ChevronIcon, Overlay, Screen } from './components';
import { ItemEditor } from './ItemEditor';

const ops = customOps(customStore);

/** The parent's own packs: family, toys, food... Made with their photos and their voice. */
export function MyPacks({
  views,
  onChanged,
  onPersonalize,
  onBack,
}: {
  views: readonly CustomPackView[];
  onChanged: () => Promise<void>;
  /** Opens "Your voice and photos" for the built-in packs. */
  onPersonalize: () => void;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ itemId: string | null } | null>(null);
  const [creating, setCreating] = useState<{ ar: string; en: string } | null>(null);
  const open = views.find((v) => v.pack.id === openId);

  if (open && editing) {
    const item = editing.itemId ? (open.items.find((i) => i.id === editing.itemId) ?? null) : null;
    return (
      <ItemEditor
        pack={open.pack}
        item={item}
        onCancel={() => setEditing(null)}
        onDone={async () => {
          await onChanged();
          setEditing(null);
        }}
      />
    );
  }

  if (open) {
    return (
      <PackDetail
        view={open}
        onBack={() => setOpenId(null)}
        onEdit={(itemId) => setEditing({ itemId })}
        onChanged={onChanged}
        onDeleted={async () => {
          await onChanged();
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <Screen title={t('myPacks')} onBack={onBack}>
      <p className="hint">{t('myPacksIntro')}</p>
      <button type="button" className="card pack-card" onClick={onPersonalize}>
        <span className="link-icon big" aria-hidden="true">
          🎙️
        </span>
        <span className="pack-text">
          <strong>{t('personalizeTitle')}</strong>
          <span className="hint">{t('personalizeCardSub')}</span>
        </span>
        <ChevronIcon />
      </button>
      <CloudBackup />
      {views.map((v) => (
        <button type="button" key={v.pack.id} className="card pack-card" onClick={() => setOpenId(v.pack.id)}>
          <span className="pack-thumbs" aria-hidden="true">
            {v.items
              .filter((i) => i.picture)
              .slice(0, 3)
              .map((i) => (
                <img key={i.id} src={blobUrl(i.picture!)} alt="" />
              ))}
          </span>
          <span className="pack-text">
            <strong>{v.pack.name[lang] || v.pack.name.en || v.pack.name.ar}</strong>
            <span className="hint">
              {t('itemsCount', { n: v.loaded.items.length })} · <ReadyLine view={v} />
            </span>
          </span>
          <ChevronIcon />
        </button>
      ))}
      {creating ? (
        <section className="card">
          <h2>{t('newPack')}</h2>
          <PackNameFields value={creating} onChange={setCreating} />
          <div className="nudge-actions">
            <button
              type="button"
              className="btn primary"
              disabled={!creating.ar.trim() && !creating.en.trim()}
              onClick={async () => {
                const pack = await ops.createPack({ ar: creating.ar.trim(), en: creating.en.trim() });
                setCreating(null);
                await onChanged();
                setOpenId(pack.id);
              }}
            >
              {t('create')}
            </button>
            <button type="button" className="btn ghost" onClick={() => setCreating(null)}>
              {t('cancel')}
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className="btn primary wide" onClick={() => setCreating({ ar: '', en: '' })}>
          + {t('newPack')}
        </button>
      )}
    </Screen>
  );
}

function ReadyLine({ view }: { view: CustomPackView }) {
  const { t } = useI18n();
  const ready = view.loaded.items.length;
  if (ready < MIN_ITEMS_PER_PACK) return <>{t('needsMore', { n: MIN_ITEMS_PER_PACK - ready })}</>;
  const withSound = view.loaded.items.filter((i) => i.sound).length;
  return <>{withSound >= MIN_ITEMS_PER_PACK ? t('readyToPlay') : t('readyNameOnly')}</>;
}

function PackNameFields({ value, onChange }: { value: { ar: string; en: string }; onChange: (v: { ar: string; en: string }) => void }) {
  const { t } = useI18n();
  return (
    <>
      <label className="field">
        <span>{t('packNameAr')}</span>
        <input dir="rtl" lang="ar" value={value.ar} onChange={(e) => onChange({ ...value, ar: e.target.value })} />
      </label>
      <label className="field">
        <span>{t('packNameEn')}</span>
        <input dir="ltr" lang="en" value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </label>
    </>
  );
}

function PackDetail({
  view,
  onBack,
  onEdit,
  onChanged,
  onDeleted,
}: {
  view: CustomPackView;
  onBack: () => void;
  onEdit: (itemId: string | null) => void;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const [name, setName] = useState({ ar: view.pack.name.ar, en: view.pack.name.en });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renamed = name.ar !== view.pack.name.ar || name.en !== view.pack.name.en;
  const title = view.pack.name[lang] || view.pack.name.en || view.pack.name.ar;

  return (
    <Screen title={title} onBack={onBack}>
      <p className="hint">
        <ReadyLine view={view} />
      </p>
      <section className="card">
        <div className="item-grid">
          {view.items.map((item) => (
            <button type="button" key={item.id} className="animal on" onClick={() => onEdit(item.id)}>
              {item.picture ? <img src={blobUrl(item.picture)} alt="" /> : <span className="no-pic">🖼️</span>}
              <span className="animal-name">{item.name[lang] || item.name.en || item.name.ar || '…'}</span>
              <span className="badges" aria-hidden="true">
                {item.nameAudio.ar ? 'ع' : ''}
                {item.nameAudio.en ? 'E' : ''}
                {item.sound ? '♪' : ''}
              </span>
              {!itemComplete(item) && <span className="tag">{t('unfinished')}</span>}
            </button>
          ))}
          <button type="button" className="animal add-item" onClick={() => onEdit(null)}>
            <span className="plus" aria-hidden="true">
              +
            </span>
            <span className="animal-name">{t('addItem')}</span>
          </button>
        </div>
      </section>

      <section className="card">
        <h2>{t('packName')}</h2>
        <PackNameFields value={name} onChange={setName} />
        {renamed && (
          <button
            type="button"
            className="btn primary"
            disabled={!name.ar.trim() && !name.en.trim()}
            onClick={async () => {
              await ops.renamePack(view.pack, { ar: name.ar.trim(), en: name.en.trim() });
              await onChanged();
            }}
          >
            {t('save')}
          </button>
        )}
      </section>

      <button type="button" className="btn danger-outline wide" onClick={() => setConfirmDelete(true)}>
        {t('deletePack')}
      </button>

      {confirmDelete && (
        <Overlay label={t('deletePack')} onDismiss={() => setConfirmDelete(false)}>
          <h2>{t('deletePack')}</h2>
          <p>{t('deletePackBody')}</p>
          <div className="pin-footer">
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await ops.deletePack(view.pack);
                await onDeleted();
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

import { useState, useSyncExternalStore } from 'react';
import { cloud, cloudConfigured } from '../../custom/cloud';
import { formatDateTime, useI18n } from '../../i18n/I18n';
import { Overlay } from './components';

/** Optional Google sign-in that backs up the parent's own packs to their private cloud space. */
export function CloudBackup() {
  const { t, lang } = useI18n();
  const state = useSyncExternalStore(cloud.subscribe, () => cloud.state);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!cloudConfigured) {
    // Release builds without a cloud project simply don't have the feature.
    return import.meta.env.DEV ? (
      <section className="card">
        <h2>{t('cloudTitle')}</h2>
        <p className="hint">{t('cloudNotSetUp')}</p>
      </section>
    ) : null;
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch (e) {
      console.warn('[cloud]', e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const signedIn = state.email !== null;
  return (
    <section className="card cloud-card">
      <h2>☁️ {t('cloudTitle')}</h2>
      {!signedIn ? (
        <>
          <p>{t('cloudIntro')}</p>
          <button type="button" className="btn google wide" disabled={busy} onClick={() => void run(() => cloud.signIn())}>
            <span className="g-mark" aria-hidden="true">
              G
            </span>
            {t('signInGoogle')}
          </button>
          {!window.isSecureContext && <p className="hint">{t('signInNeedsSecure')}</p>}
        </>
      ) : (
        <>
          <p>{t('signedInAs', { email: state.email ?? '' })}</p>
          <p className={state.status === 'error' ? 'msg error' : 'hint'}>
            {state.status === 'syncing'
              ? t('syncing')
              : state.status === 'error'
                ? t('syncFailed')
                : state.lastSyncedAt
                  ? t('syncedAt', { time: formatDateTime(state.lastSyncedAt, lang) })
                  : ''}
          </p>
          <div className="nudge-actions">
            <button type="button" className="btn" disabled={busy || state.status === 'syncing'} onClick={() => void run(() => cloud.syncNow())}>
              ⟳ {t('syncNow')}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => cloud.signOut())}>
              {t('signOut')}
            </button>
          </div>
          <button type="button" className="btn danger-outline wide" disabled={busy} onClick={() => setConfirmDelete(true)}>
            {t('deleteCloud')}
          </button>
        </>
      )}
      {failed && (
        <p className="msg error" role="alert">
          {t('syncFailed')}
        </p>
      )}
      {confirmDelete && (
        <Overlay label={t('deleteCloud')} onDismiss={() => setConfirmDelete(false)}>
          <h2>{t('deleteCloud')}</h2>
          <p>{t('deleteCloudBody')}</p>
          <div className="pin-footer">
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmDelete(false);
                void run(() => cloud.deleteCloudData());
              }}
            >
              {t('delete')}
            </button>
          </div>
        </Overlay>
      )}
    </section>
  );
}

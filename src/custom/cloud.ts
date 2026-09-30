import type { SupabaseClient } from '@supabase/supabase-js';
import { local, session } from '../settings/storage';
import { customStore } from './store';
import { forgetCloud, runSync, type Remote, type RemoteItem, type RemoteOverride, type RemotePack } from './sync';
import type { MediaName } from './types';

/**
 * Optional cloud backup of the parent's own packs (Supabase: Google sign-in, a private table
 * per account and private file storage). Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the
 * feature doesn't exist. The app contacts Supabase only after a parent chooses to sign in.
 */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const cloudConfigured = SUPABASE_URL !== '' && SUPABASE_KEY !== '';

const AUTH_STORAGE_KEY = 'ksm.auth';
const RETURN_KEY = 'ksm.returnToMyPacks';
const BUCKET = 'custom-media';
const ALL_MEDIA: MediaName[] = ['picture', 'name_ar', 'name_en', 'sound'];

let client: Promise<SupabaseClient> | null = null;
function supabase(): Promise<SupabaseClient> {
  if (!cloudConfigured) return Promise.reject(new Error('Cloud backup is not set up'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
    }),
  );
  return client;
}

function supabaseRemote(sb: SupabaseClient, uid: string): Remote {
  const path = (itemId: string, name: MediaName) => `${uid}/${itemId}/${name}`;
  // "Your voice and photos": stored under the path of the built-in file each one replaces.
  const overridePath = (assetPath: string) => `${uid}/overrides/${assetPath}`;
  const check = <T>(r: { data: T; error: unknown }): T => {
    if (r.error) throw r.error;
    return r.data;
  };
  return {
    async listPacks() {
      return check(await sb.from('custom_packs').select('id,name_en,name_ar,updated_at,deleted')) as RemotePack[];
    },
    async listItems() {
      return check(
        await sb
          .from('custom_items')
          .select('id,pack_id,name_en,name_ar,picture_kind,has_name_ar,has_name_en,has_sound,media_version,updated_at,deleted'),
      ) as RemoteItem[];
    },
    async listOverrides() {
      return check(await sb.from('custom_overrides').select('path,media_version,updated_at,deleted')) as RemoteOverride[];
    },
    async upsertPack(pack) {
      check(await sb.from('custom_packs').upsert({ ...pack, user_id: uid }));
    },
    async upsertOverride(override) {
      check(await sb.from('custom_overrides').upsert({ ...override, user_id: uid }, { onConflict: 'user_id,path' }));
    },
    async uploadOverride(assetPath, blob) {
      check(
        await sb.storage.from(BUCKET).upload(overridePath(assetPath), blob, { upsert: true, contentType: blob.type || undefined }),
      );
    },
    async downloadOverride(assetPath) {
      const data = check(await sb.storage.from(BUCKET).download(overridePath(assetPath)));
      if (!data) throw new Error(`Missing your recording or photo for ${assetPath}`);
      return data;
    },
    async removeOverride(assetPath) {
      check(await sb.storage.from(BUCKET).remove([overridePath(assetPath)]));
    },
    async upsertItem(item) {
      check(await sb.from('custom_items').upsert({ ...item, user_id: uid }));
    },
    async uploadMedia(itemId, name, blob) {
      check(await sb.storage.from(BUCKET).upload(path(itemId, name), blob, { upsert: true, contentType: blob.type || undefined }));
    },
    async downloadMedia(itemId, name) {
      const data = check(await sb.storage.from(BUCKET).download(path(itemId, name)));
      if (!data) throw new Error(`Missing ${name} for ${itemId}`);
      return data;
    },
    async removeMedia(itemId, names) {
      check(await sb.storage.from(BUCKET).remove(names.map((n) => path(itemId, n))));
    },
    async deleteEverything() {
      const items = check(await sb.from('custom_items').select('id')) as { id: string }[];
      const overrides = check(await sb.from('custom_overrides').select('path')) as { path: string }[];
      const paths = [...items.flatMap((i) => ALL_MEDIA.map((n) => path(i.id, n))), ...overrides.map((o) => overridePath(o.path))];
      for (let i = 0; i < paths.length; i += 100) check(await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
      check(await sb.from('custom_overrides').delete().eq('user_id', uid));
      check(await sb.from('custom_items').delete().eq('user_id', uid));
      check(await sb.from('custom_packs').delete().eq('user_id', uid));
    },
  };
}

export type CloudStatus = 'unavailable' | 'signedOut' | 'syncing' | 'synced' | 'error';

export interface CloudState {
  status: CloudStatus;
  email: string | null;
  lastSyncedAt: number | null;
}

let state: CloudState = { status: cloudConfigured ? 'signedOut' : 'unavailable', email: null, lastSyncedAt: null };
let uid: string | null = null;
const listeners = new Set<() => void>();
let onPulled: () => void = () => undefined;
let syncTimer: number | null = null;
let running: Promise<void> | null = null;

function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const cloud = {
  get state(): CloudState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Called once at start. Only talks to Supabase if a parent signed in before, or is coming back
   * from Google's sign-in page. `changed` runs when a sync brought new items to this phone.
   */
  async init(changed: () => void): Promise<void> {
    onPulled = changed;
    if (!cloudConfigured) return;
    const hasSession = local.get(AUTH_STORAGE_KEY) !== null || new URLSearchParams(location.search).has('code');
    if (!hasSession) return;
    try {
      const sb = await supabase();
      const { data } = await sb.auth.getSession(); // also finishes the return from Google
      const url = new URL(location.href);
      if (url.searchParams.has('code')) {
        url.searchParams.delete('code');
        history.replaceState(history.state, '', url.toString());
      }
      const user = data.session?.user;
      if (!user) {
        set({ status: 'signedOut', email: null });
        return;
      }
      uid = user.id;
      set({ status: 'synced', email: user.email ?? '' });
      await cloud.syncNow();
    } catch (e) {
      console.warn('[cloud] could not restore the session', e);
      set({ status: 'error' });
    }
  },

  /** True once, right after returning from Google, so the app can reopen My packs. */
  takeReturnToMyPacks(): boolean {
    const back = session.get(RETURN_KEY) !== null;
    session.remove(RETURN_KEY);
    return back;
  },

  async signIn(): Promise<void> {
    session.set(RETURN_KEY, '1');
    const sb = await supabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    const sb = await supabase();
    await sb.auth.signOut();
    uid = null;
    set({ status: 'signedOut', email: null, lastSyncedAt: null });
  },

  async syncNow(): Promise<void> {
    if (!uid) return;
    if (running) return running;
    running = (async () => {
      set({ status: 'syncing' });
      try {
        const result = await runSync(customStore, supabaseRemote(await supabase(), uid!), uid!);
        set({ status: 'synced', lastSyncedAt: Date.now() });
        if (result.pulled) onPulled();
      } catch (e) {
        console.warn('[cloud] sync failed', e);
        set({ status: 'error' });
      } finally {
        running = null;
      }
    })();
    return running;
  },

  /** After a local change: sync a moment later (several quick edits become one sync). */
  scheduleSync(): void {
    if (!uid) return;
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      void cloud.syncNow();
    }, 1500);
  },

  /** Removes everything from the cloud and signs out. The packs stay on this phone. */
  async deleteCloudData(): Promise<void> {
    if (!uid) return;
    const sb = await supabase();
    await supabaseRemote(sb, uid).deleteEverything();
    await forgetCloud(customStore);
    await cloud.signOut();
  },
};

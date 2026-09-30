import type { Lang } from '../content/types';
import type { CustomStore } from './store';
import type { CustomItem, CustomPack, MediaName } from './types';

/** Cloud rows (see supabase/schema.sql). Timestamps are milliseconds. */
export interface RemotePack {
  id: string;
  name_en: string;
  name_ar: string;
  updated_at: number;
  deleted: boolean;
}

export interface RemoteItem {
  id: string;
  pack_id: string;
  name_en: string;
  name_ar: string;
  picture_kind: 'photo' | 'icon';
  has_name_ar: boolean;
  has_name_en: boolean;
  has_sound: boolean;
  media_version: number;
  updated_at: number;
  deleted: boolean;
}

/** What sync needs from the cloud. Supabase implements it; tests use an in-memory fake. */
export interface Remote {
  listPacks(): Promise<RemotePack[]>;
  listItems(): Promise<RemoteItem[]>;
  upsertPack(pack: RemotePack): Promise<void>;
  upsertItem(item: RemoteItem): Promise<void>;
  uploadMedia(itemId: string, name: MediaName, blob: Blob): Promise<void>;
  downloadMedia(itemId: string, name: MediaName): Promise<Blob>;
  removeMedia(itemId: string, names: MediaName[]): Promise<void>;
  deleteEverything(): Promise<void>;
}

export interface SyncPlan {
  pushPacks: CustomPack[];
  pullPacks: RemotePack[];
  pushItems: CustomItem[];
  pullItems: RemoteItem[];
}

/**
 * A device record goes up to this account only if it was never backed up, or was backed up to this
 * same account. On a shared phone, one parent's items never end up in another parent's cloud.
 */
const uploadable = (ownerId: string | undefined, uid: string) => ownerId === undefined || ownerId === uid;

/** Last write wins, record by record. Deletions travel as markers (`deleted: true`). */
export function planSync(
  local: { packs: readonly CustomPack[]; items: readonly CustomItem[] },
  remote: { packs: readonly RemotePack[]; items: readonly RemoteItem[] },
  uid: string,
): SyncPlan {
  const remotePacks = new Map(remote.packs.map((p) => [p.id, p]));
  const remoteItems = new Map(remote.items.map((i) => [i.id, i]));
  const localPacks = new Map(local.packs.map((p) => [p.id, p]));
  const localItems = new Map(local.items.map((i) => [i.id, i]));
  const changedHere = (r: { ownerId?: string; syncedAt?: number; updatedAt: number }, remoteUpdated?: number) =>
    uploadable(r.ownerId, uid) && r.syncedAt !== r.updatedAt && (remoteUpdated === undefined || r.updatedAt > remoteUpdated);
  const newerThere = (remoteUpdated: number, localRecord?: { updatedAt: number }) =>
    !localRecord || remoteUpdated > localRecord.updatedAt;

  return {
    pushPacks: local.packs.filter((p) => changedHere(p, remotePacks.get(p.id)?.updated_at)),
    pullPacks: remote.packs.filter((r) => newerThere(r.updated_at, localPacks.get(r.id))),
    pushItems: local.items.filter((i) => changedHere(i, remoteItems.get(i.id)?.updated_at)),
    pullItems: remote.items.filter((r) => newerThere(r.updated_at, localItems.get(r.id))),
  };
}

export function toRemotePack(p: CustomPack): RemotePack {
  return { id: p.id, name_en: p.name.en, name_ar: p.name.ar, updated_at: p.updatedAt, deleted: p.deleted };
}

export function toRemoteItem(i: CustomItem): RemoteItem {
  return {
    id: i.id,
    pack_id: i.packId,
    name_en: i.name.en,
    name_ar: i.name.ar,
    picture_kind: i.pictureKind,
    has_name_ar: Boolean(i.nameAudio.ar),
    has_name_en: Boolean(i.nameAudio.en),
    has_sound: Boolean(i.sound),
    media_version: i.mediaVersion,
    updated_at: i.updatedAt,
    deleted: i.deleted,
  };
}

const NAME_MEDIA: Record<Lang, MediaName> = { ar: 'name_ar', en: 'name_en' };
const ALL_MEDIA: MediaName[] = ['picture', 'name_ar', 'name_en', 'sound'];

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** One full two-way sync for the signed-in parent. */
export async function runSync(store: CustomStore, remote: Remote, uid: string): Promise<SyncResult> {
  const [packs, items, remotePacks, remoteItems] = await Promise.all([
    store.packs(),
    store.items(),
    remote.listPacks(),
    remote.listItems(),
  ]);
  const plan = planSync({ packs, items }, { packs: remotePacks, items: remoteItems }, uid);
  const localItem = new Map(items.map((i) => [i.id, i]));
  const localPack = new Map(packs.map((p) => [p.id, p]));
  // A parent may edit while a sync runs; never overwrite a record that changed since we read it.
  const unchanged = async <T extends { id: string; updatedAt: number }>(read: () => Promise<T[]>, before?: T) => {
    if (!before) return true; // nothing here yet: a cloud-only record can't have been edited on this phone
    const latest = (await read()).find((r) => r.id === before.id);
    return !latest || latest.updatedAt === before.updatedAt;
  };

  for (const r of plan.pullPacks) {
    if (!(await unchanged(() => store.packs(), localPack.get(r.id)))) continue;
    await store.putPack({
      id: r.id,
      name: { en: r.name_en, ar: r.name_ar },
      updatedAt: r.updated_at,
      deleted: r.deleted,
      ownerId: uid,
      syncedAt: r.updated_at,
    });
  }

  for (const r of plan.pullItems) {
    const before = localItem.get(r.id);
    let media: Pick<CustomItem, 'picture' | 'nameAudio' | 'sound'>;
    if (r.deleted) media = { picture: null, nameAudio: {}, sound: null };
    else if (before && before.mediaVersion === r.media_version && before.picture) {
      media = { picture: before.picture, nameAudio: before.nameAudio, sound: before.sound };
    } else {
      media = {
        picture: await remote.downloadMedia(r.id, 'picture'),
        nameAudio: {
          ...(r.has_name_ar ? { ar: await remote.downloadMedia(r.id, 'name_ar') } : {}),
          ...(r.has_name_en ? { en: await remote.downloadMedia(r.id, 'name_en') } : {}),
        },
        sound: r.has_sound ? await remote.downloadMedia(r.id, 'sound') : null,
      };
    }
    if (!(await unchanged(() => store.items(), before))) continue;
    await store.putItem({
      id: r.id,
      packId: r.pack_id,
      name: { en: r.name_en, ar: r.name_ar },
      pictureKind: r.picture_kind,
      ...media,
      mediaVersion: r.media_version,
      updatedAt: r.updated_at,
      deleted: r.deleted,
      ownerId: uid,
      syncedAt: r.updated_at,
      syncedMediaVersion: r.media_version,
    });
  }

  for (const p of plan.pushPacks) {
    await remote.upsertPack(toRemotePack(p));
    if (await unchanged(() => store.packs(), p)) await store.putPack({ ...p, ownerId: uid, syncedAt: p.updatedAt });
  }

  for (const i of plan.pushItems) {
    if (i.deleted) {
      await remote.removeMedia(i.id, ALL_MEDIA);
    } else if (i.syncedMediaVersion !== i.mediaVersion && i.picture) {
      await remote.uploadMedia(i.id, 'picture', i.picture);
      const gone: MediaName[] = [];
      for (const lang of ['ar', 'en'] as const) {
        const blob = i.nameAudio[lang];
        if (blob) await remote.uploadMedia(i.id, NAME_MEDIA[lang], blob);
        else gone.push(NAME_MEDIA[lang]);
      }
      if (i.sound) await remote.uploadMedia(i.id, 'sound', i.sound);
      else gone.push('sound');
      if (gone.length) await remote.removeMedia(i.id, gone);
    }
    await remote.upsertItem(toRemoteItem(i));
    if (await unchanged(() => store.items(), i)) {
      await store.putItem({ ...i, ownerId: uid, syncedAt: i.updatedAt, syncedMediaVersion: i.mediaVersion });
    }
  }

  return {
    pushed: plan.pushPacks.length + plan.pushItems.length,
    pulled: plan.pullPacks.length + plan.pullItems.length,
  };
}

/** After "Delete my cloud data": everything stays on this phone, no longer linked to an account. */
export async function forgetCloud(store: CustomStore): Promise<void> {
  for (const p of await store.packs()) await store.putPack({ ...p, ownerId: undefined, syncedAt: undefined });
  for (const i of await store.items()) {
    await store.putItem({ ...i, ownerId: undefined, syncedAt: undefined, syncedMediaVersion: undefined });
  }
}

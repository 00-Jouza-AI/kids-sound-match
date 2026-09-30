import type { LocalizedText } from '../content/types';
import type { CustomStore } from './store';
import { newId, type CustomItem, type CustomPack } from './types';

/** Creating, editing and deleting the parent's packs and items. */
export function customOps(store: CustomStore, now: () => number = Date.now) {
  const tombstone = (item: CustomItem): CustomItem => ({
    ...item,
    deleted: true,
    picture: null,
    nameAudio: {},
    sound: null,
    mediaVersion: item.mediaVersion + 1,
    updatedAt: now(),
  });

  return {
    async createPack(name: LocalizedText): Promise<CustomPack> {
      const pack: CustomPack = { id: newId(), name, updatedAt: now(), deleted: false };
      await store.putPack(pack);
      return pack;
    },

    async renamePack(pack: CustomPack, name: LocalizedText): Promise<void> {
      await store.putPack({ ...pack, name, updatedAt: now() });
    },

    /** Deletes the pack and its items (their files are dropped on this phone straight away). */
    async deletePack(pack: CustomPack): Promise<void> {
      await store.putPack({ ...pack, deleted: true, updatedAt: now() });
      for (const item of await store.items()) {
        if (item.packId === pack.id && !item.deleted) await store.putItem(tombstone(item));
      }
    },

    emptyItem(packId: string): CustomItem {
      return {
        id: newId(),
        packId,
        name: { en: '', ar: '' },
        picture: null,
        pictureKind: 'photo',
        nameAudio: {},
        sound: null,
        mediaVersion: 0,
        updatedAt: 0,
        deleted: false,
      };
    },

    /** `mediaChanged`: the picture or a recording changed, so a signed-in sync re-sends the files. */
    async saveItem(item: CustomItem, mediaChanged: boolean): Promise<void> {
      await store.putItem({ ...item, mediaVersion: item.mediaVersion + (mediaChanged ? 1 : 0), updatedAt: now() });
    },

    async deleteItem(item: CustomItem): Promise<void> {
      await store.putItem(tombstone(item));
    },
  };
}

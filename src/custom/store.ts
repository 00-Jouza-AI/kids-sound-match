import type { AssetOverride, CustomItem, CustomPack } from './types';

/**
 * On-device storage for custom packs, including their pictures and recordings (as Blobs), and for
 * the parent's own voice and photos in the built-in packs.
 */
export interface CustomStore {
  packs(): Promise<CustomPack[]>;
  items(): Promise<CustomItem[]>;
  overrides(): Promise<AssetOverride[]>;
  putPack(pack: CustomPack): Promise<void>;
  putItem(item: CustomItem): Promise<void>;
  putOverride(override: AssetOverride): Promise<void>;
}

const DB_NAME = 'ksm-custom';
const DB_VERSION = 2;
const PACKS = 'packs';
const ITEMS = 'items';
const OVERRIDES = 'overrides';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IndexedDbCustomStore implements CustomStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (e.oldVersion < 1) {
          db.createObjectStore(PACKS, { keyPath: 'id' });
          db.createObjectStore(ITEMS, { keyPath: 'id' }).createIndex('byPack', 'packId');
        }
        if (e.oldVersion < 2) db.createObjectStore(OVERRIDES, { keyPath: 'path' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async packs(): Promise<CustomPack[]> {
    const db = await this.open();
    return request(db.transaction(PACKS).objectStore(PACKS).getAll()) as Promise<CustomPack[]>;
  }

  async items(): Promise<CustomItem[]> {
    const db = await this.open();
    return request(db.transaction(ITEMS).objectStore(ITEMS).getAll()) as Promise<CustomItem[]>;
  }

  async overrides(): Promise<AssetOverride[]> {
    const db = await this.open();
    return request(db.transaction(OVERRIDES).objectStore(OVERRIDES).getAll()) as Promise<AssetOverride[]>;
  }

  async putPack(pack: CustomPack): Promise<void> {
    const db = await this.open();
    await request(db.transaction(PACKS, 'readwrite').objectStore(PACKS).put(pack));
  }

  async putItem(item: CustomItem): Promise<void> {
    const db = await this.open();
    await request(db.transaction(ITEMS, 'readwrite').objectStore(ITEMS).put(item));
  }

  async putOverride(override: AssetOverride): Promise<void> {
    const db = await this.open();
    await request(db.transaction(OVERRIDES, 'readwrite').objectStore(OVERRIDES).put(override));
  }
}

/** For tests, and for browsers where IndexedDB is blocked (then items last for this visit only). */
export class MemoryCustomStore implements CustomStore {
  private readonly packMap = new Map<string, CustomPack>();
  private readonly itemMap = new Map<string, CustomItem>();
  private readonly overrideMap = new Map<string, AssetOverride>();

  async packs() {
    return [...this.packMap.values()];
  }

  async items() {
    return [...this.itemMap.values()];
  }

  async overrides() {
    return [...this.overrideMap.values()];
  }

  async putPack(pack: CustomPack) {
    this.packMap.set(pack.id, pack);
  }

  async putItem(item: CustomItem) {
    this.itemMap.set(item.id, item);
  }

  async putOverride(override: AssetOverride) {
    this.overrideMap.set(override.path, override);
  }
}

class FallbackCustomStore implements CustomStore {
  private store: CustomStore = typeof indexedDB !== 'undefined' ? new IndexedDbCustomStore() : new MemoryCustomStore();

  private async run<T>(op: (s: CustomStore) => Promise<T>): Promise<T> {
    try {
      return await op(this.store);
    } catch (e) {
      if (this.store instanceof MemoryCustomStore) throw e;
      console.warn('[custom] IndexedDB unavailable, keeping custom packs in memory for this visit', e);
      this.store = new MemoryCustomStore();
      return op(this.store);
    }
  }

  packs() {
    return this.run((s) => s.packs());
  }

  items() {
    return this.run((s) => s.items());
  }

  overrides() {
    return this.run((s) => s.overrides());
  }

  putPack(pack: CustomPack) {
    return this.run((s) => s.putPack(pack));
  }

  putItem(item: CustomItem) {
    return this.run((s) => s.putItem(item));
  }

  putOverride(override: AssetOverride) {
    return this.run((s) => s.putOverride(override));
  }
}

export const customStore: CustomStore = new FallbackCustomStore();

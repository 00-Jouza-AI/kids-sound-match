import type { CustomItem, CustomPack } from './types';

/** On-device storage for custom packs, including their pictures and recordings (as Blobs). */
export interface CustomStore {
  packs(): Promise<CustomPack[]>;
  items(): Promise<CustomItem[]>;
  putPack(pack: CustomPack): Promise<void>;
  putItem(item: CustomItem): Promise<void>;
}

const DB_NAME = 'ksm-custom';
const DB_VERSION = 1;
const PACKS = 'packs';
const ITEMS = 'items';

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
      req.onupgradeneeded = () => {
        req.result.createObjectStore(PACKS, { keyPath: 'id' });
        req.result.createObjectStore(ITEMS, { keyPath: 'id' }).createIndex('byPack', 'packId');
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

  async putPack(pack: CustomPack): Promise<void> {
    const db = await this.open();
    await request(db.transaction(PACKS, 'readwrite').objectStore(PACKS).put(pack));
  }

  async putItem(item: CustomItem): Promise<void> {
    const db = await this.open();
    await request(db.transaction(ITEMS, 'readwrite').objectStore(ITEMS).put(item));
  }
}

/** For tests, and for browsers where IndexedDB is blocked (then items last for this visit only). */
export class MemoryCustomStore implements CustomStore {
  private readonly packMap = new Map<string, CustomPack>();
  private readonly itemMap = new Map<string, CustomItem>();

  async packs() {
    return [...this.packMap.values()];
  }

  async items() {
    return [...this.itemMap.values()];
  }

  async putPack(pack: CustomPack) {
    this.packMap.set(pack.id, pack);
  }

  async putItem(item: CustomItem) {
    this.itemMap.set(item.id, item);
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

  putPack(pack: CustomPack) {
    return this.run((s) => s.putPack(pack));
  }

  putItem(item: CustomItem) {
    return this.run((s) => s.putItem(item));
  }
}

export const customStore: CustomStore = new FallbackCustomStore();

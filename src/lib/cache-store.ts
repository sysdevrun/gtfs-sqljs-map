/**
 * IndexedDB-based cache store for browsers.
 * Adapted from gtfs-sqljs examples/cache/IndexedDBCacheStore.ts
 */

import type { CacheStore, CacheMetadata, CacheEntry, CacheEntryWithData, CacheStoreOptions } from 'gtfs-sqljs';

export class IndexedDBCacheStore implements CacheStore {
  private dbName: string;
  private storeName = 'gtfs-cache';
  private version = 1;

  constructor(options: CacheStoreOptions = {}) {
    this.dbName = options.dbName || 'gtfs-sqljs-cache';
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('timestamp', 'metadata.timestamp', { unique: false });
        }
      };
    });
  }

  async get(key: string): Promise<CacheEntryWithData | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => {
        db.close();
        const result = request.result;
        resolve(result ? { data: result.data, metadata: result.metadata } : null);
      };
    });
  }

  async set(key: string, data: ArrayBuffer, metadata: CacheMetadata): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put({ key, data, metadata });
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(); };
    });
  }

  async has(key: string): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getKey(key);
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(request.result !== undefined); };
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(); };
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(); };
    });
  }

  async list(): Promise<CacheEntry[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => {
        db.close();
        const entries: CacheEntry[] = (request.result || []).map(
          (record: { key: string; metadata: CacheMetadata }) => ({
            key: record.key,
            metadata: record.metadata,
          }),
        );
        resolve(entries);
      };
    });
  }
}

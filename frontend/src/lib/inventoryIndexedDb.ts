/**
 * Utilitário de persistência Offline-First via IndexedDB nativo e feedback sonoro Web Audio.
 */

const DB_NAME = 'CronuzInventoryDB';
const DB_VERSION = 1;

export interface CatalogItemRecord {
  inventory_id: number;
  isbn: string;
  title: string;
  publisher?: string;
  category?: string;
  default_location?: string;
}

export interface PendingScanRecord {
  client_uuid: string;
  session_id: number;
  inventory_id: number;
  isbn: string;
  location: string;
  quantity: number;
  scanned_at: string;
  status: 'pending' | 'synced';
  title?: string;
  publisher?: string;
}

function getIndexedDB(): IDBFactory | null {
  if (typeof window === 'undefined') return null;
  return window.indexedDB || (window as any).mozIndexedDB || (window as any).webkitIndexedDB || (window as any).msIndexedDB;
}

export function openInventoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      reject(new Error('IndexedDB não suportado neste navegador.'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;

      // Store para catálogo leve
      if (!db.objectStoreNames.contains('catalog')) {
        const catalogStore = db.createObjectStore('catalog', { keyPath: ['inventory_id', 'isbn'] });
        catalogStore.createIndex('inventory_id', 'inventory_id', { unique: false });
        catalogStore.createIndex('isbn', 'isbn', { unique: false });
      }

      // Store para fila de bips pendentes
      if (!db.objectStoreNames.contains('pending_scans')) {
        const scanStore = db.createObjectStore('pending_scans', { keyPath: 'client_uuid' });
        scanStore.createIndex('session_id', 'session_id', { unique: false });
        scanStore.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Catálogo ─────────────────────────────────────────────────────────────
export async function saveCatalogItems(inventoryId: number, items: any[]): Promise<void> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalog', 'readwrite');
    const store = tx.objectStore('catalog');

    for (const it of items) {
      store.put({
        inventory_id: inventoryId,
        isbn: String(it.isbn).trim(),
        title: it.title || 'Sem Título',
        publisher: it.publisher || '',
        category: it.category || '',
        default_location: it.default_location || '',
      });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function upsertCatalogItem(item: CatalogItemRecord): Promise<void> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalog', 'readwrite');
    const store = tx.objectStore('catalog');
    store.put({
      inventory_id: item.inventory_id,
      isbn: String(item.isbn).trim(),
      title: item.title || 'Sem Título',
      publisher: item.publisher || '',
      category: item.category || '',
      default_location: item.default_location || '',
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function findCatalogItem(inventoryId: number, isbn: string): Promise<CatalogItemRecord | null> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalog', 'readonly');
    const store = tx.objectStore('catalog');
    const request = store.get([inventoryId, String(isbn).trim()]);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// ─── Bips Pendentes ───────────────────────────────────────────────────────
export async function savePendingScan(scan: PendingScanRecord): Promise<void> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');
    store.put(scan);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingScans(sessionId: number): Promise<PendingScanRecord[]> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readonly');
    const store = tx.objectStore('pending_scans');
    const index = store.index('session_id');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const results = (request.result || []).filter((r: PendingScanRecord) => r.status === 'pending');
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markScansSynced(clientUuids: string[]): Promise<void> {
  if (!clientUuids.length) return;
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');

    for (const uuid of clientUuids) {
      const getReq = store.get(uuid);
      getReq.onsuccess = () => {
        if (getReq.result) {
          getReq.result.status = 'synced';
          store.put(getReq.result);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLastPendingScan(sessionId: number): Promise<PendingScanRecord | null> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');
    const index = store.index('session_id');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const scans: PendingScanRecord[] = request.result || [];
      if (scans.length === 0) {
        resolve(null);
        return;
      }
      const last = scans[scans.length - 1];
      store.delete(last.client_uuid);
      tx.oncomplete = () => resolve(last);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearPendingScansForIsbn(sessionId: number, isbn: string): Promise<void> {
  const db = await openInventoryDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');
    const index = store.index('session_id');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      const scans: PendingScanRecord[] = request.result || [];
      for (const s of scans) {
        if (s.isbn === isbn) {
          store.delete(s.client_uuid);
        }
      }
      tx.oncomplete = () => resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getUnsyncedCount(sessionId: number): Promise<number> {
  try {
    const scans = await getPendingScans(sessionId);
    return scans.length;
  } catch {
    return 0;
  }
}

// ─── Web Audio API Beeps ──────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSuccessBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (err) {
    // Silencioso em caso de restrição de autoplay
  }
}

export function playWarningBeep(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Primeiro pulso grave
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(320, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.09);

    // Segundo pulso grave
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(260, now + 0.1);
    gain2.gain.setValueAtTime(0.12, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.2);
  } catch (err) {
    // Silencioso
  }
}

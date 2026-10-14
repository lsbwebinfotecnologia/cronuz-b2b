/**
 * Persistência Offline-First para Coletor Mobile de Endereçamento via IndexedDB nativo
 * e feedback sonoro imediato via Web Audio API.
 */

const DB_NAME = 'CronuzAddressingDB';
const DB_VERSION = 1;

export interface PendingAddressScanRecord {
  client_uuid: string;
  branch_id: number;
  branch_name?: string;
  cod_local_estoque?: string;
  address: string;
  isbn: string;
  title?: string;
  horus_cod_item?: string;
  notes?: string;
  scanned_at: string;
  status: 'pending' | 'synced';
}

function getIndexedDB(): IDBFactory | null {
  if (typeof window === 'undefined') return null;
  return (
    window.indexedDB ||
    (window as any).mozIndexedDB ||
    (window as any).webkitIndexedDB ||
    (window as any).msIndexedDB
  );
}

export function openAddressingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      reject(new Error('IndexedDB não suportado neste navegador.'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;

      if (!db.objectStoreNames.contains('pending_scans')) {
        const store = db.createObjectStore('pending_scans', { keyPath: 'client_uuid' });
        store.createIndex('branch_id', 'branch_id', { unique: false });
        store.createIndex('address', 'address', { unique: false });
        store.createIndex('isbn', 'isbn', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addPendingScan(
  item: Omit<PendingAddressScanRecord, 'client_uuid' | 'scanned_at' | 'status'>
): Promise<PendingAddressScanRecord> {
  const db = await openAddressingDb();
  const client_uuid = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const record: PendingAddressScanRecord = {
    ...item,
    client_uuid,
    scanned_at: new Date().toISOString(),
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');
    store.put(record);

    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingScans(branchId?: number): Promise<PendingAddressScanRecord[]> {
  const db = await openAddressingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readonly');
    const store = tx.objectStore('pending_scans');
    const request = store.getAll();

    request.onsuccess = () => {
      let results: PendingAddressScanRecord[] = request.result || [];
      if (branchId) {
        results = results.filter((r) => r.branch_id === branchId);
      }
      // Ordena por data decrescente (mais recentes primeiro)
      results.sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingScansCount(branchId?: number): Promise<number> {
  try {
    const scans = await getPendingScans(branchId);
    return scans.length;
  } catch {
    return 0;
  }
}

export async function removePendingScan(clientUuid: string): Promise<void> {
  const db = await openAddressingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');
    store.delete(clientUuid);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPendingScans(): Promise<void> {
  const db = await openAddressingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_scans', 'readwrite');
    const store = tx.objectStore('pending_scans');
    store.clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Feedback Sonoro via Web Audio API ───────────────────────────────────────
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
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 - tom agudo e limpo
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

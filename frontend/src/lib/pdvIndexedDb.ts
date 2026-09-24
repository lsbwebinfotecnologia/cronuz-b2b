/**
 * pdvIndexedDb.ts
 * Utilitário de persistência Offline-First para o PDV Mobile & Desktop.
 * Utiliza IndexedDB nativo do navegador para busca instantânea de catálogo,
 * bufferização segura de vendas offline e feedback sonoro via Web Audio API.
 */

const DB_NAME = 'CronuzPdvDB';
const DB_VERSION = 1;

export interface PDVCatalogItem {
  barcode: string;
  sku?: string;
  title: string;
  publisher?: string;
  price: number;
  stock?: number;
  horus_item_code?: string;
  product_id?: number;
  source?: string;
}

export interface PDVSaleItemRecord {
  barcode: string;
  sku?: string;
  title: string;
  publisher?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  horus_item_code?: string;
  product_id?: number;
}

export interface PDVPendingSaleRecord {
  client_sale_uuid: string;
  sale_number: string;
  session_id?: number;
  customer_name: string;
  customer_document?: string;
  customer_id?: number;
  payment_method: 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'MISTO';
  payment_details?: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  items_count: number;
  sold_at: string; // ISO string
  status: 'pending' | 'synced';
  origin: string;
  notes?: string;
  items: PDVSaleItemRecord[];
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

export function openPdvDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      reject(new Error('IndexedDB não suportado neste navegador.'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;

      // 1. Catálogo de Produtos local
      if (!db.objectStoreNames.contains('pdv_catalog')) {
        const catalogStore = db.createObjectStore('pdv_catalog', { keyPath: 'barcode' });
        catalogStore.createIndex('sku', 'sku', { unique: false });
        catalogStore.createIndex('title', 'title', { unique: false });
      }

      // 2. Fila de Vendas Realizadas (Buffer Offline)
      if (!db.objectStoreNames.contains('pdv_pending_sales')) {
        const salesStore = db.createObjectStore('pdv_pending_sales', { keyPath: 'client_sale_uuid' });
        salesStore.createIndex('status', 'status', { unique: false });
        salesStore.createIndex('session_id', 'session_id', { unique: false });
        salesStore.createIndex('sold_at', 'sold_at', { unique: false });
      }

      // 3. Configurações locais (ex: cliente fixado, sessão atual)
      if (!db.objectStoreNames.contains('pdv_settings')) {
        db.createObjectStore('pdv_settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Operações de Catálogo ───────────────────────────────────────────────────

export interface SaveCatalogResult {
  savedCount: number;
  duplicateCount: number;
  zeroPriceCount: number;
}

export async function saveCatalogItems(items: PDVCatalogItem[]): Promise<SaveCatalogResult> {
  const db = await openPdvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdv_catalog', 'readwrite');
    const store = tx.objectStore('pdv_catalog');

    const seen = new Set<string>();
    let savedCount = 0;
    let duplicateCount = 0;
    let zeroPriceCount = 0;

    for (const it of items) {
      const barcode = String(it.barcode || '').trim().replace(/\.0$/, '');
      if (!barcode) continue;

      const price = Number(it.price) || 0;
      // Não possibilitar item com preço zerado
      if (price <= 0) {
        zeroPriceCount++;
        continue;
      }

      // Não deixar item com mesmo ISBN duplicado
      if (seen.has(barcode)) {
        duplicateCount++;
        continue;
      }
      seen.add(barcode);

      store.put({
        barcode,
        sku: it.sku ? String(it.sku).trim() : '',
        title: it.title || 'Sem Título',
        publisher: it.publisher || '',
        price,
        stock: it.stock !== undefined ? Number(it.stock) : 100,
        horus_item_code: it.horus_item_code ? String(it.horus_item_code) : '',
        product_id: it.product_id,
        source: it.source || 'GENERAL',
      });
      savedCount++;
    }

    tx.oncomplete = () => resolve({ savedCount, duplicateCount, zeroPriceCount });
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearCatalog(): Promise<void> {
  const db = await openPdvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdv_catalog', 'readwrite');
    const store = tx.objectStore('pdv_catalog');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getCatalogCount(): Promise<number> {
  try {
    const db = await openPdvDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdv_catalog', 'readonly');
      const store = tx.objectStore('pdv_catalog');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

export async function getCatalogItemByBarcode(barcode: string): Promise<PDVCatalogItem | null> {
  try {
    const clean = String(barcode).trim();
    if (!clean) return null;
    const db = await openPdvDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdv_catalog', 'readonly');
      const store = tx.objectStore('pdv_catalog');
      const req = store.get(clean);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function searchCatalogItems(query: string, limit = 20): Promise<PDVCatalogItem[]> {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const db = await openPdvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdv_catalog', 'readonly');
    const store = tx.objectStore('pdv_catalog');
    const results: PDVCatalogItem[] = [];

    const req = store.openCursor();
    req.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        const item: PDVCatalogItem = cursor.value;
        const matchBarcode = item.barcode && item.barcode.toLowerCase().includes(clean);
        const matchSku = item.sku && item.sku.toLowerCase().includes(clean);
        const matchTitle = item.title && item.title.toLowerCase().includes(clean);
        const matchPub = item.publisher && item.publisher.toLowerCase().includes(clean);

        if (matchBarcode || matchSku || matchTitle || matchPub) {
          results.push(item);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Operações de Vendas Offline ─────────────────────────────────────────────

export async function savePendingSale(sale: PDVPendingSaleRecord): Promise<void> {
  const db = await openPdvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdv_pending_sales', 'readwrite');
    const store = tx.objectStore('pdv_pending_sales');
    store.put(sale);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingSales(status: 'pending' | 'synced' = 'pending'): Promise<PDVPendingSaleRecord[]> {
  try {
    const db = await openPdvDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdv_pending_sales', 'readonly');
      const store = tx.objectStore('pdv_pending_sales');
      const index = store.index('status');
      const req = index.getAll(status);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getAllSales(): Promise<PDVPendingSaleRecord[]> {
  try {
    const db = await openPdvDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdv_pending_sales', 'readonly');
      const store = tx.objectStore('pdv_pending_sales');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        // Ordena por data decrescente
        list.sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function markSalesAsSynced(syncedUuids: string[]): Promise<void> {
  if (!syncedUuids.length) return;
  const db = await openPdvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdv_pending_sales', 'readwrite');
    const store = tx.objectStore('pdv_pending_sales');

    let processed = 0;
    for (const uuid of syncedUuids) {
      const req = store.get(uuid);
      req.onsuccess = () => {
        if (req.result) {
          const updated = { ...req.result, status: 'synced' };
          store.put(updated);
        }
        processed++;
        if (processed === syncedUuids.length) {
          // Finished
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getUnsyncedSalesCount(): Promise<number> {
  try {
    const pending = await getPendingSales('pending');
    return pending.length;
  } catch {
    return 0;
  }
}

// ─── Configurações Locais (Cliente Fixado, Sessão Ativa) ──────────────────────

export async function setPdvSetting(key: string, value: any): Promise<void> {
  const db = await openPdvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pdv_settings', 'readwrite');
    const store = tx.objectStore('pdv_settings');
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPdvSetting<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openPdvDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdv_settings', 'readonly');
      const store = tx.objectStore('pdv_settings');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
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

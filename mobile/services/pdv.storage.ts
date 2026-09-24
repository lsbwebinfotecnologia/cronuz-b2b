/**
 * pdv.storage.ts
 * Armazenamento local SQLite nativo para o PDV Mobile (Offline First).
 * Utiliza expo-sqlite para persistência de alta performance de produtos e vendas offline.
 */
import * as SQLite from 'expo-sqlite';

export interface LocalPOSProduct {
  barcode: string;
  sku: string;
  title: string;
  publisher: string;
  price: number;
  stock: number;
  horus_item_code: string;
  product_id?: number | null;
  source: string;
}

export interface LocalPOSSaleItem {
  barcode: string;
  sku?: string;
  title: string;
  publisher?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  horus_item_code?: string;
  product_id?: number | null;
}

export interface LocalPOSSale {
  client_sale_uuid: string;
  sale_number: string;
  session_id?: number | null;
  customer_name: string;
  customer_document?: string | null;
  customer_id?: number | null;
  payment_method: string;
  payment_details?: string | null;
  subtotal: number;
  discount: number;
  total_amount: number;
  items_count: number;
  sold_at: string;
  status: 'pending' | 'synced';
  notes?: string | null;
  items: LocalPOSSaleItem[];
}

let _db: SQLite.SQLiteDatabase | null = null;

export async function getPdvDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('cronuz_pdv.db');
    await initPdvDatabase(_db);
  }
  return _db;
}

async function initPdvDatabase(db: SQLite.SQLiteDatabase) {
  // 1. Tabela de produtos da sessão / catálogo local
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS pdv_product (
      barcode TEXT PRIMARY KEY NOT NULL,
      sku TEXT,
      title TEXT NOT NULL,
      publisher TEXT,
      price REAL NOT NULL DEFAULT 0.0,
      stock REAL NOT NULL DEFAULT 100.0,
      horus_item_code TEXT,
      product_id INTEGER,
      source TEXT DEFAULT 'SESSION'
    );
    CREATE INDEX IF NOT EXISTS idx_pdv_product_title ON pdv_product(title);
    CREATE INDEX IF NOT EXISTS idx_pdv_product_sku ON pdv_product(sku);

    CREATE TABLE IF NOT EXISTS pdv_sale (
      client_sale_uuid TEXT PRIMARY KEY NOT NULL,
      sale_number TEXT NOT NULL,
      session_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_document TEXT,
      customer_id INTEGER,
      payment_method TEXT NOT NULL,
      payment_details TEXT,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      total_amount REAL NOT NULL,
      items_count INTEGER NOT NULL,
      sold_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pdv_sale_status ON pdv_sale(status);

    CREATE TABLE IF NOT EXISTS pdv_sale_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_uuid TEXT NOT NULL,
      barcode TEXT NOT NULL,
      sku TEXT,
      title TEXT NOT NULL,
      publisher TEXT,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      horus_item_code TEXT,
      product_id INTEGER,
      FOREIGN KEY (sale_uuid) REFERENCES pdv_sale(client_sale_uuid) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pdv_sale_item_uuid ON pdv_sale_item(sale_uuid);

    CREATE TABLE IF NOT EXISTS pdv_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);
}

// ─── Operações de Catálogo / Produtos ────────────────────────────────────────

export interface SaveProductsResult {
  savedCount: number;
  duplicateCount: number;
  zeroPriceCount: number;
}

export async function saveSessionProductsLocally(
  items: LocalPOSProduct[],
  replaceExisting = true
): Promise<SaveProductsResult> {
  const db = await getPdvDatabase();

  let savedCount = 0;
  let duplicateCount = 0;
  let zeroPriceCount = 0;

  const seen = new Set<string>();
  const validItems: LocalPOSProduct[] = [];

  for (const it of items) {
    const code = String(it.barcode || '').trim().replace(/\.0$/, '');
    if (!code) continue;

    const price = Number(it.price) || 0;
    if (price <= 0) {
      zeroPriceCount++;
      continue;
    }

    if (seen.has(code)) {
      duplicateCount++;
      continue;
    }
    seen.add(code);

    validItems.push({
      ...it,
      barcode: code,
      price,
      stock: it.stock !== undefined ? Number(it.stock) : 100,
    });
  }

  await db.withTransactionAsync(async () => {
    if (replaceExisting) {
      await db.runAsync('DELETE FROM pdv_product');
    }

    // Inserção em lotes de 50 itens por comando SQL (evita overhead de JSI e respeita o limite de parâmetros do SQLite)
    const BATCH_SIZE = 50;
    for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
      const chunk = validItems.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const it of chunk) {
        params.push(
          it.barcode,
          it.sku || '',
          it.title || 'Sem título',
          it.publisher || '',
          it.price,
          it.stock,
          it.horus_item_code || '',
          it.product_id ?? null,
          it.source || 'SESSION'
        );
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO pdv_product 
         (barcode, sku, title, publisher, price, stock, horus_item_code, product_id, source)
         VALUES ${placeholders}`,
        params
      );
      savedCount += chunk.length;
    }
  });

  return { savedCount, duplicateCount, zeroPriceCount };
}

export async function getLocalCatalogCount(): Promise<number> {
  try {
    const db = await getPdvDatabase();
    const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pdv_product');
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function getSampleLocalProducts(limit = 24): Promise<LocalPOSProduct[]> {
  try {
    const db = await getPdvDatabase();
    const rows = await db.getAllAsync<LocalPOSProduct>(
      'SELECT * FROM pdv_product ORDER BY title ASC LIMIT ?',
      [limit]
    );
    return rows || [];
  } catch {
    return [];
  }
}

export async function searchLocalProducts(query: string, limit = 30): Promise<LocalPOSProduct[]> {
  const clean = query.trim();
  if (!clean) return [];

  try {
    const db = await getPdvDatabase();
    const param = `%${clean}%`;
    const rows = await db.getAllAsync<LocalPOSProduct>(
      `SELECT * FROM pdv_product 
       WHERE barcode LIKE ? OR sku LIKE ? OR title LIKE ? OR publisher LIKE ?
       ORDER BY title ASC LIMIT ?`,
      [param, param, param, param, limit]
    );
    return rows || [];
  } catch {
    return [];
  }
}

export async function getLocalProductByBarcode(barcode: string): Promise<LocalPOSProduct | null> {
  const clean = barcode.trim().replace(/\.0$/, '');
  if (!clean) return null;

  try {
    const db = await getPdvDatabase();
    const row = await db.getFirstAsync<LocalPOSProduct>(
      'SELECT * FROM pdv_product WHERE barcode = ? OR sku = ? LIMIT 1',
      [clean, clean]
    );
    return row || null;
  } catch {
    return null;
  }
}

export async function clearAllLocalProducts(): Promise<void> {
  const db = await getPdvDatabase();
  await db.runAsync('DELETE FROM pdv_product');
}

// ─── Operações de Venda Offline ──────────────────────────────────────────────

export async function saveLocalSale(sale: LocalPOSSale): Promise<void> {
  const db = await getPdvDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO pdv_sale
       (client_sale_uuid, sale_number, session_id, customer_name, customer_document, customer_id,
        payment_method, payment_details, subtotal, discount, total_amount, items_count, sold_at, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sale.client_sale_uuid,
        sale.sale_number,
        sale.session_id ?? null,
        sale.customer_name,
        sale.customer_document ?? null,
        sale.customer_id ?? null,
        sale.payment_method,
        sale.payment_details ?? null,
        sale.subtotal,
        sale.discount,
        sale.total_amount,
        sale.items_count,
        sale.sold_at,
        sale.status,
        sale.notes ?? null,
      ]
    );

    for (const item of sale.items) {
      await db.runAsync(
        `INSERT INTO pdv_sale_item
         (sale_uuid, barcode, sku, title, publisher, quantity, unit_price, total_price, horus_item_code, product_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sale.client_sale_uuid,
          item.barcode,
          item.sku ?? null,
          item.title,
          item.publisher ?? null,
          item.quantity,
          item.unit_price,
          item.total_price,
          item.horus_item_code ?? null,
          item.product_id ?? null,
        ]
      );
    }
  });
}

export async function getPendingLocalSales(): Promise<LocalPOSSale[]> {
  try {
    const db = await getPdvDatabase();
    const sales = await db.getAllAsync<any>(
      `SELECT * FROM pdv_sale WHERE status = 'pending' ORDER BY sold_at ASC`
    );

    const result: LocalPOSSale[] = [];
    for (const s of sales) {
      const items = await db.getAllAsync<LocalPOSSaleItem>(
        'SELECT barcode, sku, title, publisher, quantity, unit_price, total_price, horus_item_code, product_id FROM pdv_sale_item WHERE sale_uuid = ?',
        [s.client_sale_uuid]
      );
      result.push({
        ...s,
        items,
      });
    }

    return result;
  } catch {
    return [];
  }
}

export async function markLocalSalesAsSynced(uuids: string[]): Promise<void> {
  if (uuids.length === 0) return;
  const db = await getPdvDatabase();
  const placeholders = uuids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE pdv_sale SET status = 'synced' WHERE client_sale_uuid IN (${placeholders})`,
    uuids
  );
}

export async function getPendingLocalSalesCount(): Promise<number> {
  try {
    const db = await getPdvDatabase();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM pdv_sale WHERE status = 'pending'`
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

// ─── Configurações Locais ────────────────────────────────────────────────────

export async function setPdvLocalSetting<T>(key: string, value: T): Promise<void> {
  const db = await getPdvDatabase();
  const serialized = JSON.stringify(value);
  await db.runAsync(
    'INSERT OR REPLACE INTO pdv_settings (key, value) VALUES (?, ?)',
    [key, serialized]
  );
}

export async function getPdvLocalSetting<T>(key: string): Promise<T | null> {
  try {
    const db = await getPdvDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM pdv_settings WHERE key = ?',
      [key]
    );
    if (!row || !row.value) return null;
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

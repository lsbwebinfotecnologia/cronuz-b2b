/**
 * pdv.service.ts
 * Chamadas de API para o módulo PDV.
 * Usa os mesmos endpoints do portal do seller web para manter consistência.
 */
import api from './api';
import { PDVCustomer, PDVProduct, CartItem, PaymentTerm } from '../store/pdv.store';
import { saveSessionProductsLocally, LocalPOSProduct } from './pdv.storage';
export type { PaymentTerm };

// ─── Tipos de Operação ────────────────────────────────────────────────────────
// Seguem as mesmas regras do portal seller: V = Venda Direta, C = Consignação
// Ambas sempre visíveis (igual ao portal seller — sem restrição por política)

export type OrderType = 'V' | 'C';

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  V: 'Venda Direta',
  C: 'Consignação',
};

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface PDVOrderItem {
  product_id?: number;
  ean_isbn?: string;
  sku?: string;
  name?: string;
  brand?: string;
  quantity: number;
  quantity_requested?: number;
  unit_price: number;
}

/** Payload alinhado com POST /orders (mesmo endpoint do portal seller) */
export interface CreateOrderPayload {
  customer_id: number;
  items: PDVOrderItem[];
  total_amount: number;
  discount_amount: number;
  payment_condition?: string;
  payment_method: string;
  status: string;
  source: string;
  type_order: OrderType;
  installments: number;
  customer_order_ref?: string;
  notes?: string;
}

export interface CreateOrderResponse {
  order_id: number;
  status: string;
  horus_id?: string | null;
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export async function searchCustomers(q: string): Promise<PDVCustomer[]> {
  const { data } = await api.get<PDVCustomer[]>('/mobile/pdv/customers', {
    params: { q, limit: 20 },
  });
  return Array.isArray(data) ? data : [];
}

// ─── Produtos ────────────────────────────────────────────────────────────────

export interface ProductListResponse {
  items: PDVProduct[];
  total: number;
  page: number;
  limit: number;
}

export async function searchProducts(params: {
  q?: string;
  customer_id?: number;
  page?: number;
  limit?: number;
}): Promise<ProductListResponse> {
  const { data } = await api.get<any>('/mobile/pdv/products', {
    params: {
      q: params.q || '',
      customer_id: params.customer_id,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    },
  });

  // ─── Normaliza campos do backend (Horus B2B ou Cronuz) para PDVProduct ───
  // Backend Horus retorna: base_price, promotional_price, stock_quantity,
  //   consigned_balance, ean_gtin, id "horus-XXXX"
  // Backend Cronuz retorna: price, stock, ean_gtin, id numérico
  const rawItems: any[] = data?.items ?? [];
  const items: import('../store/pdv.store').PDVProduct[] = rawItems.map((item) => {
    const basePrice: number = item.base_price ?? item.price ?? 0;
    const promoPrice: number | null = item.promotional_price ?? null;
    const displayPrice = promoPrice != null && promoPrice < basePrice ? promoPrice : basePrice;

    // Horus IDs vêm como string "horus-4103" — extrai numérico ou deixa undefined
    const rawId = item.id;
    const numericId: number | undefined =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string' && !rawId.startsWith('horus-')
        ? Number(rawId) || undefined
        : undefined;

    return {
      id: numericId,
      name: item.name ?? '',
      sku: item.sku ?? undefined,
      barcode: item.ean_gtin ?? item.barcode ?? undefined,
      base_price: basePrice,
      promotional_price: promoPrice,
      price: displayPrice,
      discount_percent: basePrice > 0 && promoPrice != null && promoPrice < basePrice
        ? Math.round((1 - promoPrice / basePrice) * 100)
        : undefined,
      stock: item.stock_quantity ?? item.stock ?? 0,
      consigned_balance: item.consigned_balance ?? 0,
      image_url: item.image_url ?? undefined,
      brand: item.brand ?? undefined,
      unit: item.unit ?? undefined,
    };
  });

  return {
    items,
    total: data?.total ?? items.length,
    page: data?.page ?? (params.page ?? 1),
    limit: data?.limit ?? (params.limit ?? 20),
  };
}

// ─── Condições de pagamento ───────────────────────────────────────────────────

export async function getPaymentTerms(): Promise<PaymentTerm[]> {
  const { data } = await api.get<PaymentTerm[]>('/mobile/pdv/payment-terms');
  return Array.isArray(data) ? data : [];
}

// ─── Criação de pedido ────────────────────────────────────────────────────────
// Usa POST /orders — MESMO endpoint do portal seller web.
// Isso garante que a integração Horus, geração financeira e regras de negócio
// sejam exatamente iguais ao portal, independente do canal (web ou mobile).

export async function createPDVOrder(
  customer: PDVCustomer,
  items: CartItem[],
  paymentTerm: PaymentTerm | null,
  total: number,
  options?: {
    externalOrderNumber?: string;
    orderType?: OrderType;
    notes?: string;
  }
): Promise<CreateOrderResponse> {
  const orderType: OrderType = options?.orderType ?? 'V';

  const payload: CreateOrderPayload = {
    customer_id: customer.id,
    items: items.map((item) => ({
      product_id: item.product.id,
      ean_isbn: item.product.barcode,
      sku: item.product.sku,
      name: item.product.name,
      brand: item.product.brand,
      quantity: item.quantity,
      quantity_requested: item.quantity,
      unit_price: item.unit_price,
    })),
    total_amount: total,
    discount_amount: 0, // Desconto já embutido nos preços (promotional_price do Horus/política)
    payment_condition: paymentTerm ? String(paymentTerm.name) : undefined,
    payment_method: 'B2B_STANDARD',
    status: 'PROCESSING',
    source: 'pdv_mobile',
    type_order: orderType,
    installments: 1,
    customer_order_ref: options?.externalOrderNumber?.trim() || undefined,
    notes: options?.notes?.trim() || undefined,
  };

  // Usa POST /orders — mesmo endpoint do portal seller
  const { data } = await api.post<CreateOrderResponse>('/orders', payload);
  return data;
}

// ─── MÓDULO PDV OFFLINE & SESSÕES ───────────────────────────────────────────

export interface MobilePOSSession {
  id: number;
  code: string;
  title: string;
  status: string;
  catalog_source: string;
  source_reference?: string;
  products_count: number;
  customer_name?: string;
  total_sales_count: number;
  total_sales_amount: number;
  opened_at: string;
  closed_at?: string;
}

export interface MobilePOSConfig {
  module_pdv: boolean;
  validate_stock: boolean;
  pdv_allow_out_of_stock: boolean;
}

export async function fetchPOSConfig(companyId: number): Promise<MobilePOSConfig> {
  const { data } = await api.get<MobilePOSConfig>(`/companies/${companyId}/pos/config`);
  return data;
}

export async function fetchPOSSessions(companyId: number): Promise<MobilePOSSession[]> {
  const { data } = await api.get<MobilePOSSession[]>(`/companies/${companyId}/pos/sessions`);
  return Array.isArray(data) ? data : [];
}

export async function createPOSSession(
  companyId: number,
  title: string,
  catalogSource = 'GENERAL',
  sourceReference?: string
): Promise<MobilePOSSession> {
  const { data } = await api.post<MobilePOSSession>(`/companies/${companyId}/pos/sessions`, {
    title,
    catalog_source: catalogSource,
    source_reference: sourceReference || undefined,
  });
  return data;
}

export async function closePOSSession(companyId: number, sessionId: number): Promise<MobilePOSSession> {
  const { data } = await api.put<MobilePOSSession>(`/companies/${companyId}/pos/sessions/${sessionId}/close`);
  return data;
}

export interface SyncSessionProgressCallback {
  (current: number, total: number, percent: number, message: string): void;
}

export async function fetchPOSSessionProducts(
  companyId: number,
  sessionId: number,
  page = 1,
  limit?: number
): Promise<any> {
  const params: any = {};
  if (limit) {
    params.page = page;
    params.limit = limit;
  }
  const { data } = await api.get(`/companies/${companyId}/pos/sessions/${sessionId}/products`, {
    params,
    timeout: 45000,
  });
  return data;
}

/**
 * Sincronização Progressiva e Segura em Lotes (Chunks) em Segundo Plano
 * 1. Baixa em lotes de 1.000 itens para altíssima performance.
 * 2. Faz até 3 retries com backoff se a rede oscilar.
 * 3. Grava imediatamente no SQLite via batch insert multi-row.
 * 4. Notifica percentual e contagem em tempo real para UI não-bloqueante.
 */
export async function syncSessionProductsProgressive(
  companyId: number,
  sessionId: number,
  catalogSource = 'SPREADSHEET',
  onProgress?: SyncSessionProgressCallback
): Promise<{ totalSaved: number; totalCount: number }> {
  const PAGE_LIMIT = 1000;
  let page = 1;
  let totalCount = 0;
  let totalSaved = 0;
  let hasMore = true;

  while (hasMore) {
    let attempts = 0;
    let data: any = null;

    while (attempts < 3) {
      try {
        attempts++;
        const response = await api.get(
          `/companies/${companyId}/pos/sessions/${sessionId}/products`,
          {
            params: { page, limit: PAGE_LIMIT },
            timeout: 45000,
          }
        );
        data = response.data;
        break;
      } catch (err: any) {
        if (attempts >= 3) {
          throw new Error(
            `Falha na rede ao baixar lote ${page}: ${err.message || 'Erro de conexão'}. Verifique o sinal da internet.`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempts));
      }
    }

    const rawItems: any[] = data?.items ?? (Array.isArray(data) ? data : []);
    totalCount = data?.total ?? rawItems.length;
    const totalPages = data?.total_pages ?? (totalCount > 0 ? Math.ceil(totalCount / PAGE_LIMIT) : 1);

    if (rawItems.length === 0) {
      break;
    }

    const localItems: LocalPOSProduct[] = rawItems.map((p) => ({
      barcode: String(p.barcode || p.sku || '').trim().replace(/\.0$/, ''),
      sku: p.sku || '',
      title: p.title || p.name || 'Produto sem título',
      publisher: p.publisher || p.brand || '',
      price: Number(p.price || p.unit_price || 0),
      stock: Number(p.stock_qty || p.stock || 0),
      source: (catalogSource || p.source || 'SPREADSHEET') as any,
      product_id: p.product_id ?? p.id ?? null,
      horus_item_code: p.horus_item_code,
    }));

    const isFirst = page === 1;
    const saveRes = await saveSessionProductsLocally(localItems, isFirst);
    totalSaved += saveRes.savedCount;

    const percent = totalCount > 0 ? Math.min(100, Math.round((totalSaved / totalCount) * 100)) : 0;

    if (onProgress) {
      onProgress(
        totalSaved,
        totalCount,
        percent,
        `Sincronizando: ${totalSaved.toLocaleString()} de ${totalCount.toLocaleString()} itens (${percent}%)...`
      );
    }

    if (page >= totalPages || rawItems.length < PAGE_LIMIT) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return { totalSaved, totalCount };
}

export async function loadPOSCatalogToSession(
  companyId: number,
  sessionId?: number,
  catalogSource?: string,
  sourceReference?: string
): Promise<any> {
  const { data } = await api.post(
    `/companies/${companyId}/pos/catalog-load`,
    {
      catalog_source: catalogSource || 'GENERAL',
      source_reference: sourceReference || undefined,
    },
    {
      params: sessionId ? { session_id: sessionId } : undefined,
    }
  );
  return data;
}

export async function uploadPOSSpreadsheetFile(
  companyId: number,
  formData: FormData,
  sessionId?: number
): Promise<any> {
  const { data } = await api.post(`/companies/${companyId}/pos/upload-spreadsheet`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: sessionId ? { session_id: sessionId } : undefined,
  });
  return data;
}

export async function syncPOSSalesBatch(companyId: number, payload: any): Promise<any> {
  const { data } = await api.post(`/companies/${companyId}/pos/sync-sales`, payload);
  return data;
}

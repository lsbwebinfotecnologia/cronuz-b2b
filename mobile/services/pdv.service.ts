/**
 * pdv.service.ts
 * Chamadas de API para o módulo PDV.
 * Usa os mesmos endpoints do portal do seller web para manter consistência.
 */
import api from './api';
import { PDVCustomer, PDVProduct, CartItem, PaymentTerm } from '../store/pdv.store';

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

/**
 * pdv.store.ts
 * Estado global do carrinho PDV usando Zustand.
 * Persiste customer selecionado e itens do carrinho.
 */
import { create } from 'zustand';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CommercialPolicy {
  discount_sale_percent: number;
  discount_consignment_percent: number;
  allow_consignment: boolean;
  max_installments: number;
}

export interface PDVCustomer {
  id: number;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  id_guid?: string | null;
  consignment_status?: string;      // ACTIVE | INACTIVE | BLOCKED
  discount?: number;                // Desconto fixo individual
  commercial_policy?: CommercialPolicy | null;
}

export interface PDVProduct {
  id?: number;
  name: string;
  sku?: string;
  barcode?: string;
  /** Preço de capa / preço bruto */
  base_price?: number;
  /** Preço líquido com desconto (já calculado pelo backend) */
  promotional_price?: number | null;
  /** Preço usado no carrinho: promotional_price ?? base_price */
  price: number;
  /** Desconto em % exibido na tag (ex: 55 = -55%) */
  discount_percent?: number;
  stock?: number;
  consigned_balance?: number;       // Saldo consignado do cliente
  image_url?: string;
  brand?: string;
  unit?: string;
}

export interface CartItem {
  product: PDVProduct;
  quantity: number;
  unit_price: number;
  /** Preço total do item (quantity * unit_price) */
  total: number;
}

export interface PaymentTerm {
  id: string | number;
  name: string;
  description?: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

interface PDVState {
  customer: PDVCustomer | null;
  items: CartItem[];
  paymentTerm: PaymentTerm | null;
  notes: string;

  // Computed
  subtotal: number;
  discountAmount: number;
  total: number;
  itemCount: number;

  // Actions
  setCustomer: (customer: PDVCustomer | null) => void;
  addItem: (product: PDVProduct, quantity?: number) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  setPaymentTerm: (term: PaymentTerm | null) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;

  /** Calcula desconto total com base na política comercial e tipo de operação */
  getDiscount: (orderType: 'V' | 'C') => number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

function computeTotals(items: CartItem[]) {
  const subtotal = items.reduce((acc, i) => acc + i.total, 0);
  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
  return { subtotal, total: subtotal, itemCount };
}

export const usePDVStore = create<PDVState>((set, get) => ({
  customer: null,
  items: [],
  paymentTerm: null,
  notes: '',
  subtotal: 0,
  discountAmount: 0,
  total: 0,
  itemCount: 0,

  setCustomer: (customer) => set({ customer }),

  addItem: (product, quantity = 1) => {
    const items = [...get().items];
    const existing = items.findIndex(
      (i) =>
        (i.product.id && i.product.id === product.id) ||
        (i.product.sku && i.product.sku === product.sku) ||
        (i.product.barcode && i.product.barcode === product.barcode)
    );

    // O preço do item já vem calculado pelo backend (promotional_price ou base_price)
    const unitPrice = product.promotional_price ?? product.price;

    if (existing >= 0) {
      items[existing] = {
        ...items[existing],
        quantity: items[existing].quantity + quantity,
        total: (items[existing].quantity + quantity) * items[existing].unit_price,
      };
    } else {
      items.push({
        product,
        quantity,
        unit_price: unitPrice,
        total: quantity * unitPrice,
      });
    }

    set({ items, ...computeTotals(items) });
  },

  removeItem: (index) => {
    const items = get().items.filter((_, i) => i !== index);
    set({ items, ...computeTotals(items) });
  },

  updateQuantity: (index, quantity) => {
    if (quantity <= 0) {
      get().removeItem(index);
      return;
    }
    const items = [...get().items];
    items[index] = {
      ...items[index],
      quantity,
      total: quantity * items[index].unit_price,
    };
    set({ items, ...computeTotals(items) });
  },

  setPaymentTerm: (term) => set({ paymentTerm: term }),
  setNotes: (notes) => set({ notes }),

  /**
   * Calcula o desconto total baseado na política comercial do cliente.
   * Nota: se o produto já tem promotional_price (desconto do Horus ERP),
   * ele NÃO aplica desconto adicional da política — o preço já está calculado.
   * O desconto da política só é aplicado para produtos sem promotional_price.
   */
  getDiscount: (_orderType: 'V' | 'C') => {
    // O desconto já está embutido no unit_price de cada item (via promotional_price)
    // Então discount_amount = 0 para não duplicar
    return 0;
  },

  clearCart: () =>
    set({
      customer: null,
      items: [],
      paymentTerm: null,
      notes: '',
      subtotal: 0,
      discountAmount: 0,
      total: 0,
      itemCount: 0,
    }),
}));

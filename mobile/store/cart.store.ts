import { create } from 'zustand';
import { Product } from '../services/products.service';

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
}

interface CartState {
  items: CartItem[];
  customer_id: number | null;
  customer_name: string | null;
  notes: string;
  payment_condition: string;

  // Actions
  setCustomer: (id: number, name: string) => void;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  setNotes: (notes: string) => void;
  setPaymentCondition: (condition: string) => void;
  clearCart: () => void;

  // Computed
  totalItems: () => number;
  totalValue: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer_id: null,
  customer_name: null,
  notes: '',
  payment_condition: '',

  setCustomer: (id, name) => set({ customer_id: id, customer_name: name }),

  addItem: (product, quantity = 1) => {
    const existing = get().items.find((i) => i.product.id === product.id);
    if (existing) {
      set({
        items: get().items.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + quantity }
            : i
        ),
      });
    } else {
      set({
        items: [...get().items, { product, quantity, unit_price: product.price }],
      });
    }
  },

  removeItem: (productId) => {
    set({ items: get().items.filter((i) => i.product.id !== productId) });
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    set({
      items: get().items.map((i) =>
        i.product.id === productId ? { ...i, quantity } : i
      ),
    });
  },

  setNotes: (notes) => set({ notes }),
  setPaymentCondition: (payment_condition) => set({ payment_condition }),

  clearCart: () =>
    set({
      items: [],
      customer_id: null,
      customer_name: null,
      notes: '',
      payment_condition: '',
    }),

  totalItems: () => get().items.reduce((acc, i) => acc + i.quantity, 0),

  totalValue: () =>
    get().items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0),
}));

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken } from '@/lib/auth';

export interface CartItem {
  id: number;
  company_id: number;
  sku: string;
  ean_gtin?: string;
  name: string;
  base_price: number;
  promotional_price?: number;
  stock_quantity: number;
  brand?: string;
  category?: { name: string };
  weight_kg?: number;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: any, quantity: number) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  totalWeight: number;
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalItems: 0,
  subtotal: 0,
  totalWeight: 0,
  isCartOpen: false,
  openCart: () => {},
  closeCart: () => {},
});

export const useCart = () => useContext(CartContext);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  // Initial load logic
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('cronuz_store_cart');
    const token = getToken();
    
    // First setup from local storage for fast UX
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse local cart", e);
      }
    }
    
    // Then override with DB state if user logged in
    if (token) {
      fetch('http://localhost:8000/storefront/cart', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
         if (data && data.items) {
             const mapped = data.items.map((i: any) => ({
                 id: i.product_id || Math.random(), 
                 company_id: 1,
                 sku: i.sku,
                 ean_gtin: i.ean_isbn,
                 name: i.name || 'Produto',
                 brand: i.brand,
                 base_price: i.unit_price,
                 quantity: i.quantity
             }));
             setItems(mapped);
             setSubtotal(data.subtotal || 0);
         }
      })
      .catch(err => console.error("Error fetching cart from DB", err));
    }
  }, []);

  // Sync to local storage on change
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('cronuz_store_cart', JSON.stringify(items));
    }
  }, [items, isMounted]);

  const syncItemToDB = async (item: CartItem) => {
      const token = getToken();
      if (!token) return;
      
      try {
          const response = await fetch('http://localhost:8000/storefront/cart/items', {
              method: 'POST',
              headers: { 
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json' 
              },
              body: JSON.stringify({
                  product_id: Number.isInteger(item.id) ? item.id : null,
                  ean_isbn: String(item.ean_gtin || ''),
                  sku: String(item.sku || ''),
                  name: item.name,
                  brand: item.brand,
                  quantity: item.quantity,
                  unit_price: item.promotional_price && item.promotional_price > 0 ? item.promotional_price : item.base_price
              })
          });
          
          if (!response.ok) {
              const errorText = await response.text();
              console.error("Cart API Sync Failed:", response.status, errorText);
          } else {
              console.log("Cart API Sync Success");
          }
      } catch (e) {
          console.error("Error syncing item to DB", e);
      }
  };

  const removeItemFromDB = async (productId: number) => {
      const token = getToken();
      if (!token) return;
      
      try {
          // Note: In a real implementation we'd need the actual Cart Item ID mapped.
          // For now, depending on DB schema, we sync via product ID or clean state
      } catch (e) {
          console.error("Error removing item from DB", e);
      }
  };

  const addToCart = (product: any, quantity: number) => {
    let newItemObj: CartItem | null = null;
    let syncNeeded = false;

    setItems(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        const newQuantity = Math.min(existing.quantity + quantity, product.stock_quantity || 999);
        newItemObj = { ...existing, quantity: newQuantity };
        syncNeeded = true;
        return prev.map(item => item.id === product.id ? newItemObj! : item);
      }
      
      newItemObj = {
        id: product.id,
        company_id: product.company_id,
        sku: product.sku,
        ean_gtin: product.ean_gtin,
        name: product.name,
        base_price: product.base_price,
        promotional_price: product.promotional_price,
        stock_quantity: product.stock_quantity || 999,
        brand: product.brand,
        category: product.category,
        weight_kg: product.weight_kg,
        quantity: quantity
      } as CartItem;
      
      syncNeeded = true;
      return [...prev, newItemObj];
    });
    
    // Need to wait for next tick or use callback for sync
    setTimeout(() => {
        if (syncNeeded && newItemObj) syncItemToDB(newItemObj);
    }, 100);
    
    // Automatically open the drawer immediately to show what was added
    openCart();
  };

  const removeFromCart = (productId: number) => {
    setItems(prev => prev.filter(item => item.id !== productId));
    removeItemFromDB(productId);
  };

  const updateQuantity = (productId: number, quantity: number) => {
    let updatedItem: CartItem | null = null;
    setItems(prev => prev.map(item => {
      if (item.id === productId) {
          updatedItem = { ...item, quantity: Math.max(1, Math.min(quantity, item.stock_quantity || 999)) };
          return updatedItem;
      }
      return item;
    }));
    
    setTimeout(() => {
        if (updatedItem) syncItemToDB(updatedItem);
    }, 100);
  };

  const clearCart = () => {
    setItems([]);
    localStorage.removeItem('cronuz_store_cart');
  };

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  
  const computedSubtotal = items.reduce((acc, item) => {
    const price = item.promotional_price && item.promotional_price > 0 ? item.promotional_price : item.base_price;
    return acc + (price * item.quantity);
  }, 0);

  const totalWeight = items.reduce((acc, item) => {
    return acc + ((item.weight_kg || 0) * item.quantity);
  }, 0);

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      totalItems,
      subtotal: subtotal > 0 ? subtotal : computedSubtotal,
      totalWeight,
      isCartOpen,
      openCart,
      closeCart
    }}>
      {children}
    </CartContext.Provider>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, X, Plus, Minus, Trash2, MapPin, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCart } from '@/components/store/CartContext';
import { ProductImage } from '@/components/store/ProductImage';
import { getToken } from '@/lib/auth';

export function CartDrawer() {
  const { isCartOpen, closeCart, items, updateQuantity, removeFromCart, subtotal, totalItems, clearCart } = useCart();
  
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  useEffect(() => {
    const fetchCustomerData = async () => {
      if (!isCartOpen) return;
      if (customer) return; // already loaded

      setLoading(true);
      try {
        const token = getToken();
        if (!token) return;

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/customer/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setCustomer(data);
        }
      } catch (err) {
        console.error("Error fetching customer", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerData();
  }, [isCartOpen, customer]);

  // Reset state when drawer closes so next time it's fresh
  useEffect(() => {
    if (!isCartOpen) {
      setTimeout(() => setOrderComplete(false), 500); // Wait for exit animation
    }
  }, [isCartOpen]);

  const mainAddress = customer?.addresses?.find((a: any) => a.type === 'MAIN') || customer?.addresses?.[0];

  // Removed handlePlaceOrder logic as it will be handled by /store/checkout page

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Drawer Panel */}
          <motion.div 
            initial={{ x: '100%' }} 
            animate={{ x: 0 }} 
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-white dark:bg-slate-950 shadow-2xl z-50 flex flex-col border-l border-slate-200 dark:border-slate-800"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
              <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                <ShoppingCart className="w-6 h-6 text-[var(--color-primary-base)]" /> 
                Meu Carrinho
                {totalItems > 0 && !orderComplete && (
                   <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm py-1 px-3 rounded-full">
                     {totalItems} itens
                   </span>
                )}
              </h2>
              <button 
                onClick={closeCart} 
                className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="Fechar (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto w-full flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
              
              {orderComplete ? (
                /* Success State */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full">
                  <motion.div 
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-24 h-24 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-6"
                  >
                     <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  </motion.div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-3">Pedido Realizado!</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-[300px] leading-relaxed">
                    Sua compra B2B foi enviada com sucesso para nossa central e já está sendo processada.
                  </p>
                  <button 
                    onClick={closeCart}
                    className="w-full py-4 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl font-bold transition-colors"
                  >
                    Continuar Comprando
                  </button>
                </div>
              ) : items.length === 0 ? (
                /* Empty Cart State */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full">
                  <div className="w-24 h-24 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-6">
                    <ShoppingCart className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Seu carrinho está vazio</h3>
                  <p className="text-slate-500 dark:text-slate-500 mb-8 max-w-[250px]">
                    Navegue pela loja para encontrar produtos incríveis.
                  </p>
                  <button 
                    onClick={closeCart}
                    className="px-8 py-3 bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] rounded-xl font-bold transition-colors shadow-lg shadow-[var(--color-primary-base)]/20"
                  >
                    Explorar Catálogo
                  </button>
                </div>
              ) : (
                /* Items List and Checkout details */
                <div className="flex flex-col flex-1">
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 md:p-4">
                    {items.map(item => {
                       const price = item.promotional_price && item.promotional_price > 0 ? item.promotional_price : item.base_price;
                       return (
                         <div key={item.id} className="p-3 mb-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-start gap-4">
                           
                           {/* Item Image */}
                           <div className="w-16 h-20 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 p-1 flex items-center justify-center overflow-hidden flex-shrink-0">
                              <ProductImage eanGtin={item.ean_gtin || item.sku} alt={item.name} className="w-full h-full object-contain" />
                           </div>
                           
                           {/* Item Details */}
                           <div className="flex-1 min-w-0 pr-2 pb-1">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-tight mb-1">
                                {item.name}
                              </h4>
                              <div className="text-[10px] text-slate-500 mb-2 flex items-center gap-2 flex-wrap leading-tight">
                                <span>{item.brand || (item.category ? item.category.name : 'Vários Autores')}</span>
                                {item.ean_gtin && <span className="text-slate-400">ISBN: {item.ean_gtin}</span>}
                              </div>
                              <div className="text-xs text-slate-500 mb-3 flex items-center justify-between">
                                 {item.promotional_price && item.promotional_price > 0 && item.promotional_price < item.base_price ? (
                                    <div className="flex flex-col">
                                       <span className="line-through text-[10px] text-slate-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.base_price)} un</span>
                                       <span className="text-emerald-600 font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)} un</span>
                                    </div>
                                 ) : (
                                    <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)} un</span>
                                 )}
                                 <span className="font-bold text-slate-800 dark:text-slate-200">
                                   {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price * item.quantity)}
                                 </span>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 dark:bg-slate-950 dark:border-slate-700">
                                  <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md disabled:opacity-30 dark:hover:bg-slate-800 transition-colors">
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="w-8 text-center text-xs font-bold text-slate-700 dark:text-slate-300">{item.quantity}</span>
                                  <button onClick={() => updateQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= (item.stock_quantity || 999)} className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md disabled:opacity-30 dark:hover:bg-slate-800 transition-colors">
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <button onClick={() => removeFromCart(item.id)} className="text-xs text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg flex items-center gap-1 font-medium transition-colors dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                           </div>
                         </div>
                       )
                    })}
                  </div>

                  {/* Summary Footer */}
                  <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shrink-0 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] dark:shadow-none relative z-10">
                     
                     {/* Shipping details brief */}
                     <div className="mb-4 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800 flex gap-3 text-sm">
                        <MapPin className="w-5 h-5 flex-shrink-0 text-slate-400" />
                        {loading ? (
                           <div className="animate-pulse h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                        ) : mainAddress ? (
                           <div className="flex flex-col text-slate-600 dark:text-slate-400 text-xs">
                             <span className="font-bold text-slate-800 dark:text-slate-200">Entrega Padrão</span>
                             <span className="line-clamp-1">{mainAddress.city}/{mainAddress.state} - {mainAddress.zip_code}</span>
                           </div>
                        ) : (
                           <div className="text-amber-600 dark:text-amber-500 text-xs flex items-center gap-1.5">
                             <AlertCircle className="w-4 h-4 flex-shrink-0" />
                             Sem end. principal.
                           </div>
                        )}
                     </div>

                     <div className="flex justify-between items-end mb-4 px-1">
                       <span className="text-slate-500 font-medium">Total</span>
                       <span className="text-2xl font-black text-slate-900 dark:text-white">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                       </span>
                     </div>
                     <Link 
                       href="/store/checkout"
                       onClick={closeCart}
                       className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white select-none rounded-xl h-14 font-bold text-lg transition-all active:scale-[0.98] shadow-xl shadow-[var(--color-primary-base)]/20"
                     >
                       Revisar e Finalizar <ChevronRight className="w-5 h-5" />
                     </Link>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, Plus, Minus } from 'lucide-react';
import { ProductImage } from './ProductImage';
import { useCart } from '@/components/store/CartContext';

interface ProductProps {
  product: any;
}

export function ProductCard({ product }: ProductProps) {
  const { items, addToCart, updateQuantity, removeFromCart } = useCart();
  
  const existingItem = items.find(item => item.id === product.id);
  const [localQuantity, setLocalQuantity] = useState(1);

  const price = product.promotional_price > 0 ? product.promotional_price : product.base_price;
  const allowPurchase = product.allow_purchase !== undefined ? product.allow_purchase : product.stock_quantity > 0;
  const statusLabel = product.stock_status_label || (product.stock_quantity > 0 ? 'DISPONÍVEL' : 'ESGOTADO');
  const isOutOfStock = !allowPurchase;
  
  const discountPercent = product.promotional_price > 0 && product.base_price > 0 
    ? Math.round((1 - (product.promotional_price / product.base_price)) * 100)
    : 0;

  const displayQuantity = existingItem ? existingItem.quantity : localQuantity;

  const handleDecrease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (existingItem) {
        if (existingItem.quantity > 1) {
            updateQuantity(product.id, existingItem.quantity - 1);
        } else {
            // Remove completely
            removeFromCart(product.id);
        }
    } else {
        if (localQuantity > 1) setLocalQuantity(localQuantity - 1);
    }
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const maxQty = product.stock_quantity || 999;
    
    if (existingItem) {
        if (existingItem.quantity < maxQty) {
            updateQuantity(product.id, existingItem.quantity + 1);
        }
    } else {
        if (localQuantity < maxQty) setLocalQuantity(localQuantity + 1);
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isOutOfStock) {
      if (!existingItem) {
          addToCart(product, localQuantity);
          setLocalQuantity(1); 
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-full group transition-all hover:shadow-md hover:-translate-y-1 dark:bg-slate-900/80 dark:border-slate-800">
      
      <Link href={`/store/product/${product.ean_gtin || product.id}`} className="flex flex-col flex-1">
        {/* Thumbnail */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl aspect-[3/4] w-full mb-4 flex items-center justify-center relative overflow-hidden">
          
          <ProductImage 
            eanGtin={product.ean_gtin} 
            alt={product.name} 
            className="w-full h-full p-2"
          />
          
          {/* Badges */}
          {discountPercent > 0 && !isOutOfStock && (
             <span className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
               -{discountPercent}% OFF
             </span>
          )}
          {statusLabel !== 'DISPONÍVEL' && (
             <span className={`absolute ${!allowPurchase ? 'inset-0 bg-white/60 dark:bg-slate-950/60 flex items-center justify-center text-slate-800 dark:text-slate-200 backdrop-blur-[2px]' : 'bottom-2 right-2 bg-blue-500 text-white rounded-lg px-2 py-1 text-[10px]'} font-bold z-10`}>
               {statusLabel}
             </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 flex flex-col">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-[var(--color-primary-base)] transition-colors">
            {product.name}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
            {product.brand || (product.category ? product.category.name : 'Vários Autores')}
          </p>
          
           <div className="mt-4 flex flex-col mb-4">
              <div className="flex items-end gap-2">
                <span className={`text-lg font-black ${isOutOfStock ? 'text-slate-400' : 'text-[var(--color-primary-base)] dark:text-indigo-400'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
                </span>
                {product.promotional_price > 0 && !isOutOfStock && (
                  <span className="text-xs text-slate-400 line-through mb-1">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.base_price)}
                  </span>
                )}
              </div>
              
              <span className={`text-xs font-semibold mt-1 ${isOutOfStock ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {isOutOfStock ? statusLabel : (statusLabel === 'DISPONÍVEL' ? `Disponível: ${product.stock_quantity} un` : statusLabel)}
              </span>
           </div>
        </div>
      </Link>

      {/* Actions */}
      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="flex-1 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-1 dark:bg-slate-950 dark:border-slate-700"
        >
          <button 
            onClick={handleDecrease}
            disabled={isOutOfStock || displayQuantity <= 1}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
          >
            <Minus className="w-4 h-4" />
          </button>
          
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-8 text-center select-none">
            {isOutOfStock ? 0 : displayQuantity}
          </span>
          
          <button 
            onClick={handleIncrease}
            disabled={isOutOfStock || displayQuantity >= product.stock_quantity}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <button 
           onClick={handleAddToCart}
           disabled={isOutOfStock}
           className={`p-2.5 text-white rounded-xl shadow-sm transition-colors ${existingItem ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)]'} disabled:opacity-30 disabled:bg-slate-300`}
        >
          {existingItem ? <ShoppingCart className="w-5 h-5 fill-current" /> : <ShoppingCart className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}

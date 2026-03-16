'use client';

import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, Image as ImageIcon } from 'lucide-react';

interface ProductProps {
  product: any;
  onAddToCart?: (product: any, quantity: number) => void;
}

export function ProductCard({ product, onAddToCart }: ProductProps) {
  const [quantity, setQuantity] = useState(1);

  const price = product.promotional_price > 0 ? product.promotional_price : product.base_price;
  const isOutOfStock = product.stock_quantity <= 0;

  const handleDecrease = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const handleIncrease = () => {
    if (quantity < product.stock_quantity) setQuantity(quantity + 1);
  };

  const handleAddToCart = () => {
    if (onAddToCart && !isOutOfStock) {
      onAddToCart(product, quantity);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-full group transition-all hover:shadow-md hover:-translate-y-1 dark:bg-slate-900/80 dark:border-slate-800">
      
      {/* Thumbnail */}
      <div className="bg-slate-100 dark:bg-slate-800 rounded-xl aspect-[3/4] w-full mb-4 flex items-center justify-center relative overflow-hidden">
        {/* Placeholder for real images later */}
        <ImageIcon className="w-10 h-10 text-slate-300 dark:text-slate-600" />
        
        {/* Badges */}
        {product.promotional_price > 0 && !isOutOfStock && (
           <span className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
             OFERTA
           </span>
        )}
        {isOutOfStock && (
           <span className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center font-bold text-slate-700 dark:text-slate-300">
             ESGOTADO
           </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 flex flex-col">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-[var(--color-primary-base)] transition-colors">
          {product.name}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
          {product.brand ? product.brand.name : 'Vários Autores'}
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
              {isOutOfStock ? 'Sem estoque' : `Disponível: ${product.stock_quantity} un`}
            </span>
         </div>
      </div>

      {/* Actions */}
      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div className="flex-1 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-1 dark:bg-slate-950 dark:border-slate-700">
          <button 
            onClick={handleDecrease}
            disabled={isOutOfStock || quantity <= 1}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
          >
            <Minus className="w-4 h-4" />
          </button>
          
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-8 text-center">
            {isOutOfStock ? 0 : quantity}
          </span>
          
          <button 
            onClick={handleIncrease}
            disabled={isOutOfStock || quantity >= product.stock_quantity}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <button 
           onClick={handleAddToCart}
           disabled={isOutOfStock}
           className="p-2.5 bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] rounded-xl disabled:opacity-30 disabled:bg-slate-300 transition-colors shadow-sm"
        >
          <ShoppingCart className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

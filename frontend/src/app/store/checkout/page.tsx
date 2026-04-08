'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, PackageOpen, CheckCircle, MapPin, Truck, CreditCard, Loader2, AlertCircle, Plus, Minus, Trash2 } from 'lucide-react';
import { useCart } from '@/components/store/CartContext';
import { ProductImage } from '@/components/store/ProductImage';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart, updateQuantity, removeFromCart } = useCart();
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderComplete, setOrderComplete] = useState<{order_id: string, horus_id: string} | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [orderType, setOrderType] = useState('V');
  const [stockErrors, setStockErrors] = useState<any[]>([]);
  const [validatingStock, setValidatingStock] = useState(false);

  useEffect(() => {
    const validateStock = async () => {
      if (items.length === 0) return;
      setValidatingStock(true);
      try {
        const token = getToken();
        if(!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/cart/validate_stock`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setStockErrors(data.out_of_stock || []);
        }
      } catch (err) {
        console.error("Error validating stock", err);
      } finally {
        setValidatingStock(false);
      }
    };
    validateStock();
  }, [items]);

  useEffect(() => {
    const fetchCustomerData = async () => {
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
      }
    };
    fetchCustomerData();
  }, []);
  
  const mainAddress = customer?.addresses?.find((a: any) => a.type === 'MAIN') || customer?.addresses?.[0];

  const handlePlaceOrder = async () => {
    setPlacingOrder(true);
    try {
        const token = getToken();
        if (!token) {
           router.push('/login');
           return;
        }
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/cart/checkout`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type_order: orderType })
        });
        
        if (res.ok) {
            const data = await res.json();
            setOrderComplete({
              order_id: data.order_id,
              horus_id: data.horus_id || 'N/A'
            });
            setTimeout(() => {
              clearCart();
            }, 300);
        } else {
            const errorData = await res.json();
            alert(`Erro ao finalizar pedido: ${errorData.detail}`);
        }
    } catch (err) {
        console.error("Error checking out", err);
        alert("Ocorreu um erro de comunicação com o servidor.");
    } finally {
        setPlacingOrder(false);
    }
  };

  if (orderComplete) {
     return (
        <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] flex items-center justify-center p-6">
           <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 max-w-lg w-full text-center shadow-xl border border-slate-100 dark:border-slate-800">
               <div className="w-24 h-24 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
                 <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-500" />
               </div>
               <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-4">Pedido Realizado!</h2>
               <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-sm mx-auto">
                 Sua compra foi concluída com sucesso e enviada para separação.
               </p>
               
               <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 mb-8 text-left">
                  <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                     <span className="text-slate-500">Nº do Pedido Interno</span>
                     <span className="font-bold text-slate-900 dark:text-white">#{orderComplete.order_id}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                     <span className="text-slate-500">Nº do Pedido (Horus ERP)</span>
                     <span className="font-bold text-[var(--color-primary-base)]">{orderComplete.horus_id !== 'N/A' ? `#${orderComplete.horus_id}` : 'Sem integração ERP'}</span>
                  </div>
                  {customer?.default_payment_method === 'PIX_MANUAL' && (
                     <div className="text-sm text-center text-indigo-700 dark:text-indigo-400 font-medium bg-indigo-50 dark:bg-indigo-500/10 p-3 rounded-lg">
                       Lembrete: Sua forma de pagamento é <b>PIX Manual / Depósito</b>. Nossa equipe entrará em contato com a chave PIX, ou você pode requisitar o Financeiro via WhatsApp.
                     </div>
                  )}
                  {(!customer?.default_payment_method || customer?.default_payment_method === 'ERP_STANDARD') && (
                     <div className="text-sm text-center text-slate-600 dark:text-slate-400">
                       As duplicatas / boletos serão emitidos automaticamente pelo nosso ERP no momento do faturamento físico.
                     </div>
                  )}
               </div>
               
               <Link href="/store" className="inline-block w-full text-center bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-4 rounded-xl transition-colors">
                  Voltar para o Catálogo
               </Link>
           </div>
        </div>
     );
  }

  if (items.length === 0) {
    return (
       <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] flex flex-col items-center justify-center p-6">
           <PackageOpen className="w-24 h-24 text-slate-300 dark:text-slate-700 mb-6" />
           <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-4">Seu carrinho está vazio</h2>
           <Link href="/store" className="text-[var(--color-primary-base)] font-bold hover:underline flex items-center gap-2">
             <ChevronLeft className="w-5 h-5" /> Voltar às compras
           </Link>
       </div>
    );
  }

  return (
    <div className="flex-1 w-full bg-slate-50 dark:bg-[#0a0f1c] min-h-[calc(100vh-80px)] py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="mb-8 flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
              <ChevronLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
            </button>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white">Revisar Pedido</h1>
         </div>

         <div className="flex flex-col lg:flex-row gap-8">
            
            {/* Esquerda: Itens + Dados */}
            <div className="flex-1 space-y-8">
                
                {/* Section Endereço */}
                <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                       <MapPin className="w-6 h-6 text-[var(--color-primary-base)]" />
                       Endereço de Faturamento / Entrega
                    </h2>
                    {mainAddress ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6">
                            <p className="font-bold text-slate-900 dark:text-white text-lg mb-2">{customer?.trade_name || customer?.company_name}</p>
                            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                {mainAddress.street}, {mainAddress.number} {mainAddress.complement && `- ${mainAddress.complement}`} <br/>
                                {mainAddress.neighborhood} - {mainAddress.city}/{mainAddress.state} <br/>
                                CEP: {mainAddress.zip_code}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 p-6 rounded-2xl">
                           Nenhum endereço principal cadastrado. O faturamento será enviado no endereço padrão do cliente no ERP.
                        </div>
                    )}
                </section>

                {/* Section Itens */}
                <section className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                       <PackageOpen className="w-6 h-6 text-[var(--color-primary-base)]" />
                       Itens do Pedido
                    </h2>
                    <div className="space-y-4">
                       {items.map(item => {
                          const price = item.promotional_price && item.promotional_price > 0 ? item.promotional_price : item.base_price;
                          return (
                              <div key={item.id} className="flex gap-4 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                                 {/* Optional small thumb */}
                                 <div className="w-16 h-20 bg-slate-100 dark:bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                                     <ProductImage 
                                         eanGtin={item.ean_gtin || item.sku} 
                                         alt={item.name} 
                                         className="w-full h-full object-contain p-1" 
                                     />
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 dark:text-white line-clamp-1 mb-1">{item.name}</h4>
                                    <div className="text-xs text-slate-500 mb-2 flex flex-wrap gap-2">
                                        <span>{item.brand || (item.category ? item.category.name : 'Vários Autores')}</span>
                                        {item.ean_gtin && <span className="text-slate-400">ISBN: {item.ean_gtin}</span>}
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                       <div className="flex flex-col">
                                          {item.promotional_price && item.promotional_price > 0 && item.promotional_price < item.base_price ? (
                                              <>
                                                <span className="line-through text-[10px] text-slate-400">{item.quantity}x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.base_price)}</span>
                                                <span className="text-emerald-600 font-medium">{item.quantity}x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}</span>
                                              </>
                                          ) : (
                                              <span className="text-slate-600 dark:text-slate-400">
                                                {item.quantity}x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
                                              </span>
                                          )}
                                       </div>
                                       <span className="font-bold text-slate-900 dark:text-white text-base">
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price * item.quantity)}
                                       </span>
                                    </div>
                                    {(() => {
                                       const err = stockErrors.find(e => e.isbn === (item.ean_gtin || item.sku));
                                       if (!err || err.label === 'DISPONÍVEL') return null;
                                       
                                       const isError = !err.allowed;
                                       return (
                                          <div className={`mt-2 text-xs p-2 rounded flex items-start gap-1.5 ${isError ? 'text-rose-600 bg-rose-50 dark:bg-rose-500/10' : 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-500/10'}`}>
                                             <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                             <div className="flex flex-col">
                                                <span className="font-bold">{err.label}</span>
                                                {err.message && <span>{err.message}</span>}
                                             </div>
                                           </div>
                                        );
                                     })()}
                                     
                                     {/* Mutation Controls */}
                                     <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-0.5 dark:bg-slate-950 dark:border-slate-700">
                                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1} className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md disabled:opacity-30 dark:hover:bg-slate-800 transition-colors">
                                            <Minus className="w-3.5 h-3.5" />
                                          </button>
                                          <span className="w-8 text-center text-xs font-bold text-slate-700 dark:text-slate-300">{item.quantity}</span>
                                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= (item.stock_quantity || 999)} className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md disabled:opacity-30 dark:hover:bg-slate-800 transition-colors">
                                            <Plus className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.id)} className="text-xs text-rose-500 hover:bg-rose-50 px-2 py-1.5 rounded-lg flex items-center gap-1 font-bold transition-colors dark:hover:bg-rose-500/10 dark:hover:text-rose-400">
                                          <Trash2 className="w-3.5 h-3.5" /> Remover
                                        </button>
                                     </div>
                                  </div>
                              </div>
                          );
                       })}
                    </div>
                </section>

            </div>

            {/* Direita: Resumo Financeiro */}
            <div className="lg:w-[400px]">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 sticky top-24">
                   <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Resumo</h2>
                   
                   <div className="space-y-4 mb-8">
                       <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                           <span>Subtotal</span>
                           <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span>
                       </div>
                       <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                           <span className="flex items-center gap-2"><Truck className="w-4 h-4"/> Frete</span>
                           <span className="text-emerald-500 font-medium">A Combinar FOB</span>
                       </div>
                       <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                           <span className="flex items-center gap-2"><CreditCard className="w-4 h-4"/> Faturamento</span>
                           <span className="text-slate-700 dark:text-slate-300 font-medium">
                             {customer?.default_payment_method === 'EFI_PIX_CREDIT' ? 'Pix Automático / Cartão' :
                              customer?.default_payment_method === 'PIX_MANUAL' ? 'Depósito / PIX Manual' :
                              'Boleto a Prazo ERP'}
                           </span>
                       </div>
                       <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                           <span className="text-lg font-bold text-slate-900 dark:text-white">Total Geral</span>
                           <span className="text-2xl font-black text-[var(--color-primary-base)]">
                               {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
                           </span>
                       </div>
                   </div>

                   <div className="mb-6">
                       <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Tipo de Pedido</label>
                       <select 
                           value={orderType}
                           onChange={(e) => setOrderType(e.target.value)}
                           className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                       >
                           <option value="V">VENDA</option>
                           {customer?.consignment_status === 'ACTIVE' && (
                               <option value="C">CONSIGNADO</option>
                           )}
                       </select>
                   </div>

                   {stockErrors.some(e => !e.allowed) && (
                       <div className="mb-4 text-sm text-rose-600 dark:text-rose-400 font-bold px-3 py-2 bg-rose-50 dark:bg-rose-500/10 rounded-xl w-full text-center">
                           Há itens com problemas de estoque. Ajuste as quantidades ou remova-os para continuar.
                       </div>
                   )}

                   <button
                       onClick={handlePlaceOrder}
                       disabled={placingOrder || validatingStock}
                       className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white select-none rounded-xl h-16 font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 shadow-xl shadow-[var(--color-primary-base)]/20"
                   >
                       {placingOrder ? (
                           <>
                             <Loader2 className="w-6 h-6 animate-spin" /> Processando ERP...
                           </>
                       ) : validatingStock ? (
                           <>
                             <Loader2 className="w-6 h-6 animate-spin" /> Validando Estoque...
                           </>
                       ) : (
                           'Confirmar e Finalizar'
                       )}
                   </button>
                   <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
                       Ao confirmar, o pedido será enviado para nossa logística para o início da separação.
                   </p>
                </div>
            </div>

         </div>
      </div>
    </div>
  );
}

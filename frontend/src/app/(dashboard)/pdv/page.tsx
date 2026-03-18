'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  ShoppingCart, 
  User, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard,
  Banknote,
  QrCode,
  Tag,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  PackageSearch,
  Users
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
  image?: string;
  brand?: string;
  ean_gtin?: string;
  discount_percentage?: number;
}

interface CartItem extends Product {
  quantity: number;
  cart_discount?: number;
}

interface Customer {
  id: number;
  name: string;
  document: string;
  email: string;
  id_guid?: string;
}

export default function PDVPage() {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'customer' | 'payment'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<'CREDIT' | 'DEBIT' | 'PIX' | 'CASH'>('PIX');
  const [processingOrder, setProcessingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [printReceipt, setPrintReceipt] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [financials, setFinancials] = useState<any>(null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const GENERIC_CUSTOMER: Customer = {
    id: 0,
    name: 'Consumidor Diversos',
    document: 'Não Informado',
    email: ''
  };

  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const isAgent = currentUser?.type === 'AGENT';

  useEffect(() => {
    fetchSettings().then((s) => {
      // Se não for B2B, já podemos carregar produtos sem cliente
      if (s?.horus_api_mode !== 'B2B') {
        fetchProducts();
      }
      fetchCustomers('', s);
    });
  }, []);

  async function fetchSettings() {
    try {
      const token = getToken();
      const companyId = currentUser?.company_id;
      if (!companyId) return null; // Avoid fetching with 'undefined' in the URL
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        return data;
      }
    } catch(e) {
      console.error(e);
    }
    return null;
  }

  async function fetchFinancials(customerId: number) {
     try {
        setLoadingFinancials(true);
        const token = getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/financials`, {
           headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
           const data = await res.json();
           setFinancials(data);
        } else {
           setFinancials(null);
        }
     } catch (e) {
        console.error("Erro ao buscar limite B2B", e);
     } finally {
        setLoadingFinancials(false);
     }
  }

  useEffect(() => {
     if (selectedCustomer?.id && selectedCustomer.id !== 0 && settings?.horus_api_mode === 'B2B') {
        fetchFinancials(selectedCustomer.id);
     } else {
        setFinancials(null);
     }
  }, [selectedCustomer, settings]);

  async function fetchProducts(query = '') {
    try {
      setLoading(true);
      const token = getToken();
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products`);
      if (query) url.searchParams.append('search', query); 
      url.searchParams.append('limit', '40'); 
      if (selectedCustomer?.id && selectedCustomer.id !== 0) {
         url.searchParams.append('customer_id', selectedCustomer.id.toString());
      }
      
      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || data || []);
      }
    } catch (error) {
      console.error("Erro ao buscar produtos", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCustomers(query = '', currentSettings = settings) {
    try {
      const token = getToken();
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers`);
      url.searchParams.append('limit', '40'); // Increase from 10 to 40 since we filter client side
      if (query) url.searchParams.append('search', query);
      
      const res = await fetch(url.toString(), {
         headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        let items = data.items || data;
        
        if (currentSettings?.horus_api_mode === 'B2B') {
           items = items.filter((c: Customer) => c.id_guid && c.id_guid.trim() !== '');
        }
        
        setCustomers(items);
      }
    } catch (error) {
       console.error("Erro ao buscar clientes", error);
    }
  }

  // Auto-search effect
  useEffect(() => {
    // No modo B2B, não busca produtos sem cliente selecionado
    if (settings?.horus_api_mode === 'B2B' && !selectedCustomer) return;

    const timer = setTimeout(() => {
      fetchProducts(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCustomer, settings]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (customerSearch.length >= 3) {
        fetchCustomers(customerSearch);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const addToCart = (product: Product) => {
    if (product.stock <= 0 && !settings?.pdv_allow_out_of_stock) {
       toast.error("Produto esgotado e empresa não permite venda de itens sem saldo no PDV.");
       return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, cart_discount: 0 }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQ = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQ };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const applyItemDiscount = (productId: number, discountValue: number) => {
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, cart_discount: discountValue } : item
    ));
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
  const itemDiscounts = cart.reduce((acc, item) => acc + ((item.cart_discount || 0) * (item.quantity || 1)), 0);
  const cartTotal = Math.max(0, cartSubtotal - itemDiscounts - (globalDiscount || 0));

  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error("Carrinho vazio!");
    if (!selectedCustomer) return setCheckoutStep('customer');
    if (checkoutStep !== 'payment') return setCheckoutStep('payment');

    setProcessingOrder(true);
    try {
      const token = getToken();
      
      const items = cart.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price - (item.cart_discount || 0)
      }));

      const payload = {
        customer_id: selectedCustomer.id,
        items,
        total_amount: cartTotal,
        payment_method: paymentMethod,
        discount_amount: globalDiscount + itemDiscounts,
        status: 'COMPLETED', // Status direto para PDV
        source: 'PDV'
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Falha ao processar venda no PDV");
      
      // const order = await res.json();
      setOrderSuccess(true);
      toast.success("Venda finalizada com sucesso!");
    } catch (error) {
      toast.error("Erro ao finalizar a venda.");
    } finally {
      setProcessingOrder(false);
    }
  };

  const startNewSale = () => {
    setCart([]);
    setSelectedCustomer(null);
    setCheckoutStep('cart');
    setOrderSuccess(false);
    setGlobalDiscount(0);
    setSearchQuery('');
    setFinancials(null);
    if (settings?.horus_api_mode === 'B2B') {
      setProducts([]); // Clear cached catalog until new customer chosen
    } else {
      fetchProducts();
    }
  };

  if (!mounted) return null;

  if (orderSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] animate-in fade-in duration-500">
        <div className="bg-white dark:bg-slate-900 p-8 md:p-12 rounded-3xl shadow-xl border border-emerald-100 dark:border-emerald-900/30 text-center max-w-md w-full relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500" />
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/50 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Venda Concluída!</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">
            O pedido foi registrado no sistema e o comprovante está disponível.
          </p>
          
          <div className="space-y-3">
             <button
                onClick={() => {
                  const content = `========== COMPROVANTE NÃO FISCAL ==========\n` + 
                    `CLIENTE: ${selectedCustomer?.name || 'Consumidor Diversos'}\n` +
                    `DOCUMENTO: ${selectedCustomer?.document || 'N/A'}\n` +
                    `--------------------------------------------\n` + 
                    cart.map(i => `${i.quantity}x ${i.name.substring(0,20)}... R$ ${i.price.toFixed(2)}`).join('\n') +
                    `\n--------------------------------------------\n` +
                    `SUBTOTAL: R$ ${cartSubtotal.toFixed(2)}\n` +
                    `DESCONTOS: R$ ${(itemDiscounts + globalDiscount).toFixed(2)}\n` +
                    `TOTAL: R$ ${cartTotal.toFixed(2)}\n` +
                    `FORMA DE PAGAMENTO: ${paymentMethod}\n` +
                    `============================================`;
                    
                  const printWin = window.open('', '', 'width=400,height=600');
                  if(printWin) {
                     printWin.document.write(`<pre style="font-family: monospace; font-size: 14px; padding: 20px;">${content}</pre>`);
                     printWin.document.close();
                     printWin.print();
                  }
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-4 rounded-xl transition-colors dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 focus:outline-none"
             >
                Imprimir Cupom Não-Fiscal
             </button>
             <button
                onClick={startNewSale}
                className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-3 px-4 rounded-xl transition-colors shadow-lg shadow-[var(--color-primary-base)]/20 focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-base)]/30"
             >
                Nova Venda
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950 overflow-hidden relative -mx-6 -my-6">
      
      {/* Esquerda: Lista de Produtos */}
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800">
        
        {/* Superior: Header & Busca */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-[var(--color-primary-base)]" />
              Terminal PDV
            </h1>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
               {isAgent && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full text-xs dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20">Vendedor: {currentUser?.name}</span>}
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder={settings?.horus_api_mode === 'B2B' && !selectedCustomer ? "Selecione um cliente para buscar produtos..." : "Código de Barras, SKU ou Nome do Produto..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={settings?.horus_api_mode === 'B2B' && !selectedCustomer}
              className="w-full pl-11 pr-4 py-3.5 bg-slate-100 border-none rounded-xl text-slate-900 focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:bg-slate-800 dark:text-white placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
          </div>
        </div>

        {/* Grade de Produtos */}
        <div className="flex-1 overflow-y-auto p-4 content-start">
          {settings?.horus_api_mode === 'B2B' && !selectedCustomer ? (
             <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="h-16 w-16 bg-indigo-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-indigo-100 dark:border-slate-700">
                   <Users className="h-8 w-8 text-indigo-500 dark:text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Modo B2B Ativo</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
                   Para visualizar produtos, preços e ofertas exclusivas, é necessário primeiro selecionar o cliente no painel ao lado.
                </p>
                <button 
                  onClick={() => setCheckoutStep('customer')}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-indigo-500/20 transition-all font-semibold"
                >
                   Identificar Cliente
                </button>
             </div>
          ) : loading ? (
             <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
             </div>
          ) : products.length === 0 ? (
             <div className="text-center py-12 text-slate-500 flex flex-col items-center">
                 <PackageSearch className="h-12 w-12 text-slate-300 mb-2 dark:text-slate-700" />
                 <p>Nenhum produto encontrado na busca.</p>
             </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock <= 0 && !settings?.pdv_allow_out_of_stock}
                  className={`bg-white dark:bg-slate-900 p-3 rounded-2xl border transition-all flex flex-col text-left group ${product.stock <= 0 && !settings?.pdv_allow_out_of_stock ? 'border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed' : 'border-slate-200 dark:border-slate-800 hover:border-[var(--color-primary-base)] dark:hover:border-[var(--color-primary-base)] hover:shadow-lg hover:shadow-[var(--color-primary-base)]/5'}`}
                >
                  <div className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-xl mb-3 w-full overflow-hidden flex items-center justify-center relative">
                    {product.image || (settings?.cover_image_base_url && product.ean_gtin) ? (
                       <img 
                          src={product.image || `${settings?.cover_image_base_url?.replace(/\/$/, '')}/${product.ean_gtin}.jpg`} 
                          alt={product.name} 
                          title={product.brand}
                          onError={(e) => {
                             // Fallback to placeholder if base url image fails
                             e.currentTarget.style.display = 'none';
                             const parent = e.currentTarget.parentElement;
                             if(parent) {
                                const placeholder = document.createElement('div');
                                placeholder.className = 'absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800';
                                placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-300 dark:text-slate-600"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
                                parent.appendChild(placeholder);
                             }
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 relative z-10" 
                       />
                    ) : (
                       <ShoppingCart className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    )}
                    {product.stock <= 5 && product.stock > 0 && (
                       <span className="absolute bottom-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur border border-white/20 z-20">
                          Restam {product.stock}
                       </span>
                    )}
                    {product.stock <= 0 && (
                       <span className="absolute bottom-2 left-2 bg-slate-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur border border-white/20 z-20">
                          Esgotado
                       </span>
                    )}
                  </div>
                  <div className="mt-auto pl-1">
                     <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mb-0.5 uppercase tracking-wider truncate" title={product.brand}>{product.brand || 'Diversos'}</p>
                     <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-1 truncate" title={product.ean_gtin}>{product.ean_gtin || product.sku}</p>
                     <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight line-clamp-2 mb-2" title={product.name}>
                       {product.name}
                     </h3>
                     <div className="flex items-center gap-2">
                       <p className="text-lg font-bold text-[var(--color-primary-base)]">
                         {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
                       </p>
                       {product.discount_percentage && product.discount_percentage > 0 && (
                         <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-bold border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                           -{product.discount_percentage}%
                         </span>
                       )}
                     </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Direita: Carrinho e Checkout */}
      <div className="w-full md:w-[400px] lg:w-[450px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-20 transition-all duration-300">
        
        {/* Headers Dinâmicos do Carrinho */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
           {checkoutStep !== 'cart' && (
              <button 
                onClick={() => setCheckoutStep(checkoutStep === 'payment' ? 'customer' : 'cart')}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400 transition-colors"
              >
                 <ArrowLeft className="h-5 w-5" />
              </button>
           )}
           <h2 className="text-lg font-bold text-slate-800 dark:text-white">
              {checkoutStep === 'cart' ? 'Carrinho Atual' : checkoutStep === 'customer' ? 'Identificar Cliente' : 'Pagamento'}
           </h2>
        </div>

        {/* Área Principal Dinâmica do Checkout */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-0 bg-slate-50/50 dark:bg-slate-950/20">
          <AnimatePresence mode="wait">
            {checkoutStep === 'cart' && (
              <motion.div
                key="cartView"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-3"
              >
                {cart.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-3">
                      <ShoppingCart className="h-12 w-12 opacity-20" />
                      <p>Adicione produtos para iniciar a venda</p>
                   </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex gap-3 shadow-sm group">
                       <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                          {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : <ShoppingCart className="h-6 w-6 text-slate-300" />}
                       </div>
                       <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-sm font-medium text-slate-900 dark:text-white leading-tight line-clamp-2">{item.name}</h4>
                            <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 -mr-2 -mt-1 rounded-md opacity-0 group-hover:opacity-100">
                               <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="flex items-center justify-between mt-2">
                             <div className="text-sm font-bold text-[var(--color-primary-base)]">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((item.price - (item.cart_discount || 0)) * item.quantity)}
                             </div>
                             
                             <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                <button onClick={() => updateQuantity(item.id, -1)} className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                                   <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-8 text-center text-sm font-semibold text-slate-900 dark:text-white bg-transparent border-x border-slate-200 dark:border-slate-700 px-1">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, +1)} className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                                   <Plus className="h-3.5 w-3.5" />
                                </button>
                             </div>
                          </div>
                       </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {checkoutStep === 'customer' && (
              <motion.div
                key="customerView"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 flex flex-col h-full"
              >
                 <div className="relative mb-4">
                   <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                   <input
                     type="text"
                     placeholder="Buscar Cliente..."
                     value={customerSearch}
                     onChange={(e) => setCustomerSearch(e.target.value)}
                     className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all dark:bg-slate-900 dark:border-slate-800 dark:text-white placeholder:text-slate-400"
                     autoFocus
                   />
                 </div>

                 {selectedCustomer && (
                    <div className="bg-[var(--color-primary-base)]/10 border border-[var(--color-primary-base)]/20 p-4 rounded-xl mb-4 flex flex-col gap-3">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-[var(--color-primary-base)]/20 rounded-full flex items-center justify-center text-[var(--color-primary-base)]">
                               <User className="h-5 w-5" />
                            </div>
                            <div>
                               <p className="font-semibold text-slate-900 dark:text-white text-sm">{selectedCustomer.name}</p>
                               <p className="text-xs text-slate-500">{selectedCustomer.document}</p>
                            </div>
                         </div>
                         <button onClick={() => setSelectedCustomer(null)} className="text-rose-500 text-sm hover:underline font-medium">Trocar</button>
                       </div>
                       
                       {/* Financial Widget B2B */}
                       {settings?.horus_api_mode === 'B2B' && selectedCustomer.id !== 0 && (
                          <div className="mt-2 pt-3 border-t border-[var(--color-primary-base)]/20 grid grid-cols-2 gap-4">
                             {loadingFinancials ? (
                                <div className="col-span-2 flex justify-center p-2"><Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary-base)]" /></div>
                             ) : financials ? (
                                <>
                                  <div>
                                     <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Limite B2B</p>
                                     <p className="text-sm font-semibold text-[var(--color-primary-base)]">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financials.credit_limit || 0)}</p>
                                  </div>
                                  <div>
                                     <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Títulos Abertos</p>
                                     <p className="text-sm font-semibold text-rose-500">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financials.debt_balance || 0)}</p>
                                  </div>
                                </>
                             ) : (
                                <p className="col-span-2 text-xs text-rose-500 font-medium bg-rose-50 p-2 rounded border border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30">Dados financeiros indisponíveis ou cliente sem cadastro B2B.</p>
                             )}
                          </div>
                       )}
                    </div>
                 )}

                 <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                       {settings?.horus_api_mode !== 'B2B' && (
                       <li>
                         <button
                           onClick={() => setSelectedCustomer(GENERIC_CUSTOMER)}
                           className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30"
                         >
                            <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0">
                               <Users className="h-4 w-4" />
                            </div>
                            <div className="overflow-hidden">
                               <p className="font-bold text-sm text-slate-900 dark:text-white truncate">Consumidor Diversos</p>
                               <p className="text-xs text-slate-500">Sem identificação fiscal (CPF/CNPJ)</p>
                            </div>
                         </button>
                       </li>
                       )}
                       {customers.map(c => (
                          <li key={c.id}>
                             <button
                               onClick={() => setSelectedCustomer(c)}
                               className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-3"
                             >
                                <div className="h-8 w-8 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 flex-shrink-0">
                                   <User className="h-4 w-4" />
                                </div>
                                <div className="overflow-hidden">
                                   <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{c.name}</p>
                                   <p className="text-xs text-slate-500">{c.document}</p>
                                </div>
                             </button>
                          </li>
                       ))}
                       {customers.length === 0 && (
                          <li className="p-4 text-center text-sm text-slate-500">Busque por um cliente cadastrado ou pule selecionando Consumidor Diversos.</li>
                       )}
                    </ul>
                 </div>
              </motion.div>
            )}

            {checkoutStep === 'payment' && (
              <motion.div
                key="paymentView"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                 <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Forma de Pagamento</h3>
                 
                 <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'PIX', name: 'PIX', icon: QrCode },
                      { id: 'CREDIT', name: 'Cartão Crédito', icon: CreditCard },
                      { id: 'DEBIT', name: 'Cartão Débito', icon: CreditCard },
                      { id: 'CASH', name: 'Dinheiro', icon: Banknote }
                    ].map(method => (
                       <button
                         key={method.id}
                         onClick={() => setPaymentMethod(method.id as any)}
                         className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === method.id ? 'border-[var(--color-primary-base)] bg-[var(--color-primary-base)]/5 text-[var(--color-primary-base)] ring-1 ring-[var(--color-primary-base)]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700'}`}
                       >
                         <method.icon className={`h-6 w-6 ${paymentMethod === method.id ? 'text-[var(--color-primary-base)]' : 'text-slate-400'}`} />
                         <span className="text-sm font-medium">{method.name}</span>
                       </button>
                    ))}
                 </div>

                 {paymentMethod === 'CASH' && (
                    <div className="mt-4 p-4 bg-slate-100 rounded-xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
                       <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-2">Troco / Valor Recebido</label>
                       <div className="relative">
                         <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">R$</span>
                         <input type="number" className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-primary-base)]" placeholder="0,00" />
                       </div>
                    </div>
                 )}

                 <div className="mt-6 border-t border-dashed border-slate-300 dark:border-slate-700 pt-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                         <Tag className="h-4 w-4 text-slate-400" />
                         <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Aplicar Desconto Global no Pedido</span>
                      </div>
                      <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">R$</span>
                           <input 
                             type="number" 
                             value={globalDiscount === 0 ? '' : globalDiscount}
                             onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                             className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-[var(--color-primary-base)]" 
                             placeholder="0.00" 
                           />
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 bg-slate-100 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                           type="checkbox" 
                           checked={printReceipt}
                           onChange={(e) => setPrintReceipt(e.target.checked)}
                           className="w-5 h-5 rounded border-slate-300 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Imprimir comprovante não-fiscal ao finalizar</span>
                      </label>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Rodapé Dinâmico e Totais */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="space-y-1.5 text-sm">
             <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal ({cart.reduce((a,b)=>a+b.quantity,0)} itens)</span>
                <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartSubtotal)}</span>
             </div>
             {(itemDiscounts > 0 || globalDiscount > 0) && (
               <div className="flex justify-between text-rose-500 font-medium">
                  <span>Descontos Aplicados</span>
                  <span>- {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemDiscounts + globalDiscount)}</span>
               </div>
             )}
             <div className="flex justify-between text-lg font-black text-slate-900 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800 mt-2">
                <span>Total</span>
                <span className="text-[var(--color-primary-base)]">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartTotal)}</span>
             </div>
          </div>

          <div className="pt-2">
            {checkoutStep === 'cart' && (
              <button
                onClick={() => handleCheckout()}
                disabled={cart.length === 0}
                className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold text-lg py-4 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                Avançar <ArrowLeft className="h-5 w-5 rotate-180" />
              </button>
            )}

            {checkoutStep === 'customer' && (
              <button
                onClick={() => setCheckoutStep('payment')}
                className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold text-lg py-4 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
               Prosseguir p/ Pagamento
              </button>
            )}

            {checkoutStep === 'payment' && (
              <button
                onClick={handleCheckout}
                disabled={processingOrder}
                className={`w-full text-white font-bold text-lg py-4 rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 ${processingOrder ? 'bg-emerald-400 cursor-wait' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'}`}
              >
                {processingOrder ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Finalizando...</>
                ) : (
                  <><CheckCircle2 className="h-5 w-5" /> Finalizar Venda</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

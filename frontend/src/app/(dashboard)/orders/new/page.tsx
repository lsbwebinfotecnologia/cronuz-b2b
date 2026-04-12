"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { Package, Search, ArrowLeft, Loader2, Minus, Plus, Trash2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';

interface Customer {
    id: number;
    name: string;
    corporate_name: string;
    document: string;
    credit_limit: number;
    open_debts: number;
    discount?: number;
    id_guid?: string;
    commercial_policy?: {
        name: string;
        discount_sale_percent: number;
        discount_consignment_percent: number;
        max_installments: number;
        min_installment_value: number;
    };
}

interface Product {
    id: string | number; // "horus-xxxx" or int
    original_id?: number; 
    name: string;
    sku: string;
    ean_gtin?: string;
    brand?: string;
    price: number;
    stock: number;
}

interface CartItem extends Product {
    quantity: number;
}

export default function NewSellerOrderPage() {
    const router = useRouter();
    
    // Step 1: Customer Selection
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchCustomer, setSearchCustomer] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [loadingCustomers, setLoadingCustomers] = useState(false);

    // Step 2: Product Selection
    const [searchProduct, setSearchProduct] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Step 3: Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Financial Settings
    const [orderType, setOrderType] = useState('V');
    const [installments, setInstallments] = useState(1);

    const searchParams = useSearchParams();
    const urlCustomerId = searchParams?.get('customer_id');
    const urlOrderId = searchParams?.get('order_id');

    // Restore defaults when customer changes
    useEffect(() => {
        if (selectedCustomer?.commercial_policy && !selectedCustomer.id_guid) {
            setInstallments(selectedCustomer.commercial_policy.max_installments || 1);
        } else {
            setInstallments(1);
        }
    }, [selectedCustomer]);

    // Auto-fetch Customer if provided in URL
    useEffect(() => {
        if (!urlCustomerId) return;
        const fetchCust = async () => {
            try {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const res = await fetch(`${apiUrl}/customers/${urlCustomerId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSelectedCustomer(data);
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchCust();
    }, [urlCustomerId]);

    // Auto-fetch Order (Cart) if provided in URL
    useEffect(() => {
        if (!urlOrderId) return;
        const fetchOrder = async () => {
            try {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const res = await fetch(`${apiUrl}/orders/${urlOrderId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'NEW' && data.items) {
                        const populatedCart = data.items.map((i: any) => ({
                            id: i.product_id || (i.ean_isbn ? `horus-${i.ean_isbn}` : `horus-${i.sku}`),
                            original_id: i.product_id,
                            name: i.name,
                            sku: i.sku,
                            ean_gtin: i.ean_isbn,
                            price: i.unit_price,
                            stock: 999, // Assumption for resumed carts
                            quantity: i.quantity
                        }));
                        setCart(populatedCart);
                        if (!urlCustomerId && data.customer) {
                             setSelectedCustomer(data.customer);
                        }
                    }
                }
            } catch (e) {
                console.error(e);
            }
        };
        fetchOrder();
    }, [urlOrderId, urlCustomerId]);

    // Fetch Customers
    useEffect(() => {
        const fetchCustomers = async () => {
            setLoadingCustomers(true);
            try {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const url = new URL(`${apiUrl}/customers`);
                url.searchParams.append('limit', '50');
                if (searchCustomer) url.searchParams.append('search', searchCustomer);
                
                const res = await fetch(url.toString(), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCustomers(data);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoadingCustomers(false);
            }
        };

        const timer = setTimeout(fetchCustomers, 400);
        return () => clearTimeout(timer);
    }, [searchCustomer]);

    // Fetch Products
    useEffect(() => {
        const fetchProducts = async () => {
            if (!selectedCustomer || !searchProduct) {
                setSearchResults([]);
                return;
            }
            setLoadingProducts(true);
            try {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const url = new URL(`${apiUrl}/products/`);
                url.searchParams.append('search', searchProduct);
                url.searchParams.append('customer_id', String(selectedCustomer.id));
                url.searchParams.append('limit', '20');

                const res = await fetch(url.toString(), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const mappedItems = (data.items || []).map((i: any) => ({
                        id: i.id,
                        original_id: i.id,
                        name: i.name,
                        sku: i.sku,
                        ean_gtin: i.ean_gtin,
                        brand: i.brand,
                        base_price: i.base_price,
                        promotional_price: i.promotional_price,
                        price: i.promotional_price || i.base_price || i.price || 0,
                        stock: i.stock_quantity || i.stock || 0
                    }));
                    setSearchResults(mappedItems);
                }
            } catch(e) {
                console.error(e);
            } finally {
                setLoadingProducts(false);
            }
        };

        const timer = setTimeout(fetchProducts, 600);
        return () => clearTimeout(timer);
    }, [searchProduct, selectedCustomer]);

    const addToCart = (product: Product) => {
        if (product.stock <= 0) {
            alert("Produto sem estoque disponível!");
            return;
        }

        setCart(prev => {
            const exists = prev.find(i => i.id === product.id);
            if (exists) {
                if (exists.quantity >= product.stock) {
                    alert("A quantidade máxima disponível em estoque foi atingida.");
                    return prev;
                }
                const otherItems = prev.filter(i => i.id !== product.id);
                return [{ ...exists, quantity: exists.quantity + 1 }, ...otherItems];
            }
            return [{ ...product, quantity: 1 }, ...prev];
        });
        setSearchProduct(''); // reset search
    };

    const updateQuantity = (id: string | number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = item.quantity + delta;
                if (newQ > 0 && newQ <= item.stock) {
                    return { ...item, quantity: newQ };
                }
            }
            return item;
        }));
    };

    const removeItem = (id: string | number) => {
        setCart(prev => prev.filter(i => i.id !== id));
    };

    const subtotal = cart.reduce((acc, item) => acc + ((item.base_price || item.price) * item.quantity), 0);
    
    // Calculate Dynamic Custom Discount
    const getCustomerDiscount = () => {
        if (selectedCustomer?.commercial_policy) {
            const pol = selectedCustomer.commercial_policy;
            if (orderType === 'V') return pol.discount_sale_percent || 0;
            if (orderType === 'C') return pol.discount_consignment_percent || 0;
        }
        return selectedCustomer?.discount || 0;
    };
    
    const appliedDiscountPercent = getCustomerDiscount();

    const total = cart.reduce((acc, item) => {
        const hasHorusDiscount = item.promotional_price && item.base_price && item.promotional_price < item.base_price;
        const baseValue = item.base_price || item.price;
        let finalValue = item.price;
        
        if (hasHorusDiscount) {
            finalValue = item.promotional_price!;
        } else if (appliedDiscountPercent > 0) {
            finalValue = baseValue * (1 - appliedDiscountPercent / 100);
        }
        return acc + (finalValue * item.quantity);
    }, 0);

    const discountAmount = subtotal - total;

    const handleSubmit = async () => {
        if (!selectedCustomer) return alert("Selecione um cliente.");
        if (cart.length === 0) return alert("O carrinho está vazio.");

        setIsSubmitting(true);
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            
            const payload = {
                customer_id: selectedCustomer.id,
                items: cart.map(i => {
                    const isHorus = typeof i.id === 'string' && i.id.startsWith('horus-');
                    return {
                        product_id: isHorus ? null : Number(i.id),
                        ean_isbn: i.ean_gtin || i.sku,
                        sku: i.sku,
                        name: i.name,
                        quantity: i.quantity,
                        unit_price: i.price
                    };
                }),
                total_amount: total,
                discount_amount: discountAmount,
                payment_method: "B2B_STANDARD", // Standard
                status: "PROCESSING",
                source: "seller_pdv",
                type_order: orderType,
                installments: installments
            };

            const res = await fetch(`${apiUrl}/orders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Pedido criado com sucesso! ${data.horus_id ? `(Horus: ${data.horus_id})` : ''}`);
                router.push(`/orders/${data.order_id}`);
            } else {
                const err = await res.json();
                alert(`Erro ao criar pedido: ${err.detail || 'Desconhecido'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Falha de conexão.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/orders" className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <ShoppingCart className="w-7 h-7 text-[var(--color-primary-base)]" />
                        Criar Novo Pedido
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Busque um cliente, adicione produtos do B2B e gere vendas internamente.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left Side: Client & Search */}
                <div className="lg:col-span-2 space-y-6">
                    {/* CUSTOMER SELECTOR */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h2 className="font-bold text-slate-800 dark:text-slate-200 mb-4 text-lg">1. Selecione o Cliente</h2>
                        {!selectedCustomer ? (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por nome ou CNPJ..." 
                                    value={searchCustomer}
                                    onChange={e => setSearchCustomer(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl dark:bg-slate-800/50 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                                />
                                {searchCustomer.trim() !== '' && customers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                                        {customers.map(c => (
                                            <button 
                                                key={c.id} 
                                                onClick={() => { setSelectedCustomer(c); setSearchCustomer(''); }}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-800 last:border-0 flex justify-between items-center"
                                            >
                                                <div>
                                                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                                                        {c.name}
                                                        {c.discount && c.discount > 0 ? (
                                                            <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold dark:bg-emerald-500/20 dark:text-emerald-300">-{c.discount}%</span>
                                                        ) : null}
                                                    </span>
                                                    <span className="text-xs text-slate-400 font-mono">{c.document}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            {selectedCustomer.name}
                                            {selectedCustomer.discount && selectedCustomer.discount > 0 ? (
                                                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold dark:bg-emerald-500/20 dark:text-emerald-300">-{selectedCustomer.discount}% fixo</span>
                                            ) : null}
                                        </p>
                                        <p className="text-xs text-slate-500 font-mono mt-0.5">CNPJ: {selectedCustomer.document}</p>
                                    </div>
                                    <button 
                                        onClick={() => { setSelectedCustomer(null); setCart([]); }}
                                        className="text-sm text-red-500 hover:text-red-600 px-3 py-1 bg-red-50 rounded-lg dark:bg-red-500/10"
                                    >
                                        Trocar Cliente
                                    </button>
                                </div>
                            
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mt-4 border border-slate-200 dark:border-slate-700/50">
                                <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wide">Condições do Pedido</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de Operação</label>
                                        <select value={orderType} onChange={e => setOrderType(e.target.value)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none dark:bg-slate-900 dark:border-slate-700">
                                            <option value="V">Venda Direta</option>
                                            <option value="C">Consignação</option>
                                        </select>
                                    </div>
                                    {!selectedCustomer.id_guid && (
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 mb-1">Número de Parcelas</label>
                                            <input type="number" min="1" max="120" value={installments} onChange={e => setInstallments(parseInt(e.target.value)||1)} className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 outline-none dark:bg-slate-900 dark:border-slate-700"/>
                                        </div>
                                    )}
                                </div>
                            </div>
                            </>
                        )}
                    </div>

                    {/* PRODUCT SEARCH */}
                    {selectedCustomer && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
                            <h2 className="font-bold text-slate-800 dark:text-slate-200 mb-4 text-lg">2. Adicionar Produtos</h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por descrição ou código de barras..." 
                                    value={searchProduct}
                                    onChange={e => setSearchProduct(e.target.value)}
                                    className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl dark:bg-slate-800/50 dark:border-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                                />
                                {loadingProducts && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-primary-base)] animate-spin" />}
                                
                                {searchProduct.trim() !== '' && searchResults.length > 0 && !loadingProducts && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 max-h-80 overflow-y-auto">
                                        {searchResults.map(p => {
                                            const hasHorusDiscount = p.promotional_price && p.base_price && p.promotional_price < p.base_price;
                                            
                                            const baseValue = p.base_price || p.price;
                                            let finalValue = p.price;
                                            let discountPercent = 0;

                                            if (hasHorusDiscount) {
                                                finalValue = p.promotional_price!;
                                                discountPercent = Math.round((1 - finalValue / baseValue) * 100);
                                            } else if (appliedDiscountPercent > 0) {
                                                finalValue = baseValue * (1 - appliedDiscountPercent / 100);
                                                discountPercent = appliedDiscountPercent;
                                            }
                                            
                                            const hasDiscount = discountPercent > 0;
                                            return (
                                            <button 
                                                key={p.id} 
                                                onClick={() => addToCart(p)}
                                                disabled={p.stock <= 0}
                                                className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 flex justify-between items-center transition-colors ${p.stock > 0 ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'opacity-50 cursor-not-allowed bg-slate-50/50 dark:bg-slate-900/50'}`}
                                            >
                                                <div className="flex-1 pr-4">
                                                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm block truncate" title={p.name}>{p.name}</span>
                                                    {p.brand && <span className="text-xs text-[var(--color-primary-base)] font-medium block truncate mt-0.5">{p.brand}</span>}
                                                    <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{p.sku || p.ean_gtin}</span>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {hasDiscount ? (
                                                        <>
                                                            <span className="text-[10px] text-slate-400 line-through block">R$ {baseValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm block">R$ {finalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})} <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded ml-1 font-semibold dark:bg-emerald-500/20 dark:text-emerald-300">-{discountPercent}%</span></span>
                                                        </>
                                                    ) : (
                                                        <span className="font-bold text-[var(--color-primary-base)] text-sm block">R$ {finalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                    )}
                                                    <span className={`text-[9px] uppercase font-bold mt-1 block ${p.stock > 0 ? 'text-slate-500' : 'text-red-500'}`}>Estoque: {p.stock}</span>
                                                </div>
                                            </button>
                                        )})}
                                    </div>
                                )}
                            </div>
                            
                            {/* CART GRID */}
                            {cart.length > 0 && (
                                <div className="mt-8 overflow-x-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="text-slate-500 bg-slate-50 dark:bg-slate-800/50">
                                            <tr>
                                                <th className="px-4 py-2 font-medium rounded-l-lg">Produto</th>
                                                <th className="px-4 py-2 font-medium text-right">Unitário</th>
                                                <th className="px-4 py-2 font-medium text-center">Qtd</th>
                                                <th className="px-4 py-2 font-medium text-right">Total</th>
                                                <th className="px-4 py-2 font-medium text-center rounded-r-lg">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {cart.map(item => {
                                                const custDiscount = selectedCustomer?.discount || 0;
                                                const hasHorusDiscount = item.promotional_price && item.base_price && item.promotional_price < item.base_price;
                                                
                                                const baseValue = item.base_price || item.price;
                                                let finalValue = item.price;
                                                let discountPercent = 0;

                                                if (hasHorusDiscount) {
                                                    finalValue = item.promotional_price!;
                                                    discountPercent = Math.round((1 - finalValue / baseValue) * 100);
                                                } else if (custDiscount > 0) {
                                                    finalValue = baseValue * (1 - custDiscount / 100);
                                                    discountPercent = custDiscount;
                                                }
                                                
                                                const hasDiscount = discountPercent > 0;
                                                return (
                                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={item.name}>{item.name}</div>
                                                        {item.brand && <div className="text-xs text-[var(--color-primary-base)] font-medium truncate mt-0.5">{item.brand}</div>}
                                                        <div className="text-xs text-slate-400 font-mono flex gap-2 mt-0.5">
                                                           {item.sku}
                                                           {item.ean_gtin && <span>• {item.ean_gtin}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">
                                                        {hasDiscount ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[10px] text-slate-400 line-through">R$ {baseValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">R$ {finalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm">R$ {finalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button title="Reduzir quantidade" onClick={() => updateQuantity(item.id, -1)} className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 transition-colors">
                                                                <Minus className="w-3 h-3" />
                                                            </button>
                                                            <span className="w-8 text-center font-bold">{item.quantity}</span>
                                                            <button title="Aumentar quantidade" onClick={() => updateQuantity(item.id, 1)} className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 transition-colors">
                                                                <Plus className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                                                        {hasDiscount ? (
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[10px] font-normal text-slate-400 line-through">R$ {(baseValue * item.quantity).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">R$ {(finalValue * item.quantity).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm">R$ {(finalValue * item.quantity).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button title="Remover item do pedido" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-lg transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )})}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Side: Totals & Summary */}
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sticky top-6 shadow-sm">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                        Resumo do Pedido Interno
                    </h3>
                    
                    <div className="space-y-4 text-sm mb-6">
                        <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                            <span>Itens selecionados</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{cart.length} únicos</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                            <span>Total de produtos</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{cart.reduce((a,b)=>a+b.quantity,0)} un.</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                            <span>Subtotal</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">R$ {subtotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                        </div>
                        {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-emerald-600 border-b border-slate-200 dark:border-slate-800 pb-4">
                                <span>Descontos Obtidos</span>
                                <span className="font-bold">- R$ {discountAmount.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-lg font-black pt-2">
                            <span className="text-slate-800 dark:text-slate-200">Total Faturado</span>
                            <span className="text-[var(--color-primary-base)]">R$ {total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!selectedCustomer || cart.length === 0 || isSubmitting}
                        className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> Processando...</>
                        ) : (
                            <><ShoppingCart className="w-5 h-5" /> Confirmar e Enviar</>
                        )}
                    </button>
                    {!selectedCustomer && (
                         <p className="text-center text-xs text-amber-600 mt-3 font-medium">Selecione o Cliente no passo 1.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

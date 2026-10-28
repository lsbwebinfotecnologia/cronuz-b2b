'use client';

import { useEffect, useState } from 'react';
import {
  ShoppingBag,
  Search,
  Ticket,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Truck,
  ShieldCheck,
  ExternalLink,
  Copy,
  Loader2,
  ArrowRight,
  User,
  MapPin,
  CreditCard,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { getImageUrl } from '@/lib/image_helper';

interface B2COpenStorefrontProps {
  hostname: string;
  domainInfo: {
    company_id: number;
    name: string;
    logo?: string | null;
    favicon_url?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    b2c_checkout_mode?: string;
    tray_enabled?: boolean;
  };
}

interface CartItem {
  id: number;
  sku: string;
  ean_gtin: string;
  name: string;
  author: string;
  brand: string;
  unit_price: number;
  quantity: number;
  cover_url?: string;
}

export default function B2COpenStorefront({ hostname, domainInfo }: B2COpenStorefrontProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const companyId = domainInfo.company_id;

  const [storeInfo, setStoreInfo] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('default');
  const [pageSkip, setPageSkip] = useState(0);

  // Selected product for details/synopsis modal
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Cart & Drawer state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'register' | 'success'>('cart');

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [couponCpf, setCouponCpf] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponResult, setCouponResult] = useState<any>(null);

  // Freight state
  const [zipCode, setZipCode] = useState('');
  const [freightOptions, setFreightOptions] = useState<any[]>([]);
  const [selectedFreight, setSelectedFreight] = useState<any>(null);
  const [calculatingFreight, setCalculatingFreight] = useState(false);

  // Customer & LGPD registration state
  const [customerForm, setCustomerForm] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: '',
    password: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    lgpd_accepted: false,
    marketing_opt_in: false,
  });
  const [showLgpdModal, setShowLgpdModal] = useState(false);
  const [lgpdBannerDismissed, setLgpdBannerDismissed] = useState(false);

  // Checkout result
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);

  // Load persisted cart & LGPD banner
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(`cronuz_b2c_cart_${companyId}`);
      if (savedCart) setCart(JSON.parse(savedCart));
      const bannerAck = localStorage.getItem(`cronuz_b2c_lgpd_banner_${companyId}`);
      if (bannerAck) setLgpdBannerDismissed(true);
    } catch {}
  }, [companyId]);

  useEffect(() => {
    try {
      localStorage.setItem(`cronuz_b2c_cart_${companyId}`, JSON.stringify(cart));
    } catch {}
  }, [cart, companyId]);

  // Fetch public store info
  useEffect(() => {
    fetch(`${apiBase}/b2c/public/info?company_id=${companyId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStoreInfo(data);
      })
      .catch(console.error);
  }, [companyId, apiBase]);

  // Fetch catalog from Horus / DB
  const fetchCatalog = async (qStr = searchQuery, filterStr = searchFilter, skipVal = 0) => {
    setLoadingCatalog(true);
    try {
      const params = new URLSearchParams({
        company_id: String(companyId),
        q: qStr,
        filter: filterStr,
        skip: String(skipVal),
        limit: '24',
      });
      const res = await fetch(`${apiBase}/b2c/public/catalog?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setPageSkip(skipVal);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog('', 'default', 0);
  }, [companyId]);

  const resolveProductCover = (prod: any) => {
    if (prod.cover_url) return getImageUrl(prod.cover_url);
    const isbn = prod.ean_gtin || prod.sku;
    if (storeInfo?.cover_image_base_url && isbn) {
      const base = storeInfo.cover_image_base_url.replace(/\/$/, '');
      return `${base}/${isbn}.jpg`;
    }
    return null;
  };

  const formatBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val || 0));

  const subtotal = cart.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);
  const freightValue = selectedFreight ? Number(selectedFreight.price || 0) : 0;
  const totalCart = subtotal + freightValue;

  // Re-validate coupon automatically when cart subtotal or freight changes
  useEffect(() => {
    if (couponResult && couponCode) {
      handleValidateCoupon(true);
    }
  }, [subtotal, freightValue]);

  const addToCart = (prod: any, qty = 1) => {
    const unitPrice = Number(prod.promotional_price || prod.base_price || 0);
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === String(prod.sku));
      if (existing) {
        return prev.map((i) =>
          i.sku === String(prod.sku) ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [
        ...prev,
        {
          id: Number(prod.id || 0),
          sku: String(prod.sku),
          ean_gtin: String(prod.ean_gtin || prod.sku || ''),
          name: prod.name,
          author: prod.author || '',
          brand: prod.brand || '',
          unit_price: unitPrice,
          quantity: qty,
          cover_url: resolveProductCover(prod) || undefined,
        },
      ];
    });
    toast.success(`"${prod.name}" adicionado ao carrinho!`);
  };

  const updateCartQuantity = (sku: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.sku === sku ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (sku: string) => {
    setCart((prev) => prev.filter((i) => i.sku !== sku));
  };

  const handleCalculateFreight = async (cepInput?: string) => {
    const cepDigits = (cepInput ?? zipCode).replace(/\D/g, '');
    if (cepDigits.length < 8) {
      toast.error('Informe um CEP válido com 8 dígitos.');
      return;
    }
    setCalculatingFreight(true);
    try {
      // Auto-fill ViaCEP for registration address
      fetch(`https://viacep.com.br/ws/${cepDigits}/json/`)
        .then((r) => r.json())
        .then((via) => {
          if (via && !via.erro) {
            setCustomerForm((prev) => ({
              ...prev,
              street: via.logradouro || prev.street,
              neighborhood: via.bairro || prev.neighborhood,
              city: via.localidade || prev.city,
              state: via.uf || prev.state,
            }));
          }
        })
        .catch(() => {});

      const res = await fetch(`${apiBase}/b2c/public/freight/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          zip_code: cepDigits,
          subtotal,
          items_count: cart.reduce((acc, i) => acc + i.quantity, 0),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFreightOptions(data.options || []);
        if (data.options?.length > 0) {
          setSelectedFreight(data.options[0]);
        }
      }
    } catch (e) {
      toast.error('Erro ao calcular frete.');
    } finally {
      setCalculatingFreight(false);
    }
  };

  const handleValidateCoupon = async (silent = false) => {
    if (!couponCode.trim()) {
      if (!silent) toast.error('Digite o código do seu cupom.');
      return;
    }
    setValidatingCoupon(true);
    try {
      const effectiveCpf = couponCpf || customerForm.cpf;
      const res = await fetch(`${apiBase}/b2c/public/coupon/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          code: couponCode.trim(),
          customer_cpf: effectiveCpf || null,
          subtotal,
          freight: freightValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponResult(null);
        if (!silent) toast.error(data.detail || 'Cupom inválido.');
        return;
      }
      setCouponResult(data);
      if (couponCpf && !customerForm.cpf) {
        setCustomerForm((prev) => ({ ...prev, cpf: couponCpf }));
      }
      if (!silent) toast.success('Cupom validado e aplicado ao carrinho!');
    } catch (e) {
      if (!silent) toast.error('Erro ao validar cupom.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleFinalizeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.lgpd_accepted) {
      toast.error('Você precisa aceitar o Termo de Privacidade e Consentimento LGPD para continuar.');
      return;
    }
    if (!zipCode || zipCode.replace(/\D/g, '').length < 8) {
      toast.error('Informe o CEP de entrega.');
      return;
    }

    setSubmittingCheckout(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          customer_name: customerForm.name,
          customer_cpf: customerForm.cpf || couponCpf,
          customer_email: customerForm.email,
          customer_phone: customerForm.phone,
          customer_password: customerForm.password || null,
          zip_code: zipCode,
          street: customerForm.street,
          number: customerForm.number,
          complement: customerForm.complement,
          neighborhood: customerForm.neighborhood,
          city: customerForm.city,
          state: customerForm.state,
          items: cart.map((i) => ({
            product_id: i.id > 0 ? i.id : null,
            sku: i.sku,
            ean_gtin: i.ean_gtin,
            name: i.name,
            author: i.author,
            brand: i.brand,
            unit_price: i.unit_price,
            quantity: i.quantity,
          })),
          freight_value: freightValue,
          freight_service_name: selectedFreight?.name || 'Entrega Padrão',
          coupon_code: couponResult ? couponResult.code : couponCode || null,
          lgpd_accepted: customerForm.lgpd_accepted,
          marketing_opt_in: customerForm.marketing_opt_in,
          terms_version: 'v1.0',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível finalizar o pedido.');
      }

      setOrderResult(data);
      setCheckoutStep('success');
      setCart([]);
      localStorage.removeItem(`cronuz_b2c_cart_${companyId}`);
      toast.success(data.message || 'Pedido processado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao finalizar pedido.');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const discountApplied = couponResult ? Number(couponResult.discount_applied || 0) : 0;
  const differenceToPay = Math.max(0, totalCart - discountApplied);
  const remainingCouponBalance = couponResult ? Number(couponResult.remaining_coupon_balance || 0) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Benefit Promo Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-fuchsia-950 to-indigo-950 text-white text-xs py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            <Ticket className="w-3.5 h-3.5 text-fuchsia-400" />
            Possui um <strong>Cupom Corporativo / Vale-Livro</strong> da sua empresa? Aplique no carrinho e, se sobrar saldo, geramos um novo cupom automaticamente!
          </span>
          {storeInfo?.b2c_free_shipping_min_value > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-emerald-300 font-bold">
              <Truck className="w-3.5 h-3.5" />
              Frete Grátis acima de {formatBRL(storeInfo.b2c_free_shipping_min_value)}
            </span>
          )}
        </div>
      </div>

      {/* Main Storefront Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Logo & Seller Name */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {domainInfo.logo || storeInfo?.logo ? (
                <img
                  src={getImageUrl(domainInfo.logo || storeInfo?.logo)}
                  alt={domainInfo.name}
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-fuchsia-600 text-white">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
                    {domainInfo.name}
                  </span>
                </div>
              )}
            </div>

            {/* Mobile Cart Button */}
            <button
              onClick={() => {
                setCheckoutStep('cart');
                setIsCartOpen(true);
              }}
              className="md:hidden relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-fuchsia-600 text-white text-xs font-bold shadow-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{cart.reduce((a, b) => a + b.quantity, 0)}</span>
            </button>
          </div>

          {/* Search Bar with Horus Filter */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchCatalog(searchQuery, searchFilter, 0);
            }}
            className="flex-1 max-w-2xl flex items-center bg-slate-100 rounded-2xl p-1 border border-slate-200 focus-within:border-fuchsia-500 focus-within:bg-white transition-all"
          >
            <select
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 px-2.5 py-2 border-r border-slate-200 focus:outline-none"
            >
              <option value="default">Título / ISBN</option>
              <option value="NOM_AUTOR">Autor</option>
              <option value="NOM_EDITORA">Editora</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar livros por título, autor, ISBN ou editora..."
              className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </form>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => {
                setCheckoutStep('cart');
                setIsCartOpen(true);
              }}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-sm transition-all"
            >
              <ShoppingBag className="w-4 h-4 text-fuchsia-400" />
              <span>Meu Carrinho</span>
              <span className="px-2 py-0.5 rounded-full bg-fuchsia-600 text-white text-xs">
                {cart.reduce((a, b) => a + b.quantity, 0)}
              </span>
              {subtotal > 0 && (
                <span className="text-xs text-slate-300 font-normal">({formatBRL(subtotal)})</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Catalog Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {searchQuery ? `Resultados para "${searchQuery}"` : 'Acervo em Destaque'}
            </h2>
            <p className="text-xs text-slate-500">
              Catálogo sincronizado com informações editoriais completas (Nome, Autor, ISBN, Editora, Categoria e Sinopse).
            </p>
          </div>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                fetchCatalog('', 'default', 0);
              }}
              className="text-xs font-bold text-fuchsia-600 hover:underline self-start sm:self-auto"
            >
              Limpar busca
            </button>
          )}
        </div>

        {loadingCatalog ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200 p-4 h-80 animate-pulse flex flex-col justify-between"
              >
                <div className="bg-slate-100 h-44 rounded-xl" />
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-8 bg-slate-100 rounded-xl mt-2" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">Nenhum livro encontrado</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Tente buscar por outro título, nome do autor, editora ou código ISBN.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {products.map((prod) => {
              const cover = resolveProductCover(prod);
              const price = Number(prod.promotional_price || prod.base_price || 0);
              const hasPromo =
                prod.promotional_price && Number(prod.promotional_price) < Number(prod.base_price);

              return (
                <div
                  key={`${prod.sku}-${prod.id}`}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-fuchsia-300 hover:shadow-md transition-all flex flex-col overflow-hidden group"
                >
                  {/* Cover */}
                  <div
                    onClick={() => setSelectedProduct(prod)}
                    className="relative aspect-[3/4] bg-slate-100 flex items-center justify-center p-4 cursor-pointer overflow-hidden"
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={prod.name}
                        className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-center p-3 text-slate-400">
                        <BookOpen className="w-10 h-10 mx-auto mb-1 opacity-50" />
                        <span className="text-[10px] font-mono block">{prod.ean_gtin || prod.sku}</span>
                      </div>
                    )}

                    {prod.category?.name && (
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-bold backdrop-blur-sm">
                        {prod.category.name}
                      </span>
                    )}
                  </div>

                  {/* Book Metadata */}
                  <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-1">
                      {prod.brand && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-600 truncate">
                          {prod.brand}
                        </p>
                      )}
                      <h3
                        onClick={() => setSelectedProduct(prod)}
                        className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 cursor-pointer hover:text-fuchsia-600"
                      >
                        {prod.name}
                      </h3>
                      {prod.author && (
                        <p className="text-[11px] text-slate-500 truncate">Autor: {prod.author}</p>
                      )}
                      {prod.ean_gtin && (
                        <p className="text-[10px] font-mono text-slate-400">ISBN: {prod.ean_gtin}</p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-2.5">
                      <div>
                        {hasPromo && (
                          <span className="text-[11px] text-slate-400 line-through block">
                            {formatBRL(prod.base_price)}
                          </span>
                        )}
                        <span className="text-base sm:text-lg font-extrabold text-slate-900">
                          {formatBRL(price)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(prod)}
                          className="px-2.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold"
                          title="Ver Sinopse e Detalhes"
                        >
                          Sinopse
                        </button>
                        <button
                          type="button"
                          disabled={prod.allow_purchase === false}
                          onClick={() => addToCart(prod, 1)}
                          className="flex-1 py-2 px-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loadingCatalog && products.length > 0 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            {pageSkip > 0 && (
              <button
                onClick={() => fetchCatalog(searchQuery, searchFilter, Math.max(0, pageSkip - 24))}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold hover:bg-slate-50"
              >
                ← Página Anterior
              </button>
            )}
            {products.length >= 24 && (
              <button
                onClick={() => fetchCatalog(searchQuery, searchFilter, pageSkip + 24)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                Próxima Página →
              </button>
            )}
          </div>
        )}
      </main>

      {/* PRODUCT DETAIL / SYNOPSIS MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase text-fuchsia-600">
                  {selectedProduct.brand || 'Editora'} • {selectedProduct.category?.name || 'Geral'}
                </span>
                <h3 className="text-base sm:text-xl font-bold text-slate-900 mt-0.5">
                  {selectedProduct.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-100 rounded-xl p-4 flex items-center justify-center aspect-[3/4]">
                {resolveProductCover(selectedProduct) ? (
                  <img
                    src={resolveProductCover(selectedProduct)!}
                    alt={selectedProduct.name}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <BookOpen className="w-12 h-12 text-slate-300" />
                )}
              </div>

              <div className="sm:col-span-2 flex flex-col justify-between space-y-4">
                <div className="space-y-2 text-xs sm:text-sm">
                  {selectedProduct.author && (
                    <p>
                      <strong className="text-slate-700">Autor:</strong> {selectedProduct.author}
                    </p>
                  )}
                  <p>
                    <strong className="text-slate-700">ISBN / Código:</strong>{' '}
                    <span className="font-mono">{selectedProduct.ean_gtin || selectedProduct.sku}</span>
                  </p>
                  {selectedProduct.brand && (
                    <p>
                      <strong className="text-slate-700">Editora:</strong> {selectedProduct.brand}
                    </p>
                  )}
                  <div className="pt-2">
                    <strong className="text-slate-700 block mb-1">Sinopse / Descrição:</strong>
                    <p className="text-slate-600 leading-relaxed whitespace-pre-line text-xs max-h-48 overflow-y-auto">
                      {selectedProduct.short_description ||
                        selectedProduct.long_description ||
                        'Sinopse editorial disponível no exemplar.'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block">Preço</span>
                    <span className="text-xl font-extrabold text-slate-900">
                      {formatBRL(selectedProduct.promotional_price || selectedProduct.base_price)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      addToCart(selectedProduct, 1);
                      setSelectedProduct(null);
                      setIsCartOpen(true);
                    }}
                    className="px-5 py-3 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Adicionar ao Carrinho
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE-OVER CART, COUPON ENGINE & CHECKOUT DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-base font-bold">
                  {checkoutStep === 'cart' && 'Seu Carrinho & Cupom Corporativo'}
                  {checkoutStep === 'register' && 'Identificação, Entrega & LGPD'}
                  {checkoutStep === 'success' && 'Pedido Concluído!'}
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STEP 1: CART + FREIGHT + COUPON SIMULATOR */}
            {checkoutStep === 'cart' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
                {cart.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-700">Seu carrinho está vazio</p>
                    <p className="text-xs text-slate-400">
                      Adicione livros do acervo para utilizar seu cupom corporativo ou finalizar sua compra.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Items List */}
                    <div className="space-y-3">
                      {cart.map((item) => (
                        <div
                          key={item.sku}
                          className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 bg-slate-50/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.brand} {item.author ? `• ${item.author}` : ''}
                            </p>
                            <p className="text-xs font-extrabold text-fuchsia-600 mt-0.5">
                              {formatBRL(item.unit_price * item.quantity)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateCartQuantity(item.sku, -1)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                            <button
                              onClick={() => updateCartQuantity(item.sku, 1)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeFromCart(item.sku)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg ml-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Freight Calculator */}
                    <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-slate-600" />
                        1. Calcular Frete e Prazo de Entrega (CEP)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
                          placeholder="00000-000"
                          maxLength={9}
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleCalculateFreight()}
                          disabled={calculatingFreight}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                        >
                          {calculatingFreight ? 'Calculando...' : 'Calcular'}
                        </button>
                      </div>

                      {freightOptions.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {freightOptions.map((opt) => (
                            <label
                              key={opt.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer ${
                                selectedFreight?.id === opt.id
                                  ? 'border-fuchsia-600 bg-fuchsia-50/50 font-bold'
                                  : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="freight_opt"
                                  checked={selectedFreight?.id === opt.id}
                                  onChange={() => setSelectedFreight(opt)}
                                />
                                <span>
                                  {opt.name} ({opt.delivery_days} dias úteis)
                                </span>
                              </div>
                              <span className="font-bold">
                                {opt.price === 0 ? 'GRÁTIS' : formatBRL(opt.price)}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Corporate Coupon / Voucher Section */}
                    <div className="p-4 rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50/40 space-y-3">
                      <label className="text-xs font-bold text-fuchsia-900 flex items-center gap-1.5">
                        <Ticket className="w-4 h-4 text-fuchsia-600" />
                        2. Cupom Corporativo / Vale-Livro
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder="Código do Cupom"
                          className="px-3 py-2 rounded-xl border border-fuchsia-200 bg-white text-xs font-mono uppercase font-bold"
                        />
                        <input
                          type="text"
                          value={couponCpf}
                          onChange={(e) => setCouponCpf(e.target.value)}
                          placeholder="Seu CPF (Obrigatório p/ Lote)"
                          className="px-3 py-2 rounded-xl border border-fuchsia-200 bg-white text-xs font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleValidateCoupon(false)}
                        disabled={validatingCoupon}
                        className="w-full py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold shadow-sm"
                      >
                        {validatingCoupon ? 'Validando Saldo...' : 'Aplicar Cupom no Carrinho'}
                      </button>

                      {couponResult && (
                        <div className="p-3 rounded-xl bg-white border border-fuchsia-200 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between font-bold text-emerald-700">
                            <span>Cupom {couponResult.code} Ativo!</span>
                            <span>Saldo: {formatBRL(couponResult.coupon_balance)}</span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            • Abate Frete: <strong>{couponResult.allows_freight_discount ? 'Sim' : 'Não (Apenas Produtos)'}</strong>
                          </p>
                          {couponResult.fully_covered ? (
                            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                              ✓ Seu pedido está 100% coberto pelo cupom!
                              {remainingCouponBalance > 0 && couponResult.will_generate_residual_coupon && (
                                <span className="block mt-0.5 font-bold">
                                  🎁 Você receberá automaticamente um NOVO CUPOM de {formatBRL(remainingCouponBalance)} com o saldo restante!
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                              Seu cupom abateu <strong>{formatBRL(discountApplied)}</strong>. Diferença restante a pagar:{' '}
                              <strong>{formatBRL(differenceToPay)}</strong>.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Financial Totals */}
                    <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>Subtotal dos Livros:</span>
                        <span>{formatBRL(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Frete ({selectedFreight?.name || 'A calcular'}):</span>
                        <span>{formatBRL(freightValue)}</span>
                      </div>
                      {discountApplied > 0 && (
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Desconto Cupom ({couponResult?.code}):</span>
                          <span>- {formatBRL(discountApplied)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-700 flex justify-between text-sm font-extrabold">
                        <span>Total a Pagar Agora:</span>
                        <span className="text-fuchsia-400">{formatBRL(differenceToPay)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCheckoutStep('register')}
                      className="w-full py-3.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg"
                    >
                      Prosseguir para Cadastro &amp; Finalização
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* STEP 2: CUSTOMER REGISTRATION + MANDATORY LGPD CONSENT */}
            {checkoutStep === 'register' && (
              <form onSubmit={handleFinalizeCheckout} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <button
                  type="button"
                  onClick={() => setCheckoutStep('cart')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900"
                >
                  ← Voltar ao Carrinho
                </button>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Seus Dados Pessoais
                  </h4>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">CPF *</label>
                      <input
                        type="text"
                        required
                        value={customerForm.cpf || couponCpf}
                        onChange={(e) => {
                          setCustomerForm({ ...customerForm, cpf: e.target.value });
                          setCouponCpf(e.target.value);
                        }}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp / Celular *</label>
                      <input
                        type="text"
                        required
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">E-mail *</label>
                    <input
                      type="email"
                      required
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Endereço de Entrega
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">CEP *</label>
                      <input
                        type="text"
                        required
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        onBlur={() => handleCalculateFreight(zipCode)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rua / Logradouro *</label>
                      <input
                        type="text"
                        required
                        value={customerForm.street}
                        onChange={(e) => setCustomerForm({ ...customerForm, street: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Número *</label>
                      <input
                        type="text"
                        required
                        value={customerForm.number}
                        onChange={(e) => setCustomerForm({ ...customerForm, number: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Complemento</label>
                      <input
                        type="text"
                        value={customerForm.complement}
                        onChange={(e) => setCustomerForm({ ...customerForm, complement: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Bairro *</label>
                      <input
                        type="text"
                        required
                        value={customerForm.neighborhood}
                        onChange={(e) => setCustomerForm({ ...customerForm, neighborhood: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Cidade *</label>
                      <input
                        type="text"
                        required
                        value={customerForm.city}
                        onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">UF *</label>
                      <input
                        type="text"
                        required
                        maxLength={2}
                        value={customerForm.state}
                        onChange={(e) =>
                          setCustomerForm({ ...customerForm, state: e.target.value.toUpperCase() })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs uppercase font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* LGPD Mandatory Consent Box */}
                <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-teal-600" />
                      Termo de Privacidade &amp; Proteção de Dados (LGPD)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLgpdModal(!showLgpdModal)}
                      className="text-[11px] font-bold text-teal-700 underline"
                    >
                      {showLgpdModal ? 'Ocultar texto' : 'Ler termo completo'}
                    </button>
                  </div>

                  {showLgpdModal && (
                    <div className="p-2.5 rounded-xl bg-white border border-teal-200 text-[11px] text-slate-600 leading-relaxed">
                      {storeInfo?.b2c_lgpd_terms_text}
                    </div>
                  )}

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={customerForm.lgpd_accepted}
                      onChange={(e) =>
                        setCustomerForm({ ...customerForm, lgpd_accepted: e.target.checked })
                      }
                      className="mt-0.5 rounded text-teal-600"
                    />
                    <span className="text-[11px] text-slate-700 font-medium">
                      Li e concordo com o tratamento dos meus dados pessoais para faturamento, entrega e auditoria do benefício corporativo conforme a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong>. *
                    </span>
                  </label>
                </div>

                {/* Checkout Action Button */}
                <button
                  type="submit"
                  disabled={submittingCheckout}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                >
                  {submittingCheckout ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando seu Pedido...
                    </>
                  ) : differenceToPay <= 0.009 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Concluir Pedido com Cupom (R$ 0,00 a pagar)
                    </>
                  ) : storeInfo?.b2c_checkout_mode === 'TRAY_REDIRECT' && storeInfo?.tray_enabled ? (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Pagar Diferença ({formatBRL(differenceToPay)}) no Checkout Tray
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Finalizar e Pagar Diferença ({formatBRL(differenceToPay)})
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 3: ORDER CONFIRMATION / RESIDUAL COUPON / TRAY REDIRECT */}
            {checkoutStep === 'success' && orderResult && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <span className="text-xs font-bold uppercase text-emerald-600">
                    Pedido #{orderResult.order_id} Registrado
                  </span>
                  <h4 className="text-lg font-extrabold text-slate-900 mt-1">
                    {orderResult.message}
                  </h4>
                </div>

                {/* Residual Coupon Generated Card */}
                {orderResult.residual_coupon_code && (
                  <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-left space-y-2">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      Novo Cupom Gerado com seu Saldo Restante!
                    </div>
                    <p className="text-xs text-amber-800">
                      Como sua compra foi menor que o valor do seu cupom, geramos automaticamente um novo código no valor de{' '}
                      <strong>{formatBRL(orderResult.remaining_coupon_balance)}</strong>:
                    </p>
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-amber-300">
                      <span className="font-mono font-extrabold text-base text-slate-900">
                        {orderResult.residual_coupon_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(orderResult.residual_coupon_code);
                          toast.success('Novo cupom de saldo copiado!');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Cupom
                      </button>
                    </div>
                  </div>
                )}

                {/* Tray Checkout Redirect Card */}
                {orderResult.checkout_mode === 'TRAY_REDIRECT' && orderResult.difference_to_pay > 0 && (
                  <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left space-y-3">
                    <p className="text-xs font-bold text-indigo-950">
                      Integração Transparente Tray E-commerce:
                    </p>
                    <p className="text-xs text-indigo-800">
                      Seu carrinho já foi montado na loja oficial com o abatimento de{' '}
                      <strong>{formatBRL(orderResult.discount_applied)}</strong>. Restam{' '}
                      <strong>{formatBRL(orderResult.difference_to_pay)}</strong> para concluir.
                    </p>
                    {orderResult.tray_coupon_code && (
                      <div className="p-2.5 rounded-xl bg-white border border-indigo-200 flex items-center justify-between text-xs">
                        <span>
                          Cupom sincronizado na Tray: <strong className="font-mono">{orderResult.tray_coupon_code}</strong>
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(orderResult.tray_coupon_code);
                            toast.success('Cupom Tray copiado!');
                          }}
                          className="text-indigo-600 font-bold underline"
                        >
                          Copiar
                        </button>
                      </div>
                    )}
                    {orderResult.tray_cart_url && (
                      <a
                        href={orderResult.tray_cart_url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ir para o Carrinho na Tray e Finalizar Pagamento
                      </a>
                    )}
                  </div>
                )}

                {/* Native Gateway Pix Payment Card */}
                {orderResult.checkout_mode === 'NATIVE_GATEWAY' &&
                  orderResult.difference_to_pay > 0 &&
                  orderResult.pix_code && (
                    <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-left space-y-2.5">
                      <p className="text-xs font-bold text-slate-900">
                        Pagamento da Diferença via PIX ({formatBRL(orderResult.difference_to_pay)}):
                      </p>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-[11px] break-all text-slate-600">
                        {orderResult.pix_code}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(orderResult.pix_code);
                          toast.success('Código PIX Copia e Cola copiado!');
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Código PIX
                      </button>
                    </div>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setIsCartOpen(false);
                    setCheckoutStep('cart');
                    setOrderResult(null);
                  }}
                  className="w-full py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Voltar para a Loja
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LGPD Cookie & Data Protection Bottom Banner */}
      {!lgpdBannerDismissed && (
        <div className="fixed bottom-3 left-3 right-3 z-30 max-w-4xl mx-auto bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs">
            <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
            <p className="text-slate-200 leading-relaxed">
              <strong>Privacidade &amp; LGPD:</strong> Utilizamos cookies essenciais para manter seu carrinho e validar seu benefício corporativo com segurança conforme a Lei nº 13.709/2018 (LGPD).
            </p>
          </div>
          <button
            onClick={() => {
              setLgpdBannerDismissed(true);
              try {
                localStorage.setItem(`cronuz_b2c_lgpd_banner_${companyId}`, '1');
              } catch {}
            }}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold shrink-0"
          >
            Entendi e Aceito
          </button>
        </div>
      )}
    </div>
  );
}

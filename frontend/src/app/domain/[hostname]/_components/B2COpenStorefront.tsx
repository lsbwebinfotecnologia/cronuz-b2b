'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  ArrowLeft,
  MapPin,
  CreditCard,
  Menu,
  Tag,
  Phone,
  Mail,
  Clock,
  Building2,
  MessageSquare,
  ChevronRight,
  Zap,
  Send,
  FolderTree,
  Headset,
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
  base_price?: number;
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
  const [onlyPromoFilter, setOnlyPromoFilter] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string>('');
  const [pageSkip, setPageSkip] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Navigation View: 'catalog' | 'product' | 'contact'
  const [activeView, setActiveView] = useState<'catalog' | 'product' | 'contact'>('catalog');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productDetailQty, setProductDetailQty] = useState<number>(1);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  // Contact page form state
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'Dúvida sobre Produto / Pedido',
    message: '',
  });
  const [sendingContact, setSendingContact] = useState(false);

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
  const fetchCatalog = async (
    qStr = searchQuery,
    filterStr = searchFilter,
    skipVal = 0,
    onlyPromo = onlyPromoFilter
  ) => {
    setLoadingCatalog(true);
    try {
      const params = new URLSearchParams({
        company_id: String(companyId),
        q: qStr,
        filter: filterStr,
        only_promo: String(onlyPromo),
        skip: String(skipVal),
        limit: '24',
      });
      const res = await fetch(`${apiBase}/b2c/public/catalog?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setPageSkip(skipVal);
        setTotalPages(Math.max(1, Number(data.pages || 1)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog('', 'default', 0, false);
  }, [companyId]);

  const resolveProductCover = (prod: any) => {
    if (!prod) return null;
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

  const couponFreeFreightOption = {
    id: 'COUPON_FREE',
    name: 'Frete Grátis',
    price: 0,
    delivery_days: 6,
  };

  const effectiveFreightOptions = useMemo(() => {
    const baseOpts = freightOptions.filter((o) => o.id !== 'COUPON_FREE');
    if (couponResult?.allows_freight_discount) {
      return [couponFreeFreightOption, ...baseOpts];
    }
    return baseOpts;
  }, [freightOptions, couponResult?.allows_freight_discount]);

  const subtotal = cart.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);
  const rawFreightValue = selectedFreight ? Number(selectedFreight.price || 0) : 0;
  const freightValue =
    selectedFreight?.id === 'COUPON_FREE' || couponResult?.allows_freight_discount
      ? 0
      : rawFreightValue;
  const totalCart = subtotal + freightValue;

  // Re-validate coupon automatically when cart subtotal or freight changes
  useEffect(() => {
    if (couponResult && couponCode) {
      handleValidateCoupon(true);
    }
  }, [subtotal, rawFreightValue]);

  const openProductPage = (prod: any) => {
    setSelectedProduct(prod);
    setProductDetailQty(1);
    setActiveView('product');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const addToCart = (prod: any, qty = 1, silentToast = false) => {
    const unitPrice = Number(prod.promotional_price ?? prod.base_price ?? 0);
    const basePrice = Number(prod.base_price ?? unitPrice);
    const itemSku = String(prod.sku || prod.ean_gtin || prod.id || prod.name);
    setCart((prev) => {
      const existing = prev.find((i) => i.sku === itemSku);
      if (existing) {
        return prev.map((i) =>
          i.sku === itemSku
            ? { ...i, unit_price: unitPrice, base_price: basePrice, quantity: i.quantity + qty }
            : i
        );
      }
      return [
        ...prev,
        {
          id: Number(prod.id || 0),
          sku: itemSku,
          ean_gtin: String(prod.ean_gtin || prod.sku || itemSku),
          name: prod.name,
          author: prod.author || '',
          brand: prod.brand || '',
          unit_price: unitPrice,
          base_price: basePrice,
          quantity: qty,
          cover_url: resolveProductCover(prod) || undefined,
        },
      ];
    });
    if (!silentToast) {
      toast.success(`"${prod.name}" adicionado à sacola!`);
    }
  };

  // Single Unified Buy Action ("Comprar")
  const handleBuyNow = (prod: any, qty = 1) => {
    addToCart(prod, qty, true);
    setCheckoutStep('cart');
    setIsCartOpen(true);
    toast.success(`"${prod.name}" adicionado à sacola!`);
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

  const handleSelectCategory = (
    catId: string,
    label: string,
    code: string,
    filterType: string,
    onlyPromo = false
  ) => {
    setSelectedCategoryId(catId);
    setSelectedCategoryLabel(label);
    setSearchQuery(code);
    const targetFilter =
      filterType === 'SEARCH_TERM' || !filterType ? 'default' : filterType;
    setSearchFilter(targetFilter);
    setOnlyPromoFilter(onlyPromo);
    setActiveView('catalog');
    setIsMobileMenuOpen(false);
    fetchCatalog(code, targetFilter, 0, onlyPromo);
  };

  const handleResetToHome = () => {
    setSelectedCategoryId('ALL');
    setSelectedCategoryLabel('');
    setSearchQuery('');
    setSearchFilter('default');
    setOnlyPromoFilter(false);
    setActiveView('catalog');
    setSelectedProduct(null);
    setIsMobileMenuOpen(false);
    fetchCatalog('', 'default', 0, false);
  };

  const handleCalculateFreight = async (cepInput?: string, overrideSubtotal?: number) => {
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

      const effectiveSub =
        overrideSubtotal !== undefined
          ? overrideSubtotal
          : subtotal > 0
          ? subtotal
          : selectedProduct
          ? Number(selectedProduct.promotional_price ?? selectedProduct.base_price ?? 0)
          : 0;

      const res = await fetch(`${apiBase}/b2c/public/freight/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          zip_code: cepDigits,
          subtotal: effectiveSub,
          items_count: Math.max(1, cart.reduce((acc, i) => acc + i.quantity, 0)),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFreightOptions(data.options || []);
        if (couponResult?.allows_freight_discount) {
          setSelectedFreight(couponFreeFreightOption);
        } else if (data.options?.length > 0) {
          setSelectedFreight(data.options[0]);
        }
      }
    } catch {
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
        if (selectedFreight?.id === 'COUPON_FREE') {
          setSelectedFreight(freightOptions[0] || null);
        }
        if (!silent) toast.error(data.detail || 'Cupom inválido.');
        return;
      }
      setCouponResult(data);
      if (data.allows_freight_discount) {
        setSelectedFreight(couponFreeFreightOption);
      }
      if (couponCpf && !customerForm.cpf) {
        setCustomerForm((prev) => ({ ...prev, cpf: couponCpf }));
      }
      if (!silent) toast.success('Cupom validado e aplicado à sacola!');
    } catch {
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

      if (
        data.checkout_mode === 'TRAY_REDIRECT' &&
        Number(data.difference_to_pay || 0) > 0 &&
        data.tray_cart_url
      ) {
        setTimeout(() => {
          window.location.href = data.tray_cart_url;
        }, 1800);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao finalizar pedido.');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleSubmitContactForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      toast.error('Preencha seu nome, e-mail e mensagem.');
      return;
    }
    setSendingContact(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          ...contactForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar mensagem.');
      toast.success(data.message || 'Mensagem enviada com sucesso!');
      setContactForm({
        name: '',
        email: '',
        phone: '',
        subject: 'Dúvida sobre Produto / Pedido',
        message: '',
      });
    } catch (err: any) {
      toast.error(err.message || 'Falha ao enviar mensagem.');
    } finally {
      setSendingContact(false);
    }
  };

  const discountApplied = couponResult ? Number(couponResult.discount_applied || 0) : 0;
  const differenceToPay = Math.max(0, totalCart - discountApplied);
  const remainingCouponBalance = couponResult ? Number(couponResult.remaining_coupon_balance || 0) : 0;

  // Appearance & Branding from Seller Settings
  const appearance = storeInfo?.appearance || (domainInfo as any)?.appearance || {};
  const branding = appearance?.branding || {};
  const primaryColor = branding.primary_color || '#4f46e5';
  const secondaryColor = branding.secondary_color || '#0f172a';
  const effectiveLogo = branding.logo_url || domainInfo.logo || storeInfo?.logo;
  const footerInfo = appearance?.footer_info || {
    legal_name: domainInfo.name,
    cnpj: '',
    address_line: 'Atendimento em todo o território nacional',
    contact_email: '',
    contact_phone: '',
    whatsapp: '',
    business_hours: 'Segunda a Sexta, das 09h às 18h',
    about_text: `Loja oficial ${domainInfo.name}. Catálogo editorial completo com entrega rápida e segura para todo o Brasil.`,
  };

  const activeBanners = Array.isArray(appearance?.banners)
    ? appearance.banners.filter((b: any) => b.active !== false)
    : [];
  const activeShowcases = Array.isArray(appearance?.showcases)
    ? appearance.showcases.filter((s: any) => s.active !== false && Array.isArray(s.items) && s.items.length > 0)
    : [];
  const configuredCategories = Array.isArray(appearance?.categories)
    ? appearance.categories.filter((c: any) => c.active !== false)
    : [];
  const activePromotions = Array.isArray(appearance?.promotions)
    ? appearance.promotions.filter((p: any) => p.active !== false)
    : [];

  // Fallback dynamic categories derived from loaded catalog if Seller hasn't configured custom categories yet
  const effectiveCategories = useMemo(() => {
    if (configuredCategories.length > 0) return configuredCategories;
    const seen = new Set<string>();
    const autoCats: any[] = [];
    for (const p of products) {
      const catName = (p.category?.name || '').trim();
      if (catName && catName.toLowerCase() !== 'geral' && !seen.has(catName.toLowerCase())) {
        seen.add(catName.toLowerCase());
        autoCats.push({
          id: `auto-cat-${catName}`,
          label: catName,
          code: catName,
          filter_type: 'COD_GENERO',
        });
      }
      if (autoCats.length >= 8) break;
    }
    return autoCats;
  }, [configuredCategories, products]);

  // Suggestions for Product Page ("Quem viu também se interessou")
  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    const currentSku = String(selectedProduct.sku || selectedProduct.ean_gtin);
    const pool = [...products];
    for (const sc of activeShowcases) {
      if (Array.isArray(sc.items)) pool.push(...sc.items);
    }
    const uniqueMap = new Map<string, any>();
    for (const item of pool) {
      const k = String(item.sku || item.ean_gtin);
      if (k && k !== currentSku && !uniqueMap.has(k)) {
        uniqueMap.set(k, item);
      }
    }
    const candidates = Array.from(uniqueMap.values());
    const sameCatOrBrand = candidates.filter(
      (c) =>
        (selectedProduct.category?.name &&
          c.category?.name &&
          c.category.name === selectedProduct.category.name) ||
        (selectedProduct.brand && c.brand && c.brand === selectedProduct.brand)
    );
    const others = candidates.filter((c) => !sameCatOrBrand.includes(c));
    return [...sameCatOrBrand, ...others].slice(0, 4);
  }, [selectedProduct, products, activeShowcases]);

  // Cross-sell Suggestions inside Cart Drawer ("Aproveite e leve também")
  const cartSuggestions = useMemo(() => {
    const cartSkus = new Set(cart.map((c) => String(c.sku)));
    const pool = [...products];
    for (const sc of activeShowcases) {
      if (Array.isArray(sc.items)) pool.push(...sc.items);
    }
    const out: any[] = [];
    const seen = new Set<string>();
    for (const p of pool) {
      const k = String(p.sku || p.ean_gtin);
      if (k && !cartSkus.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
      if (out.length >= 4) break;
    }
    return out;
  }, [cart, products, activeShowcases]);

  // Numbered Pagination Computation
  const currentPage = Math.floor(pageSkip / 24) + 1;
  const pageNumbers = useMemo(() => {
    const maxPages = Math.max(totalPages, currentPage);
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(maxPages, start + 4);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [currentPage, totalPages]);

  const handleGoToPage = (pageNum: number) => {
    const nextSkip = Math.max(0, (pageNum - 1) * 24);
    fetchCatalog(searchQuery, searchFilter, nextSkip, onlyPromoFilter);
    const el = document.getElementById('catalogo-principal');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const isHomeView =
    activeView === 'catalog' &&
    !searchQuery.trim() &&
    selectedCategoryId === 'ALL' &&
    !onlyPromoFilter &&
    pageSkip === 0;

  const freeShippingMin = Number(storeInfo?.b2c_free_shipping_min_value || 0);
  const missingForFreeShipping = Math.max(0, freeShippingMin - subtotal);
  const freeShippingProgress =
    freeShippingMin > 0 ? Math.min(100, Math.round((subtotal / freeShippingMin) * 100)) : 0;

  // Reusable Product Card renderer (Mobile First)
  const renderProductCard = (prod: any, keyPrefix: string) => {
    const cover = resolveProductCover(prod);
    const basePrice = Number(prod.base_price || 0);
    const promoPrice =
      prod.promotional_price !== null && prod.promotional_price !== undefined
        ? Number(prod.promotional_price)
        : null;
    const hasPromo = promoPrice !== null && promoPrice > 0 && promoPrice < basePrice;
    const finalPrice = hasPromo ? promoPrice! : basePrice;
    const discountPct =
      prod.discount_percent ||
      (hasPromo && basePrice > 0 ? Math.round(((basePrice - finalPrice) / basePrice) * 100) : 0);

    return (
      <div
        key={`${keyPrefix}-${prod.sku || prod.ean_gtin}-${prod.id || ''}`}
        className="bg-white rounded-2xl border border-slate-200 hover:shadow-lg transition-all flex flex-col overflow-hidden group"
      >
        {/* Cover Clickable to Product Detail Page */}
        <div
          onClick={() => openProductPage(prod)}
          className="relative aspect-[3/4] bg-slate-100 flex items-center justify-center p-3 sm:p-4 cursor-pointer overflow-hidden"
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

          {hasPromo && discountPct > 0 && (
            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] sm:text-[11px] font-extrabold shadow-sm">
              -{discountPct}% OFF
            </span>
          )}

          {prod.category?.name && prod.category.name !== 'Geral' && (
            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-bold backdrop-blur-sm truncate max-w-[65%]">
              {prod.category.name}
            </span>
          )}
        </div>

        {/* Book Metadata */}
        <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-1">
            {prod.brand && (
              <button
                type="button"
                onClick={() =>
                  handleSelectCategory(`brand-${prod.brand}`, prod.brand, prod.brand, 'NOM_EDITORA')
                }
                className="text-[10px] font-bold uppercase tracking-wider truncate block text-left hover:underline cursor-pointer"
                style={{ color: primaryColor }}
              >
                {prod.brand}
              </button>
            )}
            <h3
              onClick={() => openProductPage(prod)}
              className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 cursor-pointer hover:text-indigo-600 transition-colors"
            >
              {prod.name}
            </h3>
            {prod.author && (
              <p className="text-[11px] text-slate-500 truncate">Autor: {prod.author}</p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <div>
              {hasPromo ? (
                <div className="space-y-0.5">
                  <span className="text-[11px] text-slate-400 line-through block">
                    De {formatBRL(basePrice)}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base sm:text-lg font-black text-rose-600">
                      {formatBRL(finalPrice)}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600">no PIX</span>
                  </div>
                </div>
              ) : (
                <span className="text-base sm:text-lg font-extrabold text-slate-900 block">
                  {formatBRL(finalPrice)}
                </span>
              )}
            </div>

            {/* Single Unified "Comprar" Button */}
            <button
              type="button"
              onClick={() => handleBuyNow(prod, 1)}
              style={{ backgroundColor: primaryColor }}
              className="w-full py-2.5 px-3 rounded-xl hover:opacity-95 active:scale-[0.99] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>Comprar</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans"
      style={{ '--b2c-primary': primaryColor, '--b2c-secondary': secondaryColor } as any}
    >
      {/* Top E-commerce Trust Bar */}
      <div className="text-white text-xs py-2 px-3 sm:px-6" style={{ backgroundColor: secondaryColor }}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-200 text-[11px] sm:text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              Compra 100% Segura
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 font-medium text-slate-200">
              <Truck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              Entrega Rápida para todo o Brasil
            </span>
          </div>

          <div className="flex items-center gap-4">
            {freeShippingMin > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-300 font-bold text-[11px] sm:text-xs">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                Frete Grátis acima de {formatBRL(freeShippingMin)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Sticky Header (Mobile First) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Top Row on Mobile: Menu Button + Logo + Cart Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 md:hidden cursor-pointer"
                aria-label="Abrir Menu de Categorias"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleResetToHome}
                className="flex items-center gap-2.5 text-left cursor-pointer"
              >
                {effectiveLogo ? (
                  <img
                    src={getImageUrl(effectiveLogo)}
                    alt={domainInfo.name}
                    className="h-9 sm:h-11 w-auto max-w-[160px] sm:max-w-[190px] object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className="p-2 rounded-xl text-white shadow-sm"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <span className="text-base sm:text-xl font-black tracking-tight text-slate-900 truncate max-w-[180px] sm:max-w-none">
                      {domainInfo.name}
                    </span>
                  </div>
                )}
              </button>
            </div>

            {/* Mobile Cart Button */}
            <button
              onClick={() => {
                setCheckoutStep('cart');
                setIsCartOpen(true);
              }}
              style={{ backgroundColor: primaryColor }}
              className="md:hidden relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-bold shadow-sm cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{cart.reduce((a, b) => a + b.quantity, 0)}</span>
            </button>
          </div>

          {/* Search Bar with Horus Filter */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSelectedCategoryId('SEARCH');
              setSelectedCategoryLabel(searchQuery);
              setActiveView('catalog');
              fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter);
            }}
            className="flex-1 max-w-2xl flex items-center bg-slate-100 rounded-2xl p-1 border border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/10 transition-all"
          >
            <select
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="bg-transparent text-[11px] sm:text-xs font-bold text-slate-700 px-2 sm:px-2.5 py-2 border-r border-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="default">Título / ISBN</option>
              <option value="NOM_AUTOR">Autor</option>
              <option value="NOM_EDITORA">Editora</option>
              <option value="COD_GENERO">Categoria</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, autor, editora ou ISBN..."
              className="flex-1 min-w-0 bg-transparent px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              style={{ backgroundColor: primaryColor }}
              className="px-3.5 sm:px-4 py-2 rounded-xl hover:opacity-95 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Buscar</span>
            </button>
          </form>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActiveView('contact');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Headset className="w-4 h-4" style={{ color: primaryColor }} />
              <span>Fale Conosco</span>
            </button>

            <button
              onClick={() => {
                setCheckoutStep('cart');
                setIsCartOpen(true);
              }}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-white text-sm font-bold shadow-sm transition-all hover:opacity-95 cursor-pointer"
              style={{ backgroundColor: secondaryColor }}
            >
              <ShoppingBag className="w-4 h-4" style={{ color: primaryColor }} />
              <span>Sacola</span>
              <span
                className="px-2 py-0.5 rounded-full text-white text-xs"
                style={{ backgroundColor: primaryColor }}
              >
                {cart.reduce((a, b) => a + b.quantity, 0)}
              </span>
              {subtotal > 0 && (
                <span className="text-xs text-slate-200 font-normal">({formatBRL(subtotal)})</span>
              )}
            </button>
          </div>
        </div>

        {/* Horizontal Category Navigation Bar (Clean — Only Categories and Offers) */}
        {(effectiveCategories.length > 0 || activePromotions.length > 0) && (
          <div className="border-t border-slate-100 bg-slate-50/90">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {activePromotions.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onlyPromoFilter
                      ? handleResetToHome()
                      : handleSelectCategory('PROMO', 'Ofertas e Promoções', '', 'default', true)
                  }
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                    onlyPromoFilter
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  Ofertas ({activePromotions.length})
                </button>
              )}

              {effectiveCategories.map((cat: any) => {
                const isSelected = activeView === 'catalog' && selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      isSelected
                        ? handleResetToHome()
                        : handleSelectCategory(
                            cat.id,
                            cat.label,
                            cat.code,
                            cat.filter_type || 'COD_GENERO',
                            false
                          )
                    }
                    style={
                      isSelected ? { backgroundColor: primaryColor, color: '#ffffff' } : undefined
                    }
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* =======================================================================
          MOBILE CATEGORY & NAVIGATION DRAWER (MOBILE FIRST)
         ======================================================================= */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex">
          <div className="bg-white w-80 max-w-[85vw] h-full flex flex-col shadow-2xl overflow-hidden">
            <div
              className="p-4 text-white flex items-center justify-between"
              style={{ backgroundColor: secondaryColor }}
            >
              <div className="flex items-center gap-2">
                <FolderTree className="w-5 h-5" style={{ color: primaryColor }} />
                <span className="font-bold text-sm">Navegar por Categorias</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleResetToHome}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <span>🏠 Início</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                {activePromotions.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectCategory('PROMO', 'Ofertas e Promoções', '', 'default', true)
                    }
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50/70 hover:bg-rose-100 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Tag className="w-4 h-4" />
                      Ofertas e Promoções
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {effectiveCategories.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Categorias e Editoras
                  </span>
                  {effectiveCategories.map((cat: any) => (
                    <button
                      key={`mob-${cat.id}`}
                      type="button"
                      onClick={() =>
                        handleSelectCategory(
                          cat.id,
                          cat.label,
                          cat.code,
                          cat.filter_type || 'COD_GENERO',
                          false
                        )
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <span>{cat.label}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-1 pt-2 border-t border-slate-100">
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Atendimento ao Cliente
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('contact');
                    setIsMobileMenuOpen(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Headset className="w-4 h-4 text-indigo-600" />
                    Fale Conosco
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
              <p className="font-bold text-slate-700 truncate">{footerInfo.legal_name}</p>
              {footerInfo.cnpj && <p className="font-mono">CNPJ: {footerInfo.cnpj}</p>}
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
        </div>
      )}

      {/* =======================================================================
          VIEW 1: DEDICATED PRODUCT DETAIL PAGE (PÁGINA DE PRODUTO COMPLETA)
         ======================================================================= */}
      {activeView === 'product' && selectedProduct && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-8 pb-24 md:pb-12">
          {/* Breadcrumb & Back Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetToHome}
                className="hover:text-slate-900 font-semibold"
              >
                Início
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              {selectedProduct.category?.name && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectCategory(
                        `cat-${selectedProduct.category.name}`,
                        selectedProduct.category.name,
                        selectedProduct.category.name,
                        'COD_GENERO'
                      )
                    }
                    className="hover:text-slate-900 font-semibold"
                  >
                    {selectedProduct.category.name}
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </>
              )}
              <span className="text-slate-800 font-bold truncate max-w-[220px] sm:max-w-md">
                {selectedProduct.name}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveView('catalog')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para a Loja
            </button>
          </div>

          {/* Product Main Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-8 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            {/* Left Column: High-Res Cover */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-50 rounded-2xl p-6 border border-slate-100 relative min-h-[320px] sm:min-h-[420px]">
              {resolveProductCover(selectedProduct) ? (
                <img
                  src={resolveProductCover(selectedProduct)!}
                  alt={selectedProduct.name}
                  className="max-h-[360px] sm:max-h-[420px] w-auto object-contain drop-shadow-md"
                />
              ) : (
                <div className="text-center text-slate-300 space-y-2">
                  <BookOpen className="w-20 h-20 mx-auto" />
                  <p className="text-xs font-mono text-slate-400">
                    ISBN: {selectedProduct.ean_gtin || selectedProduct.sku}
                  </p>
                </div>
              )}

              {selectedProduct.promotional_price &&
                Number(selectedProduct.promotional_price) < Number(selectedProduct.base_price) && (
                  <span className="absolute top-4 right-4 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black shadow-md">
                    -
                    {selectedProduct.discount_percent ||
                      Math.round(
                        ((Number(selectedProduct.base_price) -
                          Number(selectedProduct.promotional_price)) /
                          Number(selectedProduct.base_price)) *
                          100
                      )}
                    % OFF
                  </span>
                )}
            </div>

            {/* Right Column: Pricing, Direct Buy, Freight & Specs */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedProduct.brand && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectCategory(
                          `brand-${selectedProduct.brand}`,
                          selectedProduct.brand,
                          selectedProduct.brand,
                          'NOM_EDITORA'
                        )
                      }
                      style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                      className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider hover:opacity-80"
                    >
                      Editora: {selectedProduct.brand}
                    </button>
                  )}
                  {selectedProduct.category?.name && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectCategory(
                          `cat-${selectedProduct.category.name}`,
                          selectedProduct.category.name,
                          selectedProduct.category.name,
                          'COD_GENERO'
                        )
                      }
                      className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                    >
                      {selectedProduct.category.name}
                    </button>
                  )}
                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                    ✓ Em Estoque
                  </span>
                </div>

                <h1 className="text-xl sm:text-3xl font-black text-slate-900 leading-tight">
                  {selectedProduct.name}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600">
                  {selectedProduct.author && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectCategory(
                          `author-${selectedProduct.author}`,
                          selectedProduct.author,
                          selectedProduct.author,
                          'NOM_AUTOR'
                        )
                      }
                      className="hover:underline"
                    >
                      Autor(a): <strong className="text-slate-900">{selectedProduct.author}</strong>
                    </button>
                  )}
                  <span className="font-mono text-xs text-slate-400">
                    ISBN/EAN: {selectedProduct.ean_gtin || selectedProduct.sku}
                  </span>
                </div>
              </div>

              {/* Price Box (De / Por + Promotion Validity) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                {selectedProduct.promotional_price &&
                Number(selectedProduct.promotional_price) < Number(selectedProduct.base_price) ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm text-slate-400 line-through">
                        De: {formatBRL(selectedProduct.base_price)}
                      </span>
                      {selectedProduct.promotion_name && (
                        <span className="px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[11px] font-bold">
                          🔥 {selectedProduct.promotion_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl sm:text-4xl font-black text-rose-600">
                        Por: {formatBRL(selectedProduct.promotional_price)}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">
                        (Economize{' '}
                        {formatBRL(
                          Number(selectedProduct.base_price) -
                            Number(selectedProduct.promotional_price)
                        )}
                        )
                      </span>
                    </div>
                    {selectedProduct.promotion_valid_until && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        Oferta válida até {selectedProduct.promotion_valid_until}
                      </p>
                    )}
                  </>
                ) : (
                  <div>
                    <span className="text-xs text-slate-500 block">Preço de Capa / Loja</span>
                    <span className="text-2xl sm:text-4xl font-black text-slate-900">
                      {formatBRL(selectedProduct.base_price)}
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity + Single "Comprar" Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center justify-between sm:justify-start border border-slate-200 rounded-2xl bg-slate-50 px-3 py-2">
                  <span className="text-xs font-bold text-slate-500 mr-3 sm:hidden">
                    Quantidade:
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setProductDetailQty((q) => Math.max(1, q - 1))}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-black text-sm">{productDetailQty}</span>
                    <button
                      type="button"
                      onClick={() => setProductDetailQty((q) => q + 1)}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleBuyNow(selectedProduct, productDetailQty)}
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 py-3.5 px-6 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Comprar
                </button>
              </div>

              {/* Inline CEP Freight Simulator on Product Page */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" style={{ color: primaryColor }} />
                  Calcular Frete e Prazo de Entrega
                </label>
                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="Digite seu CEP (00000-000)"
                    maxLength={9}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleCalculateFreight(
                        zipCode,
                        Number(
                          selectedProduct.promotional_price ?? selectedProduct.base_price ?? 0
                        ) * productDetailQty
                      )
                    }
                    disabled={calculatingFreight}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                  >
                    {calculatingFreight ? 'Calculando...' : 'Calcular'}
                  </button>
                </div>
                {freightOptions.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {freightOptions.map((opt) => (
                      <div
                        key={opt.id}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <span>
                          <strong>{opt.name}</strong> ({opt.delivery_days} dias úteis)
                        </span>
                        <span className="font-extrabold text-emerald-700">
                          {opt.price === 0 ? 'GRÁTIS' : formatBRL(opt.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Synopsis & Technical Specs (Ficha Técnica) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-3">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                Sinopse e Descrição da Obra
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {selectedProduct.long_description ||
                  selectedProduct.short_description ||
                  `Exemplar oficial de "${selectedProduct.name}" (${
                    selectedProduct.brand || domainInfo.name
                  }). Produto novo, original e enviado com nota fiscal para todo o Brasil.`}
              </p>
            </div>

            <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 space-y-3">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">Ficha Técnica</h2>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2 flex justify-between gap-2">
                  <span className="text-slate-500">ISBN / Código de Barras</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedProduct.ean_gtin || selectedProduct.sku}
                  </span>
                </div>
                <div className="py-2 flex justify-between gap-2">
                  <span className="text-slate-500">SKU Interno</span>
                  <span className="font-mono text-slate-800">{selectedProduct.sku}</span>
                </div>
                {selectedProduct.author && (
                  <div className="py-2 flex justify-between gap-2">
                    <span className="text-slate-500">Autor(a)</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedProduct.author}
                    </span>
                  </div>
                )}
                {selectedProduct.brand && (
                  <div className="py-2 flex justify-between gap-2">
                    <span className="text-slate-500">Editora / Selo</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedProduct.brand}
                    </span>
                  </div>
                )}
                {selectedProduct.category?.name && (
                  <div className="py-2 flex justify-between gap-2">
                    <span className="text-slate-500">Categoria</span>
                    <span className="font-semibold text-slate-900 text-right">
                      {selectedProduct.category.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Recommendations ("Quem viu este livro também se interessou por") */}
          {relatedProducts.length > 0 && (
            <section className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: primaryColor }}
                  >
                    Sugestões para Você
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                    Quem viu este livro também comprou
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
                {relatedProducts.map((rel) => renderProductCard(rel, 'related'))}
              </div>
            </section>
          )}

          {/* Mobile Sticky Bottom Buy Bar on Product Page */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 p-3 shadow-2xl flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] text-slate-400 block">Valor unitário</span>
              <span className="text-base font-black text-slate-900">
                {formatBRL(selectedProduct.promotional_price ?? selectedProduct.base_price)}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <button
                type="button"
                onClick={() => handleBuyNow(selectedProduct, productDetailQty)}
                style={{ backgroundColor: primaryColor }}
                className="flex-1 max-w-[190px] py-2.5 px-4 rounded-xl text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                Comprar
              </button>
            </div>
          </div>
        </main>
      )}

      {/* =======================================================================
          VIEW 2: DEDICATED CONTACT PAGE (FALE CONOSCO)
         ======================================================================= */}
      {activeView === 'contact' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: primaryColor }}
              >
                Central de Atendimento ao Cliente
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5">
                Fale Conosco
              </h1>
            </div>
            <button
              type="button"
              onClick={handleResetToHome}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar às Compras
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Left: Company Legal Info, Address, CNPJ, WhatsApp */}
            <div className="md:col-span-5 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5" style={{ color: primaryColor }} />
                  Dados Institucionais
                </h2>

                <div className="space-y-3 text-xs text-slate-600">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Razão Social / Loja
                    </span>
                    <p className="font-bold text-slate-900 text-sm">
                      {footerInfo.legal_name || domainInfo.name}
                    </p>
                  </div>

                  {footerInfo.cnpj && (
                    <div>
                      <span className="text-[11px] font-bold uppercase text-slate-400 block">
                        CNPJ
                      </span>
                      <p className="font-mono font-bold text-slate-900">{footerInfo.cnpj}</p>
                    </div>
                  )}

                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Endereço Físico
                    </span>
                    <p className="text-slate-700 leading-relaxed flex items-start gap-1.5 mt-0.5">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>{footerInfo.address_line}</span>
                    </p>
                  </div>

                  {footerInfo.whatsapp && (
                    <div>
                      <span className="text-[11px] font-bold uppercase text-slate-400 block">
                        WhatsApp de Atendimento
                      </span>
                      <a
                        href={`https://wa.me/55${footerInfo.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mt-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        Chamar no WhatsApp ({footerInfo.whatsapp})
                      </a>
                    </div>
                  )}

                  {footerInfo.contact_phone && (
                    <div>
                      <span className="text-[11px] font-bold uppercase text-slate-400 block">
                        Telefone / SAC
                      </span>
                      <p className="font-bold text-slate-800">{footerInfo.contact_phone}</p>
                    </div>
                  )}

                  {footerInfo.contact_email && (
                    <div>
                      <span className="text-[11px] font-bold uppercase text-slate-400 block">
                        E-mail de Atendimento
                      </span>
                      <a
                        href={`mailto:${footerInfo.contact_email}`}
                        className="font-bold text-indigo-600 hover:underline"
                      >
                        {footerInfo.contact_email}
                      </a>
                    </div>
                  )}

                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      Horário de Atendimento
                    </span>
                    <p className="text-slate-700 flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {footerInfo.business_hours}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Contact Form */}
            <div className="md:col-span-7">
              <form
                onSubmit={handleSubmitContactForm}
                className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-sm"
              >
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Envie uma Mensagem para Nossa Equipe
                  </h2>
                  <p className="text-xs text-slate-500">
                    Dúvidas sobre pedidos, entregas, prazos ou catálogo? Preencha abaixo e responderemos rapidamente.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Seu Nome *
                    </label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="Nome completo"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Seu E-mail *
                    </label>
                    <input
                      type="email"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="seu@email.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      WhatsApp / Telefone
                    </label>
                    <input
                      type="text"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Assunto</label>
                    <select
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                    >
                      <option value="Dúvida sobre Produto / Pedido">
                        Dúvida sobre Produto / Pedido
                      </option>
                      <option value="Prazo de Entrega e Rastreio">
                        Prazo de Entrega e Rastreio
                      </option>
                      <option value="Trocas e Devoluções">Trocas e Devoluções</option>
                      <option value="Outros Assuntos">Outros Assuntos</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mensagem *</label>
                  <textarea
                    rows={4}
                    required
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    placeholder="Escreva como podemos ajudar você..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sendingContact}
                  style={{ backgroundColor: primaryColor }}
                  className="px-6 py-3 rounded-xl text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm hover:opacity-95"
                >
                  {sendingContact ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Enviar Mensagem
                </button>
              </form>
            </div>
          </div>
        </main>
      )}

      {/* =======================================================================
          VIEW 3: MAIN CATALOG & HOME SHOWCASES
         ======================================================================= */}
      {activeView === 'catalog' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 space-y-8">
          {/* CLEAN MODERN E-COMMERCE HERO BANNER */}
          {isHomeView && (
            <div
              className="relative rounded-3xl overflow-hidden text-white p-6 sm:p-12 shadow-md"
              style={{
                backgroundColor: secondaryColor,
                backgroundImage: branding.hero_banner_url
                  ? `linear-gradient(to right, rgba(15,23,42,0.92), rgba(15,23,42,0.45)), url(${getImageUrl(branding.hero_banner_url)})`
                  : `linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="max-w-2xl space-y-4">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {(branding.hero_badge_text &&
                  !branding.hero_badge_text.toLowerCase().includes('benefício corporativo')
                    ? branding.hero_badge_text
                    : 'Lançamentos e Destaques'
                  ).replace(/\s*&\s*/g, ' e ')}
                </span>

                <h1 className="text-2xl sm:text-4xl font-black leading-tight tracking-tight">
                  {(branding.hero_title || `Bem-vindo à ${domainInfo.name}`).replace(/\s*&\s*/g, ' e ')}
                </h1>

                <p className="text-xs sm:text-base text-slate-200 max-w-xl leading-relaxed">
                  {branding.hero_subtitle &&
                  !branding.hero_subtitle.toLowerCase().includes('voucher corporativo')
                    ? branding.hero_subtitle
                    : 'Explore nosso catálogo completo de obras, lançamentos e mais vendidos com envio rápido para todo o Brasil.'}
                </p>

                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <a
                    href="#catalogo-principal"
                    style={{ backgroundColor: primaryColor }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-sm hover:opacity-95 transition-all cursor-pointer"
                  >
                    Explorar Catálogo
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* SECONDARY / PROMOTIONAL BANNERS */}
          {isHomeView && activeBanners.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeBanners.map((bn: any) => (
                <div
                  key={bn.id}
                  onClick={() => {
                    if (bn.filter_query) {
                      handleSelectCategory('BANNER', bn.title, bn.filter_query, 'default');
                    }
                  }}
                  style={{
                    backgroundColor: secondaryColor,
                    backgroundImage: bn.image_url
                      ? `linear-gradient(to right, rgba(15,23,42,0.85), rgba(15,23,42,0.35)), url(${getImageUrl(bn.image_url)})`
                      : `linear-gradient(120deg, ${secondaryColor}, ${primaryColor})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  className={`rounded-2xl p-6 text-white flex flex-col justify-between min-h-[160px] shadow-sm ${
                    bn.filter_query ? 'cursor-pointer hover:scale-[1.01] transition-transform' : ''
                  }`}
                >
                  <div className="space-y-1.5 max-w-md">
                    {bn.badge_text && (
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {bn.badge_text}
                      </span>
                    )}
                    <h3 className="text-lg sm:text-xl font-extrabold">{bn.title}</h3>
                    {bn.subtitle && <p className="text-xs text-slate-200">{bn.subtitle}</p>}
                  </div>
                  {bn.filter_query && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 mt-3">
                      {bn.button_text || 'Explorar Seleção'} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* HOME VITRINES E DESTAQUES CONFIGURED BY SELLER */}
          {isHomeView &&
            activeShowcases.map((sc: any) => (
              <section key={sc.id} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    {sc.badge && (
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white mb-1"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {String(sc.badge).replace(/\s*&\s*/g, ' e ')}
                      </span>
                    )}
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                      {String(sc.title || '').replace(/\s*&\s*/g, ' e ')}
                    </h2>
                    {sc.subtitle && <p className="text-xs text-slate-500">{sc.subtitle}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                  {sc.items.map((prod: any) => renderProductCard(prod, `sc-${sc.id}`))}
                </div>
              </section>
            ))}

          {/* Catalog Section Header */}
          <div
            id="catalogo-principal"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2"
          >
            <div>
              <h2 className="text-base sm:text-xl font-extrabold text-slate-900">
                {onlyPromoFilter
                  ? '🔥 Ofertas e Preços Promocionais'
                  : selectedCategoryLabel
                  ? `Categoria: ${selectedCategoryLabel}`
                  : searchQuery
                  ? `Resultados para "${searchQuery}"`
                  : 'Catálogo Completo de Livros'}
              </h2>
              <p className="text-xs text-slate-500">
                Clique na capa para ver os detalhes da obra ou em Comprar para compra rápida.
              </p>
            </div>
            {(searchQuery || onlyPromoFilter || selectedCategoryId !== 'ALL') && (
              <button
                onClick={handleResetToHome}
                style={{ color: primaryColor }}
                className="text-xs font-bold hover:underline self-start sm:self-auto cursor-pointer"
              >
                Limpar filtro / Voltar ao Início
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
              <button
                type="button"
                onClick={handleResetToHome}
                style={{ backgroundColor: primaryColor }}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer"
              >
                Ver Todos os Livros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {products.map((prod) => renderProductCard(prod, 'cat'))}
            </div>
          )}

          {/* NUMBERED PAGINATION (1, 2, 3, 4, 5...) */}
          {!loadingCatalog && products.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-6">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => handleGoToPage(currentPage - 1)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                « Anterior
              </button>

              {pageNumbers[0] > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleGoToPage(1)}
                    className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    1
                  </button>
                  {pageNumbers[0] > 2 && <span className="text-xs text-slate-400 px-1">...</span>}
                </>
              )}

              {pageNumbers.map((pNum) => {
                const isCurrent = pNum === currentPage;
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => handleGoToPage(pNum)}
                    style={
                      isCurrent ? { backgroundColor: primaryColor, color: '#ffffff' } : undefined
                    }
                    className={`w-9 h-9 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                      isCurrent
                        ? 'shadow-sm scale-105'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {pNum}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={products.length < 24 && currentPage >= totalPages}
                onClick={() => handleGoToPage(currentPage + 1)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                Próxima »
              </button>
            </div>
          )}
        </main>
      )}

      {/* =======================================================================
          COMPLETE E-COMMERCE FOOTER WITH MANDATORY CNPJ, ADDRESS & CONTACT PAGE
         ======================================================================= */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 mt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
          {/* Col 1: Logo & About */}
          <div className="space-y-3">
            {effectiveLogo ? (
              <div className="bg-white inline-block p-2 rounded-xl">
                <img
                  src={getImageUrl(effectiveLogo)}
                  alt={domainInfo.name}
                  className="h-8 w-auto object-contain"
                />
              </div>
            ) : (
              <span className="font-black text-white text-base block">{domainInfo.name}</span>
            )}
            <p className="text-slate-400 leading-relaxed text-xs">
              {footerInfo.about_text ||
                `Loja virtual oficial ${domainInfo.name}. Acervo completo com envio rápido e seguro para todo o Brasil.`}
            </p>
          </div>

          {/* Col 2: Categorias e Navegação */}
          <div className="space-y-2.5">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">
              Departamentos
            </h4>
            <ul className="space-y-1.5">
              {effectiveCategories.slice(0, 5).map((cat: any) => (
                <li key={`ft-${cat.id}`}>
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectCategory(
                        cat.id,
                        cat.label,
                        cat.code,
                        cat.filter_type || 'COD_GENERO'
                      )
                    }
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    {cat.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('contact');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Fale Conosco
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Atendimento (SAC) */}
          <div className="space-y-2.5">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">
              Atendimento (SAC)
            </h4>
            <div className="space-y-1.5 text-slate-400">
              {footerInfo.whatsapp && (
                <p className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>WhatsApp: {footerInfo.whatsapp}</span>
                </p>
              )}
              {footerInfo.contact_phone && (
                <p className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Tel: {footerInfo.contact_phone}</span>
                </p>
              )}
              {footerInfo.contact_email && (
                <p className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{footerInfo.contact_email}</span>
                </p>
              )}
              <p className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{footerInfo.business_hours || 'Segunda a Sexta, das 09h às 18h'}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveView('contact');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] cursor-pointer"
              >
                <Headset className="w-3.5 h-3.5" />
                Fale Conosco
              </button>
            </div>
          </div>

          {/* Col 4: Endereço e Segurança */}
          <div className="space-y-2.5">
            <h4 className="text-white font-bold uppercase tracking-wider text-xs">
              Endereço e Segurança
            </h4>
            <p className="text-slate-400 leading-relaxed flex items-start gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{footerInfo.address_line}</span>
            </p>
            <div className="pt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-emerald-400 text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Ambiente Seguro SSL e LGPD
              </span>
            </div>
          </div>
        </div>

        {/* Mandatory E-commerce Legal Bottom Bar (CNPJ + Razão Social + Endereço) */}
        <div className="border-t border-slate-800 bg-slate-950 py-4 px-4 sm:px-6 text-[11px] text-slate-400">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-center md:text-left">
            <p>
              <strong>{footerInfo.legal_name || domainInfo.name}</strong>
              {footerInfo.cnpj ? ` • CNPJ: ${footerInfo.cnpj}` : ''} • {footerInfo.address_line}
            </p>
            <p className="text-slate-500 shrink-0">
              © {new Date().getFullYear()} {domainInfo.name}. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* =======================================================================
          SLIDE-OVER CART, CROSS-SELL SUGGESTIONS, COUPON & CHECKOUT DRAWER
         ======================================================================= */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div
              className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between text-white"
              style={{ backgroundColor: secondaryColor }}
            >
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5" style={{ color: primaryColor }} />
                <h3 className="text-base font-bold">
                  {checkoutStep === 'cart' && 'Minha Sacola'}
                  {checkoutStep === 'register' && 'Identificação e Entrega'}
                  {checkoutStep === 'success' && 'Pedido Concluído!'}
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Free Shipping Progress Bar inside Drawer */}
            {checkoutStep === 'cart' && freeShippingMin > 0 && cart.length > 0 && (
              <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100 text-xs">
                {missingForFreeShipping > 0 ? (
                  <p className="text-emerald-900 font-medium">
                    Faltam <strong>{formatBRL(missingForFreeShipping)}</strong> para você ganhar{' '}
                    <strong className="text-emerald-700">Frete Grátis!</strong>
                  </p>
                ) : (
                  <p className="text-emerald-800 font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Parabéns! Você ganhou Frete Grátis nesta compra!
                  </p>
                )}
                <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* STEP 1: CART + CROSS-SELL SUGGESTIONS + FREIGHT + COUPON */}
            {checkoutStep === 'cart' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
                {cart.length === 0 ? (
                  <div className="text-center py-12 space-y-4">
                    <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-700">Sua sacola está vazia</p>
                    <p className="text-xs text-slate-400">
                      Explore nosso catálogo ou confira nossas sugestões abaixo:
                    </p>
                    {cartSuggestions.length > 0 && (
                      <div className="pt-4 text-left space-y-2">
                        <span className="text-xs font-bold text-slate-700 block">
                          Sugestões para você começar:
                        </span>
                        {cartSuggestions.slice(0, 3).map((sug) => (
                          <div
                            key={`empty-sug-${sug.sku}`}
                            className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{sug.name}</p>
                              <p className="text-xs font-extrabold" style={{ color: primaryColor }}>
                                {formatBRL(sug.promotional_price ?? sug.base_price)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => addToCart(sug, 1)}
                              style={{ backgroundColor: primaryColor }}
                              className="px-3 py-1.5 rounded-lg text-white text-xs font-bold shrink-0"
                            >
                              + Levar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                            <p
                              className="text-xs font-extrabold mt-0.5"
                              style={{ color: primaryColor }}
                            >
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

                    {/* Smart Cross-Sell Suggestions inside Cart ("Aproveite e leve também") */}
                    {cartSuggestions.length > 0 && (
                      <div className="p-3.5 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-2.5">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                          Aproveite e leve também:
                        </span>
                        <div className="space-y-2">
                          {cartSuggestions.slice(0, 2).map((sug) => (
                            <div
                              key={`cart-sug-${sug.sku || sug.ean_gtin}`}
                              className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-900 truncate">
                                  {sug.name}
                                </p>
                                <p className="text-[11px] font-extrabold text-emerald-700">
                                  {formatBRL(sug.promotional_price ?? sug.base_price)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => addToCart(sug, 1)}
                                style={{ backgroundColor: primaryColor }}
                                className="px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold shrink-0"
                              >
                                + Adicionar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Freight Calculator */}
                    <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-slate-600" />
                        Entrega e Prazo (CEP)
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

                      {effectiveFreightOptions.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {effectiveFreightOptions.map((opt) => {
                            const isChecked =
                              selectedFreight?.id === opt.id ||
                              (!selectedFreight && opt.id === 'COUPON_FREE');
                            return (
                              <label
                                key={opt.id}
                                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer ${
                                  isChecked
                                    ? opt.id === 'COUPON_FREE'
                                      ? 'border-emerald-600 bg-emerald-50/70 font-bold text-emerald-950'
                                      : 'border-indigo-600 bg-indigo-50/50 font-bold'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="freight_opt"
                                    checked={isChecked}
                                    onChange={() => setSelectedFreight(opt)}
                                  />
                                  <span>
                                    {opt.name} ({opt.delivery_days} dias úteis)
                                  </span>
                                </div>
                                <span
                                  className={`font-bold ${
                                    opt.price === 0 ? 'text-emerald-600' : ''
                                  }`}
                                >
                                  {opt.price === 0 ? 'GRÁTIS' : formatBRL(opt.price)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Clean Standard E-commerce Coupon Section */}
                    <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-2.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Ticket className="w-4 h-4" style={{ color: primaryColor }} />
                        Cupom de Desconto
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          placeholder="Digite seu cupom..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono uppercase font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => handleValidateCoupon(false)}
                          disabled={validatingCoupon}
                          style={{ backgroundColor: primaryColor }}
                          className="px-4 py-2 rounded-xl hover:opacity-95 text-white text-xs font-bold shadow-sm shrink-0"
                        >
                          {validatingCoupon ? '...' : 'Aplicar'}
                        </button>
                      </div>

                      {couponCode.trim().length > 0 && (
                        <div>
                          <input
                            type="text"
                            value={couponCpf}
                            onChange={(e) => setCouponCpf(e.target.value)}
                            placeholder="CPF (se o cupom for vinculado ao seu CPF)"
                            className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-mono text-slate-600"
                          />
                        </div>
                      )}

                      {couponResult && (
                        <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1 text-xs">
                          <div className="flex items-center justify-between font-bold text-emerald-700">
                            <span>Cupom {couponResult.code} aplicado!</span>
                            <span>- {formatBRL(discountApplied)}</span>
                          </div>
                          {couponResult.fully_covered ? (
                            <p className="text-[11px] text-emerald-700 font-medium">
                              ✓ Pedido 100% coberto pelo desconto.
                              {remainingCouponBalance > 0 && couponResult.will_generate_residual_coupon && (
                                <span className="block mt-0.5 font-bold">
                                  Ao concluir, um novo cupom de {formatBRL(remainingCouponBalance)} será gerado para o saldo restante.
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-600">
                              Desconto de <strong>{formatBRL(discountApplied)}</strong> aplicado. Valor restante:{' '}
                              <strong>{formatBRL(differenceToPay)}</strong>.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Financial Totals */}
                    <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>Subtotal:</span>
                        <span>{formatBRL(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>
                          Frete ({selectedFreight?.name || (couponResult?.allows_freight_discount ? 'Frete Grátis' : 'A calcular')}):
                        </span>
                        <span className={freightValue === 0 && (selectedFreight || couponResult?.allows_freight_discount) ? 'text-emerald-400 font-bold' : ''}>
                          {freightValue === 0 && (selectedFreight || couponResult?.allows_freight_discount) ? 'GRÁTIS' : formatBRL(freightValue)}
                        </span>
                      </div>
                      {discountApplied > 0 && (
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Desconto ({couponResult?.code}):</span>
                          <span>- {formatBRL(discountApplied)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-700 flex justify-between text-sm font-extrabold">
                        <span>Total a Pagar:</span>
                        <span className="text-emerald-400">{formatBRL(differenceToPay)}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setCheckoutStep('register')}
                        style={{ backgroundColor: primaryColor }}
                        className="w-full py-3.5 rounded-2xl hover:opacity-95 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                      >
                        Finalizar Compra
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCartOpen(false)}
                        className="w-full py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Continuar Comprando
                      </button>
                    </div>
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
                  ← Revisar Sacola ({cart.reduce((a, b) => a + b.quantity, 0)} itens • {formatBRL(subtotal)})
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
                        placeholder="00000-000"
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
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Privacidade e Proteção de Dados (LGPD)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLgpdModal(!showLgpdModal)}
                      className="text-[11px] font-bold text-slate-600 underline"
                    >
                      {showLgpdModal ? 'Ocultar termo' : 'Ver termo'}
                    </button>
                  </div>

                  {showLgpdModal && (
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
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
                      className="mt-0.5 rounded text-emerald-600"
                    />
                    <span className="text-[11px] text-slate-600 font-medium">
                      Concordo com o processamento dos meus dados para faturamento e entrega do pedido conforme a{' '}
                      <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong>. *
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
                      Concluir Pedido (R$ 0,00)
                    </>
                  ) : storeInfo?.b2c_checkout_mode === 'TRAY_REDIRECT' && storeInfo?.tray_enabled ? (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Ir para Pagamento ({formatBRL(differenceToPay)})
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Finalizar Pedido ({formatBRL(differenceToPay)})
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
                      Geramos automaticamente um novo cupom no valor de{' '}
                      <strong>{formatBRL(orderResult.remaining_coupon_balance)}</strong> para sua próxima compra:
                    </p>
                    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-amber-300">
                      <span className="font-mono font-extrabold text-base text-slate-900">
                        {orderResult.residual_coupon_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(orderResult.residual_coupon_code);
                          toast.success('Cupom copiado!');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </button>
                    </div>
                  </div>
                )}

                {/* Tray Checkout Redirect Card */}
                {orderResult.checkout_mode === 'TRAY_REDIRECT' && orderResult.difference_to_pay > 0 && (
                  <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left space-y-3">
                    <p className="text-xs font-bold text-indigo-950">Concluir Pagamento:</p>
                    <p className="text-xs text-indigo-800">
                      Seu carrinho foi preparado com o desconto de{' '}
                      <strong>{formatBRL(orderResult.discount_applied)}</strong>. Restam{' '}
                      <strong>{formatBRL(orderResult.difference_to_pay)}</strong> para finalizar.
                    </p>
                    {orderResult.tray_coupon_code && (
                      <div className="p-2.5 rounded-xl bg-white border border-indigo-200 flex items-center justify-between text-xs">
                        <span>
                          Cupom: <strong className="font-mono">{orderResult.tray_coupon_code}</strong>
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(orderResult.tray_coupon_code);
                            toast.success('Cupom copiado!');
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
                        Ir para Pagamento Seguro
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
                        Pagamento via PIX ({formatBRL(orderResult.difference_to_pay)}):
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
                  Continuar Comprando
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
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-slate-200 leading-relaxed">
              <strong>Privacidade e Cookies:</strong> Utilizamos cookies essenciais para oferecer a melhor experiência de compra com segurança conforme a Lei Geral de Proteção de Dados (LGPD).
            </p>
          </div>
          <button
            onClick={() => {
              setLgpdBannerDismissed(true);
              try {
                localStorage.setItem(`cronuz_b2c_lgpd_banner_${companyId}`, '1');
              } catch {}
            }}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shrink-0"
          >
            Entendi
          </button>
        </div>
      )}
    </div>
  );
}

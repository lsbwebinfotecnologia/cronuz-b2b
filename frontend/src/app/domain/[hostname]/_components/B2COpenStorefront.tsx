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
  ChevronLeft,
  Zap,
  Send,
  FolderTree,
  Headset,
  User,
  Lock,
  KeyRound,
  LogOut,
  Package,
  Bell,
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
  basePath?: string;
  routeSegments?: string[];
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

const slugifySegment = (value: string): string => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
};

export default function B2COpenStorefront({
  hostname,
  domainInfo,
  basePath,
  routeSegments,
}: B2COpenStorefrontProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const companyId = domainInfo.company_id;

  const effectiveBasePath = useMemo(() => {
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/loja/')) {
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) return `/loja/${parts[1]}`;
      }
      return '';
    }
    if (typeof basePath === 'string') return basePath.replace(/\/$/, '');
    return '';
  }, [basePath]);

  const [storeInfo, setStoreInfo] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [totalItemsCount, setTotalItemsCount] = useState<number>(0);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingProductDetail, setLoadingProductDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('default');
  const [onlyPromoFilter, setOnlyPromoFilter] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string>('');
  const [selectedCategoryObj, setSelectedCategoryObj] = useState<any>(null);
  const [selectedShowcaseObj, setSelectedShowcaseObj] = useState<any>(null);
  const [pageSkip, setPageSkip] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Left Sidebar Filters & Facets for Category / Showcase / Search Pages
  const [catalogFacets, setCatalogFacets] = useState<{
    categories: string[];
    brands: string[];
    authors: string[];
    characteristics: Record<string, string[]>;
  }>({ categories: [], brands: [], authors: [], characteristics: {} });
  const [discoveredCategoryNames, setDiscoveredCategoryNames] = useState<string[]>([]);
  const [sidebarBrand, setSidebarBrand] = useState<string>('');
  const [sidebarAuthor, setSidebarAuthor] = useState<string>('');
  const [sidebarCharacteristic, setSidebarCharacteristic] = useState<string>('');
  const [sidebarPriceRange, setSidebarPriceRange] = useState<'ALL' | 'UP_TO_40' | '40_TO_80' | 'OVER_80'>('ALL');
  const [sidebarInStockOnly, setSidebarInStockOnly] = useState<boolean>(false);
  const [catalogSortBy, setCatalogSortBy] = useState<string>('default');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);

  // Navigation View: 'catalog' (Home) | 'category' | 'showcase' | 'product' | 'contact' | 'account' | 'checkout'
  const [activeView, setActiveView] = useState<
    'catalog' | 'category' | 'showcase' | 'product' | 'contact' | 'account' | 'checkout'
  >('catalog');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productRelatedList, setProductRelatedList] = useState<any[]>([]);
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

  // Smart Customer Auth, Password Recovery, My Orders & My Coupons State
  const [b2cCustomer, setB2cCustomer] = useState<any | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<'login' | 'register' | 'recovery' | 'orders' | 'coupons' | 'profile' | 'security'>('orders');
  const [identityInput, setIdentityInput] = useState('');
  const [identityChecking, setIdentityChecking] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [identityExists, setIdentityExists] = useState(false);
  const [identityHasPassword, setIdentityHasPassword] = useState(false);
  const [identityCustomerName, setIdentityCustomerName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Password Recovery via Seller SMTP
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryMaskedEmail, setRecoveryMaskedEmail] = useState('');

  // Customer My Orders & My Coupons
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [loadingMyOrders, setLoadingMyOrders] = useState(false);
  const [selectedCustomerOrder, setSelectedCustomerOrder] = useState<any | null>(null);
  const [myCoupons, setMyCoupons] = useState<any[]>([]);
  const [myRedemptions, setMyRedemptions] = useState<any[]>([]);
  const [loadingMyCoupons, setLoadingMyCoupons] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [directNewPassword, setDirectNewPassword] = useState('');

  // Checkout Payment Method (PIX vs CREDIT_CARD)
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
  const [cardForm, setCardForm] = useState({
    holder_name: '',
    number: '',
    expiration: '',
    cvv: '',
    installments: 1,
  });

  // Checkout result
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);

  const applyAuthenticatedCustomer = (cust: any) => {
    if (!cust) return;
    setB2cCustomer(cust);
    setIdentityChecked(true);
    setIdentityExists(true);
    setCouponCpf(cust.cpf || '');
    setCustomerForm((prev) => ({
      ...prev,
      name: cust.name || prev.name,
      cpf: cust.cpf || prev.cpf,
      email: cust.email || prev.email,
      phone: cust.phone || prev.phone,
      street: cust.address?.street || prev.street,
      number: cust.address?.number || prev.number,
      complement: cust.address?.complement || prev.complement,
      neighborhood: cust.address?.neighborhood || prev.neighborhood,
      city: cust.address?.city || prev.city,
      state: cust.address?.state || prev.state,
    }));
    if (cust.address?.zip_code) {
      setZipCode(cust.address.zip_code);
    }
    try {
      localStorage.setItem(`cronuz_b2c_customer_${companyId}`, JSON.stringify(cust));
    } catch {}
  };

  // Load persisted cart, customer session & LGPD banner
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem(`cronuz_b2c_cart_${companyId}`);
      if (savedCart) setCart(JSON.parse(savedCart));
      const savedCust = localStorage.getItem(`cronuz_b2c_customer_${companyId}`);
      if (savedCust) {
        const parsedCust = JSON.parse(savedCust);
        applyAuthenticatedCustomer(parsedCust);
      }
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

  // Apply store favicon dynamically to browser tab
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const rawFav = storeInfo?.branding?.favicon_url || domainInfo?.favicon_url || storeInfo?.favicon_url;
    if (!rawFav) return;
    const resolvedFav = getImageUrl(rawFav);
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = resolvedFav;
  }, [storeInfo, domainInfo]);

  // Helper to update browser URL without full page reload
  const navigateToStorePath = (subPath: string, replace = false) => {
    if (typeof window === 'undefined') return;
    const cleanSub = subPath.startsWith('/') ? subPath : subPath ? `/${subPath}` : '';
    const fullUrl = effectiveBasePath
      ? `${effectiveBasePath}${cleanSub}`
      : cleanSub || '/';
    if (window.location.pathname !== fullUrl) {
      if (replace) {
        window.history.replaceState(null, '', fullUrl);
      } else {
        window.history.pushState(null, '', fullUrl);
      }
    }
  };

  // Fetch catalog from Horus / DB with optional Sidebar Filters & Facets
  const fetchCatalog = async (
    qStr = searchQuery,
    filterStr = searchFilter,
    skipVal = 0,
    onlyPromo = onlyPromoFilter,
    extra?: {
      brand?: string;
      author?: string;
      characteristic?: string;
      priceRange?: 'ALL' | 'UP_TO_40' | '40_TO_80' | 'OVER_80';
      inStock?: boolean;
      sortBy?: string;
    }
  ) => {
    setLoadingCatalog(true);
    try {
      const effBrand = extra?.brand !== undefined ? extra.brand : sidebarBrand;
      const effAuthor = extra?.author !== undefined ? extra.author : sidebarAuthor;
      const effChar = extra?.characteristic !== undefined ? extra.characteristic : sidebarCharacteristic;
      const effPriceRange = extra?.priceRange !== undefined ? extra.priceRange : sidebarPriceRange;
      const effInStock = extra?.inStock !== undefined ? extra.inStock : sidebarInStockOnly;
      const effSort = extra?.sortBy !== undefined ? extra.sortBy : catalogSortBy;

      const params = new URLSearchParams({
        company_id: String(companyId),
        q: qStr,
        filter: filterStr,
        only_promo: String(onlyPromo),
        skip: String(skipVal),
        limit: '24',
        sort_by: effSort || 'default',
      });
      if (effBrand) params.set('brand', effBrand);
      if (effAuthor) params.set('author', effAuthor);
      if (effChar) params.set('characteristic', effChar);
      if (effInStock) params.set('in_stock', 'true');
      if (effPriceRange === 'UP_TO_40') {
        params.set('max_price', '40');
      } else if (effPriceRange === '40_TO_80') {
        params.set('min_price', '40');
        params.set('max_price', '80');
      } else if (effPriceRange === 'OVER_80') {
        params.set('min_price', '80');
      }

      const res = await fetch(`${apiBase}/b2c/public/catalog?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const fetchedItems = Array.isArray(data.items) ? data.items : [];
        setProducts(fetchedItems);
        setTotalItemsCount(Number(data.total || fetchedItems.length));
        setPageSkip(skipVal);
        setTotalPages(Math.max(1, Number(data.pages || 1)));

        const facetCats: string[] = Array.isArray(data.facets?.categories)
          ? data.facets.categories
          : [];
        setDiscoveredCategoryNames((prev) => {
          const merged = new Set<string>(prev);
          for (const fc of facetCats) {
            const clean = String(fc || '').trim();
            if (clean && clean.toLowerCase() !== 'geral') merged.add(clean);
          }
          for (const it of fetchedItems) {
            const cName = String(it?.category?.name || '').trim();
            if (cName && cName.toLowerCase() !== 'geral') merged.add(cName);
          }
          return Array.from(merged);
        });

        if (data.facets) {
          const rawChars =
            data.facets.characteristics && typeof data.facets.characteristics === 'object'
              ? data.facets.characteristics
              : {};
          const cleanChars: Record<string, string[]> = {};
          for (const [k, vals] of Object.entries(rawChars)) {
            const kTrim = String(k || '').trim();
            const kLow = kTrim.toLowerCase();
            if (!kTrim || kLow.includes('tray')) continue;
            const filteredVals = (Array.isArray(vals) ? vals : []).filter((v) => {
              const vTrim = String(v || '').trim();
              const vLow = vTrim.toLowerCase();
              const comb = `${kLow} ${vLow}`.trim();
              if (!vTrim || vLow.includes('tray') || comb === 'tray sim') return false;
              if (kLow.startsWith('característica horus tipo') && (vLow === 'sim' || vLow === 's')) {
                return false;
              }
              return true;
            });
            if (filteredVals.length > 0) {
              cleanChars[kTrim] = filteredVals;
            }
          }
          setCatalogFacets({
            categories: facetCats,
            brands: Array.isArray(data.facets.brands) ? data.facets.brands : [],
            authors: Array.isArray(data.facets.authors) ? data.facets.authors : [],
            characteristics: cleanChars,
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const fetchProductDetailByCode = async (code: string) => {
    const cleanCode = decodeURIComponent(String(code || '').trim());
    if (!cleanCode) return;
    setLoadingProductDetail(true);
    setActiveView('product');
    try {
      const res = await fetch(
        `${apiBase}/b2c/public/product/${encodeURIComponent(cleanCode)}?company_id=${companyId}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.product) {
          setSelectedProduct(data.product);
          setProductRelatedList(Array.isArray(data.related) ? data.related : []);
          setProductDetailQty(1);
        }
      } else {
        toast.error('Produto não encontrado nesta loja.');
        setActiveView('catalog');
      }
    } catch {
      setActiveView('catalog');
    } finally {
      setLoadingProductDetail(false);
    }
  };

  useEffect(() => {
    fetchCatalog('', 'default', 0, false);
  }, [companyId]);

  const resolveProductCoverCandidates = (prod: any): string[] => {
    if (!prod) return [];
    const list: string[] = [];
    const wrapProxyIfNeeded = (rawUrl: string) => {
      if (
        rawUrl.startsWith('http://') &&
        !rawUrl.startsWith('http://localhost') &&
        !rawUrl.startsWith('http://127.0.0.1')
      ) {
        return `${apiBase}/b2c/public/cover-proxy?url=${encodeURIComponent(rawUrl)}`;
      }
      return rawUrl;
    };
    const addUnique = (u: string | null | undefined) => {
      if (!u) return;
      const trimmed = u.trim();
      if (!trimmed) return;
      const finalUrl = wrapProxyIfNeeded(trimmed);
      if (!list.includes(finalUrl)) list.push(finalUrl);
    };
    if (prod.cover_url) addUnique(getImageUrl(prod.cover_url));
    const isbn = String(prod.ean_gtin || prod.sku || '').trim();
    if (isbn) {
      if (storeInfo?.cover_image_base_url) {
        const base = storeInfo.cover_image_base_url.replace(/\/$/, '');
        addUnique(`${base}/${isbn}.jpg`);
      }
      if (storeInfo?.cover_image_secondary_base_url) {
        const secBase = storeInfo.cover_image_secondary_base_url.replace(/\/$/, '');
        addUnique(`${secBase}/${isbn}.jpg`);
      }
    }
    return list;
  };

  const resolveProductCover = (prod: any) => {
    const candidates = resolveProductCoverCandidates(prod);
    return candidates[0] || null;
  };

  const handleCoverImgError = (e: React.SyntheticEvent<HTMLImageElement, Event>, prod: any) => {
    const img = e.currentTarget;
    const candidates = resolveProductCoverCandidates(prod);
    const currentStep = Number(img.dataset.fallbackStep || '0');
    const nextStep = currentStep + 1;
    if (nextStep < candidates.length) {
      img.dataset.fallbackStep = String(nextStep);
      img.src = candidates[nextStep];
    } else {
      img.style.display = 'none';
      const fallbackPlaceholder = img.parentElement?.querySelector('[data-cover-placeholder="true"]') as HTMLElement | null;
      if (fallbackPlaceholder) {
        fallbackPlaceholder.style.display = 'block';
      }
    }
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
  const discountApplied = couponResult ? Number(couponResult.discount_applied || 0) : 0;
  const differenceToPay = Math.max(0, totalCart - discountApplied);
  const remainingCouponBalance = couponResult ? Number(couponResult.remaining_coupon_balance || 0) : 0;

  // Re-validate coupon automatically when cart subtotal or freight changes
  useEffect(() => {
    if (couponResult && couponCode) {
      handleValidateCoupon(true);
    }
  }, [subtotal, rawFreightValue]);

  // Vindi Commerce Fingerprint Antifraude (https://developers.vindi.com.br/docs/fingerprint)
  useEffect(() => {
    if (typeof window === 'undefined' || storeInfo?.payment_gateway_active !== 'VINDI') return;
    if (checkoutStep !== 'register') return;
    const initFp = () => {
      try {
        const w = window as any;
        if (w.yapay?.FingerPrint) {
          w.yapay.FingerPrint(storeInfo?.vindi_sandbox ? { env: 'sandbox' } : {});
        }
      } catch {}
    };
    const existing = document.getElementById('vindi-yapay-fingerprint-js');
    if (existing) {
      initFp();
      return;
    }
    const s = document.createElement('script');
    s.id = 'vindi-yapay-fingerprint-js';
    s.src = 'https://static.traycheckout.com.br/js/finger_print.js';
    s.async = true;
    s.onload = initFp;
    document.head.appendChild(s);
  }, [checkoutStep, storeInfo?.payment_gateway_active, storeInfo?.vindi_sandbox]);

  // Polling automático do status do PIX na tela de sucesso (a cada 5s)
  useEffect(() => {
    if (
      checkoutStep !== 'success' ||
      !orderResult?.order_id ||
      !orderResult?.pix_code ||
      orderResult?.status === 'PAID'
    ) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const r = await fetch(
          `${apiBase}/b2c/public/orders/${orderResult.order_id}/payment-status`
        );
        if (r.ok) {
          const st = await r.json();
          if (st.paid || st.status === 'PAID') {
            setOrderResult((prev: any) =>
              prev
                ? {
                    ...prev,
                    status: 'PAID',
                    status_label: 'Pago',
                    message: 'Pagamento PIX confirmado com sucesso! Seu pedido já está Pago.',
                  }
                : prev
            );
            toast.success('Pagamento PIX confirmado com sucesso!');
            clearInterval(timer);
          }
        }
      } catch {}
    }, 5000);
    return () => clearInterval(timer);
  }, [checkoutStep, orderResult?.order_id, orderResult?.pix_code, orderResult?.status, apiBase]);

  const openProductPage = (prod: any, updateUrl = true) => {
    setSelectedProduct(prod);
    setProductRelatedList([]);
    setProductDetailQty(1);
    setActiveView('product');
    const prodCode = encodeURIComponent(String(prod.ean_gtin || prod.sku || prod.id || '').trim());
    if (updateUrl && prodCode) {
      navigateToStorePath(`/produto/${prodCode}`);
    }
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

  const openDedicatedCheckoutPage = (updateUrl: boolean | React.MouseEvent = true) => {
    setIsCartOpen(false);
    setIsMobileMenuOpen(false);
    setCheckoutStep('register');
    setActiveView('checkout');
    if (updateUrl !== false) {
      navigateToStorePath('/checkout');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openContactPage = (updateUrl: boolean | React.MouseEvent = true) => {
    setIsMobileMenuOpen(false);
    setActiveView('contact');
    if (updateUrl !== false) {
      navigateToStorePath('/contato');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  const resetSidebarFiltersState = () => {
    setSidebarBrand('');
    setSidebarAuthor('');
    setSidebarCharacteristic('');
    setSidebarPriceRange('ALL');
    setSidebarInStockOnly(false);
    setCatalogSortBy('default');
  };

  const handleSelectCategory = (
    catId: string,
    label: string,
    code: string,
    filterType: string,
    onlyPromo = false,
    catObj?: any,
    updateUrl = true
  ) => {
    resetSidebarFiltersState();
    setSelectedCategoryId(catId);
    setSelectedCategoryLabel(label);
    setSelectedCategoryObj(
      catObj || {
        id: catId,
        label,
        code,
        filter_type: filterType,
        slug: slugifySegment(label || code || catId),
        banner_url: '',
        headline: label,
        description: '',
      }
    );
    setSelectedShowcaseObj(null);
    setSearchQuery(code);
    const targetFilter =
      filterType === 'SEARCH_TERM' || !filterType ? 'default' : filterType;
    setSearchFilter(targetFilter);
    setOnlyPromoFilter(onlyPromo);
    setActiveView('category');
    setIsMobileMenuOpen(false);
    if (updateUrl) {
      if (catId === 'PROMO') {
        navigateToStorePath('/ofertas');
      } else {
        const catSlug = catObj?.slug || slugifySegment(label || code || catId);
        navigateToStorePath(`/categoria/${encodeURIComponent(catSlug)}`);
      }
    }
    fetchCatalog(code, targetFilter, 0, onlyPromo, {
      brand: '',
      author: '',
      characteristic: '',
      priceRange: 'ALL',
      inStock: false,
      sortBy: 'default',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectShowcase = (sc: any, updateUrl = true) => {
    if (!sc) return;
    resetSidebarFiltersState();
    setSelectedShowcaseObj(sc);
    setSelectedCategoryObj(null);
    setSelectedCategoryId(`SHOWCASE-${sc.id}`);
    setSelectedCategoryLabel(sc.title || 'Vitrine Especial');
    setActiveView('showcase');
    setIsMobileMenuOpen(false);
    const scSlug = sc.slug || slugifySegment(sc.title || sc.id);
    if (updateUrl) {
      navigateToStorePath(`/vitrine/${encodeURIComponent(scSlug)}`);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResetToHome = (updateUrl: boolean | React.MouseEvent = true) => {
    resetSidebarFiltersState();
    setSelectedCategoryId('ALL');
    setSelectedCategoryLabel('');
    setSelectedCategoryObj(null);
    setSelectedShowcaseObj(null);
    setSearchQuery('');
    setSearchFilter('default');
    setOnlyPromoFilter(false);
    setActiveView('catalog');
    setSelectedProduct(null);
    setIsMobileMenuOpen(false);
    if (updateUrl !== false) {
      navigateToStorePath('');
    }
    fetchCatalog('', 'default', 0, false, {
      brand: '',
      author: '',
      characteristic: '',
      priceRange: 'ALL',
      inStock: false,
      sortBy: 'default',
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
      setCustomerForm((prev) => ({
        ...prev,
        cpf: prev.cpf || couponCpf || data.assigned_cpf || '',
        name: prev.name || data.assigned_name || '',
        email: prev.email || data.assigned_email || '',
      }));
      if (!silent) toast.success('Cupom validado e aplicado à sacola!');
    } catch {
      if (!silent) toast.error('Erro ao validar cupom.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleAutoLookupByCpf = async (rawCpf: string) => {
    const digits = rawCpf.replace(/\D/g, '');
    if (digits.length !== 11) return;
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/check-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, identifier: digits }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.prefill) {
        setCustomerForm((prev) => ({
          ...prev,
          cpf: prev.cpf || digits,
          name: prev.name || data.prefill.name || '',
          email: prev.email || data.prefill.email || '',
          phone: prev.phone || data.prefill.phone || '',
          street:
            prev.street ||
            (data.prefill.address?.street && !String(data.prefill.address.street).includes('ETAPA DE PAGAMENTO')
              ? data.prefill.address.street
              : ''),
          number:
            prev.number ||
            (data.prefill.address?.number && data.prefill.address.number !== 'S/N'
              ? data.prefill.address.number
              : ''),
          complement: prev.complement || data.prefill.address?.complement || '',
          neighborhood:
            prev.neighborhood ||
            (data.prefill.address?.neighborhood && data.prefill.address.neighborhood !== 'CENTRO'
              ? data.prefill.address.neighborhood
              : ''),
          city: prev.city || data.prefill.address?.city || '',
          state: prev.state || data.prefill.address?.state || '',
        }));
        if (
          !zipCode &&
          data.prefill.address?.zip_code &&
          data.prefill.address.zip_code !== '01001000'
        ) {
          setZipCode(data.prefill.address.zip_code);
        }
      }
    } catch {}
  };

  const handleCheckIdentity = async (identifierToUse?: string) => {
    const raw = (identifierToUse ?? identityInput).trim();
    if (!raw || raw.length < 4) {
      toast.error('Digite seu E-mail ou CPF para continuar.');
      return;
    }
    setIdentityChecking(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/check-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, identifier: raw }),
      });
      const data = await res.json();
      setIdentityChecked(true);
      if (data.exists) {
        setIdentityExists(true);
        setIdentityHasPassword(Boolean(data.has_password));
        setIdentityCustomerName(data.customer_name || '');
        if (data.prefill) {
          setCustomerForm((prev) => ({
            ...prev,
            name: prev.name || data.prefill.name || '',
            email: prev.email || data.prefill.email || '',
            cpf: prev.cpf || data.prefill.cpf || '',
            phone: prev.phone || data.prefill.phone || '',
          }));
          if (data.prefill.cpf) setCouponCpf(data.prefill.cpf);
        }
        if (!data.has_password && data.customer) {
          // Legacy B2C customer without password: pre-fill data directly
          applyAuthenticatedCustomer(data.customer);
          if (data.customer.address?.zip_code) {
            handleCalculateFreight(data.customer.address.zip_code);
          }
          toast.success(`Olá, ${data.customer_name}! Seus dados foram preenchidos.`);
        }
      } else {
        setIdentityExists(false);
        setIdentityHasPassword(false);
        setCustomerForm((prev) => ({
          ...prev,
          name: data.prefill?.name || prev.name,
          email: data.prefill?.email || prev.email,
          cpf: data.prefill?.cpf || prev.cpf,
          phone: data.prefill?.phone || prev.phone,
        }));
        if (data.prefill?.cpf) setCouponCpf(data.prefill.cpf);
      }
    } catch {
      toast.error('Erro ao verificar cadastro.');
    } finally {
      setIdentityChecking(false);
    }
  };

  const handleCustomerLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!identityInput.trim() || !loginPassword.trim()) {
      toast.error('Informe seu E-mail/CPF e sua senha.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          identifier: identityInput.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha no login.');
      applyAuthenticatedCustomer(data.customer);
      if (data.customer?.address?.zip_code) {
        handleCalculateFreight(data.customer.address.zip_code);
      }
      setLoginPassword('');
      toast.success(data.message || 'Login realizado com sucesso!');
      setAccountTab('orders');
      fetchMyOrders(data.customer?.cpf);
      fetchMyCoupons(data.customer?.cpf, data.customer?.email);
    } catch (err: any) {
      toast.error(err.message || 'Senha incorreta.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (overrideIdentifier?: string) => {
    const idVal = (
      overrideIdentifier ??
      identityInput ??
      b2cCustomer?.email ??
      b2cCustomer?.cpf ??
      ''
    ).trim();
    if (!idVal) {
      toast.error('Informe seu E-mail ou CPF para receber o token de recuperação.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          identifier: idVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Não foi possível enviar o token.');
      setRecoverySent(true);
      setRecoveryMaskedEmail(data.email || '');
      if (!b2cCustomer) setAccountTab('recovery');
      if (data.dev_recovery_code) {
        setRecoveryCode(data.dev_recovery_code);
      }
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao solicitar token.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const idVal = (identityInput || b2cCustomer?.email || b2cCustomer?.cpf || '').trim();
    const cleanPwd = newResetPassword.trim();
    const hasMinLen = cleanPwd.length >= 6;
    const hasLetter = /[a-zA-Z]/.test(cleanPwd);
    const hasNumber = /\d/.test(cleanPwd);

    if (!recoveryCode.trim()) {
      toast.error('Informe o token de segurança de 6 dígitos enviado para o seu e-mail.');
      return;
    }
    if (!hasMinLen || !hasLetter || !hasNumber) {
      toast.error(
        'Por segurança, a nova senha deve ter no mínimo 6 caracteres e conter pelo menos 1 letra e 1 número.'
      );
      return;
    }
    if (confirmResetPassword.trim() && confirmResetPassword.trim() !== cleanPwd) {
      toast.error('A confirmação da senha não confere com a nova senha.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          identifier: idVal,
          recovery_code: recoveryCode.trim(),
          new_password: cleanPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Token inválido.');
      applyAuthenticatedCustomer(data.customer);
      setRecoverySent(false);
      setRecoveryCode('');
      setNewResetPassword('');
      setConfirmResetPassword('');
      setRecoveryMaskedEmail('');
      toast.success(data.message || 'Senha redefinida com sucesso!');
      setAccountTab('orders');
      fetchMyOrders(data.customer?.cpf);
      fetchMyCoupons(data.customer?.cpf, data.customer?.email);
    } catch (err: any) {
      toast.error(err.message || 'Falha ao redefinir senha.');
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchMyOrders = async (cpfParam?: string) => {
    const cpfToQuery = (cpfParam || b2cCustomer?.cpf || customerForm.cpf || '').replace(/\D/g, '');
    if (cpfToQuery.length < 11) return;
    setLoadingMyOrders(true);
    try {
      const res = await fetch(
        `${apiBase}/b2c/public/my-orders?company_id=${companyId}&customer_cpf=${cpfToQuery}`
      );
      if (res.ok) {
        setMyOrders(await res.json());
      }
    } catch {
    } finally {
      setLoadingMyOrders(false);
    }
  };

  const fetchMyCoupons = async (cpfParam?: string, emailParam?: string) => {
    const cpfToQuery = (cpfParam || b2cCustomer?.cpf || customerForm.cpf || '').replace(/\D/g, '');
    const emailToQuery = (emailParam || b2cCustomer?.email || customerForm.email || '').trim();
    if (!cpfToQuery && !emailToQuery) return;
    setLoadingMyCoupons(true);
    try {
      const params = new URLSearchParams({
        company_id: String(companyId),
        ...(cpfToQuery ? { customer_cpf: cpfToQuery } : {}),
        ...(emailToQuery ? { customer_email: emailToQuery } : {}),
      });
      const res = await fetch(`${apiBase}/b2c/public/my-coupons?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMyCoupons(data.coupons || []);
        setMyRedemptions(data.redemptions || []);
      }
    } catch {
    } finally {
      setLoadingMyCoupons(false);
    }
  };

  const handleRegisterCustomerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          name: customerForm.name,
          cpf: customerForm.cpf,
          email: customerForm.email,
          phone: customerForm.phone,
          password: customerForm.password,
          zip_code: zipCode,
          street: customerForm.street,
          number: customerForm.number,
          complement: customerForm.complement,
          neighborhood: customerForm.neighborhood,
          city: customerForm.city,
          state: customerForm.state,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar conta.');
      applyAuthenticatedCustomer(data.customer);
      toast.success(data.message || 'Conta criada com sucesso!');
      setAccountTab('orders');
      fetchMyOrders(data.customer?.cpf);
      fetchMyCoupons(data.customer?.cpf, data.customer?.email);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveCustomerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!b2cCustomer?.cpf && !customerForm.cpf) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          cpf: b2cCustomer?.cpf || customerForm.cpf,
          name: customerForm.name,
          email: customerForm.email,
          phone: customerForm.phone,
          zip_code: zipCode,
          street: customerForm.street,
          number: customerForm.number,
          complement: customerForm.complement,
          neighborhood: customerForm.neighborhood,
          city: customerForm.city,
          state: customerForm.state,
          new_password: directNewPassword.trim() ? directNewPassword.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar dados.');
      applyAuthenticatedCustomer(data.customer);
      setDirectNewPassword('');
      toast.success(data.message || 'Dados atualizados com sucesso!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const openAccountScreen = (
    initialMenu?: 'login' | 'register' | 'recovery' | 'orders' | 'coupons' | 'profile' | 'security',
    updateUrl = true
  ) => {
    setAccountModalOpen(false);
    setIsMobileMenuOpen(false);
    setActiveView('account');
    if (b2cCustomer) {
      const target = initialMenu && !['login', 'register', 'recovery'].includes(initialMenu) ? initialMenu : 'orders';
      setAccountTab(target);
      fetchMyOrders(b2cCustomer.cpf);
      fetchMyCoupons(b2cCustomer.cpf, b2cCustomer.email);
      if (updateUrl) navigateToStorePath('/conta');
    } else {
      const target = initialMenu && ['login', 'register', 'recovery'].includes(initialMenu) ? initialMenu : 'login';
      setAccountTab(target);
      if (updateUrl) {
        if (target === 'register') navigateToStorePath('/cadastro');
        else if (target === 'recovery') navigateToStorePath('/recuperar-senha');
        else if (target === 'login') navigateToStorePath('/login');
        else navigateToStorePath('/conta');
      }
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLogoutCustomer = () => {
    setB2cCustomer(null);
    setIdentityChecked(false);
    setIdentityExists(false);
    setIdentityInput('');
    setMyOrders([]);
    setMyCoupons([]);
    setMyRedemptions([]);
    setAccountTab('login');
    try {
      localStorage.removeItem(`cronuz_b2c_customer_${companyId}`);
    } catch {}
    toast.success('Você saiu da sua conta.');
  };

  const isVindiPaymentLinkMode =
    storeInfo?.b2c_channel_mode === 'PAYMENT_LINK' ||
    (storeInfo?.payment_gateway_active === 'VINDI' && storeInfo?.vindi_integration_mode === 'PAYMENT_LINK');

  const isVindiExpressLink =
    differenceToPay > 0.009 &&
    !(storeInfo?.b2c_checkout_mode === 'TRAY_REDIRECT' && storeInfo?.tray_enabled) &&
    isVindiPaymentLinkMode &&
    storeInfo?.vindi_express_cpf_only !== false;

  const handleFinalizeCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.lgpd_accepted) {
      toast.error('Você precisa aceitar o Termo de Privacidade e Consentimento LGPD para continuar.');
      return;
    }
    const cleanCpfForCheckout = (customerForm.cpf || couponCpf || '').replace(/\D/g, '');
    if (cleanCpfForCheckout.length < 11) {
      toast.error('Informe um CPF válido (11 dígitos) para continuar.');
      return;
    }
    if (!customerForm.name || customerForm.name.trim().length < 3) {
      toast.error('Informe seu Nome Completo para continuar.');
      return;
    }
    if (!customerForm.email || !customerForm.email.includes('@')) {
      toast.error('Informe seu E-mail para continuar.');
      return;
    }
    if (!customerForm.phone || customerForm.phone.replace(/\D/g, '').length < 10) {
      toast.error('Informe seu WhatsApp / Telefone com DDD.');
      return;
    }
    if (!isVindiExpressLink) {
      if (!zipCode || zipCode.replace(/\D/g, '').length < 8) {
        toast.error('Informe o CEP de entrega.');
        return;
      }
      if (!b2cCustomer && customerForm.password && customerForm.password.trim().length < 6) {
        toast.error('Crie uma senha segura com pelo menos 6 caracteres.');
        return;
      }
    }

    setSubmittingCheckout(true);
    try {
      const fpInput =
        typeof document !== 'undefined'
          ? (document.querySelector('input[name="finger_print"]') as HTMLInputElement | null)
          : null;
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
          payment_method:
            differenceToPay <= 0.009
              ? 'VOUCHER_100'
              : isVindiPaymentLinkMode
              ? 'PAYMENT_LINK'
              : paymentMethod,
          card_holder_name: cardForm.holder_name || customerForm.name,
          card_number: cardForm.number || null,
          card_expiration: cardForm.expiration || null,
          card_cvv: cardForm.cvv || null,
          card_installments: Number(cardForm.installments || 1),
          finger_print: fpInput?.value || null,
          lgpd_accepted: customerForm.lgpd_accepted,
          marketing_opt_in: customerForm.marketing_opt_in,
          terms_version: 'v1.0',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível finalizar o pedido.');
      }

      if (data.customer) {
        applyAuthenticatedCustomer(data.customer);
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
      } else if (Number(data.difference_to_pay || 0) > 0 && data.vindi_payment_url) {
        setTimeout(() => {
          window.location.href = data.vindi_payment_url;
        }, 1500);
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

  // Fallback dynamic categories derived from store facets & discovered categories so top bar NEVER loses categories when one is selected
  const effectiveCategories = useMemo(() => {
    if (configuredCategories.length > 0) {
      return configuredCategories.map((c: any, idx: number) => ({
        ...c,
        slug: c.slug || slugifySegment(c.label || c.code || `categoria-${idx + 1}`),
      }));
    }
    const seen = new Set<string>();
    const autoCats: any[] = [];
    const candidateNames: string[] = [
      ...(catalogFacets.categories || []),
      ...discoveredCategoryNames,
      ...products.map((p: any) => String(p?.category?.name || '').trim()),
    ];
    for (const rawName of candidateNames) {
      const catName = String(rawName || '').trim();
      if (catName && catName.toLowerCase() !== 'geral' && !seen.has(catName.toLowerCase())) {
        seen.add(catName.toLowerCase());
        autoCats.push({
          id: `auto-cat-${slugifySegment(catName)}`,
          label: catName,
          code: catName,
          slug: slugifySegment(catName),
          filter_type: 'COD_GENERO',
          banner_url: '',
          headline: catName,
          description: '',
        });
      }
      if (autoCats.length >= 25) break;
    }
    return autoCats;
  }, [configuredCategories, catalogFacets.categories, discoveredCategoryNames, products]);

  const maxTopCategories = Math.max(1, Number(branding.max_top_categories || 6));
  const moreCategoriesPosition: 'start' | 'end' =
    branding.more_categories_position === 'start' ? 'start' : 'end';
  const moreCategoriesLabel = String(branding.more_categories_label || 'Outras').trim() || 'Outras';
  const [isMoreCategoriesOpen, setIsMoreCategoriesOpen] = useState(false);
  const [moreCategoriesSearch, setMoreCategoriesSearch] = useState('');

  const { visibleTopCategories, overflowCategories } = useMemo(() => {
    const visible = effectiveCategories.slice(0, maxTopCategories);
    const visibleSlugs = new Set<string>(
      visible.map((c: any) => String(slugifySegment(c.label || c.code || '')))
    );
    const overflow: any[] = [];
    const seenOverflow = new Set<string>(Array.from(visibleSlugs));

    for (const c of effectiveCategories.slice(maxTopCategories)) {
      const sl = slugifySegment(c.label || c.code || '');
      if (sl && !seenOverflow.has(sl)) {
        seenOverflow.add(sl);
        overflow.push(c);
      }
    }

    const extraNames: string[] = [
      ...(catalogFacets.categories || []),
      ...discoveredCategoryNames,
    ];
    for (const rawName of extraNames) {
      const catName = String(rawName || '').trim();
      const sl = slugifySegment(catName);
      if (catName && catName.toLowerCase() !== 'geral' && sl && !seenOverflow.has(sl)) {
        seenOverflow.add(sl);
        overflow.push({
          id: `auto-cat-${sl}`,
          label: catName,
          code: catName,
          slug: sl,
          filter_type: 'COD_GENERO',
          banner_url: '',
          headline: catName,
          description: '',
        });
      }
    }

    return { visibleTopCategories: visible, overflowCategories: overflow };
  }, [
    effectiveCategories,
    maxTopCategories,
    catalogFacets.categories,
    discoveredCategoryNames,
  ]);

  // Multi-Page URL Resolution (F5 Refresh & Browser Back/Forward Navigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const extractSegmentsFromLocation = (): string[] => {
      const pathname = window.location.pathname.replace(/\/$/, '');
      if (effectiveBasePath && pathname.startsWith(effectiveBasePath)) {
        const rest = pathname.slice(effectiveBasePath.length).replace(/^\//, '');
        return rest ? rest.split('/').filter(Boolean).map((s) => decodeURIComponent(s)) : [];
      }
      if (Array.isArray(routeSegments) && routeSegments.length > 0) {
        return routeSegments.map((s) => decodeURIComponent(s));
      }
      const rawParts = pathname.split('/').filter(Boolean);
      if (rawParts[0] === 'loja' && rawParts.length >= 2) {
        return rawParts.slice(2).map((s) => decodeURIComponent(s));
      }
      return rawParts.map((s) => decodeURIComponent(s));
    };

    const resolveSegments = (segs: string[]) => {
      if (!segs || segs.length === 0) {
        handleResetToHome(false);
        return;
      }
      const first = (segs[0] || '').toLowerCase();
      const second = segs[1] || '';

      if ((first === 'produto' || first === 'p') && second) {
        fetchProductDetailByCode(second);
        return;
      }

      if ((first === 'categoria' || first === 'c') && second) {
        const targetSlug = slugifySegment(second);
        const foundCat = effectiveCategories.find(
          (c: any) =>
            slugifySegment(c.slug || c.label || c.code) === targetSlug ||
            String(c.code || '').toLowerCase() === second.toLowerCase()
        );
        if (foundCat) {
          handleSelectCategory(
            foundCat.id,
            foundCat.label,
            foundCat.code,
            foundCat.filter_type || 'COD_GENERO',
            false,
            foundCat,
            false
          );
        } else {
          const prettyLabel = second.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
          handleSelectCategory(
            `url-cat-${targetSlug}`,
            prettyLabel,
            second.replace(/-/g, ' '),
            'COD_GENERO',
            false,
            {
              id: `url-cat-${targetSlug}`,
              label: prettyLabel,
              code: second.replace(/-/g, ' '),
              slug: targetSlug,
              filter_type: 'COD_GENERO',
              banner_url: '',
              headline: prettyLabel,
              description: '',
            },
            false
          );
        }
        return;
      }

      if ((first === 'vitrine' || first === 'v') && second) {
        const targetSlug = slugifySegment(second);
        const foundSc = activeShowcases.find(
          (s: any) =>
            slugifySegment(s.slug || s.title || s.id) === targetSlug ||
            String(s.id || '').toLowerCase() === second.toLowerCase()
        );
        if (foundSc) {
          handleSelectShowcase(foundSc, false);
        } else if (activeShowcases.length > 0) {
          handleSelectShowcase(activeShowcases[0], false);
        }
        return;
      }

      if (first === 'ofertas' || first === 'promocoes') {
        handleSelectCategory(
          'PROMO',
          'Ofertas e Promoções',
          '',
          'default',
          true,
          {
            id: 'PROMO',
            label: 'Ofertas e Promoções',
            code: '',
            slug: 'ofertas',
            headline: 'Ofertas e Promoções Especiais',
            description: 'Confira todas as obras com descontos exclusivos por tempo limitado.',
          },
          false
        );
        return;
      }

      if (first === 'busca') {
        const urlParams = new URLSearchParams(window.location.search);
        const qParam = urlParams.get('q') || searchQuery || '';
        const filterParam = urlParams.get('filter') || 'default';
        setSelectedCategoryId('SEARCH');
        setSelectedCategoryLabel(qParam ? `Busca: "${qParam}"` : 'Busca no Catálogo');
        setSelectedCategoryObj({
          id: 'SEARCH',
          label: qParam ? `Resultados para "${qParam}"` : 'Catálogo Completo',
          code: qParam,
          slug: 'busca',
          headline: qParam ? `Resultados da busca por "${qParam}"` : 'Explorando o Acervo',
          description: 'Utilize os filtros na lateral esquerda para refinar por editora, autor, características ou faixa de preço.',
        });
        setSearchQuery(qParam);
        setSearchFilter(filterParam);
        setActiveView('category');
        fetchCatalog(qParam, filterParam, 0, false);
        return;
      }

      if (first === 'contato' || first === 'fale-conosco') {
        openContactPage(false);
        return;
      }

      if (first === 'conta' || first === 'minha-conta') {
        openAccountScreen('orders', false);
        return;
      }

      if (first === 'login' || first === 'entrar') {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab') || '';
        const idParam = urlParams.get('id') || '';
        const tokenParam = urlParams.get('token') || '';
        if (idParam) setIdentityInput(idParam);
        if (tokenParam) {
          setRecoveryCode(tokenParam);
          setRecoverySent(true);
        }
        if (tabParam === 'recovery' || tokenParam) {
          openAccountScreen('recovery', false);
        } else {
          openAccountScreen('login', false);
        }
        return;
      }

      if (first === 'recuperar-senha' || first === 'esqueci-senha') {
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id') || '';
        const tokenParam = urlParams.get('token') || '';
        if (idParam) setIdentityInput(idParam);
        if (tokenParam) {
          setRecoveryCode(tokenParam);
          setRecoverySent(true);
        }
        openAccountScreen('recovery', false);
        return;
      }

      if (first === 'cadastro' || first === 'criar-conta') {
        openAccountScreen('register', false);
        return;
      }

      if (first === 'checkout' || first === 'finalizar') {
        openDedicatedCheckoutPage(false);
        return;
      }
    };

    const initialSegs = extractSegmentsFromLocation();
    if (initialSegs.length > 0) {
      resolveSegments(initialSegs);
    }

    const onPopState = () => {
      resolveSegments(extractSegmentsFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [storeInfo?.company_id, effectiveCategories.length, activeShowcases.length]);

  // Suggestions for Product Page ("Quem viu também se interessou")
  const relatedProducts = useMemo(() => {
    if (productRelatedList.length > 0) return productRelatedList.slice(0, 4);
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
  }, [selectedProduct, productRelatedList, products, activeShowcases]);

  // Cross-sell Suggestions inside Cart Drawer ("Aproveite e leve também")
  // Prioritizes: 1) Only in-stock items, 2) Same Author or Category as cart items, 3) Active Vitrines/Promos, 4) Same Publisher
  const cartSuggestions = useMemo(() => {
    const cartSkus = new Set(cart.map((c) => String(c.sku)));
    const cartAuthors = new Set(
      cart
        .map((c) => String(c.author || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const cartBrands = new Set(
      cart
        .map((c) => String(c.brand || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const showcasePool: any[] = [];
    for (const sc of activeShowcases) {
      if (Array.isArray(sc.items)) showcasePool.push(...sc.items);
    }
    const pool = [...showcasePool, ...products];
    const uniqueCandidates: any[] = [];
    const seen = new Set<string>();

    for (const p of pool) {
      const k = String(p.sku || p.ean_gtin || '');
      const hasStock = p.allow_purchase === true || (Number(p.stock_quantity ?? 0) > 0 && p.allow_purchase !== false);
      if (k && hasStock && !cartSkus.has(k) && !seen.has(k)) {
        seen.add(k);
        uniqueCandidates.push(p);
      }
    }

    const scoreCandidate = (p: any) => {
      let score = 0;
      const pAuthor = String(p.author || '').trim().toLowerCase();
      const pBrand = String(p.brand || '').trim().toLowerCase();
      if (pAuthor && cartAuthors.has(pAuthor)) score += 50;
      if (showcasePool.includes(p)) score += 30;
      if (p.promotional_price && Number(p.promotional_price) < Number(p.base_price || 0)) score += 20;
      if (pBrand && cartBrands.has(pBrand)) score += 10;
      return score;
    };

    uniqueCandidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    return uniqueCandidates.slice(0, 3);
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

  // Stock Notification ("Avise-me") state
  const [aviseMeOpenSku, setAviseMeOpenSku] = useState<string | null>(null);
  const [aviseMeEmail, setAviseMeEmail] = useState('');
  const [aviseMeSubmitting, setAviseMeSubmitting] = useState(false);

  const handleSubmitAviseMe = async (prod: any, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetEmail = (aviseMeEmail || b2cCustomer?.email || customerForm.email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      toast.error('Informe um e-mail válido para avisarmos você.');
      return;
    }
    setAviseMeSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/b2c/public/stock-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: domainInfo.company_id,
          email: targetEmail,
          name: b2cCustomer?.name || customerForm.name || undefined,
          product_id: prod.id || null,
          sku: String(prod.sku || prod.ean_gtin || 'ITEM'),
          ean_gtin: prod.ean_gtin || null,
          product_name: prod.name || 'Produto',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao registrar aviso.');
      toast.success(data.message || 'Pronto! Avisaremos você por e-mail assim que chegar.');
      setAviseMeOpenSku(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAviseMeSubmitting(false);
    }
  };

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
    const stockQty = Number(prod.stock_quantity ?? 0);
    const hasStock = prod.allow_purchase === true || (stockQty > 0 && prod.allow_purchase !== false);
    const prodKey = `${keyPrefix}-${prod.sku || prod.ean_gtin}-${prod.id || ''}`;
    const isAviseMeOpen = aviseMeOpenSku === prodKey;

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
            <>
              <img
                src={cover}
                alt={prod.name}
                className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                onError={(e) => handleCoverImgError(e, prod)}
              />
              <div data-cover-placeholder="true" style={{ display: 'none' }} className="text-center p-3 text-slate-400">
                <BookOpen className="w-10 h-10 mx-auto mb-1 opacity-50" />
                <span className="text-[10px] font-mono block">{prod.ean_gtin || prod.sku}</span>
              </div>
            </>
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

            {/* Stock Control: "Comprar" if in stock, or "Avise-me" if out of stock */}
            {hasStock ? (
              <button
                type="button"
                onClick={() => handleBuyNow(prod, 1)}
                style={{ backgroundColor: primaryColor }}
                className="w-full py-2.5 px-3 rounded-xl hover:opacity-95 active:scale-[0.99] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>Comprar</span>
              </button>
            ) : isAviseMeOpen ? (
              <form
                onSubmit={(e) => handleSubmitAviseMe(prod, e)}
                className="p-2 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5"
              >
                <span className="block text-[10px] font-bold text-amber-900">
                  Receber aviso por e-mail:
                </span>
                <div className="flex gap-1">
                  <input
                    type="email"
                    required
                    value={aviseMeEmail}
                    onChange={(e) => setAviseMeEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-amber-300 bg-white text-[11px]"
                  />
                  <button
                    type="submit"
                    disabled={aviseMeSubmitting}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    {aviseMeSubmitting ? '...' : 'OK'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAviseMeEmail(b2cCustomer?.email || customerForm.email || '');
                  setAviseMeOpenSku(prodKey);
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 shrink-0" />
                <span>Avise-me</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const themeTemplate = branding.theme_template || 'editorial_modern';
  const seoCfg = appearance?.seo_config || {};

  const seoDynamicMeta = useMemo(() => {
    const storeName = domainInfo.name || 'Loja Oficial';
    const renderTpl = (tpl: string, map: Record<string, string>) => {
      let out = String(tpl || '');
      for (const [k, v] of Object.entries(map)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), String(v || '').trim());
      }
      return out
        .replace(/\(\s*ISBN\s*\)/gi, '')
        .replace(/\s+\|\s+\|/g, ' |')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    if (activeView === 'product' && selectedProduct) {
      const isbnVal = String(selectedProduct.ean_gtin || selectedProduct.sku || '').trim();
      const authorVal = String(selectedProduct.author || selectedProduct.brand || storeName).trim();
      const brandVal = String(selectedProduct.brand || storeName).trim();
      const catVal = String(selectedProduct.category?.name || 'Livros').trim();
      const priceVal = Number(selectedProduct.promotional_price ?? selectedProduct.base_price ?? 0);
      const stockQty = Number(selectedProduct.stock_quantity ?? 0);
      const map = {
        nome: selectedProduct.name || 'Livro',
        isbn: isbnVal,
        autor: authorVal,
        editora: brandVal,
        categoria: catVal,
        preco: formatBRL(priceVal),
        loja: storeName,
      };
      const title = renderTpl(
        seoCfg.product_title_template || '{nome} - ISBN {isbn} | {autor} | {loja}',
        map
      );
      const description = renderTpl(
        seoCfg.product_description_template ||
          'Compre o livro {nome} (ISBN {isbn}) de {autor}, editora {editora} na {loja}. Confira sinopse, preço e envio rápido.',
        map
      );
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': ['Product', 'Book'],
        name: selectedProduct.name,
        sku: String(selectedProduct.sku || isbnVal),
        isbn: isbnVal,
        gtin13: isbnVal.length === 13 ? isbnVal : undefined,
        description: description.slice(0, 300),
        image: resolveProductCover(selectedProduct) || undefined,
        author: { '@type': 'Person', name: authorVal },
        publisher: { '@type': 'Organization', name: brandVal },
        brand: { '@type': 'Brand', name: brandVal },
        offers: {
          '@type': 'Offer',
          priceCurrency: 'BRL',
          price: priceVal.toFixed(2),
          availability:
            stockQty > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          seller: { '@type': 'Organization', name: storeName },
        },
      };
      return { title, description, jsonLd };
    }

    if (activeView === 'category' && selectedCategoryObj) {
      const catLabel = selectedCategoryObj.headline || selectedCategoryObj.label || selectedCategoryLabel || 'Catálogo';
      const map = { categoria: catLabel, loja: storeName };
      const title = renderTpl(
        seoCfg.category_title_template || '{categoria} - Livros em Oferta | {loja}',
        map
      );
      const description =
        selectedCategoryObj.description ||
        renderTpl(
          seoCfg.category_description_template ||
            'Explore os melhores livros de {categoria} na {loja}. Obras selecionadas com pronta entrega.',
          map
        );
      return { title, description, jsonLd: null };
    }

    if (activeView === 'showcase' && selectedShowcaseObj) {
      const scTitle = selectedShowcaseObj.title || 'Vitrine';
      const scSub = selectedShowcaseObj.description || selectedShowcaseObj.subtitle || scTitle;
      const map = { vitrine: scTitle, subtitulo: scSub, loja: storeName };
      const title = renderTpl(
        seoCfg.showcase_title_template || '{vitrine} | Seleção Especial {loja}',
        map
      );
      const description = renderTpl(
        seoCfg.showcase_description_template || '{subtitulo} - Confira a vitrine {vitrine} na {loja}.',
        map
      );
      return { title, description, jsonLd: null };
    }

    const title = renderTpl(
      seoCfg.home_title || `${storeName} | Livraria e Loja Oficial`,
      { loja: storeName }
    );
    const description = renderTpl(
      seoCfg.home_description ||
        `Compre livros na loja oficial ${storeName}. Acervo completo com ISBN, lançamentos e entrega rápida para todo o Brasil.`,
      { loja: storeName }
    );
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BookStore',
      name: storeName,
      description,
    };
    return { title, description, jsonLd };
  }, [
    activeView,
    selectedProduct,
    selectedCategoryObj,
    selectedCategoryLabel,
    selectedShowcaseObj,
    domainInfo.name,
    seoCfg,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (seoDynamicMeta.title) {
      document.title = seoDynamicMeta.title;
    }
    if (seoDynamicMeta.description) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', seoDynamicMeta.description);
    }
  }, [seoDynamicMeta]);

  return (
    <div
      className={`min-h-screen text-slate-900 flex flex-col ${
        themeTemplate === 'classic_bookstore'
          ? 'bg-[#faf8f5] font-serif'
          : themeTemplate === 'minimal_boutique'
          ? 'bg-white font-sans'
          : 'bg-slate-50 font-sans'
      }`}
      style={{ '--b2c-primary': primaryColor, '--b2c-secondary': secondaryColor } as any}
    >
      {seoDynamicMeta.jsonLd && seoCfg.auto_json_ld !== false && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(seoDynamicMeta.jsonLd) }}
        />
      )}
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
                onClick={() => handleResetToHome()}
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
              resetSidebarFiltersState();
              setSelectedCategoryId('SEARCH');
              setSelectedCategoryLabel(searchQuery ? `Busca: "${searchQuery}"` : 'Catálogo');
              setSelectedCategoryObj({
                id: 'SEARCH',
                label: searchQuery ? `Resultados para "${searchQuery}"` : 'Explorando o Acervo',
                code: searchQuery,
                slug: 'busca',
                headline: searchQuery ? `Resultados da busca por "${searchQuery}"` : 'Catálogo Completo',
                description:
                  'Utilize os filtros na lateral esquerda para refinar por editora, autor, características físicas ou faixa de preço.',
              });
              setActiveView('category');
              navigateToStorePath(
                `/busca${searchQuery ? `?q=${encodeURIComponent(searchQuery)}&filter=${encodeURIComponent(searchFilter)}` : ''}`
              );
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
              onClick={() => openAccountScreen('orders')}
              className="px-4 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <User className="w-4 h-4" style={{ color: primaryColor }} />
              <span>{b2cCustomer ? `Olá, ${b2cCustomer.name.split(' ')[0]}` : 'Minha Conta'}</span>
            </button>

            <button
              type="button"
              onClick={() => openContactPage()}
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

        {/* Horizontal Category Navigation Bar (Clean — Categories, Vitrines, Offers & "Outras" Overflow Menu) */}
        {(effectiveCategories.length > 0 || activePromotions.length > 0 || activeShowcases.length > 0) && (
          <div className="relative border-t border-slate-100 bg-slate-50/90">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {moreCategoriesPosition === 'start' && overflowCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsMoreCategoriesOpen((prev) => !prev)}
                  style={
                    isMoreCategoriesOpen ||
                    (activeView === 'category' &&
                      overflowCategories.some(
                        (oc: any) =>
                          oc.id === selectedCategoryId ||
                          slugifySegment(oc.label) === slugifySegment(selectedCategoryLabel)
                      ))
                      ? { backgroundColor: primaryColor, color: '#ffffff' }
                      : undefined
                  }
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isMoreCategoriesOpen
                      ? 'shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span>{moreCategoriesLabel}</span>
                  <span className="text-[10px] opacity-80">({overflowCategories.length}) ▾</span>
                </button>
              )}

              {activePromotions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreCategoriesOpen(false);
                    if (onlyPromoFilter && activeView === 'category') {
                      handleResetToHome();
                    } else {
                      handleSelectCategory(
                        'PROMO',
                        'Ofertas e Promoções',
                        '',
                        'default',
                        true,
                        {
                          id: 'PROMO',
                          label: 'Ofertas e Promoções',
                          code: '',
                          slug: 'ofertas',
                          headline: 'Ofertas e Promoções Especiais',
                          description:
                            'Seleção de títulos com descontos especiais por tempo limitado.',
                        }
                      );
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                    onlyPromoFilter && activeView === 'category'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  Ofertas ({activePromotions.length})
                </button>
              )}

              {visibleTopCategories.map((cat: any) => {
                const isSelected =
                  activeView === 'category' &&
                  (selectedCategoryId === cat.id ||
                    slugifySegment(selectedCategoryLabel) === slugifySegment(cat.label));
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setIsMoreCategoriesOpen(false);
                      handleSelectCategory(
                        cat.id,
                        cat.label,
                        cat.code,
                        cat.filter_type || 'COD_GENERO',
                        false,
                        cat
                      );
                    }}
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

              {moreCategoriesPosition === 'end' && overflowCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsMoreCategoriesOpen((prev) => !prev)}
                  style={
                    isMoreCategoriesOpen ||
                    (activeView === 'category' &&
                      overflowCategories.some(
                        (oc: any) =>
                          oc.id === selectedCategoryId ||
                          slugifySegment(oc.label) === slugifySegment(selectedCategoryLabel)
                      ))
                      ? { backgroundColor: primaryColor, color: '#ffffff' }
                      : undefined
                  }
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isMoreCategoriesOpen
                      ? 'shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span>{moreCategoriesLabel}</span>
                  <span className="text-[10px] opacity-80">({overflowCategories.length}) ▾</span>
                </button>
              )}

              {activeShowcases.map((sc: any) => {
                const isSelectedSc =
                  activeView === 'showcase' && selectedShowcaseObj?.id === sc.id;
                return (
                  <button
                    key={`nav-sc-${sc.id}`}
                    type="button"
                    onClick={() => {
                      setIsMoreCategoriesOpen(false);
                      if (isSelectedSc) {
                        handleResetToHome();
                      } else {
                        handleSelectShowcase(sc);
                      }
                    }}
                    style={
                      isSelectedSc ? { backgroundColor: primaryColor, color: '#ffffff' } : undefined
                    }
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                      isSelectedSc
                        ? 'shadow-sm'
                        : 'bg-indigo-50/70 text-indigo-800 border border-indigo-200/80 hover:bg-indigo-100'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    {sc.title}
                  </button>
                );
              })}
            </div>

            {/* Dropdown Popover for "Outras" Categories */}
            {isMoreCategoriesOpen && overflowCategories.length > 0 && (
              <div className="border-t border-slate-200 bg-white shadow-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      {moreCategoriesLabel} ({overflowCategories.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {overflowCategories.length > 8 && (
                        <input
                          type="text"
                          value={moreCategoriesSearch}
                          onChange={(e) => setMoreCategoriesSearch(e.target.value)}
                          placeholder="Filtrar categoria..."
                          className="px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setIsMoreCategoriesOpen(false)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        Fechar ✕
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
                    {overflowCategories
                      .filter(
                        (oc: any) =>
                          !moreCategoriesSearch.trim() ||
                          String(oc.label || '')
                            .toLowerCase()
                            .includes(moreCategoriesSearch.trim().toLowerCase())
                      )
                      .map((oc: any) => {
                        const isSelectedOc =
                          activeView === 'category' &&
                          (selectedCategoryId === oc.id ||
                            slugifySegment(selectedCategoryLabel) === slugifySegment(oc.label));
                        return (
                          <button
                            key={`overflow-cat-${oc.id}`}
                            type="button"
                            onClick={() => {
                              setIsMoreCategoriesOpen(false);
                              setMoreCategoriesSearch('');
                              handleSelectCategory(
                                oc.id,
                                oc.label,
                                oc.code,
                                oc.filter_type || 'COD_GENERO',
                                false,
                                oc
                              );
                            }}
                            style={
                              isSelectedOc
                                ? { backgroundColor: primaryColor, color: '#ffffff' }
                                : undefined
                            }
                            className={`px-3 py-2 rounded-xl text-left text-xs font-semibold truncate transition-all cursor-pointer ${
                              isSelectedOc
                                ? 'shadow-sm font-bold'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                            }`}
                          >
                            {oc.label}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
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
                <span className="font-bold text-sm">Navegar pela Loja</span>
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
                  onClick={() => handleResetToHome()}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <span>🏠 Início</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={() => openAccountScreen('orders')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    {b2cCustomer ? `Minha Conta (${b2cCustomer.name.split(' ')[0]})` : 'Minha Conta / Meus Pedidos'}
                  </span>
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
                    Páginas de Categorias
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
                          false,
                          cat
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

              {activeShowcases.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Vitrines Especiais
                  </span>
                  {activeShowcases.map((sc: any) => (
                    <button
                      key={`mob-sc-${sc.id}`}
                      type="button"
                      onClick={() => handleSelectShowcase(sc)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-indigo-800 hover:bg-indigo-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        {sc.title}
                      </span>
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
                  onClick={() => openContactPage()}
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
          VIEW 1: DEDICATED PRODUCT DETAIL PAGE (PÁGINA DE PRODUTO COMPLETA - /produto/[code])
         ======================================================================= */}
      {activeView === 'product' && loadingProductDetail && !selectedProduct && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: primaryColor }} />
          <p className="text-xs font-bold text-slate-500">Carregando página do produto...</p>
        </main>
      )}
      {activeView === 'product' && selectedProduct && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-8 pb-24 md:pb-12">
          {/* Breadcrumb & Back Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleResetToHome()}
                className="hover:text-slate-900 font-semibold cursor-pointer"
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
                <>
                  <img
                    src={resolveProductCover(selectedProduct)!}
                    alt={selectedProduct.name}
                    className="max-h-[360px] sm:max-h-[420px] w-auto object-contain drop-shadow-md"
                    onError={(e) => handleCoverImgError(e, selectedProduct)}
                  />
                  <div data-cover-placeholder="true" style={{ display: 'none' }} className="text-center text-slate-300 space-y-2">
                    <BookOpen className="w-20 h-20 mx-auto" />
                    <p className="text-xs font-mono text-slate-400">
                      ISBN: {selectedProduct.ean_gtin || selectedProduct.sku}
                    </p>
                  </div>
                </>
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
                  {Number(selectedProduct.stock_quantity ?? 0) > 0 && selectedProduct.allow_purchase !== false ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                      ✓ Em Estoque
                    </span>
                  ) : selectedProduct.allow_purchase === true ? (
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold">
                      ✓ Disponível sob Encomenda
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                      🔔 Sem Estoque (Avise-me)
                    </span>
                  )}
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

              {/* Quantity + Single "Comprar" Button or "Avise-me" */}
              {selectedProduct.allow_purchase === true ||
              (Number(selectedProduct.stock_quantity ?? 0) > 0 && selectedProduct.allow_purchase !== false) ? (
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
              ) : (
                <form
                  onSubmit={(e) => handleSubmitAviseMe(selectedProduct, e)}
                  className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-xs font-extrabold text-amber-900">
                    <Bell className="w-4 h-4 text-amber-600" />
                    Avise-me quando este livro voltar ao estoque
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Digite seu e-mail abaixo e clique em OK para ser avisado assim que estiver disponível:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={aviseMeEmail}
                      onChange={(e) => setAviseMeEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-xs"
                    />
                    <button
                      type="submit"
                      disabled={aviseMeSubmitting}
                      className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {aviseMeSubmitting ? 'Salvando...' : 'OK'}
                    </button>
                  </div>
                </form>
              )}

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
          VIEW 2B: DEDICATED CUSTOMER PORTAL SCREEN (MINHA CONTA — SEM MODAL)
         ======================================================================= */}
      {activeView === 'account' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6 pb-20">
          {/* Top Breadcrumb & Back to Store */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
                <User className="w-6 h-6" style={{ color: primaryColor }} />
                {b2cCustomer ? `Minha Conta — ${b2cCustomer.name}` : 'Área do Cliente'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {b2cCustomer
                  ? `CPF: ${b2cCustomer.cpf} • ${b2cCustomer.email}`
                  : 'Acesse sua conta, acompanhe seus pedidos, consulte seus cupons ou redefina sua senha.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetToHome}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para a Loja
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT SIDEBAR MENU FOR CUSTOMER */}
            <aside className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 p-3 sm:p-4 shadow-sm space-y-1.5">
              {b2cCustomer ? (
                <>
                  {[
                    { id: 'orders', label: 'Meus Pedidos', icon: Package, badge: myOrders.length },
                    { id: 'coupons', label: 'Meus Cupons', icon: Ticket, badge: myCoupons.length },
                    { id: 'profile', label: 'Meus Dados e Endereço', icon: User },
                    { id: 'security', label: 'Resetar / Alterar Senha', icon: KeyRound },
                  ].map((item) => {
                    const IconComp = item.icon;
                    const isActive = accountTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAccountTab(item.id as any);
                          if (item.id === 'orders') fetchMyOrders(b2cCustomer.cpf);
                          if (item.id === 'coupons') fetchMyCoupons(b2cCustomer.cpf, b2cCustomer.email);
                        }}
                        style={isActive ? { backgroundColor: primaryColor, color: '#ffffff' } : undefined}
                        className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'shadow-sm'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <IconComp className="w-4 h-4 shrink-0" />
                          {item.label}
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleLogoutCustomer}
                      className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Sair da Conta
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {[
                    { id: 'login', label: 'Entrar na Conta', icon: Lock },
                    { id: 'register', label: 'Criar Meu Cadastro', icon: User },
                    { id: 'recovery', label: 'Resetar Minha Senha', icon: KeyRound },
                  ].map((item) => {
                    const IconComp = item.icon;
                    const isActive = accountTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAccountTab(item.id as any)}
                        style={isActive ? { backgroundColor: primaryColor, color: '#ffffff' } : undefined}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                          isActive ? 'shadow-sm' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <IconComp className="w-4 h-4 shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </>
              )}
            </aside>

            {/* RIGHT CONTENT AREA OF CUSTOMER SCREEN */}
            <div className="lg:col-span-9 bg-white rounded-3xl border border-slate-200 p-5 sm:p-8 shadow-sm">
              {!b2cCustomer ? (
                <>
                  {/* 1. LOGIN */}
                  {accountTab === 'login' && (
                    <form onSubmit={handleCustomerLogin} className="max-w-md space-y-4">
                      <div>
                        <h2 className="text-lg font-extrabold text-slate-900">Entrar na Minha Conta</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Informe seu E-mail ou CPF e sua senha cadastrada para ver seus pedidos e cupons.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          E-mail ou CPF *
                        </label>
                        <input
                          type="text"
                          required
                          value={identityInput}
                          onChange={(e) => setIdentityInput(e.target.value)}
                          placeholder="Digite seu e-mail ou CPF..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Sua Senha *
                        </label>
                        <input
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Digite sua senha..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            openAccountScreen('recovery');
                            if (identityInput.trim().length >= 5) {
                              handleForgotPassword(identityInput.trim());
                            }
                          }}
                          className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                          Esqueci minha senha
                        </button>
                        <button
                          type="submit"
                          disabled={authLoading}
                          style={{ backgroundColor: primaryColor }}
                          className="px-6 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
                        >
                          {authLoading ? 'Entrando...' : 'Entrar na Conta'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 2. REGISTER NEW CUSTOMER */}
                  {accountTab === 'register' && (
                    <form onSubmit={handleRegisterCustomerAccount} className="space-y-4 max-w-2xl">
                      <div>
                        <h2 className="text-lg font-extrabold text-slate-900">Criar Meu Cadastro</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Cadastre seus dados básicos e uma senha segura para comprar mais rápido.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Nome Completo *
                          </label>
                          <input
                            type="text"
                            required
                            value={customerForm.name}
                            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">CPF *</label>
                          <input
                            type="text"
                            required
                            value={customerForm.cpf}
                            onChange={(e) => setCustomerForm({ ...customerForm, cpf: e.target.value })}
                            placeholder="000.000.000-00"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Telefone / WhatsApp *
                          </label>
                          <input
                            type="text"
                            required
                            value={customerForm.phone}
                            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                            placeholder="(11) 99999-9999"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">E-mail *</label>
                          <input
                            type="email"
                            required
                            value={customerForm.email}
                            onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                            placeholder="seu@email.com"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Criar Senha Segura (mín. 6 caracteres) *
                          </label>
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={customerForm.password}
                            onChange={(e) => setCustomerForm({ ...customerForm, password: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={authLoading}
                        style={{ backgroundColor: primaryColor }}
                        className="px-6 py-3 rounded-xl text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
                      >
                        {authLoading ? 'Criando Conta...' : 'Criar Minha Conta'}
                      </button>
                    </form>
                  )}

                  {/* 3. PASSWORD RECOVERY WITH SECURITY RULES & 6-DIGIT EMAIL TOKEN */}
                  {accountTab === 'recovery' && (
                    <form onSubmit={handleResetPassword} className="max-w-lg space-y-5">
                      <div>
                        <h2 className="text-lg font-extrabold text-slate-900">
                          Recuperação de Senha com Token de Segurança
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          Informe seu <strong>CPF</strong> ou <strong>E-mail</strong> cadastrado. Enviaremos um{' '}
                          <strong>Token de Segurança de 6 dígitos</strong> para o seu e-mail para validar sua identidade.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          1. Seu CPF ou E-mail de Cadastro *
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            required
                            value={identityInput}
                            onChange={(e) => setIdentityInput(e.target.value)}
                            placeholder="Digite seu CPF (000.000.000-00) ou E-mail..."
                            className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                          <button
                            type="button"
                            disabled={authLoading}
                            onClick={() => handleForgotPassword()}
                            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                          >
                            {authLoading && !recoverySent ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Mail className="w-3.5 h-3.5" />
                            )}
                            {recoverySent ? 'Reenviar Token' : 'Enviar Token por E-mail'}
                          </button>
                        </div>
                        {!recoverySent && (
                          <button
                            type="button"
                            onClick={() => setRecoverySent(true)}
                            className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer pt-1"
                          >
                            Já recebi meu token de 6 dígitos por e-mail →
                          </button>
                        )}
                      </div>

                      {recoverySent && (
                        <div className="p-4 sm:p-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-4">
                          {recoveryMaskedEmail && (
                            <div className="p-3 rounded-xl bg-white border border-indigo-100 flex items-center gap-2.5 text-xs text-slate-700">
                              <Mail className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>
                                Token enviado para <strong className="text-slate-900">{recoveryMaskedEmail}</strong>{' '}
                                <span className="text-[11px] text-slate-400">(válido por 30 min)</span>
                              </span>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              2. Token de Segurança (6 dígitos enviados por e-mail) *
                            </label>
                            <input
                              type="text"
                              required
                              maxLength={6}
                              value={recoveryCode}
                              onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="000000"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-base font-mono font-extrabold tracking-widest text-center text-indigo-700"
                            />
                          </div>

                          {/* Password Security Rules Box */}
                          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Regras de Segurança da Nova Senha
                            </span>
                            <ul className="space-y-1 text-xs">
                              {[
                                {
                                  ok: newResetPassword.trim().length >= 6,
                                  label: 'Mínimo de 6 caracteres',
                                },
                                {
                                  ok: /[a-zA-Z]/.test(newResetPassword),
                                  label: 'Pelo menos 1 letra (A-Z)',
                                },
                                {
                                  ok: /\d/.test(newResetPassword),
                                  label: 'Pelo menos 1 número (0-9)',
                                },
                              ].map((rule, rIdx) => (
                                <li
                                  key={rIdx}
                                  className={`flex items-center gap-2 font-medium ${
                                    rule.ok ? 'text-emerald-700 font-bold' : 'text-slate-500'
                                  }`}
                                >
                                  <CheckCircle2
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      rule.ok ? 'text-emerald-600' : 'text-slate-300'
                                    }`}
                                  />
                                  {rule.label}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                3. Nova Senha Segura *
                              </label>
                              <input
                                type="password"
                                required
                                minLength={6}
                                value={newResetPassword}
                                onChange={(e) => setNewResetPassword(e.target.value)}
                                placeholder="Letras e números..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Confirmar Nova Senha *
                              </label>
                              <input
                                type="password"
                                required
                                minLength={6}
                                value={confirmResetPassword}
                                onChange={(e) => setConfirmResetPassword(e.target.value)}
                                placeholder="Repita a nova senha..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={authLoading}
                            style={{ backgroundColor: primaryColor }}
                            className="w-full py-3 rounded-xl text-white text-xs sm:text-sm font-bold shadow-sm hover:opacity-95 cursor-pointer"
                          >
                            {authLoading ? 'Validando Token e Salvando...' : 'Confirmar Nova Senha e Entrar'}
                          </button>
                        </div>
                      )}
                    </form>
                  )}
                </>
              ) : (
                <>
                  {/* LOGGED-IN MENU 1: MEUS PEDIDOS + TELA DE DETALHE DO PEDIDO */}
                  {accountTab === 'orders' && (
                    <div className="space-y-5">
                      {selectedCustomerOrder ? (
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                            <div className="space-y-1">
                              <button
                                type="button"
                                onClick={() => setSelectedCustomerOrder(null)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer mb-1"
                              >
                                <ChevronLeft className="w-4 h-4" />
                                Voltar para Meus Pedidos
                              </button>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                                  Detalhes do Pedido #{selectedCustomerOrder.id}
                                </h2>
                                <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
                                  {selectedCustomerOrder.status_label || selectedCustomerOrder.status}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">
                                Realizado em{' '}
                                {selectedCustomerOrder.created_at
                                  ? new Date(selectedCustomerOrder.created_at).toLocaleString('pt-BR')
                                  : '—'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedCustomerOrder(null)}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                            >
                              ← Lista de Pedidos
                            </button>
                          </div>

                          {/* 1. LINHA DO TEMPO / STATUS DO PEDIDO */}
                          {selectedCustomerOrder.status !== 'CANCELLED' ? (
                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                                Acompanhamento do Pedido
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {[
                                  { key: 'WAITING_PAYMENT', label: 'Aguardando Pagamento' },
                                  { key: 'PAID', label: 'Pago' },
                                  { key: 'SEPARATION', label: 'Em Separação' },
                                  { key: 'FINALIZED', label: 'Finalizado / NF-e' },
                                  { key: 'DELIVERED', label: 'Entregue' },
                                ].map((step, idx, arr) => {
                                  const currentIdx = arr.findIndex(
                                    (s) => s.key === selectedCustomerOrder.status
                                  );
                                  const isDone = currentIdx >= idx;
                                  const isCurrent = currentIdx === idx;
                                  return (
                                    <div
                                      key={step.key}
                                      className={`p-3 rounded-xl border text-left transition-all ${
                                        isCurrent
                                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                                          : isDone
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                          : 'border-slate-200 bg-white text-slate-400'
                                      }`}
                                    >
                                      <span className="block text-[10px] font-bold uppercase opacity-80">
                                        Etapa {idx + 1}
                                      </span>
                                      <span className="block text-xs font-extrabold mt-0.5">
                                        {step.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                              Este pedido encontra-se cancelado.
                            </div>
                          )}

                          {/* 2. PIX COPIA E COLA (SE AGUARDANDO PAGAMENTO) */}
                          {selectedCustomerOrder.status === 'WAITING_PAYMENT' &&
                            selectedCustomerOrder.pix_code && (
                              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-emerald-950">
                                    Pagamento Pendente via PIX ({formatBRL(selectedCustomerOrder.total)})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(selectedCustomerOrder.pix_code);
                                      toast.success('Código PIX copiado!');
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    Copiar PIX Copia e Cola
                                  </button>
                                </div>
                                <div className="p-2.5 rounded-xl bg-white border border-emerald-200 font-mono text-[11px] text-slate-600 break-all">
                                  {selectedCustomerOrder.pix_code}
                                </div>
                              </div>
                            )}

                          {/* 3. ENDEREÇO DE ENTREGA + NOTA FISCAL & RASTREIO */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2 text-xs">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 text-indigo-600" />
                                Endereço de Entrega &amp; Modalidade
                              </h3>
                              <p className="font-bold text-slate-900">
                                {selectedCustomerOrder.customer_name || b2cCustomer.name}
                              </p>
                              {selectedCustomerOrder.shipping_address?.street ? (
                                <p className="text-slate-600 leading-relaxed">
                                  {selectedCustomerOrder.shipping_address.street},{' '}
                                  {selectedCustomerOrder.shipping_address.number}
                                  {selectedCustomerOrder.shipping_address.complement
                                    ? ` - ${selectedCustomerOrder.shipping_address.complement}`
                                    : ''}
                                  <br />
                                  {selectedCustomerOrder.shipping_address.neighborhood} —{' '}
                                  {selectedCustomerOrder.shipping_address.city}/
                                  {selectedCustomerOrder.shipping_address.state}
                                  <br />
                                  <span className="font-mono font-semibold">
                                    CEP: {selectedCustomerOrder.shipping_address.zip_code}
                                  </span>
                                </p>
                              ) : (
                                <p className="text-slate-500">
                                  Endereço cadastrado na conta do cliente.
                                </p>
                              )}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-slate-500">Modalidade de Frete:</span>
                                <span className="font-bold text-slate-800">
                                  {selectedCustomerOrder.freight_service_name || 'Entrega Padrão'}
                                </span>
                              </div>
                            </div>

                            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5 text-xs">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-indigo-600" />
                                Nota Fiscal &amp; Rastreio da Encomenda
                              </h3>

                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">Número da NF-e:</span>
                                  <span className="font-bold text-slate-900 font-mono">
                                    {selectedCustomerOrder.invoice_number || 'Aguardando emissão'}
                                  </span>
                                </div>
                                {selectedCustomerOrder.invoice_key && (
                                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold uppercase text-slate-400">
                                        Chave de Acesso NF-e
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(
                                            selectedCustomerOrder.invoice_key
                                          );
                                          toast.success('Chave da NF-e copiada!');
                                        }}
                                        className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                                      >
                                        Copiar chave
                                      </button>
                                    </div>
                                    <p className="font-mono text-[11px] text-slate-700 break-all">
                                      {selectedCustomerOrder.invoice_key}
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">Transportadora:</span>
                                  <span className="font-bold text-slate-900">
                                    {selectedCustomerOrder.carrier_name ||
                                      selectedCustomerOrder.freight_service_name ||
                                      'Correios / Transportadora'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">Código de Rastreio:</span>
                                  {selectedCustomerOrder.tracking_code ? (
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-extrabold text-indigo-600">
                                        {selectedCustomerOrder.tracking_code}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(
                                            selectedCustomerOrder.tracking_code
                                          );
                                          toast.success('Código de rastreio copiado!');
                                        }}
                                        className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                                        title="Copiar rastreio"
                                      >
                                        <Copy className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">Aguardando postagem</span>
                                  )}
                                </div>

                                {selectedCustomerOrder.tracking_url && (
                                  <a
                                    href={selectedCustomerOrder.tracking_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ backgroundColor: primaryColor }}
                                    className="mt-2 w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Rastrear Encomenda Online
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 4. TABELA DE ITENS DO PEDIDO */}
                          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                                Itens Comprados ({(selectedCustomerOrder.items || []).length})
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="border-b border-slate-100 text-[11px] uppercase text-slate-400">
                                    <th className="py-2.5 px-4">Código / ISBN</th>
                                    <th className="py-2.5 px-4">Produto</th>
                                    <th className="py-2.5 px-4 text-center">Qtd</th>
                                    <th className="py-2.5 px-4 text-right">Unitário</th>
                                    <th className="py-2.5 px-4 text-right">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {(selectedCustomerOrder.items || []).map((it: any) => (
                                    <tr key={it.id} className="hover:bg-slate-50/60">
                                      <td className="py-3 px-4 font-mono text-slate-500">
                                        {it.ean_isbn || it.sku || '—'}
                                      </td>
                                      <td className="py-3 px-4 font-bold text-slate-900">
                                        {it.name}
                                      </td>
                                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                                        {it.quantity}
                                      </td>
                                      <td className="py-3 px-4 text-right text-slate-600">
                                        {formatBRL(it.unit_price)}
                                      </td>
                                      <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                                        {formatBRL(it.total_price)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* 5. RESUMO FINANCEIRO & CUPOM DO PEDIDO */}
                          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white space-y-2.5 text-xs">
                            <div className="flex items-center justify-between text-slate-300">
                              <span>Subtotal dos Produtos:</span>
                              <span className="font-bold">{formatBRL(selectedCustomerOrder.subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300">
                              <span>
                                Frete ({selectedCustomerOrder.freight_service_name || 'Entrega'}):
                              </span>
                              <span className="font-bold text-emerald-400">
                                {Number(selectedCustomerOrder.freight || 0) <= 0
                                  ? 'GRÁTIS (R$ 0,00)'
                                  : formatBRL(selectedCustomerOrder.freight)}
                              </span>
                            </div>
                            {selectedCustomerOrder.discount_applied > 0 && (
                              <div className="flex items-center justify-between text-emerald-400 font-bold">
                                <span>
                                  Desconto Aplicado
                                  {selectedCustomerOrder.coupon_code
                                    ? ` (Cupom ${selectedCustomerOrder.coupon_code})`
                                    : ''}
                                  :
                                </span>
                                <span>- {formatBRL(selectedCustomerOrder.discount_applied)}</span>
                              </div>
                            )}
                            {selectedCustomerOrder.residual_coupon_code && (
                              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-400/40 flex flex-wrap items-center justify-between gap-2 text-amber-200">
                                <span>
                                  Novo Cupom Gerado com Saldo Restante (
                                  <strong>{formatBRL(selectedCustomerOrder.remaining_coupon_balance)}</strong>
                                  ):{' '}
                                  <strong className="font-mono text-white">
                                    {selectedCustomerOrder.residual_coupon_code}
                                  </strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      selectedCustomerOrder.residual_coupon_code
                                    );
                                    toast.success('Cupom residual copiado!');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                                >
                                  Copiar Cupom
                                </button>
                              </div>
                            )}
                            <div className="pt-2.5 border-t border-slate-700 flex items-center justify-between text-sm sm:text-base font-extrabold">
                              <span>Valor Total Pago:</span>
                              <span className="text-emerald-400">
                                {formatBRL(selectedCustomerOrder.total)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                                <Package className="w-5 h-5" style={{ color: primaryColor }} />
                                Meus Pedidos ({myOrders.length})
                              </h2>
                              <p className="text-xs text-slate-500">
                                Clique em qualquer pedido para abrir a tela completa com todos os detalhes, NF-e e rastreio.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => fetchMyOrders(b2cCustomer.cpf)}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                            >
                              Atualizar
                            </button>
                          </div>

                          {loadingMyOrders ? (
                            <div className="py-12 text-center text-xs text-slate-400">
                              Carregando seus pedidos...
                            </div>
                          ) : myOrders.length === 0 ? (
                            <div className="p-8 rounded-2xl border border-dashed border-slate-200 text-center space-y-3">
                              <Package className="w-10 h-10 text-slate-300 mx-auto" />
                              <p className="text-sm font-bold text-slate-700">
                                Você ainda não possui pedidos realizados.
                              </p>
                              <button
                                type="button"
                                onClick={handleResetToHome}
                                style={{ backgroundColor: primaryColor }}
                                className="px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer"
                              >
                                Começar a Comprar
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3.5">
                              {myOrders.map((ord) => (
                                <div
                                  key={ord.id}
                                  onClick={() => setSelectedCustomerOrder(ord)}
                                  className="p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-white transition-all space-y-3 text-xs cursor-pointer shadow-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                                    <div>
                                      <span className="font-extrabold text-slate-900 text-sm">
                                        Pedido #{ord.id}
                                      </span>
                                      <span className="text-slate-400 ml-2.5">
                                        {ord.created_at
                                          ? new Date(ord.created_at).toLocaleString('pt-BR')
                                          : ''}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                                        {ord.status_label}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedCustomerOrder(ord);
                                        }}
                                        style={{ backgroundColor: primaryColor }}
                                        className="px-3 py-1 rounded-xl text-white font-bold text-xs cursor-pointer"
                                      >
                                        Ver Detalhes →
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    {(ord.items || []).map((it: any) => (
                                      <div key={it.id} className="flex justify-between text-slate-700">
                                        <span>
                                          <strong>{it.quantity}x</strong> {it.name}
                                        </span>
                                        <span className="font-bold">{formatBRL(it.total_price)}</span>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                                      {ord.invoice_number && (
                                        <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                                          <strong>NF-e:</strong> {ord.invoice_number}
                                        </span>
                                      )}
                                      {ord.tracking_code && (
                                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-bold">
                                          🚚 Rastreio: {ord.tracking_code}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      {ord.discount_applied > 0 && (
                                        <span className="text-[11px] text-emerald-600 font-bold mr-3">
                                          Desconto: - {formatBRL(ord.discount_applied)}
                                        </span>
                                      )}
                                      <span className="font-extrabold text-sm text-slate-900">
                                        Total Pago: {formatBRL(ord.total)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* LOGGED-IN MENU 2: MEUS CUPONS */}
                  {accountTab === 'coupons' && (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                            <Ticket className="w-5 h-5" style={{ color: primaryColor }} />
                            Meus Cupons e Saldos
                          </h2>
                          <p className="text-xs text-slate-500">
                            Consulte seus cupons disponíveis, saldos residuais e histórico de utilização.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => fetchMyCoupons(b2cCustomer.cpf, b2cCustomer.email)}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Atualizar
                        </button>
                      </div>

                      {loadingMyCoupons ? (
                        <div className="py-10 text-center text-xs text-slate-400">
                          Consultando seus cupons...
                        </div>
                      ) : myCoupons.length === 0 ? (
                        <div className="p-8 rounded-2xl border border-dashed border-slate-200 text-center space-y-2">
                          <Ticket className="w-9 h-9 text-slate-300 mx-auto" />
                          <p className="text-sm font-bold text-slate-700">
                            Nenhum cupom nominal vinculado diretamente ao seu CPF no momento.
                          </p>
                          <p className="text-xs text-slate-500">
                            Se você recebeu um código promocional, pode digitá-lo diretamente na sua Sacola de Compras!
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {myCoupons.map((cp) => {
                            const isAvailable =
                              cp.status === 'AVAILABLE' ||
                              (cp.status === 'PARTIALLY_USED' && Number(cp.current_balance) > 0);
                            return (
                              <div
                                key={cp.id}
                                className={`p-4 rounded-2xl border space-y-2.5 ${
                                  isAvailable
                                    ? 'border-emerald-200 bg-emerald-50/40'
                                    : 'border-slate-200 bg-slate-50 opacity-75'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-black text-base text-slate-900">
                                    {cp.code}
                                  </span>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                      isAvailable
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {isAvailable ? 'Disponível' : 'Utilizado'}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-700 space-y-0.5">
                                  <p>
                                    Saldo Disponível:{' '}
                                    <strong className="text-emerald-700">
                                      {cp.discount_type === 'PERCENTAGE'
                                        ? `${cp.initial_value}% OFF`
                                        : formatBRL(cp.current_balance)}
                                    </strong>
                                  </p>
                                  {cp.allows_freight_discount && (
                                    <p className="text-[11px] font-bold text-indigo-600">
                                      ✓ Inclui Frete Grátis
                                    </p>
                                  )}
                                  {cp.valid_until && (
                                    <p className="text-[11px] text-slate-400">
                                      Válido até {cp.valid_until}
                                    </p>
                                  )}
                                </div>
                                {isAvailable && (
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCouponCode(cp.code);
                                        setCouponCpf(b2cCustomer.cpf || '');
                                        navigator.clipboard.writeText(cp.code);
                                        toast.success(`Cupom ${cp.code} copiado e preenchido na sacola!`);
                                      }}
                                      style={{ backgroundColor: primaryColor }}
                                      className="flex-1 py-2 rounded-xl text-white text-xs font-bold cursor-pointer"
                                    >
                                      Usar na Sacola
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {myRedemptions.length > 0 && (
                        <div className="space-y-2.5 pt-3 border-t border-slate-100">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Histórico de Cupons Utilizados
                          </h3>
                          <div className="space-y-2">
                            {myRedemptions.map((r) => (
                              <div
                                key={r.id}
                                className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <span className="font-mono font-bold text-slate-900">
                                    {r.coupon_code}
                                  </span>
                                  <span className="text-slate-500 ml-2">
                                    Pedido #{r.order_id}
                                  </span>
                                  {r.residual_coupon_code && (
                                    <span className="block text-[11px] text-amber-700 font-bold mt-0.5">
                                      Gerou cupom residual: {r.residual_coupon_code} (
                                      {formatBRL(r.remaining_balance)})
                                    </span>
                                  )}
                                </div>
                                <span className="font-bold text-emerald-700">
                                  Desconto: - {formatBRL(r.discount_applied)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* LOGGED-IN MENU 3: MEUS DADOS E ENDEREÇO */}
                  {accountTab === 'profile' && (
                    <form onSubmit={handleSaveCustomerProfile} className="space-y-5 max-w-2xl">
                      <div className="border-b border-slate-100 pb-3">
                        <h2 className="text-lg font-extrabold text-slate-900">
                          Meus Dados Pessoais e Endereço
                        </h2>
                        <p className="text-xs text-slate-500">
                          Mantenha seus dados e endereço de entrega atualizados para agilizar suas compras.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Nome Completo *
                          </label>
                          <input
                            type="text"
                            required
                            value={customerForm.name}
                            onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">CPF</label>
                          <input
                            type="text"
                            disabled
                            value={b2cCustomer.cpf}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-sm font-mono text-slate-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            WhatsApp / Telefone *
                          </label>
                          <input
                            type="text"
                            required
                            value={customerForm.phone}
                            onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-slate-700 mb-1">E-mail *</label>
                          <input
                            type="email"
                            required
                            value={customerForm.email}
                            onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Endereço de Entrega
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">CEP</label>
                            <input
                              type="text"
                              value={zipCode}
                              onChange={(e) => setZipCode(e.target.value)}
                              onBlur={() => zipCode.replace(/\D/g, '').length === 8 && handleCalculateFreight(zipCode)}
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Rua / Logradouro
                            </label>
                            <input
                              type="text"
                              value={customerForm.street}
                              onChange={(e) => setCustomerForm({ ...customerForm, street: e.target.value })}
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Número</label>
                            <input
                              type="text"
                              value={customerForm.number}
                              onChange={(e) => setCustomerForm({ ...customerForm, number: e.target.value })}
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Complemento
                            </label>
                            <input
                              type="text"
                              value={customerForm.complement}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, complement: e.target.value })
                              }
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Bairro</label>
                            <input
                              type="text"
                              value={customerForm.neighborhood}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, neighborhood: e.target.value })
                              }
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Cidade</label>
                            <input
                              type="text"
                              value={customerForm.city}
                              onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">UF</label>
                            <input
                              type="text"
                              maxLength={2}
                              value={customerForm.state}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, state: e.target.value.toUpperCase() })
                              }
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm uppercase font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={savingProfile}
                        style={{ backgroundColor: primaryColor }}
                        className="px-6 py-3 rounded-xl text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer"
                      >
                        {savingProfile ? 'Salvando...' : 'Salvar Meus Dados'}
                      </button>
                    </form>
                  )}

                  {/* LOGGED-IN MENU 4: RESETAR / ALTERAR SENHA */}
                  {accountTab === 'security' && (
                    <div className="space-y-6 max-w-md">
                      <div className="border-b border-slate-100 pb-3">
                        <h2 className="text-lg font-extrabold text-slate-900">
                          Alterar ou Resetar Minha Senha
                        </h2>
                        <p className="text-xs text-slate-500">
                          Defina uma nova senha diretamente abaixo ou solicite um código de verificação por e-mail.
                        </p>
                      </div>

                      <form onSubmit={handleSaveCustomerProfile} className="space-y-3.5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Nova Senha Segura (mínimo 6 caracteres) *
                          </label>
                          <input
                            type="password"
                            required
                            minLength={6}
                            value={directNewPassword}
                            onChange={(e) => setDirectNewPassword(e.target.value)}
                            placeholder="Digite sua nova senha..."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={savingProfile}
                          style={{ backgroundColor: primaryColor }}
                          className="px-6 py-2.5 rounded-xl text-white text-xs font-bold shadow-sm cursor-pointer"
                        >
                          {savingProfile ? 'Atualizando...' : 'Atualizar Minha Senha'}
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      )}

      {/* =======================================================================
          VIEW 2C: DEDICATED CATEGORY & SEARCH PAGE (/categoria/[slug], /ofertas, /busca)
          WITH CUSTOMIZABLE TOP BANNER, DESCRIPTION & LEFT SIDEBAR FILTERS
         ======================================================================= */}
      {activeView === 'category' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6 pb-20">
          {/* Breadcrumb & Back */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleResetToHome()}
                className="hover:text-slate-900 font-semibold cursor-pointer"
              >
                Início
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Categorias</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 font-extrabold">
                {selectedCategoryObj?.label || selectedCategoryLabel || 'Acervo'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Link desta página copiado!');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar Link
              </button>
              <button
                type="button"
                onClick={() => handleResetToHome()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar à Home
              </button>
            </div>
          </div>

          {/* Customizable Category Top Banner + Headline + Editorial Description */}
          <div
            className="relative rounded-3xl overflow-hidden text-white p-6 sm:p-10 shadow-sm border border-slate-200/20"
            style={{
              backgroundColor: secondaryColor,
              backgroundImage: selectedCategoryObj?.banner_url
                ? `linear-gradient(to right, rgba(15,23,42,0.92), rgba(15,23,42,0.45)), url(${getImageUrl(selectedCategoryObj.banner_url)})`
                : `linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="max-w-3xl space-y-2.5">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider text-white shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                <FolderTree className="w-3.5 h-3.5" />
                {onlyPromoFilter ? 'Promoções Ativas' : 'Departamento / Categoria'}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
                {selectedCategoryObj?.headline ||
                  selectedCategoryObj?.label ||
                  selectedCategoryLabel ||
                  'Catálogo da Categoria'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-2xl">
                {selectedCategoryObj?.description ||
                  `Explore nossa curadoria completa em ${
                    selectedCategoryObj?.label || selectedCategoryLabel || 'nosso acervo'
                  }. Utilize os filtros à esquerda para refinar por editora, autor, características da edição ou faixa de preço.`}
              </p>
            </div>
          </div>

          {/* Mobile Filter Toggle Bar */}
          <div className="flex lg:hidden items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              style={{ backgroundColor: primaryColor }}
              className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <FolderTree className="w-3.5 h-3.5" />
              {mobileFiltersOpen ? 'Ocultar Filtros' : 'Filtrar Resultados'}
            </button>

            <select
              value={catalogSortBy}
              onChange={(e) => {
                const nextSort = e.target.value;
                setCatalogSortBy(nextSort);
                fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, { sortBy: nextSort });
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"
            >
              <option value="default">Ordenar: Relevância</option>
              <option value="price_asc">Menor Preço</option>
              <option value="price_desc">Maior Preço</option>
              <option value="name_asc">Título (A - Z)</option>
            </select>
          </div>

          {/* 2-Column Layout: Left Rich Sidebar Filters (lg:col-span-3) + Right Catalog Grid (lg:col-span-9) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <aside
              className={`${
                mobileFiltersOpen ? 'block' : 'hidden lg:block'
              } lg:col-span-3 bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-5 lg:sticky lg:top-24`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                  Filtros da Página
                </h3>
                {(sidebarBrand ||
                  sidebarAuthor ||
                  sidebarCharacteristic ||
                  sidebarPriceRange !== 'ALL' ||
                  sidebarInStockOnly ||
                  onlyPromoFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      resetSidebarFiltersState();
                      setOnlyPromoFilter(false);
                      fetchCatalog(searchQuery, searchFilter, 0, false, {
                        brand: '',
                        author: '',
                        characteristic: '',
                        priceRange: 'ALL',
                        inStock: false,
                        sortBy: 'default',
                      });
                    }}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>

              {/* 1. Disponibilidade & Ofertas */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Disponibilidade &amp; Ofertas
                </span>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sidebarInStockOnly}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSidebarInStockOnly(checked);
                      fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                        inStock: checked,
                      });
                    }}
                    className="rounded text-indigo-600"
                  />
                  <span>Apenas itens em estoque</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyPromoFilter}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setOnlyPromoFilter(checked);
                      fetchCatalog(searchQuery, searchFilter, 0, checked);
                    }}
                    className="rounded text-rose-600"
                  />
                  <span>Apenas em promoção</span>
                </label>
              </div>

              {/* 2. Faixa de Preço */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Faixa de Preço
                </span>
                <div className="space-y-1">
                  {[
                    { id: 'ALL', label: 'Todos os preços' },
                    { id: 'UP_TO_40', label: 'Até R$ 40,00' },
                    { id: '40_TO_80', label: 'De R$ 40,00 a R$ 80,00' },
                    { id: 'OVER_80', label: 'Acima de R$ 80,00' },
                  ].map((pr) => {
                    const active = sidebarPriceRange === pr.id;
                    return (
                      <button
                        key={pr.id}
                        type="button"
                        onClick={() => {
                          setSidebarPriceRange(pr.id as any);
                          fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                            priceRange: pr.id as any,
                          });
                        }}
                        style={
                          active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : undefined
                        }
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          active ? 'font-extrabold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pr.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Editoras / Selos */}
              {catalogFacets.brands.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Editoras / Marcas
                  </span>
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                    {catalogFacets.brands.map((bName) => {
                      const isSel = sidebarBrand.toLowerCase() === bName.toLowerCase();
                      return (
                        <button
                          key={bName}
                          type="button"
                          onClick={() => {
                            const nextB = isSel ? '' : bName;
                            setSidebarBrand(nextB);
                            fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                              brand: nextB,
                            });
                          }}
                          style={
                            isSel
                              ? { backgroundColor: primaryColor, color: '#ffffff' }
                              : undefined
                          }
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs truncate transition-colors cursor-pointer ${
                            isSel ? 'font-bold shadow-2xs' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {bName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Autores */}
              {catalogFacets.authors.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Autores
                  </span>
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                    {catalogFacets.authors.map((aName) => {
                      const isSel = sidebarAuthor.toLowerCase() === aName.toLowerCase();
                      return (
                        <button
                          key={aName}
                          type="button"
                          onClick={() => {
                            const nextA = isSel ? '' : aName;
                            setSidebarAuthor(nextA);
                            fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                              author: nextA,
                            });
                          }}
                          style={
                            isSel
                              ? { backgroundColor: primaryColor, color: '#ffffff' }
                              : undefined
                          }
                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs truncate transition-colors cursor-pointer ${
                            isSel ? 'font-bold shadow-2xs' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {aName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Características Físicas / Editoriais */}
              {Object.keys(catalogFacets.characteristics || {}).length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  {Object.entries(catalogFacets.characteristics).map(([charGroup, values]) => (
                    <div key={charGroup} className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        {charGroup}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {(values || []).map((val) => {
                          const token = `${charGroup}:${val}`;
                          const isSel = sidebarCharacteristic.toLowerCase() === token.toLowerCase();
                          return (
                            <button
                              key={token}
                              type="button"
                              onClick={() => {
                                const nextC = isSel ? '' : token;
                                setSidebarCharacteristic(nextC);
                                fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                                  characteristic: nextC,
                                });
                              }}
                              style={
                                isSel
                                  ? { backgroundColor: primaryColor, color: '#ffffff' }
                                  : undefined
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                isSel
                                  ? 'border-transparent shadow-2xs'
                                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 6. Navegar entre Outras Categorias */}
              {effectiveCategories.length > 0 && (
                <div className="space-y-1.5 pt-3 border-t border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Todas as Categorias
                  </span>
                  {effectiveCategories.map((cat: any) => {
                    const isCurr = selectedCategoryId === cat.id;
                    return (
                      <button
                        key={`side-cat-${cat.id}`}
                        type="button"
                        onClick={() =>
                          handleSelectCategory(
                            cat.id,
                            cat.label,
                            cat.code,
                            cat.filter_type || 'COD_GENERO',
                            false,
                            cat
                          )
                        }
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isCurr
                            ? 'bg-slate-900 text-white font-bold'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{cat.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            {/* Right Column: Sorting Bar + Active Filter Pills + Products Grid */}
            <div className="lg:col-span-9 space-y-5">
              <div className="hidden lg:flex items-center justify-between gap-4 bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-xs text-slate-600">
                  Exibindo <strong>{products.length}</strong> de{' '}
                  <strong>{Math.max(products.length, totalItemsCount)}</strong> obras encontradas
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Ordenar por:</span>
                  <select
                    value={catalogSortBy}
                    onChange={(e) => {
                      const nextSort = e.target.value;
                      setCatalogSortBy(nextSort);
                      fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                        sortBy: nextSort,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="default">Mais Relevantes</option>
                    <option value="price_asc">Menor Preço</option>
                    <option value="price_desc">Maior Preço</option>
                    <option value="name_asc">Ordem Alfabética (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Active Filters Bar */}
              {(sidebarBrand ||
                sidebarAuthor ||
                sidebarCharacteristic ||
                sidebarPriceRange !== 'ALL' ||
                sidebarInStockOnly) && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500">Filtros ativos:</span>
                  {sidebarBrand && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200">
                      Editora: {sidebarBrand}
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarBrand('');
                          fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                            brand: '',
                          });
                        }}
                        className="ml-1 hover:text-rose-600 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {sidebarAuthor && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200">
                      Autor: {sidebarAuthor}
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarAuthor('');
                          fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                            author: '',
                          });
                        }}
                        className="ml-1 hover:text-rose-600 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {sidebarCharacteristic && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200">
                      {sidebarCharacteristic}
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarCharacteristic('');
                          fetchCatalog(searchQuery, searchFilter, 0, onlyPromoFilter, {
                            characteristic: '',
                          });
                        }}
                        className="ml-1 hover:text-rose-600 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
              )}

              {loadingCatalog ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
                  {Array.from({ length: 6 }).map((_, idx) => (
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
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
                  <h3 className="text-base font-bold text-slate-800">
                    Nenhum livro encontrado com estes filtros
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Tente remover alguns filtros laterais ou explorar outra categoria da loja.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetSidebarFiltersState();
                      fetchCatalog(searchQuery, searchFilter, 0, false, {
                        brand: '',
                        author: '',
                        characteristic: '',
                        priceRange: 'ALL',
                        inStock: false,
                        sortBy: 'default',
                      });
                    }}
                    style={{ backgroundColor: primaryColor }}
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer"
                  >
                    Limpar Filtros da Categoria
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
                  {products.map((prod) => renderProductCard(prod, 'catpage'))}
                </div>
              )}

              {/* Pagination inside Category Page */}
              {!loadingCatalog && products.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-4">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => handleGoToPage(currentPage - 1)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    « Anterior
                  </button>
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
            </div>
          </div>
        </main>
      )}

      {/* =======================================================================
          VIEW 2D: DEDICATED SPECIFIC SHOWCASE PAGE (/vitrine/[slug])
         ======================================================================= */}
      {activeView === 'showcase' && selectedShowcaseObj && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-6 pb-20">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleResetToHome()}
                className="hover:text-slate-900 font-semibold cursor-pointer"
              >
                Início
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Vitrines</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 font-extrabold">{selectedShowcaseObj.title}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success('Link exclusivo da vitrine copiado!');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Compartilhar Vitrine
              </button>
              <button
                type="button"
                onClick={() => handleResetToHome()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar à Home
              </button>
            </div>
          </div>

          {/* Showcase Header Banner */}
          <div
            className="relative rounded-3xl overflow-hidden text-white p-6 sm:p-10 shadow-sm"
            style={{
              backgroundColor: secondaryColor,
              backgroundImage: selectedShowcaseObj.banner_url
                ? `linear-gradient(to right, rgba(15,23,42,0.92), rgba(15,23,42,0.45)), url(${getImageUrl(selectedShowcaseObj.banner_url)})`
                : `linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="max-w-3xl space-y-2.5">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {selectedShowcaseObj.badge || 'Vitrine Especial'}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
                {selectedShowcaseObj.title}
              </h1>
              {(selectedShowcaseObj.description || selectedShowcaseObj.subtitle) && (
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed max-w-2xl">
                  {selectedShowcaseObj.description || selectedShowcaseObj.subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
            {(selectedShowcaseObj.items || []).map((prod: any) =>
              renderProductCard(prod, `sc-page-${selectedShowcaseObj.id}`)
            )}
          </div>
        </main>
      )}

      {/* =======================================================================
          VIEW 2E: DEDICATED SEPARATED CHECKOUT PAGE (/checkout)
         ======================================================================= */}
      {activeView === 'checkout' && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-6 pb-20">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl font-black text-slate-900">
                  Finalização Segura da Compra
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  Ambiente criptografado ponta a ponta • Seus dados estão protegidos
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleResetToHome()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Continuar Comprando
            </button>
          </div>

          {checkoutStep === 'success' && orderResult ? (
            <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-5 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase text-emerald-600">
                  Pedido #{orderResult.order_id} • {orderResult.status_label || orderResult.status}
                </span>
                <h2 className="text-xl font-black text-slate-900 mt-1">{orderResult.message}</h2>
              </div>

              {orderResult.vindi_payment_url && orderResult.difference_to_pay > 0 && (
                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left space-y-3">
                  <p className="text-xs font-bold text-indigo-950">
                    Pagamento Online Seguro ({formatBRL(orderResult.difference_to_pay)}):
                  </p>
                  <p className="text-xs text-indigo-800">
                    Clique no botão abaixo caso não tenha sido redirecionado automaticamente para concluir seu pagamento:
                  </p>
                  <a
                    href={orderResult.vindi_payment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ir para o Ambiente Seguro de Pagamento
                  </a>
                </div>
              )}

              {orderResult.checkout_mode === 'NATIVE_GATEWAY' &&
                orderResult.difference_to_pay > 0 &&
                orderResult.pix_code && (
                  <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-left space-y-2.5">
                    <p className="text-xs font-bold text-slate-900">
                      Pagamento via PIX ({formatBRL(orderResult.difference_to_pay)}):
                    </p>
                    {orderResult.pix_qr_code_url && (
                      <img
                        src={orderResult.pix_qr_code_url}
                        alt="QR Code PIX"
                        className="w-44 h-44 mx-auto rounded-xl border border-slate-200 bg-white"
                      />
                    )}
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-[11px] break-all text-slate-600">
                      {orderResult.pix_code}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(orderResult.pix_code);
                        toast.success('Código PIX Copia e Cola copiado!');
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copiar Código PIX
                    </button>
                  </div>
                )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutStep('cart');
                    setOrderResult(null);
                    openAccountScreen('orders');
                  }}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
                >
                  Acompanhar em Meus Pedidos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutStep('cart');
                    setOrderResult(null);
                    handleResetToHome();
                  }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Voltar para a Loja
                </button>
              </div>
            </div>
          ) : cart.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
              <h2 className="text-lg font-extrabold text-slate-800">Sua sacola está vazia</h2>
              <p className="text-xs text-slate-500">
                Adicione produtos à sua sacola antes de prosseguir para o checkout.
              </p>
              <button
                type="button"
                onClick={() => handleResetToHome()}
                style={{ backgroundColor: primaryColor }}
                className="px-5 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer"
              >
                Explorar Catálogo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Customer Identification + Address + Payment */}
              <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-xs">
                <form
                  onSubmit={handleFinalizeCheckout}
                  data-yapay="payment-form"
                  className="space-y-5"
                >
                  {isVindiExpressLink ? (
                    <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          <User className="w-4 h-4 text-indigo-600" />
                          Identificação Rápida do Cliente
                        </span>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                          Sem Redigitação
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Preencha apenas seus <strong>dados básicos de contato</strong> abaixo para acompanhamento do pedido. Eles já serão enviados <strong>pré-preenchidos automaticamente</strong> para a próxima etapa de pagamento seguro.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Seu CPF *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="000.000.000-00"
                            value={customerForm.cpf || couponCpf}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomerForm({ ...customerForm, cpf: val });
                              setCouponCpf(val);
                              handleAutoLookupByCpf(val);
                            }}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-300 bg-white text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            WhatsApp / Celular *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="(11) 99999-9999"
                            value={customerForm.phone}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, phone: e.target.value })
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Nome Completo *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Seu nome completo"
                            value={customerForm.name}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, name: e.target.value })
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            E-mail *
                          </label>
                          <input
                            type="email"
                            required
                            placeholder="seu@email.com.br"
                            value={customerForm.email}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, email: e.target.value })
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                          1. Dados Pessoais
                        </h3>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Nome Completo *
                          </label>
                          <input
                            type="text"
                            required
                            value={customerForm.name}
                            onChange={(e) =>
                              setCustomerForm({ ...customerForm, name: e.target.value })
                            }
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
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
                                const val = e.target.value;
                                setCustomerForm({ ...customerForm, cpf: val });
                                setCouponCpf(val);
                                handleAutoLookupByCpf(val);
                              }}
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              WhatsApp / Celular *
                            </label>
                            <input
                              type="text"
                              required
                              value={customerForm.phone}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, phone: e.target.value })
                              }
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              E-mail *
                            </label>
                            <input
                              type="email"
                              required
                              value={customerForm.email}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, email: e.target.value })
                              }
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                            />
                          </div>
                          {!b2cCustomer && (
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Criar Senha de Acesso *
                              </label>
                              <input
                                type="password"
                                required={!b2cCustomer}
                                minLength={6}
                                value={customerForm.password}
                                onChange={(e) =>
                                  setCustomerForm({ ...customerForm, password: e.target.value })
                                }
                                placeholder="Mínimo 6 caracteres"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 pt-4 border-t border-slate-100">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                          2. Endereço de Entrega
                        </h3>
                        <div className="grid grid-cols-3 gap-2.5">
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
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Rua / Logradouro *
                            </label>
                            <input
                              type="text"
                              required
                              value={customerForm.street}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, street: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Número *
                            </label>
                            <input
                              type="text"
                              required
                              value={customerForm.number}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, number: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Complemento
                            </label>
                            <input
                              type="text"
                              value={customerForm.complement}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, complement: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Bairro *
                            </label>
                            <input
                              type="text"
                              required
                              value={customerForm.neighborhood}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, neighborhood: e.target.value })
                              }
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Cidade *
                            </label>
                            <input
                              type="text"
                              required
                              value={customerForm.city}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, city: e.target.value })
                              }
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
                                setCustomerForm({
                                  ...customerForm,
                                  state: e.target.value.toUpperCase(),
                                })
                              }
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs uppercase font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* LGPD Consent */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
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

                  <button
                    type="submit"
                    disabled={submittingCheckout}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    {submittingCheckout ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando seu Pedido...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Finalizar Pedido ({formatBRL(differenceToPay)})
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column: Order Summary, Coupon & Freight */}
              <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
                <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-xs">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Resumo do Pedido ({cart.reduce((a, b) => a + b.quantity, 0)} itens)
                  </h3>
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={`chk-${item.sku}`}
                        className="flex items-center justify-between gap-2 text-xs border-b border-slate-100 pb-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 truncate">{item.name}</p>
                          <p className="text-[11px] text-slate-400">Qtd: {item.quantity}</p>
                        </div>
                        <span className="font-extrabold text-slate-900">
                          {formatBRL(item.unit_price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Coupon Box inside Dedicated Checkout */}
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <Ticket className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                      Cupom de Desconto ou Vale-Livro
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        placeholder="CÓDIGO DO CUPOM"
                        className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-mono uppercase"
                      />
                      <button
                        type="button"
                        disabled={validatingCoupon}
                        onClick={() => handleValidateCoupon(false)}
                        style={{ backgroundColor: primaryColor }}
                        className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold cursor-pointer"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Subtotal:</span>
                      <span>{formatBRL(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Frete:</span>
                      <span>
                        {freightValue === 0 &&
                        (selectedFreight || couponResult?.allows_freight_discount)
                          ? 'GRÁTIS'
                          : formatBRL(freightValue)}
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
                </div>
              </div>
            </div>
          )}
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
                    <h2
                      onClick={() => handleSelectShowcase(sc)}
                      className="text-lg sm:text-xl font-extrabold text-slate-900 hover:underline cursor-pointer"
                    >
                      {String(sc.title || '').replace(/\s*&\s*/g, ' e ')}
                    </h2>
                    {sc.subtitle && <p className="text-xs text-slate-500">{sc.subtitle}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectShowcase(sc)}
                    style={{ color: primaryColor }}
                    className="inline-flex items-center gap-1 text-xs font-extrabold hover:underline self-start sm:self-auto cursor-pointer"
                  >
                    Ver Vitrine Completa
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
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
                Clique na capa para abrir a página exclusiva da obra ou em Comprar para compra rápida.
              </p>
            </div>
            {(searchQuery || onlyPromoFilter || selectedCategoryId !== 'ALL') && (
              <button
                onClick={() => handleResetToHome()}
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
                onClick={() => handleResetToHome()}
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
                        cat.filter_type || 'COD_GENERO',
                        false,
                        cat
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
                  onClick={() => openContactPage()}
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
                  {checkoutStep === 'register' && 'Checkout'}
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
                    {/* Items List clearly separated with header */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                          Itens na sua sacola ({cart.reduce((a, b) => a + b.quantity, 0)})
                        </span>
                        <span className="text-[11px] font-bold text-slate-700">
                          Subtotal: {formatBRL(subtotal)}
                        </span>
                      </div>

                      {cart.map((item) => (
                        <div
                          key={item.sku}
                          className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 bg-white shadow-2xs"
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
                        onClick={() => openDedicatedCheckoutPage(true)}
                        style={{ backgroundColor: primaryColor }}
                        className="w-full py-3.5 rounded-2xl hover:opacity-95 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                      >
                        Ir para Pagamento
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

                    {/* Smart Cross-Sell Suggestions clearly separated below Action Buttons */}
                    {cartSuggestions.length > 0 && (
                      <div className="pt-3 border-t border-dashed border-slate-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                            Aproveite e leve também
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            Sugestões do mesmo autor/acervo
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {cartSuggestions.slice(0, 2).map((sug) => {
                            const sugCover = resolveProductCover(sug);
                            return (
                              <div
                                key={`cart-sug-${sug.sku || sug.ean_gtin}`}
                                className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-2.5"
                              >
                                <div
                                  onClick={() => {
                                    setIsCartOpen(false);
                                    openProductPage(sug);
                                  }}
                                  className="w-9 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                                >
                                  {sugCover ? (
                                    <img
                                      src={sugCover}
                                      alt={sug.name}
                                      className="max-h-full max-w-full object-contain"
                                      onError={(e) => handleCoverImgError(e, sug)}
                                    />
                                  ) : (
                                    <BookOpen className="w-4 h-4 text-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-800 truncate">
                                    {sug.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {sug.author || sug.brand || 'Disponível em estoque'}
                                  </p>
                                  <p className="text-xs font-extrabold text-emerald-700">
                                    {formatBRL(sug.promotional_price ?? sug.base_price)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => addToCart(sug, 1)}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-[11px] font-bold transition-colors shrink-0 cursor-pointer"
                                >
                                  + Adicionar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 2: SMART IDENTIFICATION + DELIVERY + PAYMENT + LGPD */}
            {checkoutStep === 'register' && (
              <form
                onSubmit={handleFinalizeCheckout}
                data-yapay="payment-form"
                className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4"
              >
                <button
                  type="button"
                  onClick={() => setCheckoutStep('cart')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  ← Revisar Sacola ({cart.reduce((a, b) => a + b.quantity, 0)} itens • {formatBRL(subtotal)})
                </button>

                {/* 1. CUSTOMER IDENTIFICATION: MODO EXPRESS LINK (CPF + NOME + EMAIL + TEL) vs CADASTRO COMPLETO */}
                {isVindiExpressLink ? (
                  <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-indigo-600" />
                        Identificação Rápida do Cliente
                      </span>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                        Sem Redigitação
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Preencha seus <strong>dados básicos de contato</strong> abaixo para acompanhar seu pedido na loja. Eles já serão enviados <strong>pré-preenchidos automaticamente</strong> para o ambiente seguro de pagamento na próxima etapa.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Seu CPF *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="000.000.000-00"
                          value={customerForm.cpf || couponCpf}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomerForm({ ...customerForm, cpf: val });
                            setCouponCpf(val);
                            handleAutoLookupByCpf(val);
                          }}
                          className="w-full px-3.5 py-2 rounded-xl border border-indigo-300 bg-white text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          WhatsApp / Celular *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="(11) 99999-9999"
                          value={customerForm.phone}
                          onChange={(e) =>
                            setCustomerForm({ ...customerForm, phone: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Seu nome completo"
                        value={customerForm.name}
                        onChange={(e) =>
                          setCustomerForm({ ...customerForm, name: e.target.value })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        E-mail *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="seu@email.com.br"
                        value={customerForm.email}
                        onChange={(e) =>
                          setCustomerForm({ ...customerForm, email: e.target.value })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {!b2cCustomer ? (
                      <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-indigo-600" />
                            Já tem cadastro?
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Informe seu <strong>E-mail ou CPF</strong> para preencher seus dados automaticamente, ou preencha abaixo.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={identityInput}
                            onChange={(e) => {
                              setIdentityInput(e.target.value);
                              setIdentityChecked(false);
                            }}
                            placeholder="Seu E-mail ou CPF..."
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                          />
                          <button
                            type="button"
                            disabled={identityChecking}
                            onClick={() => handleCheckIdentity()}
                            style={{ backgroundColor: primaryColor }}
                            className="px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer shrink-0"
                          >
                            {identityChecking ? 'Verificando...' : 'Continuar'}
                          </button>
                        </div>

                        {identityChecked && identityExists && identityHasPassword && (
                          <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-2.5">
                            <p className="text-xs font-bold text-slate-800">
                              Olá, <span className="text-indigo-600">{identityCustomerName}</span>! Encontramos seu cadastro. Confirme sua senha para carregar seu endereço:
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                placeholder="Sua senha..."
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                              />
                              <button
                                type="button"
                                disabled={authLoading}
                                onClick={() => handleCustomerLogin()}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                              >
                                {authLoading ? '...' : 'Entrar'}
                              </button>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCartOpen(false);
                                  openAccountScreen('recovery');
                                  handleForgotPassword();
                                }}
                                className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                              >
                                Esqueci minha senha (receber código por e-mail)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-emerald-900 block">
                            ✓ Conectado como {b2cCustomer.name}
                          </span>
                          <span className="text-[11px] text-emerald-700 font-mono">
                            CPF: {b2cCustomer.cpf} • {b2cCustomer.email}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleLogoutCustomer}
                          className="text-[11px] font-bold text-slate-500 hover:text-rose-600 underline cursor-pointer"
                        >
                          Trocar conta
                        </button>
                      </div>
                    )}

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
                              const val = e.target.value;
                              setCustomerForm({ ...customerForm, cpf: val });
                              setCouponCpf(val);
                              handleAutoLookupByCpf(val);
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        {!b2cCustomer && (
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Criar Senha de Acesso *
                            </label>
                            <input
                              type="password"
                              required={!b2cCustomer}
                              minLength={6}
                              value={customerForm.password}
                              onChange={(e) =>
                                setCustomerForm({ ...customerForm, password: e.target.value })
                              }
                              placeholder="Mínimo 6 caracteres"
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                            />
                          </div>
                        )}
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
                  </>
                )}

                {/* Payment Method Selection */}
                {differenceToPay > 0.009 &&
                  !(storeInfo?.b2c_checkout_mode === 'TRAY_REDIRECT' && storeInfo?.tray_enabled) &&
                  isVindiPaymentLinkMode && (
                    <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-indigo-600" />
                          Pagamento Online Seguro ({formatBRL(differenceToPay)})
                        </span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                          PIX • Cartão • Boleto
                        </span>
                      </div>
                      <p className="text-[11px] text-indigo-800">
                        Ao clicar em finalizar, você será direcionado ao nosso ambiente seguro de pagamento para escolher entre PIX, Cartão de Crédito ou Boleto.
                      </p>
                    </div>
                  )}

                {differenceToPay > 0.009 &&
                  !(storeInfo?.b2c_checkout_mode === 'TRAY_REDIRECT' && storeInfo?.tray_enabled) &&
                  !isVindiPaymentLinkMode && (
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Forma de Pagamento ({formatBRL(differenceToPay)})
                        </h4>
                        <span className="text-[10px] font-bold text-emerald-600">
                          Ambiente 100% Seguro
                        </span>
                      </div>

                      <div
                        className={`grid ${
                          storeInfo?.b2c_method_providers?.BOLETO ? 'grid-cols-3' : 'grid-cols-2'
                        } gap-2.5`}
                      >
                        {(!storeInfo?.b2c_method_providers ||
                          Object.keys(storeInfo.b2c_method_providers).length === 0 ||
                          storeInfo?.b2c_method_providers?.PIX) && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('PIX')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              paymentMethod === 'PIX'
                                ? 'border-emerald-600 bg-emerald-50/60 font-bold text-emerald-950'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <span className="block text-xs font-extrabold">PIX Instantâneo</span>
                            <span className="block text-[10px] text-slate-500">
                              Liberação Imediata • QR Code
                            </span>
                          </button>
                        )}

                        {(!storeInfo?.b2c_method_providers ||
                          Object.keys(storeInfo.b2c_method_providers).length === 0 ||
                          storeInfo?.b2c_method_providers?.CARD) && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('CREDIT_CARD')}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              paymentMethod === 'CREDIT_CARD'
                                ? 'border-indigo-600 bg-indigo-50/60 font-bold text-indigo-950'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <span className="block text-xs font-extrabold">Cartão de Crédito</span>
                            <span className="block text-[10px] text-slate-500">
                              Aprovação Imediata
                            </span>
                          </button>
                        )}

                        {storeInfo?.b2c_method_providers?.BOLETO && (
                          <button
                            type="button"
                            onClick={() => setPaymentMethod('BOLETO' as any)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              (paymentMethod as string) === 'BOLETO'
                                ? 'border-pink-600 bg-pink-50/60 font-bold text-pink-950'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            <span className="block text-xs font-extrabold">Boleto Bancário</span>
                            <span className="block text-[10px] text-slate-500">
                              Boleto Registrado
                            </span>
                          </button>
                        )}
                      </div>

                      {paymentMethod === 'CREDIT_CARD' && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Nome Impresso no Cartão *
                            </label>
                            <input
                              type="text"
                              required={paymentMethod === 'CREDIT_CARD'}
                              value={cardForm.holder_name}
                              onChange={(e) =>
                                setCardForm({ ...cardForm, holder_name: e.target.value.toUpperCase() })
                              }
                              placeholder="COMO ESTÁ NO CARTÃO"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs uppercase font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Número do Cartão *
                            </label>
                            <input
                              type="text"
                              required={paymentMethod === 'CREDIT_CARD'}
                              value={cardForm.number}
                              onChange={(e) =>
                                setCardForm({
                                  ...cardForm,
                                  number: e.target.value.replace(/\D/g, '').slice(0, 19),
                                })
                              }
                              placeholder="0000 0000 0000 0000"
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Validade *
                              </label>
                              <input
                                type="text"
                                required={paymentMethod === 'CREDIT_CARD'}
                                value={cardForm.expiration}
                                onChange={(e) =>
                                  setCardForm({ ...cardForm, expiration: e.target.value })
                                }
                                placeholder="MM/AAAA"
                                maxLength={7}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                CVV *
                              </label>
                              <input
                                type="text"
                                required={paymentMethod === 'CREDIT_CARD'}
                                value={cardForm.cvv}
                                onChange={(e) =>
                                  setCardForm({
                                    ...cardForm,
                                    cvv: e.target.value.replace(/\D/g, '').slice(0, 4),
                                  })
                                }
                                placeholder="123"
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Parcelas
                              </label>
                              <select
                                value={cardForm.installments}
                                onChange={(e) =>
                                  setCardForm({
                                    ...cardForm,
                                    installments: Number(e.target.value),
                                  })
                                }
                                className="w-full px-2 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold"
                              >
                                {Array.from(
                                  {
                                    length: Math.max(
                                      1,
                                      Math.min(12, Number(storeInfo?.vindi_max_installments || 6))
                                    ),
                                  },
                                  (_, idx) => idx + 1
                                ).map((n) => (
                                  <option key={n} value={n}>
                                    {n}x de {formatBRL(differenceToPay / n)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                      className="text-[11px] font-bold text-slate-600 underline cursor-pointer"
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
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
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
                    Pedido #{orderResult.order_id} • {orderResult.status_label || orderResult.status}
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
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
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
                          className="text-indigo-600 font-bold underline cursor-pointer"
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

                {/* Hosted Payment Link Card */}
                {orderResult.vindi_payment_url && orderResult.difference_to_pay > 0 && (
                  <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-left space-y-3">
                    <p className="text-xs font-bold text-indigo-950">
                      Pagamento Online Seguro ({formatBRL(orderResult.difference_to_pay)}):
                    </p>
                    <p className="text-xs text-indigo-800">
                      Clique no botão abaixo caso não tenha sido redirecionado automaticamente para concluir seu pagamento:
                    </p>
                    <a
                      href={orderResult.vindi_payment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ir para o Ambiente Seguro de Pagamento
                    </a>
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
                      {orderResult.pix_qr_code_url && (
                        <img
                          src={orderResult.pix_qr_code_url}
                          alt="QR Code PIX"
                          className="w-44 h-44 mx-auto rounded-xl border border-slate-200 bg-white"
                        />
                      )}
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 font-mono text-[11px] break-all text-slate-600">
                        {orderResult.pix_code}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(orderResult.pix_code);
                          toast.success('Código PIX Copia e Cola copiado!');
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copiar Código PIX
                      </button>
                    </div>
                  )}

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCartOpen(false);
                      setCheckoutStep('cart');
                      setOrderResult(null);
                      openAccountScreen('orders');
                    }}
                    className="w-full py-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
                  >
                    Acompanhar em Meus Pedidos
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCartOpen(false);
                      setCheckoutStep('cart');
                      setOrderResult(null);
                    }}
                    className="w-full py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Continuar Comprando
                  </button>
                </div>
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
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shrink-0 cursor-pointer"
          >
            Entendi
          </button>
        </div>
      )}
    </div>
  );
}

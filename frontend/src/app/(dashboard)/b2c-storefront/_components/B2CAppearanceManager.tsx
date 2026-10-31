'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe,
  Sparkles,
  FolderTree,
  Ticket,
  ShoppingBag,
  SlidersHorizontal,
  Save,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  ExternalLink,
  Copy,
  Check,
  Palette,
  Image as ImageIcon,
  Search,
  BookOpen,
  Layers,
  RefreshCw,
  Eye,
  ArrowUp,
  ArrowDown,
  Store,
  CheckCircle2,
  Tag,
  Calendar,
  Building2,
  MapPin,
  Phone,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { getImageUrl } from '@/lib/image_helper';
import { CurrencyInput } from '@/components/CurrencyInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface B2CBranding {
  store_slug: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string;
  hero_badge_text: string;
  hero_title: string;
  hero_subtitle: string;
  hero_banner_url: string;
  show_voucher_simulator: boolean;
}

export interface B2CBannerItem {
  id: string;
  title: string;
  subtitle: string;
  badge_text?: string;
  image_url: string;
  mobile_image_url?: string;
  button_text?: string;
  filter_query?: string;
  active: boolean;
}

export interface B2CShowcaseProductItem {
  sku: string;
  ean_gtin: string;
  name: string;
  author?: string;
  brand?: string;
  base_price: number;
  promotional_price?: number | null;
  cover_url?: string | null;
  stock_quantity?: number;
}

export interface B2CShowcaseSection {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  items: B2CShowcaseProductItem[];
  active: boolean;
}

export interface B2CCategoryFilterItem {
  id: string;
  label: string;
  code: string;
  filter_type: 'COD_GENERO' | 'NOM_EDITORA' | 'SEARCH_TERM';
  active: boolean;
}

export interface B2CPromotionRule {
  id: string;
  name: string;
  target_type: 'ALL' | 'CATEGORY' | 'BRAND' | 'PRODUCTS';
  target_value: string;
  product_codes: string[];
  product_summaries?: { sku: string; ean_gtin: string; name: string; base_price: number }[];
  discount_type: 'PERCENTAGE' | 'FIXED_BRL';
  discount_value: number;
  valid_from?: string;
  valid_until?: string;
  active: boolean;
}

export interface B2CFooterInfo {
  legal_name: string;
  cnpj: string;
  address_line: string;
  zip_code?: string;
  city_state?: string;
  contact_email: string;
  contact_phone: string;
  whatsapp: string;
  business_hours: string;
  about_text: string;
}

interface B2CAppearanceManagerProps {
  initialSection?: 'banners' | 'showcases' | 'categories' | 'promotions';
}

const PRESET_PRIMARY_COLORS = [
  { name: 'Indigo Cronuz', hex: '#4f46e5' },
  { name: 'Azul Royal', hex: '#2563eb' },
  { name: 'Esmeralda', hex: '#059669' },
  { name: 'Violeta', hex: '#7c3aed' },
  { name: 'Rosa Editorial', hex: '#e11d48' },
  { name: 'Âmbar Livraria', hex: '#d97706' },
  { name: 'Ciano Moderno', hex: '#0891b2' },
  { name: 'Grafite Minimal', hex: '#1e293b' },
];

const PRESET_SECONDARY_COLORS = [
  { name: 'Noite Profunda', hex: '#0f172a' },
  { name: 'Indigo Escuro', hex: '#1e1b4b' },
  { name: 'Verde Floresta', hex: '#064e3b' },
  { name: 'Vinho Clássico', hex: '#4c0519' },
  { name: 'Azul Marinho', hex: '#172554' },
  { name: 'Carvão Editorial', hex: '#18181b' },
];

export default function B2CAppearanceManager({
  initialSection = 'banners',
}: B2CAppearanceManagerProps) {
  const [activeSection, setActiveSection] = useState<'banners' | 'showcases' | 'categories' | 'promotions'>(initialSection);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [b2cCustomDomain, setB2cCustomDomain] = useState('');
  const [usesHorus, setUsesHorus] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(false);

  const [branding, setBranding] = useState<B2CBranding>({
    store_slug: '',
    primary_color: '#4f46e5',
    secondary_color: '#0f172a',
    logo_url: '',
    hero_badge_text: 'Lançamentos e Destaques',
    hero_title: 'Explore nosso catálogo completo',
    hero_subtitle: 'Encontre seus livros favoritos com entrega rápida para todo o Brasil.',
    hero_banner_url: '',
    show_voucher_simulator: false,
  });

  const [banners, setBanners] = useState<B2CBannerItem[]>([]);
  const [showcases, setShowcases] = useState<B2CShowcaseSection[]>([]);
  const [categories, setCategories] = useState<B2CCategoryFilterItem[]>([]);
  const [promotions, setPromotions] = useState<B2CPromotionRule[]>([]);
  const [footerInfo, setFooterInfo] = useState<B2CFooterInfo>({
    legal_name: '',
    cnpj: '',
    address_line: '',
    zip_code: '',
    city_state: '',
    contact_email: '',
    contact_phone: '',
    whatsapp: '',
    business_hours: 'Segunda a Sexta, das 09h às 18h',
    about_text: '',
  });

  // New Promotion Form State
  const [promoName, setPromoName] = useState('');
  const [promoTargetType, setPromoTargetType] = useState<'CATEGORY' | 'BRAND' | 'PRODUCTS' | 'ALL'>('CATEGORY');
  const [promoTargetValue, setPromoTargetValue] = useState('');
  const [promoSelectedProducts, setPromoSelectedProducts] = useState<{ sku: string; ean_gtin: string; name: string; base_price: number }[]>([]);
  const [promoDiscountType, setPromoDiscountType] = useState<'PERCENTAGE' | 'FIXED_BRL'>('PERCENTAGE');
  const [promoDiscountValue, setPromoDiscountValue] = useState<number>(15);
  const [promoValidFrom, setPromoValidFrom] = useState('');
  const [promoValidUntil, setPromoValidUntil] = useState('');

  // Media upload states
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);

  // Product Search for Showcases & Promotions
  const [activeShowcaseIdForSearch, setActiveShowcaseIdForSearch] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<B2CShowcaseProductItem[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Available Categories from Horus / Tray / Local
  const [availableCatalogMeta, setAvailableCatalogMeta] = useState<{
    categories: any[];
    brands: any[];
    tray_categories: any[];
  }>({ categories: [], brands: [], tray_categories: [] });
  const [loadingAvailableCategories, setLoadingAvailableCategories] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatType, setNewCatType] = useState<'COD_GENERO' | 'NOM_EDITORA' | 'SEARCH_TERM'>('COD_GENERO');

  useEffect(() => {
    setActiveSection(initialSection);
    if (initialSection === 'showcases') {
      handleSearchProductsForShowcase('');
    } else if (initialSection === 'categories') {
      fetchAvailableCategories();
    } else if (initialSection === 'promotions') {
      fetchAvailableCategories();
      handleSearchProductsForShowcase('');
    }
  }, [initialSection]);

  const fetchAppearance = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/b2c/appearance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao carregar configurações visuais B2C');
      const data = await res.json();
      setCompanyId(data.company_id);
      setCompanyName(data.company_name || '');
      setB2cCustomDomain(data.b2c_custom_domain || '');
      setUsesHorus(Boolean(data.uses_horus));
      setTrayEnabled(Boolean(data.tray_enabled));
      if (data.branding) setBranding(data.branding);
      setBanners(Array.isArray(data.banners) ? data.banners : []);
      setShowcases(Array.isArray(data.showcases) ? data.showcases : []);
      setCategories(Array.isArray(data.categories) ? data.categories : []);
      setPromotions(Array.isArray(data.promotions) ? data.promotions : []);
      if (data.footer_info) setFooterInfo((prev) => ({ ...prev, ...data.footer_info }));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar aparência da loja B2C.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppearance();
  }, []);

  const persistAppearance = async (overridePromotions?: B2CPromotionRule[]) => {
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/b2c/appearance`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branding,
          banners,
          showcases,
          categories,
          promotions: overridePromotions !== undefined ? overridePromotions : promotions,
          footer_info: footerInfo,
          b2c_custom_domain: b2cCustomDomain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar configurações');
      if (data.branding) setBranding(data.branding);
      if (Array.isArray(data.promotions)) setPromotions(data.promotions);
      if (data.footer_info) setFooterInfo((prev) => ({ ...prev, ...data.footer_info }));
      toast.success(data.message || 'Configurações da Loja B2C salvas com sucesso!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    await persistAppearance();
  };

  const handleClearStoreCache = async () => {
    setClearingCache(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/b2c/cache/clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao limpar cache da loja.');
      toast.success(data.message || 'Cache da loja B2C limpo com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha ao limpar cache.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleUploadImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'hero_banner' | string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxMB = target === 'logo' ? 2 : 5;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`O arquivo excede o limite máximo permitido de ${maxMB} MB para este tipo de envio.`);
      e.target.value = '';
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Formato inválido. Utilize imagens JPG, PNG ou WEBP.');
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingTarget(target);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar imagem');

      let nextBranding = branding;
      let nextBanners = banners;

      if (target === 'logo') {
        nextBranding = { ...branding, logo_url: data.url };
        setBranding(nextBranding);
      } else if (target === 'hero_banner') {
        nextBranding = { ...branding, hero_banner_url: data.url };
        setBranding(nextBranding);
      } else if (target.startsWith('banner_')) {
        const bannerId = target.replace('banner_', '');
        nextBanners = banners.map((b) => (b.id === bannerId ? { ...b, image_url: data.url } : b));
        setBanners(nextBanners);
      }

      // Auto-persist immediately so the uploaded logo/banner is saved right away
      const saveRes = await fetch(`${API_URL}/b2c/appearance`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branding: nextBranding,
          banners: nextBanners,
          showcases,
          categories,
          promotions,
          footer_info: footerInfo,
          b2c_custom_domain: b2cCustomDomain,
        }),
      });
      if (saveRes.ok) {
        const savedData = await saveRes.json();
        if (savedData.branding) setBranding(savedData.branding);
        toast.success(
          target === 'logo'
            ? 'Logo enviada e salva automaticamente na loja!'
            : 'Imagem enviada e salva automaticamente!'
        );
      } else {
        toast.success('Imagem enviada! Clique em Salvar Alterações para publicar.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha no upload da imagem.');
    } finally {
      setUploadingTarget(null);
      e.target.value = '';
    }
  };

  // Friendly Storefront URL computation
  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const friendlyStoreUrl = `${originUrl}/loja/${branding.store_slug || companyId || 'loja'}`;

  const handleCopyStoreLink = () => {
    navigator.clipboard.writeText(friendlyStoreUrl);
    setCopiedLink(true);
    toast.success('Link amigável da Loja B2C copiado!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Banner Helpers
  const handleAddBanner = () => {
    const newBanner: B2CBannerItem = {
      id: `bn-${Date.now()}`,
      title: 'Oferta Especial para Colaboradores',
      subtitle: 'Aproveite seu saldo de benefício para renovar sua biblioteca',
      badge_text: 'Destaque',
      image_url: '',
      button_text: 'Ver Livros',
      filter_query: '',
      active: true,
    };
    setBanners((prev) => [...prev, newBanner]);
  };

  const handleRemoveBanner = (id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  };

  // Showcase Helpers
  const handleAddShowcase = (presetTitle?: string, presetSubtitle?: string, presetBadge?: string) => {
    const newSc: B2CShowcaseSection = {
      id: `sc-${Date.now()}`,
      title: presetTitle || 'Destaques da Loja',
      subtitle: presetSubtitle || 'Títulos selecionados com pronta entrega',
      badge: presetBadge || 'Seleção Especial',
      items: [],
      active: true,
    };
    setShowcases((prev) => [...prev, newSc]);
    setActiveShowcaseIdForSearch(newSc.id);
  };

  const handleRemoveShowcase = (id: string) => {
    setShowcases((prev) => prev.filter((s) => s.id !== id));
    if (activeShowcaseIdForSearch === id) setActiveShowcaseIdForSearch(null);
  };

  const handleMoveShowcase = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= showcases.length) return;
    const copy = [...showcases];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setShowcases(copy);
  };

  const handleSearchProductsForShowcase = async (queryOverride?: string) => {
    const term = (queryOverride !== undefined ? queryOverride : productSearchTerm).trim();
    setSearchingProducts(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/b2c/appearance/search-products?q=${encodeURIComponent(term)}&limit=16`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setProductSearchResults(data.items || []);
      }
    } catch {
      toast.error('Erro ao buscar livros no acervo.');
    } finally {
      setSearchingProducts(false);
    }
  };

  const handleAddProductToShowcase = (showcaseId: string, prod: any) => {
    setShowcases((prev) =>
      prev.map((sc) => {
        if (sc.id !== showcaseId) return sc;
        const exists = sc.items.some(
          (i) => (i.ean_gtin && i.ean_gtin === prod.ean_gtin) || i.sku === prod.sku
        );
        if (exists) {
          toast.info('Este livro já está nesta vitrine.');
          return sc;
        }
        const newItem: B2CShowcaseProductItem = {
          sku: prod.sku,
          ean_gtin: prod.ean_gtin || prod.sku,
          name: prod.name,
          author: prod.author || '',
          brand: prod.brand || '',
          base_price: Number(prod.promotional_price || prod.base_price || 0),
          promotional_price: prod.promotional_price ? Number(prod.promotional_price) : null,
          cover_url: prod.cover_url || null,
          stock_quantity: prod.stock_quantity || 0,
        };
        toast.success(`"${prod.name}" adicionado à vitrine!`);
        return { ...sc, items: [...sc.items, newItem] };
      })
    );
  };

  const handleRemoveProductFromShowcase = (showcaseId: string, skuOrIsbn: string) => {
    setShowcases((prev) =>
      prev.map((sc) =>
        sc.id === showcaseId
          ? {
              ...sc,
              items: sc.items.filter((i) => i.sku !== skuOrIsbn && i.ean_gtin !== skuOrIsbn),
            }
          : sc
      )
    );
  };

  // Categories Helpers
  const fetchAvailableCategories = async () => {
    setLoadingAvailableCategories(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/b2c/appearance/available-categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableCatalogMeta({
          categories: data.categories || [],
          brands: data.brands || [],
          tray_categories: data.tray_categories || [],
        });
        toast.success('Categorias e editoras sincronizadas do seu ecossistema!');
      }
    } catch {
      toast.error('Erro ao buscar categorias disponíveis.');
    } finally {
      setLoadingAvailableCategories(false);
    }
  };

  const handleAddCategoryFilter = (
    label: string,
    code: string,
    filterType: 'COD_GENERO' | 'NOM_EDITORA' | 'SEARCH_TERM'
  ) => {
    if (!label.trim() || !code.trim()) {
      toast.error('Informe o nome de exibição e o termo/código do filtro.');
      return;
    }
    const exists = categories.some(
      (c) => c.label.toLowerCase() === label.trim().toLowerCase() && c.filter_type === filterType
    );
    if (exists) {
      toast.info('Esta categoria já está adicionada na barra da loja.');
      return;
    }
    setCategories((prev) => [
      ...prev,
      {
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: label.trim(),
        code: code.trim(),
        filter_type: filterType,
        active: true,
      },
    ]);
    setNewCatLabel('');
    setNewCatCode('');
    toast.success(`Filtro "${label.trim()}" adicionado!`);
  };

  const handleCreatePromotion = async () => {
    if (!promoName.trim()) {
      toast.error('Informe um nome para a campanha promocional (ex: Semana da Literatura).');
      return;
    }
    if (!promoDiscountValue || promoDiscountValue <= 0) {
      toast.error('Informe um valor ou percentual de desconto maior que zero.');
      return;
    }
    if ((promoTargetType === 'CATEGORY' || promoTargetType === 'BRAND') && !promoTargetValue.trim()) {
      toast.error(
        promoTargetType === 'CATEGORY'
          ? 'Selecione ou digite a Categoria que receberá o desconto.'
          : 'Selecione ou digite a Editora que receberá o desconto.'
      );
      return;
    }
    if (promoTargetType === 'PRODUCTS' && promoSelectedProducts.length === 0) {
      toast.error('Adicione pelo menos 1 livro na lista de produtos da promoção.');
      return;
    }

    const newRule: B2CPromotionRule = {
      id: `promo-${Date.now()}`,
      name: promoName.trim(),
      target_type: promoTargetType,
      target_value: promoTargetType === 'ALL' ? 'Todo o Catálogo' : promoTargetValue.trim(),
      product_codes: promoSelectedProducts.map((p) => p.ean_gtin || p.sku),
      product_summaries: promoSelectedProducts,
      discount_type: promoDiscountType,
      discount_value: Number(promoDiscountValue),
      valid_from: promoValidFrom || undefined,
      valid_until: promoValidUntil || undefined,
      active: true,
    };

    const nextPromos = [newRule, ...promotions];
    setPromotions(nextPromos);
    setPromoName('');
    setPromoTargetValue('');
    setPromoSelectedProducts([]);
    await persistAppearance(nextPromos);
  };

  const handleTogglePromotion = async (id: string) => {
    const nextPromos = promotions.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
    setPromotions(nextPromos);
    await persistAppearance(nextPromos);
  };

  const handleRemovePromotion = async (id: string) => {
    const nextPromos = promotions.filter((p) => p.id !== id);
    setPromotions(nextPromos);
    await persistAppearance(nextPromos);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-sm text-slate-500">Carregando construtor visual da Loja B2C...</p>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Friendly URL Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Store className="w-4 h-4" />
            Storefront B2C
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
            {activeSection === 'banners'
              ? 'Banners, Identidade Visual, Rodapé & URL da Loja'
              : activeSection === 'showcases'
              ? 'Vitrines & Destaques da Home'
              : activeSection === 'promotions'
              ? 'Promoções & Descontos por Categoria, Editora ou Produto'
              : 'Categorias & Menu de Navegação'}
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {activeSection === 'banners'
              ? 'Defina a URL amigável, logo, cores da sua marca, banners e dados obrigatórios do rodapé (CNPJ, Endereço e Contato).'
              : activeSection === 'showcases'
              ? 'Monte as seções de produtos em destaque exibidas na página inicial da sua loja.'
              : activeSection === 'promotions'
              ? 'Aplique preços promocionais (De/Por) com data de validade em categorias inteiras, editoras ou livros específicos.'
              : 'Escolha as categorias e editoras exibidas no menu superior da loja virtual.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs">
            <Globe className="w-3.5 h-3.5 text-indigo-500 mr-2 shrink-0" />
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate max-w-[220px]">
              /loja/{branding.store_slug || companyId}
            </span>
            <button
              type="button"
              onClick={handleCopyStoreLink}
              className="ml-2 p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              title="Copiar Link da Loja"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <a
            href={friendlyStoreUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4 text-indigo-500" />
            Ver Loja
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={handleClearStoreCache}
            disabled={clearingCache}
            title="Limpar o cache de catálogo e vitrine da Loja B2C"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
            Limpar Cache
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Alterações
          </button>
        </div>
      </div>

      {/* =====================================================================
          SECTION 1: BANNERS, CORES, LOGO & URL AMIGÁVEL
         ===================================================================== */}
      {activeSection === 'banners' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Controls */}
          <div className="lg:col-span-7 space-y-6">
            {/* Card 1: Friendly URL & Custom Domain */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  URL Amigável & Domínio da Loja B2C
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Slug Amigável da Loja (Acesso imediato)
                  </label>
                  <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
                    <span className="px-3 py-2 text-xs text-slate-400 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 font-mono">
                      /loja/
                    </span>
                    <input
                      type="text"
                      value={branding.store_slug}
                      onChange={(e) =>
                        setBranding({
                          ...branding,
                          store_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                        })
                      }
                      placeholder="ex: movimentoliterario"
                      className="w-full px-3 py-2 text-sm bg-transparent text-slate-900 dark:text-white focus:outline-none font-mono font-bold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Link pronto para enviar aos colaboradores: <strong className="text-indigo-600">{friendlyStoreUrl}</strong>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Domínio ou Subdomínio Próprio (Opcional)
                  </label>
                  <input
                    type="text"
                    value={b2cCustomDomain}
                    onChange={(e) => setB2cCustomDomain(e.target.value)}
                    placeholder="ex: beneficios.suaeditora.com.br"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Caso aponte um CNAME próprio para o servidor Cronuz.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Logo & Brand Colors */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Logo do Cliente & Paleta de Cores da Loja Padronizada
                </h2>
              </div>

              {/* Logo Upload */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <div className="w-20 h-20 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                  {branding.logo_url ? (
                    <img
                      src={getImageUrl(branding.logo_url)}
                      alt="Logo Loja"
                      className="w-full h-full object-contain p-1.5"
                    />
                  ) : (
                    <ImageIcon className="w-7 h-7 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors">
                      {uploadingTarget === 'logo' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UploadCloud className="w-3.5 h-3.5" />
                      )}
                      Enviar Logo (PNG/JPG/WEBP • Máx 2MB)
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleUploadImage(e, 'logo')}
                      />
                    </label>
                    {branding.logo_url && (
                      <button
                        type="button"
                        onClick={() => setBranding({ ...branding, logo_url: '' })}
                        className="px-2.5 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={branding.logo_url}
                    onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
                    placeholder="Ou cole a URL da imagem da logo..."
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
                  />
                </div>
              </div>

              {/* Primary & Secondary Color Pickers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cor Primária da Marca (Botões, Destaques & Sacola)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={branding.primary_color || '#4f46e5'}
                      onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                      className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={branding.primary_color}
                      onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                      className="w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PRESET_PRIMARY_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setBranding({ ...branding, primary_color: c.hex })}
                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                          branding.primary_color === c.hex ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cor Secundária / Fundo do Banner Hero
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={branding.secondary_color || '#0f172a'}
                      onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                      className="w-10 h-10 rounded-xl border border-slate-200 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={branding.secondary_color}
                      onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                      className="w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PRESET_SECONDARY_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setBranding({ ...branding, secondary_color: c.hex })}
                        className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                          branding.secondary_color === c.hex ? 'border-indigo-500 scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Hero Banner Principal da Home */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Banner Principal da Home (Hero)
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Selo Superior (Badge)
                  </label>
                  <input
                    type="text"
                    value={branding.hero_badge_text}
                    onChange={(e) => setBranding({ ...branding, hero_badge_text: e.target.value })}
                    placeholder="Ex: Lançamentos & Destaques"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Título Principal do Banner
                  </label>
                  <input
                    type="text"
                    value={branding.hero_title}
                    onChange={(e) => setBranding({ ...branding, hero_title: e.target.value })}
                    placeholder="Ex: Explore nosso catálogo completo"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Subtítulo do Banner
                </label>
                <textarea
                  rows={2}
                  value={branding.hero_subtitle}
                  onChange={(e) => setBranding({ ...branding, hero_subtitle: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Imagem de Fundo do Banner Principal (Opcional • Máx 5MB)
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">
                    {uploadingTarget === 'hero_banner' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UploadCloud className="w-3.5 h-3.5" />
                    )}
                    Enviar Banner (Máx 5MB)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleUploadImage(e, 'hero_banner')}
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={branding.hero_banner_url}
                  onChange={(e) => setBranding({ ...branding, hero_banner_url: e.target.value })}
                  placeholder="Ou cole a URL da imagem do banner..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            </div>

            {/* Card 4: Additional Promotional Banners */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Banners Promocionais & Rotativos da Home ({banners.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Adicione banners visuais clicáveis para campanhas, feiras literárias ou coleções.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddBanner}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 text-xs font-bold"
                >
                  <Plus className="w-4 h-4" />
                  Novo Banner
                </button>
              </div>

              {banners.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                  Nenhum banner secundário adicionado. O Banner Hero principal acima já será exibido automaticamente.
                </div>
              ) : (
                <div className="space-y-3">
                  {banners.map((b, idx) => (
                    <div
                      key={b.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-600">
                          Banner #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBanner(b.id)}
                          className="text-rose-500 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={b.title}
                          onChange={(e) =>
                            setBanners((prev) =>
                              prev.map((x) => (x.id === b.id ? { ...x, title: e.target.value } : x))
                            )
                          }
                          placeholder="Título do Banner"
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                        <input
                          type="text"
                          value={b.subtitle}
                          onChange={(e) =>
                            setBanners((prev) =>
                              prev.map((x) =>
                                x.id === b.id ? { ...x, subtitle: e.target.value } : x
                              )
                            )
                          }
                          placeholder="Subtítulo"
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold">
                          {uploadingTarget === `banner_${b.id}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <UploadCloud className="w-3.5 h-3.5" />
                          )}
                          Upload Imagem (Máx 5MB)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => handleUploadImage(e, `banner_${b.id}`)}
                          />
                        </label>
                        <input
                          type="text"
                          value={b.image_url}
                          onChange={(e) =>
                            setBanners((prev) =>
                              prev.map((x) =>
                                x.id === b.id ? { ...x, image_url: e.target.value } : x
                              )
                            )
                          }
                          placeholder="URL da imagem do banner..."
                          className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                        <input
                          type="text"
                          value={b.filter_query || ''}
                          onChange={(e) =>
                            setBanners((prev) =>
                              prev.map((x) =>
                                x.id === b.id ? { ...x, filter_query: e.target.value } : x
                              )
                            )
                          }
                          placeholder="Filtro ao clicar (ex: Infantil)"
                          className="w-44 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card 5: Rodapé Obrigatório (CNPJ, Endereço) & Canais de Contato (SAC) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Rodapé Obrigatório (CNPJ, Endereço) & Página de Contato (SAC)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Informações legais obrigatórias no e-commerce brasileiro (Decreto nº 7.962/2013) exibidas no rodapé e na página Fale Conosco.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Razão Social da Empresa
                  </label>
                  <input
                    type="text"
                    value={footerInfo.legal_name}
                    onChange={(e) => setFooterInfo({ ...footerInfo, legal_name: e.target.value })}
                    placeholder="Ex: Editora Exemplo Ltda"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    CNPJ Obrigatório
                  </label>
                  <input
                    type="text"
                    value={footerInfo.cnpj}
                    onChange={(e) => setFooterInfo({ ...footerInfo, cnpj: e.target.value })}
                    placeholder="00.000.000/0001-00"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Endereço Físico Completo (Exibido no Rodapé e Contato)
                </label>
                <input
                  type="text"
                  value={footerInfo.address_line}
                  onChange={(e) => setFooterInfo({ ...footerInfo, address_line: e.target.value })}
                  placeholder="Ex: Rua das Letras, 100 - Centro • São Paulo/SP • CEP 01000-000"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    WhatsApp de Atendimento
                  </label>
                  <input
                    type="text"
                    value={footerInfo.whatsapp}
                    onChange={(e) => setFooterInfo({ ...footerInfo, whatsapp: e.target.value })}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Telefone Fixo / SAC
                  </label>
                  <input
                    type="text"
                    value={footerInfo.contact_phone}
                    onChange={(e) => setFooterInfo({ ...footerInfo, contact_phone: e.target.value })}
                    placeholder="Ex: (11) 3000-0000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    E-mail de Atendimento
                  </label>
                  <input
                    type="email"
                    value={footerInfo.contact_email}
                    onChange={(e) => setFooterInfo({ ...footerInfo, contact_email: e.target.value })}
                    placeholder="sac@sualoja.com.br"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Horário de Atendimento
                  </label>
                  <input
                    type="text"
                    value={footerInfo.business_hours}
                    onChange={(e) => setFooterInfo({ ...footerInfo, business_hours: e.target.value })}
                    placeholder="Segunda a Sexta, das 09h às 18h"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Texto Institucional do Rodapé (Sobre a Loja)
                  </label>
                  <input
                    type="text"
                    value={footerInfo.about_text}
                    onChange={(e) => setFooterInfo({ ...footerInfo, about_text: e.target.value })}
                    placeholder="Breve descrição da sua livraria/editora..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Storefront Preview */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 truncate max-w-[200px]">
                    /loja/{branding.store_slug || companyId}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Preview da Loja
                </span>
              </div>

              {/* Mini Storefront Header */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div className="flex items-center gap-2.5">
                  {branding.logo_url ? (
                    <img
                      src={getImageUrl(branding.logo_url)}
                      alt="Logo"
                      className="h-8 w-auto max-w-[110px] object-contain"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: branding.primary_color }}
                    >
                      {(companyName || 'L')[0]}
                    </div>
                  )}
                  <span className="font-bold text-xs text-slate-800 dark:text-white truncate max-w-[130px]">
                    {companyName || 'Sua Loja Oficial'}
                  </span>
                </div>
                <div
                  className="px-2.5 py-1 rounded-lg text-white text-[10px] font-bold flex items-center gap-1"
                  style={{ backgroundColor: branding.primary_color }}
                >
                  <ShoppingBag className="w-3 h-3" />
                  Sacola (0)
                </div>
              </div>

              {/* Mini Hero Banner */}
              <div
                className="relative p-5 text-white overflow-hidden"
                style={{
                  backgroundColor: branding.secondary_color || '#0f172a',
                  backgroundImage: branding.hero_banner_url
                    ? `linear-gradient(to right, rgba(15,23,42,0.88), rgba(15,23,42,0.65)), url(${getImageUrl(branding.hero_banner_url)})`
                    : `linear-gradient(135deg, ${branding.secondary_color || '#0f172a'} 0%, ${branding.primary_color || '#4f46e5'} 100%)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <span
                  className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold mb-2"
                  style={{ backgroundColor: branding.primary_color }}
                >
                  {branding.hero_badge_text || 'Lançamentos & Destaques'}
                </span>
                <h3 className="text-base font-extrabold leading-snug">
                  {branding.hero_title || 'Explore nosso catálogo completo'}
                </h3>
                <p className="text-[11px] text-slate-200 mt-1 line-clamp-2">
                  {branding.hero_subtitle}
                </p>
              </div>

              {/* Mini Category Pills */}
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: branding.primary_color }}
                >
                  Início
                </span>
                {(categories.length > 0
                  ? categories.slice(0, 4)
                  : [
                      { id: '1', label: 'Literatura' },
                      { id: '2', label: 'Infantil' },
                      { id: '3', label: 'Negócios' },
                    ]
                ).map((cat: any) => (
                  <span
                    key={cat.id}
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0"
                  >
                    {cat.label}
                  </span>
                ))}
              </div>

              {/* Mini Product Cards Preview */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {showcases[0]?.title || 'Destaques da Semana'}
                  </span>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: branding.primary_color }}
                  >
                    Ver todos →
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2"
                    >
                      <div className="h-20 rounded-lg bg-slate-200/70 dark:bg-slate-700/50 flex items-center justify-center">
                        <BookOpen className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                          Livro Exemplo #{n}
                        </p>
                        <p className="text-xs font-extrabold" style={{ color: branding.primary_color }}>
                          R$ 49,90
                        </p>
                      </div>
                      <div
                        className="w-full py-1 rounded-lg text-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: branding.primary_color }}
                      >
                        Comprar
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 2: VITRINES & DESTAQUES DA HOME
         ===================================================================== */}
      {activeSection === 'showcases' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Showcases Builder */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Vitrines da Página Inicial ({showcases.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Crie seções de livros em destaque para a página inicial da sua loja virtual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddShowcase()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nova Vitrine
                </button>
              </div>

              {/* Quick Preset Templates */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-semibold text-slate-400">
                  Sugestões rápidas:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleAddShowcase(
                      'Destaques da Semana',
                      'Nossa curadoria especial de títulos',
                      'Destaques'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 text-xs font-medium transition-colors"
                >
                  + Destaques da Semana
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleAddShowcase(
                      'Lançamentos & Novidades',
                      'Acabaram de chegar no nosso acervo',
                      'Novidades'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 text-xs font-medium transition-colors"
                >
                  + Lançamentos & Novidades
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleAddShowcase(
                      'Mais Vendidos',
                      'Os títulos mais procurados pelos leitores',
                      'Best-Sellers'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 text-xs font-medium transition-colors"
                >
                  + Mais Vendidos
                </button>
              </div>
            </div>

            {showcases.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center space-y-3">
                <Sparkles className="w-10 h-10 text-indigo-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white">
                  Nenhuma vitrine personalizada criada ainda
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Clique em <strong>&ldquo;Criar Nova Vitrine&rdquo;</strong> ou escolha um dos modelos rápidos acima para destacar livros na página inicial da sua Loja B2C.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {showcases.map((sc, idx) => {
                  const isSelectedForSearch = activeShowcaseIdForSearch === sc.id;
                  return (
                    <div
                      key={sc.id}
                      className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all p-5 space-y-4 ${
                        isSelectedForSearch
                          ? 'border-indigo-500 ring-2 ring-indigo-500/15'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-xs font-bold">
                            Vitrine #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveShowcaseIdForSearch(sc.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                              isSelectedForSearch
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50'
                            }`}
                          >
                            {isSelectedForSearch
                              ? '✓ Selecionada para adicionar livros ao lado'
                              : '+ Selecionar para adicionar livros'}
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveShowcase(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500"
                            title="Subir vitrine"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveShowcase(idx, 'down')}
                            disabled={idx === showcases.length - 1}
                            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 text-slate-500"
                            title="Descer vitrine"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveShowcase(sc.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                            title="Excluir vitrine"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={sc.title}
                          onChange={(e) =>
                            setShowcases((prev) =>
                              prev.map((x) => (x.id === sc.id ? { ...x, title: e.target.value } : x))
                            )
                          }
                          placeholder="Título da Vitrine (ex: Destaques)"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                        />
                        <input
                          type="text"
                          value={sc.subtitle || ''}
                          onChange={(e) =>
                            setShowcases((prev) =>
                              prev.map((x) =>
                                x.id === sc.id ? { ...x, subtitle: e.target.value } : x
                              )
                            )
                          }
                          placeholder="Subtítulo opcional"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                        />
                        <input
                          type="text"
                          value={sc.badge || ''}
                          onChange={(e) =>
                            setShowcases((prev) =>
                              prev.map((x) => (x.id === sc.id ? { ...x, badge: e.target.value } : x))
                            )
                          }
                          placeholder="Selo (ex: Mais Vendidos)"
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                        />
                      </div>

                      {/* Items inside this showcase */}
                      {sc.items.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
                          Nenhum livro nesta vitrine ainda. Use o buscador de livros à direita para adicionar títulos com 1 clique!
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {sc.items.map((item) => (
                            <div
                              key={item.sku || item.ean_gtin}
                              className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-10 h-12 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                  {item.cover_url ? (
                                    <img
                                      src={getImageUrl(item.cover_url)}
                                      alt={item.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <BookOpen className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    ISBN: {item.ean_gtin || item.sku} • R${' '}
                                    {Number(item.base_price || 0).toFixed(2).replace('.', ',')}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveProductFromShowcase(sc.id, item.sku || item.ean_gtin)
                                }
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0"
                                title="Remover livro da vitrine"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Live Book Search (Horus ERP / Catalog) */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  {usesHorus ? 'Conectado ao Horus ERP em Tempo Real' : 'Catálogo de Produtos'}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  Buscar Livros para Adicionar na Vitrine
                </h3>
                <p className="text-xs text-slate-500">
                  {activeShowcaseIdForSearch
                    ? `Adicionando na vitrine: "${
                        showcases.find((s) => s.id === activeShowcaseIdForSearch)?.title || ''
                      }"`
                    : showcases.length > 0
                    ? `Adicionando na vitrine: "${showcases[0].title}"`
                    : 'Crie uma vitrine à esquerda primeiro para adicionar livros.'}
                </p>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchProductsForShowcase()}
                    placeholder="Buscar por Título, ISBN, Autor ou Editora..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSearchProductsForShowcase()}
                  disabled={searchingProducts}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0"
                >
                  {searchingProducts ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                </button>
              </div>

              <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                {searchingProducts ? (
                  <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    Consultando acervo com saldo disponível...
                  </div>
                ) : productSearchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Digite o título, autor ou ISBN acima e clique em Buscar.
                  </div>
                ) : (
                  productSearchResults.map((prod: any) => {
                    const targetScId = activeShowcaseIdForSearch || showcases[0]?.id;
                    return (
                      <div
                        key={prod.sku || prod.ean_gtin}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                            {prod.cover_url ? (
                              <img
                                src={getImageUrl(prod.cover_url)}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <BookOpen className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {prod.name}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {prod.author || prod.brand || 'Acervo'} • ISBN: {prod.ean_gtin || prod.sku}
                            </p>
                            <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                              R$ {Number(prod.promotional_price || prod.base_price || 0).toFixed(2).replace('.', ',')}
                              <span className="ml-2 text-[10px] font-normal text-emerald-600">
                                Estoque: {prod.stock_quantity ?? 0}
                              </span>
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!targetScId) {
                              toast.error('Crie uma vitrine à esquerda primeiro!');
                              return;
                            }
                            handleAddProductToShowcase(targetScId, prod);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white text-xs font-bold transition-colors shrink-0"
                        >
                          + Adicionar
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 3: CATEGORIAS & MENU DE FILTROS DA LOJA B2C
         ===================================================================== */}
      {activeSection === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Active Categories on Storefront */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Barra de Categorias & Filtros Ativos na Loja B2C ({categories.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Estes filtros aparecem no topo da Loja Aberta B2C para que o cliente filtre por Gênero/Categoria, Editora ou Assunto com 1 clique.
                </p>
              </div>

              {/* Manual Quick Add */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Adicionar Filtro Manualmente
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newCatLabel}
                    onChange={(e) => {
                      setNewCatLabel(e.target.value);
                      if (!newCatCode) setNewCatCode(e.target.value);
                    }}
                    placeholder="Nome no Menu (ex: Infantil)"
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                  <input
                    type="text"
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value)}
                    placeholder="Termo/Gênero no Horus"
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                  <select
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as any)}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  >
                    <option value="COD_GENERO">Categoria / Gênero</option>
                    <option value="NOM_EDITORA">Editora / Marca</option>
                    <option value="SEARCH_TERM">Termo Livre</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddCategoryFilter(newCatLabel, newCatCode, newCatType)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar ao Menu da Loja
                </button>
              </div>

              {categories.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                  Nenhuma categoria ativa ainda. Clique nas categorias do Horus / Tray ao lado para adicioná-las com 1 clique!
                </div>
              ) : (
                <div className="space-y-2">
                  {categories.map((cat, idx) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {cat.label}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Filtro: <span className="font-mono">{cat.code}</span> •{' '}
                            {cat.filter_type === 'NOM_EDITORA'
                              ? 'Editora'
                              : cat.filter_type === 'COD_GENERO'
                              ? 'Categoria / Gênero'
                              : 'Busca Livre'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCategories((prev) => prev.filter((c) => c.id !== cat.id))
                        }
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: 1-Click Import from Horus ERP & Tray */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Importar com 1 Clique (Horus ERP / Tray / Catálogo)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Clique em qualquer gênero ou editora abaixo para incluí-lo imediatamente na barra da Loja B2C.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchAvailableCategories}
                  disabled={loadingAvailableCategories}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-bold"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAvailableCategories ? 'animate-spin' : ''}`} />
                  Atualizar Lista
                </button>
              </div>

              {loadingAvailableCategories ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  Consultando árvore de gêneros e editoras no Horus ERP / Tray...
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {availableCatalogMeta.tray_categories.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
                        Categorias da Loja Tray ({availableCatalogMeta.tray_categories.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {availableCatalogMeta.tray_categories.map((tc, i) => (
                          <button
                            key={`tray-${i}`}
                            type="button"
                            onClick={() =>
                              handleAddCategoryFilter(tc.label, tc.code, 'COD_GENERO')
                            }
                            className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-600 hover:text-white text-emerald-700 text-xs font-medium transition-colors"
                          >
                            + {tc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {availableCatalogMeta.categories.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block">
                        Gêneros / Categorias do Horus ERP ({availableCatalogMeta.categories.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {availableCatalogMeta.categories.map((hc, i) => (
                          <button
                            key={`horus-cat-${i}`}
                            type="button"
                            onClick={() =>
                              handleAddCategoryFilter(hc.label, hc.code, 'COD_GENERO')
                            }
                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors"
                          >
                            + {hc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {availableCatalogMeta.brands.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block">
                        Editoras / Selos ({availableCatalogMeta.brands.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {availableCatalogMeta.brands.slice(0, 60).map((hb, i) => (
                          <button
                            key={`horus-brand-${i}`}
                            type="button"
                            onClick={() =>
                              handleAddCategoryFilter(hb.label, hb.code, 'NOM_EDITORA')
                            }
                            className="px-2.5 py-1.5 rounded-xl border border-purple-200/70 bg-purple-50/40 hover:bg-purple-600 hover:text-white text-purple-700 dark:text-purple-300 text-xs font-medium transition-colors"
                          >
                            + {hb.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 4: PROMOÇÕES & DESCONTOS B2C (DE/POR) COM VALIDADE
         ===================================================================== */}
      {activeSection === 'promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Promotion Creator & Active Rules List */}
          <div className="lg:col-span-7 space-y-6">
            {/* Creator Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Nova Regra de Preço Promocional (De / Por)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Aplique descontos diretos nos produtos da loja por Categoria, Editora, Livros específicos ou Todo o Catálogo com período de validade.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Nome da Promoção / Campanha
                  </label>
                  <input
                    type="text"
                    value={promoName}
                    onChange={(e) => setPromoName(e.target.value)}
                    placeholder="Ex: Semana da Literatura 20% OFF"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Onde aplicar o desconto?
                  </label>
                  <select
                    value={promoTargetType}
                    onChange={(e) => {
                      setPromoTargetType(e.target.value as any);
                      setPromoTargetValue('');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    <option value="CATEGORY">Em uma Categoria / Gênero</option>
                    <option value="BRAND">Em uma Editora / Selo</option>
                    <option value="PRODUCTS">Em Produtos Específicos (ISBN / SKU)</option>
                    <option value="ALL">Em Todo o Catálogo da Loja</option>
                  </select>
                </div>
              </div>

              {/* Target Selector depending on promoTargetType */}
              {promoTargetType === 'CATEGORY' && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Selecione ou digite a Categoria / Gênero alvo
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <select
                      value={promoTargetValue}
                      onChange={(e) => setPromoTargetValue(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    >
                      <option value="">-- Escolher categoria cadastrada --</option>
                      {categories.map((c) => (
                        <option key={`sc-${c.id}`} value={c.label}>
                          {c.label} (Menu da Loja)
                        </option>
                      ))}
                      {availableCatalogMeta.categories.map((hc, i) => (
                        <option key={`hc-${i}`} value={hc.label}>
                          {hc.label} (Horus ERP)
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={promoTargetValue}
                      onChange={(e) => setPromoTargetValue(e.target.value)}
                      placeholder="Ou digite o nome da categoria (ex: Infantil)"
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>
              )}

              {promoTargetType === 'BRAND' && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Selecione ou digite a Editora / Marca alvo
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <select
                      value={promoTargetValue}
                      onChange={(e) => setPromoTargetValue(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    >
                      <option value="">-- Escolher editora do acervo --</option>
                      {availableCatalogMeta.brands.map((hb, i) => (
                        <option key={`hb-${i}`} value={hb.label}>
                          {hb.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={promoTargetValue}
                      onChange={(e) => setPromoTargetValue(e.target.value)}
                      placeholder="Ou digite o nome da editora..."
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                </div>
              )}

              {promoTargetType === 'PRODUCTS' && (
                <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-900/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      Livros selecionados para esta promoção ({promoSelectedProducts.length})
                    </span>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                      Use o buscador à direita para clicar e incluir livros →
                    </span>
                  </div>
                  {promoSelectedProducts.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">
                      Nenhum livro adicionado ainda. Pesquise no painel ao lado e clique em <strong>&ldquo;+ Incluir na Promoção&rdquo;</strong>.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {promoSelectedProducts.map((p) => (
                        <span
                          key={p.ean_gtin || p.sku}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-xs font-medium text-slate-800 dark:text-slate-200"
                        >
                          <span className="truncate max-w-[180px]">{p.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setPromoSelectedProducts((prev) =>
                                prev.filter((x) => (x.ean_gtin || x.sku) !== (p.ean_gtin || p.sku))
                              )
                            }
                            className="text-rose-500 hover:text-rose-700 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Discount Value (CurrencyInput with R$ / % switcher) + Validity Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Desconto Promocional
                    </label>
                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setPromoDiscountType('PERCENTAGE')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                          promoDiscountType === 'PERCENTAGE'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        % OFF
                      </button>
                      <button
                        type="button"
                        onClick={() => setPromoDiscountType('FIXED_BRL')}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                          promoDiscountType === 'FIXED_BRL'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        R$ OFF
                      </button>
                    </div>
                  </div>
                  <CurrencyInput
                    value={promoDiscountValue}
                    onChangeValue={(val) => setPromoDiscountValue(val)}
                    prefixStr={promoDiscountType === 'FIXED_BRL' ? 'R$ ' : ''}
                    suffixStr={promoDiscountType === 'PERCENTAGE' ? '%' : ''}
                    max={promoDiscountType === 'PERCENTAGE' ? 100 : undefined}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-extrabold text-indigo-600 dark:text-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Início da Validade (Opcional)
                  </label>
                  <input
                    type="date"
                    value={promoValidFrom}
                    onChange={(e) => setPromoValidFrom(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Válido Até (Expiração)
                  </label>
                  <input
                    type="date"
                    value={promoValidUntil}
                    onChange={(e) => setPromoValidUntil(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleCreatePromotion}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Criar e Ativar Promoção na Loja
                </button>
              </div>
            </div>

            {/* Existing Promotions List */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Regras Promocionais Cadastradas ({promotions.length})
                </h3>
              </div>

              {promotions.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                  Nenhuma promoção ativa no momento. Crie uma regra acima para exibir preços promocionais &ldquo;De / Por&rdquo; com selo de desconto na sua loja virtual.
                </div>
              ) : (
                <div className="space-y-3">
                  {promotions.map((pr) => {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const isExpired = Boolean(pr.valid_until && pr.valid_until < todayStr);
                    const isScheduled = Boolean(pr.valid_from && pr.valid_from > todayStr);
                    return (
                      <div
                        key={pr.id}
                        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          !pr.active || isExpired
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/50 opacity-65'
                            : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {pr.name}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-600 text-white">
                              {pr.discount_type === 'PERCENTAGE'
                                ? `-${Number(pr.discount_value).toFixed(0)}% OFF`
                                : `-R$ ${Number(pr.discount_value).toFixed(2).replace('.', ',')} OFF`}
                            </span>
                            {!pr.active ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 text-slate-600">
                                Pausada
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700">
                                Expirada
                              </span>
                            ) : isScheduled ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">
                                Agendada
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                Ativa na Loja
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            <strong>Escopo:</strong>{' '}
                            {pr.target_type === 'ALL'
                              ? 'Todo o Catálogo'
                              : pr.target_type === 'CATEGORY'
                              ? `Categoria "${pr.target_value}"`
                              : pr.target_type === 'BRAND'
                              ? `Editora "${pr.target_value}"`
                              : `${(pr.product_codes || []).length} livro(s) selecionado(s)`}
                            {(pr.valid_from || pr.valid_until) && (
                              <span className="ml-3 text-slate-500">
                                • Validade: {pr.valid_from || 'Imediato'} até{' '}
                                {pr.valid_until || 'Indeterminado'}
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTogglePromotion(pr.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              pr.active
                                ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            {pr.active ? 'Pausar' : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePromotion(pr.id)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                            title="Excluir promoção"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Live Book Search to Pick Products for Promotion */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  Seleção de Livros para Promoção
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  Buscar Produtos no Acervo
                </h3>
                <p className="text-xs text-slate-500">
                  Pesquise qualquer livro abaixo para adicioná-lo a uma promoção de produtos específicos ou conferir seu preço atual.
                </p>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchProductsForShowcase()}
                    placeholder="Título, ISBN, Autor ou Editora..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSearchProductsForShowcase()}
                  disabled={searchingProducts}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0"
                >
                  {searchingProducts ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                </button>
              </div>

              <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                {searchingProducts ? (
                  <div className="py-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    Consultando livros no acervo...
                  </div>
                ) : productSearchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Digite o título ou ISBN acima para buscar.
                  </div>
                ) : (
                  productSearchResults.map((prod: any) => {
                    const code = prod.ean_gtin || prod.sku;
                    const alreadyAdded = promoSelectedProducts.some(
                      (x) => (x.ean_gtin || x.sku) === code
                    );
                    return (
                      <div
                        key={code}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                            {prod.cover_url ? (
                              <img
                                src={getImageUrl(prod.cover_url)}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <BookOpen className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {prod.name}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {prod.brand || prod.author || 'Acervo'} • ISBN: {code}
                            </p>
                            <p className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                              De: R$ {Number(prod.base_price || 0).toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (promoTargetType !== 'PRODUCTS') {
                              setPromoTargetType('PRODUCTS');
                            }
                            if (alreadyAdded) {
                              setPromoSelectedProducts((prev) =>
                                prev.filter((x) => (x.ean_gtin || x.sku) !== code)
                              );
                            } else {
                              setPromoSelectedProducts((prev) => [
                                ...prev,
                                {
                                  sku: prod.sku,
                                  ean_gtin: prod.ean_gtin || prod.sku,
                                  name: prod.name,
                                  base_price: Number(prod.base_price || 0),
                                },
                              ]);
                              toast.success(`"${prod.name}" selecionado para a promoção!`);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                            alreadyAdded
                              ? 'bg-emerald-600 text-white'
                              : 'bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white'
                          }`}
                        >
                          {alreadyAdded ? '✓ Selecionado' : '+ Promoção'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

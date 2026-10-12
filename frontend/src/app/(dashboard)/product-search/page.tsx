'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Loader2,
  BookOpen,
  Package,
  AlertCircle,
  MapPin,
  BarChart3,
  Tag,
  Hash,
  Maximize2,
  Minimize2,
  X,
  Building2,
  Truck,
  RefreshCw,
  Camera,
  Globe,
  Plus,
  Check,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { getImageUrl } from '@/lib/image_helper';
import CameraBarcodeScanner from '@/components/inventory/CameraBarcodeScanner';
import { toast } from 'sonner';
import CustomerEncomendaDrawer, { EncomendaCartItem } from '@/components/encomendas/CustomerEncomendaDrawer';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
type SearchOption = {
  value: 'BARRAS_ISBN' | 'NOME' | 'COD_ITEM';
  label: string;
  placeholder: string;
  icon: React.ElementType;
};

const SEARCH_OPTIONS: SearchOption[] = [
  { value: 'BARRAS_ISBN', label: 'ISBN / Cód. Barras', placeholder: 'Ex: 9788543112596', icon: Hash },
  { value: 'NOME',        label: 'Nome do Produto',    placeholder: 'Ex: O Alquimista',   icon: BookOpen },
  { value: 'COD_ITEM',    label: 'Código Horus',       placeholder: 'Ex: 12345',           icon: Tag },
];

type HorusProduct = {
  COD_ITEM: number;
  NOM_ITEM: string;
  COD_BARRA_ITEM?: string;
  COD_ISBN_ITEM?: string;
  NOM_EDITORA?: string;
  DES_AUTOR?: string;
  SELO?: string;
  GENERO_NIVEL_1?: string;
  GENERO_NIVEL_2?: string;
  VLR_CAPA?: string | number;
  SALDO_DISPONIVEL?: number;
  QTD_SALDO_DISP?: number;
  SITUACAO_ITEM?: string;
  SITUACAO_ITEM_DESC?: string;
  DESC_SINOPSE?: string;
  DES_SINOPSE?: string;
  IMAGEM_ITEM?: string;
  TIPO?: string;
  STATUS_ITEM?: string;
  COVER_URL?: string | null;
  source?: 'HORUS' | 'CRONUZ';
  has_erp_registration?: boolean;
  badge_warning?: string | null;
  COD_ITEM_CRONUZ?: number;
};

type BranchStock = {
  filial_nome: string;
  cod_empresa?: string;
  cod_filial?: string;
  saldo: number;
  situacao_item?: string;
  registros_retornados?: number;
  erro?: string;
};

type DistributorResult = {
  slug: string;
  name: string;
  enabled: boolean;
  found: boolean;
  saldo: number;
  preco?: number;
  titulo?: string;
  error?: string;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function situacaoLabel(sit?: string): { label: string; color: string } {
  switch (sit) {
    case 'N': return { label: 'Item Normal',      color: 'bg-emerald-100 text-emerald-700' };
    case 'F': return { label: 'Em Falta',          color: 'bg-amber-100 text-amber-700'   };
    case 'E': return { label: 'Em falta (Editora)',color: 'bg-amber-100 text-amber-700'   };
    case 'A': return { label: 'Aguard. Lançamento',color: 'bg-blue-100 text-blue-700'     };
    case 'D': return { label: 'Descontinuado',     color: 'bg-red-100 text-red-700'       };
    case 'C': return { label: 'Cancelado',         color: 'bg-slate-100 text-slate-600'   };
    default:  return { label: sit || '—',          color: 'bg-slate-100 text-slate-500'   };
  }
}

function formatPrice(val?: string | number): string {
  if (!val) return '—';
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val;
  if (isNaN(num)) return String(val);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ──────────────────────────────────────────────
// Page Component
// ──────────────────────────────────────────────
export default function ProductSearchPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const [searchTerm, setSearchTerm]         = useState('');
  const [selectedOption, setSelectedOption] = useState<SearchOption>(SEARCH_OPTIONS[0]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [stockLoading, setStockLoading]     = useState(false);
  const [isFullscreen, setIsFullscreen]     = useState(false);

  const [product, setProduct]     = useState<HorusProduct | null>(null);
  const [products, setProducts]   = useState<HorusProduct[]>([]);
  const [stockData, setStockData] = useState<BranchStock[]>([]);
  const [stockStatus, setStockStatus] = useState<'ok' | 'partial_error' | 'offline' | null>(null);
  const [stockErrorMessage, setStockErrorMessage] = useState<string | null>(null);
  const [searched, setSearched]   = useState(false);

  // Distribuidores
  const [distLoading, setDistLoading] = useState(false);
  const [distLoaded,  setDistLoaded]  = useState(false);
  const [distData,    setDistData]    = useState<DistributorResult[]>([]);
  const [autoFetchDistributors, setAutoFetchDistributors] = useState<boolean>(false);

  // Inicializa autoFetchDistributors do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cronuz_auto_dist_search');
      if (saved !== null) {
        setAutoFetchDistributors(saved === 'true');
      }
    } catch {}
  }, []);

  // Camera Scanner Modal
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // ── Bookinfo Metadados Lookup ────────────────
  const [bookinfoLoading, setBookinfoLoading] = useState(false);
  const [bookinfoBookData, setBookinfoBookData] = useState<any | null>(null);
  const [bookinfoItems, setBookinfoItems] = useState<any[]>([]);
  const [bookinfoSearched, setBookinfoSearched] = useState(false);
  const [bookinfoError, setBookinfoError] = useState<string | null>(null);
  const [bookinfoTokenMissing, setBookinfoTokenMissing] = useState(false);
  const [bookinfoSearchType, setBookinfoSearchType] = useState<'AUTO' | 'ISBN' | 'TITULO' | 'AUTOR' | 'EDITORA' | 'SELO'>('AUTO');
  const [bookinfoCustomQuery, setBookinfoCustomQuery] = useState('');

  // ── Modal Cadastro Rápido de Livro Manual ──
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickIsbn, setQuickIsbn] = useState('');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPublisher, setQuickPublisher] = useState('');
  const [quickAuthor, setQuickAuthor] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickSynopsis, setQuickSynopsis] = useState('');
  const [quickCoverUrl, setQuickCoverUrl] = useState('');

  // ── Modal Abrir Encomenda ────────────────────
  const [showBackorderModal, setShowBackorderModal] = useState(false);
  const [backorderSubmitting, setBackorderSubmitting] = useState(false);
  const [orderCustomerDoc, setOrderCustomerDoc] = useState('');
  const [orderCustomerName, setOrderCustomerName] = useState('');
  const [orderCustomerPhone, setOrderCustomerPhone] = useState('');
  const [orderCustomerEmail, setOrderCustomerEmail] = useState('');
  const [orderQty, setOrderQty] = useState(1);
  const [orderNotes, setOrderNotes] = useState('');
  const [customerSearching, setCustomerSearching] = useState(false);
  const [moduleEncomendas, setModuleEncomendas] = useState(false);
  const [encomendaCart, setEncomendaCart] = useState<EncomendaCartItem[]>([]);
  const [isEncomendaDrawerOpen, setIsEncomendaDrawerOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  // Dados do seller
  const [companyName, setCompanyName] = useState<string>('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Autofoco inicial no campo de busca e restauração do carrinho de encomendas
  useEffect(() => {
    setMounted(true);
    inputRef.current?.focus();
    try {
      const saved = localStorage.getItem('cronuz_encomenda_cart');
      if (saved) {
        setEncomendaCart(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const saveEncomendaCart = (newCart: EncomendaCartItem[]) => {
    setEncomendaCart(newCart);
    try {
      localStorage.setItem('cronuz_encomenda_cart', JSON.stringify(newCart));
    } catch {}
  };

  // Carrega logo e nome do seller autenticado diretamente pelo cadastro da empresa
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    try {
      const u = getUser();
      if (u?.type === 'MASTER') setModuleEncomendas(true);
      if (u?.company_name) setCompanyName(u.company_name);
      if (u?.company_logo) setCompanyLogo(u.company_logo);

      if (u?.company_id) {
        fetch(`${apiUrl}/companies/${u.company_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            if (data.name) setCompanyName(data.name);
            setCompanyLogo(data.logo || null);
            if (data.module_encomendas !== undefined) {
              setModuleEncomendas(Boolean(data.module_encomendas) || u?.type === 'MASTER');
            }
          })
          .catch(() => {});
      } else {
        setCompanyLogo(null);
      }
    } catch {}
  }, [apiUrl]);

  // Fechar fullscreen com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Consulta distribuidores sob demanda ─────
  const fetchDistributorStock = useCallback(async (isbnToFetch?: string) => {
    const targetIsbn = isbnToFetch || product?.COD_BARRA_ITEM || product?.COD_ISBN_ITEM || '';
    if (!targetIsbn) {
      toast.info('Produto sem ISBN / Código de barras para consulta em fornecedores.');
      return;
    }
    setDistLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/product-search/distributor-stock?isbn=${encodeURIComponent(targetIsbn)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDistData(data.distributors || []);
        setDistLoaded(true);
      } else {
        toast.error('Erro ao consultar fornecedores parceiros.');
      }
    } catch {
      toast.error('Falha de conexão ao consultar fornecedores.');
    } finally {
      setDistLoading(false);
    }
  }, [apiUrl, product]);

  const handleToggleAutoDist = (checked: boolean) => {
    setAutoFetchDistributors(checked);
    try {
      localStorage.setItem('cronuz_auto_dist_search', String(checked));
    } catch {}
    if (checked && product && !distLoaded && !distLoading) {
      const isbn = product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || '';
      if (isbn) fetchDistributorStock(isbn);
    }
  };

  // ── Seleciona produto e busca estoque ─────
  const selectProduct = useCallback(async (p: HorusProduct) => {
    setProduct(p);
    setStockData([]);
    setStockStatus(null);
    setStockErrorMessage(null);
    setDistData([]);
    setDistLoaded(false);
    if (!p.COD_ITEM) return;

    const token = getToken();
    const isbn = p.COD_BARRA_ITEM || p.COD_ISBN_ITEM || '';

    // 1. HORUS STOCK: Dispara imediatamente sem bloquear a UI
    setStockLoading(true);
    fetch(`${apiUrl}/product-search/stock?cod_item=${p.COD_ITEM}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setStockData(data.branches || []);
          setStockStatus(data.status || 'ok');
          setStockErrorMessage(data.error_message || null);
          if (data.status === 'offline') {
            toast.error('O servidor do Horus não respondeu para as filiais.');
          }
        } else {
          setStockStatus('offline');
          setStockErrorMessage('Não foi possível comunicar com o servidor do ERP Horus.');
          toast.error('Falha de conexão ao consultar estoque no Horus.');
        }
      })
      .catch(() => {
        setStockStatus('offline');
        setStockErrorMessage('Não foi possível comunicar com o servidor do ERP Horus.');
        toast.error('Falha de conexão ao consultar estoque no Horus.');
      })
      .finally(() => {
        setStockLoading(false);
      });

    // 2. FORNECEDORES: Se autoFetchDistributors estiver ligado, busca em segundo plano
    if (autoFetchDistributors && isbn) {
      setDistLoading(true);
      fetch(`${apiUrl}/product-search/distributor-stock?isbn=${encodeURIComponent(isbn)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setDistData(data.distributors || []);
            setDistLoaded(true);
          }
        })
        .catch(() => {})
        .finally(() => {
          setDistLoading(false);
        });
    }
  }, [apiUrl, autoFetchDistributors]);

  // Helper para manter o campo selecionado por completo para novos bipes
  const selectSearchInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // ── Executa busca de produto ───────────────
  const executeSearch = useCallback(async (
    customTerm?: string,
    customOption?: SearchOption['value'],
    customSource: 'web' | 'physical_scanner' = 'web'
  ) => {
    const term = (customTerm !== undefined ? customTerm : searchTerm).trim();
    const optValue = customOption || selectedOption.value;

    if (!term) {
      toast.warning('Informe um termo para buscar.');
      return;
    }

    setSearchLoading(true);
    setProduct(null);
    setProducts([]);
    setStockData([]);
    setStockStatus(null);
    setStockErrorMessage(null);
    setDistData([]);
    setDistLoaded(false);
    setSearched(true);
    setBookinfoBookData(null);
    setBookinfoItems([]);
    setBookinfoSearched(false);
    setBookinfoError(null);
    setBookinfoTokenMissing(false);
    setBookinfoCustomQuery(term);
    if (optValue === 'NOME') {
      setBookinfoSearchType('TITULO');
    } else if (optValue === 'BARRAS_ISBN') {
      setBookinfoSearchType('ISBN');
    } else {
      setBookinfoSearchType('AUTO');
    }

    try {
      const token = getToken();
      const params = new URLSearchParams({
        term,
        search_option: optValue,
        source: customSource,
        offset: '0',
        limit: '10',
      });

      const res = await fetch(`${apiUrl}/product-search/product?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro ao buscar produto.');
      }

      const data = await res.json();
      const items: HorusProduct[] = data.items || [];

      if (items.length === 0) {
        toast.info('Nenhum produto encontrado no catálogo do sistema.');
      } else {
        setProducts(items);
        await selectProduct(items[0]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha na busca.');
    } finally {
      setSearchLoading(false);
      // Mantém o campo focado e 100% selecionado para o próximo bipe sem necessidade de apagar manualmente
      if (optValue === 'BARRAS_ISBN' || optValue === 'COD_ITEM') {
        setTimeout(selectSearchInput, 50);
      }
    }
  }, [searchTerm, selectedOption, apiUrl, selectProduct, selectSearchInput]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedOption.value === 'BARRAS_ISBN' || selectedOption.value === 'COD_ITEM') {
      selectSearchInput();
    }
    executeSearch();
  };

  const handleCameraScan = (scannedCode: string) => {
    setShowCameraScanner(false);
    const clean = scannedCode.trim();
    if (!clean) return;
    setSearchTerm(clean);
    const isbnOpt = SEARCH_OPTIONS.find(o => o.value === 'BARRAS_ISBN') || SEARCH_OPTIONS[0];
    setSelectedOption(isbnOpt);
    toast.success(`Código lido: ${clean}`);
    executeSearch(clean, 'BARRAS_ISBN');
    setTimeout(selectSearchInput, 50);
  };

  // ── Consulta Catálogo Oficial na Bookinfo (API v1.5) ──────────────
  const handleBookinfoLookup = async (customTerm?: string, customType?: string) => {
    const raw = (customTerm !== undefined ? customTerm : (bookinfoCustomQuery || searchTerm)).trim();
    const type = (customType !== undefined ? customType : bookinfoSearchType) || 'AUTO';

    if (!raw) {
      toast.warning('Informe um termo (Nome, Autor, Editora ou ISBN) para consultar na Bookinfo.');
      return;
    }

    setBookinfoLoading(true);
    setBookinfoSearched(true);
    setBookinfoBookData(null);
    setBookinfoItems([]);
    setBookinfoError(null);
    setBookinfoTokenMissing(false);

    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.set('query', raw);
      params.set('search_type', type);

      const res = await fetch(`${apiUrl}/product-search/bookinfo-lookup?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token_configured === false) {
          setBookinfoTokenMissing(true);
          toast.warning('Token da Bookinfo Metadados não configurado (nem no Seller nem no Master).');
        } else if (data.found && data.items && data.items.length > 0) {
          setBookinfoItems(data.items);
          setBookinfoBookData(data.data || data.items[0]);
          toast.success(`${data.items.length} obra(s) localizada(s) no catálogo da Bookinfo!`);
        } else {
          setBookinfoError(data.detail || 'Nenhuma obra localizada na Bookinfo para esta busca.');
          toast.info(data.detail || 'Nenhuma obra localizada no acervo da Bookinfo.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setBookinfoError(err.detail || 'Erro na consulta Bookinfo.');
        toast.error(err.detail || 'Erro ao consultar a Bookinfo.');
      }
    } catch {
      setBookinfoError('Falha de conexão com a API da Bookinfo.');
      toast.error('Falha de conexão com a Bookinfo.');
    } finally {
      setBookinfoLoading(false);
    }
  };

  // Preenche modal de cadastro rápido a partir dos dados retornados da Bookinfo
  const handleFillFromBookinfoData = (bData: any) => {
    setQuickIsbn(bData.isbn || searchTerm);
    setQuickTitle(bData.title || '');
    setQuickPublisher(bData.publisher || '');
    setQuickAuthor(bData.authors || '');
    setQuickPrice(bData.price ? String(bData.price) : '');
    setQuickSynopsis(bData.synopsis || '');
    setQuickCoverUrl(bData.cover_url || '');
    setShowQuickCreateModal(true);
  };

  // ── Cadastro Rápido de Livro Manual no Cronuz ──────────────────
  const handleQuickCreateBook = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickIsbn.trim() || !quickTitle.trim()) {
      toast.warning('ISBN e Título são obrigatórios.');
      return;
    }
    setQuickCreateLoading(true);
    try {
      const token = getToken();
      const payload = {
        isbn: quickIsbn.trim(),
        title: quickTitle.trim(),
        publisher: quickPublisher.trim() || null,
        author: quickAuthor.trim() || null,
        market_cover_price: quickPrice ? parseFloat(quickPrice.replace(',', '.')) : 0.0,
        synopsis: quickSynopsis.trim() || null,
        cover_url: quickCoverUrl.trim() || null,
      };
      const res = await fetch(`${apiUrl}/product-search/quick-create-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        toast.success(created.message || 'Produto cadastrado no Cronuz!');
        setShowQuickCreateModal(false);
        setProduct(created);
        setProducts([created]);
        setSearched(true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao cadastrar produto no Cronuz.');
      }
    } catch {
      toast.error('Falha de conexão.');
    } finally {
      setQuickCreateLoading(false);
    }
  };

  // ── Gestão da Encomenda Multi-título (Carrinho) ─────────────
  const handleAddToCart = (targetProd?: HorusProduct | null, customQty: number = 1) => {
    const p = targetProd || product;
    if (!p) return;
    const isbn = (p.COD_BARRA_ITEM || p.COD_ISBN_ITEM || String(p.COD_ITEM) || '').trim();
    if (!isbn) {
      toast.warning('Produto sem identificador ou ISBN para encomenda.');
      return;
    }
    const unitPrice = parseFloat(String(p.VLR_CAPA || 0)) || 0;
    const existingIndex = encomendaCart.findIndex(it => it.isbn === isbn);

    let updated: EncomendaCartItem[];
    if (existingIndex >= 0) {
      updated = [...encomendaCart];
      updated[existingIndex].quantity += customQty;
    } else {
      const newItem: EncomendaCartItem = {
        isbn,
        title: p.NOM_ITEM,
        publisher: p.NOM_EDITORA || p.SELO || undefined,
        author: p.DES_AUTOR || undefined,
        cover_url: p.COVER_URL || undefined,
        quantity: customQty,
        unit_price: unitPrice,
        horus_cod_item: p.COD_ITEM ? Number(p.COD_ITEM) : undefined,
      };
      updated = [...encomendaCart, newItem];
    }
    saveEncomendaCart(updated);
    toast.success(`"${p.NOM_ITEM.substring(0, 30)}..." adicionado à Encomenda!`, {
      action: {
        label: 'Ver Encomenda',
        onClick: () => setIsEncomendaDrawerOpen(true),
      },
    });
  };

  const handleBookinfoAddToCart = (book: any) => {
    const isbn = (book.isbn || '').trim();
    if (!isbn) return;
    const unitPrice = parseFloat(String(book.price || 0)) || 0;
    const existingIndex = encomendaCart.findIndex(it => it.isbn === isbn);

    let updated: EncomendaCartItem[];
    if (existingIndex >= 0) {
      updated = [...encomendaCart];
      updated[existingIndex].quantity += 1;
    } else {
      const newItem: EncomendaCartItem = {
        isbn,
        title: book.title,
        publisher: book.publisher || book.imprint || undefined,
        author: book.author || undefined,
        cover_url: book.cover_url || undefined,
        quantity: 1,
        unit_price: unitPrice,
      };
      updated = [...encomendaCart, newItem];
    }
    saveEncomendaCart(updated);
    toast.success(`"${book.title.substring(0, 30)}..." adicionado à Encomenda!`, {
      action: {
        label: 'Ver Encomenda',
        onClick: () => setIsEncomendaDrawerOpen(true),
      },
    });
  };

  const handleUpdateCartQty = (isbn: string, newQty: number) => {
    const updated = encomendaCart.map(it => it.isbn === isbn ? { ...it, quantity: newQty } : it);
    saveEncomendaCart(updated);
  };

  const handleUpdateCartPrice = (isbn: string, newPrice: number) => {
    const updated = encomendaCart.map(it => it.isbn === isbn ? { ...it, unit_price: newPrice } : it);
    saveEncomendaCart(updated);
  };

  const handleRemoveFromCart = (isbn: string) => {
    const updated = encomendaCart.filter(it => it.isbn !== isbn);
    saveEncomendaCart(updated);
    toast.info('Item removido da encomenda.');
  };

  const handleClearCart = () => {
    saveEncomendaCart([]);
  };

  // ── Abertura de Encomenda Modal Legado ────────────────────────
  const handleOpenBackorderModal = (prodToOrder?: HorusProduct) => {
    const target = prodToOrder || product;
    if (!target) return;
    handleAddToCart(target, 1);
  };

  const handleCustomerSearchByDoc = async () => {
    const rawDoc = orderCustomerDoc.replace(/\D/g, '');
    if (rawDoc.length < 11) return;
    setCustomerSearching(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/customers/search?q=${rawDoc}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const found = Array.isArray(data) ? data[0] : (data.items ? data.items[0] : null);
        if (found) {
          setOrderCustomerName(found.name || found.trade_name || '');
          setOrderCustomerPhone(found.phone || found.mobile_phone || '');
          setOrderCustomerEmail(found.email || '');
          toast.info(`Cliente existente localizado: ${found.name || found.trade_name}`);
        }
      }
    } catch {}
    finally {
      setCustomerSearching(false);
    }
  };

  const handleSubmitBackorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setBackorderSubmitting(true);
    try {
      const token = getToken();
      const isbnVal = product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || String(product.COD_ITEM);
      const payload = {
        isbn: isbnVal,
        title: product.NOM_ITEM,
        publisher: product.NOM_EDITORA || null,
        author: product.DES_AUTOR || null,
        quantity: Number(orderQty) || 1,
        cover_url: product.COVER_URL || null,
        price_estimated: typeof product.VLR_CAPA === 'number' ? product.VLR_CAPA : (product.VLR_CAPA ? parseFloat(String(product.VLR_CAPA).replace(',', '.')) : 0.0),
        has_erp_registration: Boolean(product.has_erp_registration),
        horus_cod_item: product.has_erp_registration ? product.COD_ITEM : null,
        origin: 'BUSCA_PRECO',
        notes: orderNotes.trim() || null,
        customer_document: orderCustomerDoc.replace(/\D/g, '') || null,
        customer_name: orderCustomerName.trim() || null,
        customer_phone: orderCustomerPhone.trim() || null,
        customer_email: orderCustomerEmail.trim() || null,
      };

      const res = await fetch(`${apiUrl}/backorders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Encomenda aberta com sucesso para o cliente!');
        setShowBackorderModal(false);
        setOrderCustomerDoc('');
        setOrderCustomerName('');
        setOrderCustomerPhone('');
        setOrderCustomerEmail('');
        setOrderNotes('');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao registrar encomenda.');
      }
    } catch {
      toast.error('Falha de conexão.');
    } finally {
      setBackorderSubmitting(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const clean = searchTerm.trim();
      if (!clean) return;
      const isBarcode = /^\d{10,14}$/.test(clean);
      if (isBarcode) {
        const isbnOpt = SEARCH_OPTIONS.find(o => o.value === 'BARRAS_ISBN') || SEARCH_OPTIONS[0];
        setSelectedOption(isbnOpt);
        executeSearch(clean, 'BARRAS_ISBN');
      } else {
        executeSearch(clean);
      }
      if (selectedOption.value === 'BARRAS_ISBN' || selectedOption.value === 'COD_ITEM' || isBarcode) {
        setTimeout(selectSearchInput, 10);
      }
    }
  };

  // Suporte a leitor de código de barras físico USB/Bluetooth mesmo fora do foco
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const onGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target === inputRef.current) return;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyTime;
      lastKeyTime = now;

      if (elapsed > 100) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter') {
        const candidate = barcodeBuffer.trim();
        if (candidate.length >= 8 && /^\d+$/.test(candidate)) {
          e.preventDefault();
          setSearchTerm(candidate);
          const isbnOpt = SEARCH_OPTIONS.find(o => o.value === 'BARRAS_ISBN') || SEARCH_OPTIONS[0];
          setSelectedOption(isbnOpt);
          executeSearch(candidate, 'BARRAS_ISBN', 'physical_scanner');
          barcodeBuffer = '';
          setTimeout(selectSearchInput, 30);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [executeSearch, selectSearchInput]);

  // ──────────────────────────────────────────
  // Content (reutilizado em normal e fullscreen)
  // ──────────────────────────────────────────
  const PageContent = (
    <div className="flex flex-col min-h-full">

      {/* ── Hero Header ────────────────────── */}
      <div className="relative overflow-hidden rounded-xl mb-5"
           style={{ background: 'linear-gradient(135deg, #00b4b4 0%, #007a7a 100%)' }}>
        <div className="absolute inset-0 opacity-10"
             style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative flex items-center justify-between px-5 py-4">
          {/* Esquerda: logo + nome */}
          <div className="flex items-center gap-3">
            {mounted && companyLogo ? (
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/20 backdrop-blur-sm shadow-md flex-shrink-0 flex items-center justify-center border border-white/30">
                <img
                  src={getImageUrl(companyLogo)}
                  alt={companyName || 'Logo'}
                  className="w-full h-full object-contain p-1"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-lg bg-white/20 backdrop-blur-sm shadow-md flex-shrink-0 flex items-center justify-center border border-white/30">
                <Building2 className="w-6 h-6 text-white/80" />
              </div>
            )}
            <div>
              {mounted && companyName && (
                <p suppressHydrationWarning className="text-white/65 text-[10px] font-semibold tracking-wider uppercase leading-none mb-1">
                  {companyName}
                </p>
              )}
              <h1 className="text-white font-bold text-lg leading-tight flex items-center gap-1.5">
                <Search className="w-4 h-4 opacity-80" />
                Busca Preço
              </h1>
            </div>
          </div>

          {/* Direita: botão encomendas e expandir */}
          <div className="flex items-center gap-2">
            {moduleEncomendas && (
              <Link
                href="/encomendas"
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/90 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold transition-all backdrop-blur-sm border border-emerald-400/40 shadow-xs cursor-pointer"
                title="Acessar painel de encomendas dos clientes"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Central de Encomendas</span>
              </Link>
            )}

            <button
              onClick={() => setIsFullscreen(v => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-sm border border-white/20 cursor-pointer"
              title={isFullscreen ? 'Sair da tela cheia' : 'Expandir para tela cheia'}
            >
              {isFullscreen
                ? <><Minimize2 className="w-3.5 h-3.5" /> Minimizar</>
                : <><Maximize2 className="w-3.5 h-3.5" /> Expandir</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Barra de busca ─────────────────── */}
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-5">
        {/* Radio options */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm shrink-0">
          {SEARCH_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = selectedOption.value === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-1.5 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all select-none
                  ${active
                    ? 'bg-[#00b4b4] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
              >
                <input
                  type="radio"
                  name="search_option"
                  value={opt.value}
                  checked={active}
                  onChange={() => {
                    setSelectedOption(opt);
                    if (opt.value === 'BARRAS_ISBN' || opt.value === 'COD_ITEM') {
                      setTimeout(selectSearchInput, 30);
                    } else {
                      inputRef.current?.focus();
                    }
                  }}
                  className="sr-only"
                />
                <Icon className="w-3.5 h-3.5" />
                {opt.label}
              </label>
            );
          })}
        </div>

        {/* Input + botões */}
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              inputMode={selectedOption.value === 'COD_ITEM' ? 'numeric' : 'text'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={e => {
                if (selectedOption.value === 'BARRAS_ISBN' || selectedOption.value === 'COD_ITEM') {
                  e.target.select();
                }
              }}
              onClick={e => {
                if (selectedOption.value === 'BARRAS_ISBN' || selectedOption.value === 'COD_ITEM') {
                  (e.target as HTMLInputElement).select();
                }
              }}
              onKeyDown={handleInputKeyDown}
              placeholder={selectedOption.placeholder}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-4 pr-11 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
            />
            {/* Botão de Leitor de Código de Barras via Câmera */}
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              title="Ler código de barras com a câmera do celular"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-[#00b4b4] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <button
            type="submit"
            disabled={searchLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#00b4b4] hover:bg-[#009999] text-white px-5 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-60 cursor-pointer shrink-0"
          >
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>
      </form>

      {/* ── Resultado ──────────────────────── */}
      <div className="w-full">
        <AnimatePresence>
          {searched && !searchLoading && products.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full space-y-6"
            >
              {/* ── Múltiplos resultados: carrossel horizontal de seleção rápida ── */}
              {products.length > 1 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Search className="w-4 h-4 text-[#00b4b4]" />
                      {products.length} produtos encontrados — selecione para ver estoque:
                    </p>
                    <span className="text-[11px] text-slate-400">Clique para alternar</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                    {products.map(p => {
                      const isActive = product?.COD_ITEM === p.COD_ITEM;
                      return (
                        <button
                          key={p.COD_ITEM}
                          onClick={() => selectProduct(p)}
                          className={`flex-shrink-0 flex items-center gap-3 text-left rounded-xl border p-2.5 min-w-[240px] max-w-[300px] transition-all
                            ${isActive
                              ? 'border-[#00b4b4] bg-[#00b4b4]/10 shadow-sm ring-2 ring-[#00b4b4]/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-[#00b4b4]/50 bg-slate-50/50 dark:bg-slate-800/40'
                            }`}
                        >
                          {p.COVER_URL ? (
                            <img
                              src={p.COVER_URL}
                              alt=""
                              className="w-10 h-14 object-contain rounded bg-white dark:bg-slate-900 shadow-xs shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-14 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                              <BookOpen className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                              {p.NOM_ITEM}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1 truncate">
                              {p.COD_BARRA_ITEM ? `ISBN: ${p.COD_BARRA_ITEM}` : `Cód: ${p.COD_ITEM}`}
                            </p>
                            {isActive && (
                              <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-[#00b4b4]">
                                ● Visualizando
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── GRID PRINCIPAL: COLUNA 5 (PRODUTO) E COLUNA 7 (ESTOQUES) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                {/* ── COLUNA DE 5: CARD DO PRODUTO (STICKY) ── */}
                <div className="lg:col-span-5 lg:sticky lg:top-4">
                  {product ? (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col">
                      {/* Capa com destaque */}
                      <div className="w-full p-6 flex items-center justify-center bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        {product.COVER_URL ? (
                          <img
                            src={product.COVER_URL}
                            alt={`Capa de ${product.NOM_ITEM}`}
                            className="max-h-72 w-auto object-contain rounded-xl shadow-md border border-slate-200/60 dark:border-slate-700"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-40 h-56 rounded-xl bg-slate-200 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-400 gap-2 border border-slate-200 dark:border-slate-700">
                            <BookOpen className="w-10 h-10 opacity-40" />
                            <span className="text-xs font-medium">Sem imagem</span>
                          </div>
                        )}
                      </div>

                      {/* Informações detalhadas */}
                      <div className="p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {product.SITUACAO_ITEM && (
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${situacaoLabel(product.SITUACAO_ITEM).color}`}>
                                {situacaoLabel(product.SITUACAO_ITEM).label}
                              </span>
                            )}
                            {product.TIPO && (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {product.TIPO}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono text-slate-400">
                            Cód. Horus: <strong className="text-slate-700 dark:text-slate-200">#{product.COD_ITEM}</strong>
                          </span>
                        </div>

                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
                          {product.NOM_ITEM}
                        </h2>

                        {/* Preço e saldo geral */}
                        <div className="flex flex-wrap items-baseline justify-between gap-3 pt-1">
                          {product.VLR_CAPA ? (
                            <span className="text-3xl font-black text-[#00b4b4]">
                              {formatPrice(product.VLR_CAPA)}
                            </span>
                          ) : (
                            <span className="text-lg font-bold text-slate-400">Preço não informado</span>
                          )}

                          {product.SALDO_DISPONIVEL !== undefined && (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold">
                              <Package className="w-4 h-4 text-slate-400" />
                              <span>Saldo Geral Horus: <strong className="text-[#00b4b4]">{product.SALDO_DISPONIVEL} un.</strong></span>
                            </div>
                          )}
                        </div>

                        {/* Botão de Encomenda Direta do Cliente (Posição Principal e Destaque Imediato) */}
                        {moduleEncomendas && (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleAddToCart(product)}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                            >
                              <Package className="w-4 h-4" />
                              {encomendaCart.some(it => it.isbn === (product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || String(product.COD_ITEM))) ? (
                                <>Na Encomenda ({encomendaCart.find(it => it.isbn === (product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || String(product.COD_ITEM)))?.quantity} un) • + Adicionar Outro</>
                              ) : (
                                <>📦 Adicionar à Encomenda do Cliente</>
                              )}
                            </button>
                          </div>
                        )}

                        {/* Metadados */}
                        <div className="space-y-2 text-xs pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                          {product.COD_BARRA_ITEM && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">ISBN / Barras:</span>
                              <span className="font-mono font-semibold">{product.COD_BARRA_ITEM}</span>
                            </p>
                          )}
                          {product.NOM_EDITORA && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">Editora:</span>
                              <span className="font-medium">{product.NOM_EDITORA}</span>
                            </p>
                          )}
                          {product.SELO && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">Selo:</span>
                              <span className="font-medium">{product.SELO}</span>
                            </p>
                          )}
                          {(product.GENERO_NIVEL_1 || product.GENERO_NIVEL_2) && (
                            <p className="flex justify-between">
                              <span className="text-slate-400 font-medium">Gênero:</span>
                              <span className="font-medium">{[product.GENERO_NIVEL_1, product.GENERO_NIVEL_2].filter(Boolean).join(' › ')}</span>
                            </p>
                          )}
                        </div>

                        {/* Aviso de Item apenas Cronuz (Sem cadastro no Hórus) */}
                        {product.badge_warning && (
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                            <span>{product.badge_warning}</span>
                          </div>
                        )}

                        {/* Sinopse */}
                        {product.DESC_SINOPSE && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Sinopse</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-4">
                              {product.DESC_SINOPSE}
                            </p>
                          </div>
                        )}

                        {/* Botão de Ação: Encomenda do Cliente (Independente do Saldo) */}
                        {moduleEncomendas && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => handleAddToCart(product)}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                            >
                              <Package className="w-4 h-4" />
                              {encomendaCart.some(it => it.isbn === (product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || String(product.COD_ITEM))) ? (
                                <>Na Encomenda ({encomendaCart.find(it => it.isbn === (product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || String(product.COD_ITEM)))?.quantity} un) • + Adicionar Outro</>
                              ) : (
                                <>📦 Adicionar à Encomenda do Cliente</>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 flex flex-col items-center justify-center text-center gap-2 text-slate-400">
                      <AlertCircle className="w-8 h-8" />
                      <p className="text-sm font-medium">Nenhum produto selecionado.</p>
                    </div>
                  )}
                </div>

                {/* ── COLUNA DE 7: ESTOQUES DAS LOJAS + DISTRIBUIDORAS ── */}
                <div className="lg:col-span-7 space-y-6">

                  {/* 1. ESTOQUE POR LOJA / FILIAL (HORUS) */}
                  <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#00b4b4]/10 flex items-center justify-center text-[#00b4b4]">
                          <BarChart3 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            Estoque por Loja / Filial (Horus)
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Locais de estoque configurados.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {product && moduleEncomendas && (
                          <button
                            type="button"
                            onClick={() => handleAddToCart(product)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                            title="Adicionar à encomenda do cliente"
                          >
                            <Package className="w-3.5 h-3.5" />
                            <span>+ Encomendar</span>
                          </button>
                        )}
                        {product && stockData.length > 0 && (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {stockData.length} filial(is)
                          </span>
                        )}
                        {product && !stockLoading && (
                          <button
                            onClick={() => selectProduct(product)}
                            title="Recarregar saldos"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-[#00b4b4] transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Alerta de instabilidade ou servidor offline */}
                    {stockStatus === 'offline' && !stockLoading && (
                      <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start justify-between gap-3 text-amber-900 dark:text-amber-200">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider">
                              Servidor do ERP Horus Indisponível
                            </p>
                            <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-300 leading-relaxed">
                              {stockErrorMessage || 'Não foi possível estabelecer comunicação com o ERP Horus para obter o estoque das lojas.'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => product && selectProduct(product)}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Tentar novamente
                        </button>
                      </div>
                    )}

                    {stockStatus === 'partial_error' && !stockLoading && (
                      <div className="mx-6 mt-3 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{stockErrorMessage || 'Algumas filiais apresentaram instabilidade de resposta.'}</span>
                      </div>
                    )}

                    {stockLoading && (
                      <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin text-[#00b4b4]" />
                        <span className="text-sm font-medium">Consultando saldo nas filiais do Horus de forma simultânea…</span>
                      </div>
                    )}

                    {!stockLoading && !product && (
                      <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
                        <MapPin className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Realize uma busca para ver o saldo por filial.</p>
                      </div>
                    )}

                    {!stockLoading && product && stockData.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="py-3 px-5">Filial / Loja</th>
                              <th className="py-3 px-3 text-center">Empresa / Filial</th>
                              <th className="py-3 px-3 text-center">Situação</th>
                              <th className="py-3 px-5 text-right">Saldo Disponível</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                            {stockData.map((b, idx) => {
                              const sit = situacaoLabel(b.situacao_item);
                              const hasError = Boolean(b.erro);
                              return (
                                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="py-3 px-5">
                                    <p className="font-semibold text-slate-800 dark:text-slate-100">{b.filial_nome}</p>
                                    {hasError && (
                                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>{b.erro}</span>
                                      </p>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                      Emp {b.cod_empresa || '—'} · Fil {b.cod_filial || '—'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {hasError ? (
                                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                                        Indisponível
                                      </span>
                                    ) : b.situacao_item ? (
                                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sit.color}`}>
                                        {sit.label}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-5 text-right">
                                    {hasError ? (
                                      <span className="inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-bold bg-slate-100 text-slate-400 dark:bg-slate-800">
                                        —
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-bold
                                        ${b.saldo > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                        {b.saldo} un
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!stockLoading && product && stockData.length === 0 && stockStatus !== 'offline' && (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                        <MapPin className="w-8 h-8 opacity-40" />
                        <p className="text-sm font-medium">Nenhuma filial configurada ou sem dados de estoque.</p>
                        <p className="text-xs">
                          Configure em{' '}
                          <a href="/logistics/branches" className="text-[#00b4b4] underline hover:no-underline">
                            Logística Horus → Filiais do Seller
                          </a>.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2. ESTOQUE DOS DISTRIBUIDORES / FORNECEDORES PARCEIROS */}
                  {product && (
                    <div className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800/80 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                            <Truck className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                              Estoque Fornecedores Parceiros
                              {distLoaded && !distLoading && (
                                <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                                  Ao vivo
                                </span>
                              )}
                            </h3>
                          </div>
                        </div>

                        {/* Controles de busca: Toggle automático e botão sob demanda */}
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 dark:text-slate-400 font-medium select-none hover:text-slate-700 dark:hover:text-slate-200">
                            <input
                              type="checkbox"
                              checked={autoFetchDistributors}
                              onChange={e => handleToggleAutoDist(e.target.checked)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span>Buscar automático</span>
                          </label>

                          {distLoading ? (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 rounded-lg border border-emerald-200/50">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Consultando...</span>
                            </div>
                          ) : distLoaded ? (
                            <button
                              type="button"
                              onClick={() => fetchDistributorStock()}
                              title="Atualizar saldo nos parceiros"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Atualizar</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => fetchDistributorStock()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Consultar Fornecedores</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {distLoading && distData.length === 0 ? (
                        <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                          <span className="text-sm font-medium">Consultando saldo nos fornecedores integrados…</span>
                        </div>
                      ) : !distLoaded && distData.length === 0 ? (
                        <div className="p-6 flex flex-col items-center justify-center text-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div className="max-w-md">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                              Consulta sob demanda
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              O estoque local das suas lojas já está disponível acima. Clique abaixo para consultar o saldo em tempo real nos fornecedores parceiros (Catavento, Disal, etc.) ou ative &quot;Buscar automático&quot;.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => fetchDistributorStock()}
                            disabled={distLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer mt-1"
                          >
                            <Truck className="w-4 h-4" />
                            Consultar Estoque nos Fornecedores
                          </button>
                        </div>
                      ) : distLoaded && distData.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          Nenhum fornecedor parceiro habilitado ou com saldo para este produto.
                        </div>
                      ) : (
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {distData.map((d, i) => {
                            const colors: Record<string, { border: string; bg: string; badge: string; text: string }> = {
                              catavento: { border: '#16a34a', bg: 'rgba(22, 163, 74, 0.04)', badge: '#16a34a', text: '#15803d' },
                              disal:     { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.04)', badge: '#2563eb', text: '#1d4ed8' },
                              inovacao:  { border: '#ea580c', bg: 'rgba(234, 88, 12, 0.04)', badge: '#ea580c', text: '#c2410c' },
                            };
                            const conf = colors[d.slug] || { border: '#00b4b4', bg: 'rgba(0, 180, 180, 0.04)', badge: '#00b4b4', text: '#008a8a' };
                            const hasDistError = Boolean(d.error);

                            return (
                              <div
                                key={i}
                                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden"
                                style={{
                                  borderLeftColor: hasDistError ? '#f59e0b' : conf.border,
                                  borderLeftWidth: 4,
                                  backgroundColor: hasDistError ? 'rgba(245, 158, 11, 0.03)' : conf.bg,
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{d.name}</h4>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Distribuidor</span>
                                  </div>
                                  {hasDistError ? (
                                    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 shrink-0">
                                      Indisponível
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold shrink-0"
                                      style={{
                                        background: d.saldo > 0 ? `${conf.badge}20` : '#f1f5f9',
                                        color:      d.saldo > 0 ? conf.text : '#94a3b8',
                                      }}
                                    >
                                      {d.saldo} un
                                    </span>
                                  )}
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs min-h-[22px]">
                                  {hasDistError ? (
                                    <span className="text-amber-700 dark:text-amber-400 flex items-start gap-1.5 text-[11px] leading-tight w-full">
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                                      <span>{d.error}</span>
                                    </span>
                                  ) : !d.found ? (
                                    <span className="text-slate-400 text-[11px]">Não localizado no catálogo</span>
                                  ) : (
                                    <>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                                        ● Disponível
                                      </span>
                                      {d.preco && (
                                        <span className="font-bold text-slate-700 dark:text-slate-200">
                                          R$ {d.preco.toFixed(2).replace('.', ',')}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Fallback quando nenhum produto foi localizado no catálogo do sistema ── */}
        {searched && !searchLoading && products.length === 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm sm:text-base">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>Obra não localizada no catálogo do sistema</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  O termo pesquisado não possui cadastro no ERP Hórus nem no catálogo Cronuz.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBookinfoLookup()}
                  disabled={bookinfoLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                  {bookinfoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  Consultar Catálogo Bookinfo
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQuickIsbn(searchTerm.replace(/\D/g, '') || '');
                    setQuickTitle(selectedOption.value === 'NOME' ? searchTerm : '');
                    setQuickPublisher('');
                    setQuickAuthor('');
                    setQuickPrice('');
                    setQuickSynopsis('');
                    setQuickCoverUrl('');
                    setShowQuickCreateModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar
                </button>
              </div>
            </div>

            {/* ── Barra de Consulta Personalizada na Bookinfo (Título, Autor, Editora, ISBN) ── */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <BookOpen className="w-4 h-4 text-sky-500" />
                  Buscar no Acervo Oficial Bookinfo (Metadados v1.5)
                </span>
                
                {/* Filtro por tipo de campo */}
                <div className="flex items-center gap-1 p-0.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs flex-wrap">
                  {(['TITULO', 'AUTOR', 'EDITORA', 'SELO', 'ISBN'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setBookinfoSearchType(st)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        bookinfoSearchType === st
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {st === 'TITULO' ? 'Título / Nome' : st === 'AUTOR' ? 'Autor' : st === 'EDITORA' ? 'Editora' : st === 'SELO' ? 'Selo Editorial' : 'ISBN'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={bookinfoCustomQuery}
                  onChange={(e) => setBookinfoCustomQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBookinfoLookup(bookinfoCustomQuery, bookinfoSearchType);
                    }
                  }}
                  placeholder={
                    bookinfoSearchType === 'TITULO'
                      ? 'Buscar na Bookinfo por título ou nome da obra...'
                      : bookinfoSearchType === 'AUTOR'
                      ? 'Buscar na Bookinfo por nome do autor (ex: Machado de Assis, Rowling)...'
                      : bookinfoSearchType === 'EDITORA'
                      ? 'Buscar na Bookinfo por editora (ex: Mythos, Rocco, Planeta)...'
                      : bookinfoSearchType === 'SELO'
                      ? 'Buscar na Bookinfo por selo editorial (ex: Círculo de Poemas, Rocco)...'
                      : 'Buscar na Bookinfo por ISBN ou código de barras (10 ou 13 dígitos)...'
                  }
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 px-3.5 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />

                <button
                  type="button"
                  onClick={() => handleBookinfoLookup(bookinfoCustomQuery, bookinfoSearchType)}
                  disabled={bookinfoLoading || !bookinfoCustomQuery.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer shrink-0"
                >
                  {bookinfoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar na Bookinfo
                </button>
              </div>
            </div>

            {/* Aviso se o token Bookinfo não estiver configurado */}
            {bookinfoTokenMissing && (
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                <strong>Atenção:</strong> O Token da Bookinfo Metadados não foi configurado. O administrador Master pode configurá-lo no menu <strong>Hub Sync Bookinfo &rarr; Token Metadados (Global)</strong> para liberar as consultas automaticamente para todos os sellers.
              </div>
            )}

            {/* Loading da consulta Bookinfo */}
            {bookinfoLoading && (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-sky-500" />
                <p className="text-xs font-semibold">Consultando acervo oficial na API Bookinfo Metadados...</p>
              </div>
            )}

            {/* Aviso quando pesquisou e não encontrou na Bookinfo */}
            {bookinfoSearched && !bookinfoLoading && bookinfoItems.length === 0 && !bookinfoTokenMissing && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-slate-500 text-xs">
                {bookinfoError || 'Nenhuma obra localizada no acervo da Bookinfo para os filtros informados. Você pode cadastrar manualmente pelo botão "Cadastrar" acima.'}
              </div>
            )}

            {/* Resultados encontrados na Bookinfo (Lista / Grid) */}
            {bookinfoItems && bookinfoItems.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-sky-500" />
                    {bookinfoItems.length} obra(s) localizada(s) na Bookinfo Metadados
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Selecione uma obra abaixo para importar os dados automaticamente
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {bookinfoItems.map((bItem, idx) => (
                    <div
                      key={bItem.isbn || idx}
                      className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/30 dark:bg-sky-950/20 p-4 flex flex-col justify-between gap-3 shadow-xs hover:border-sky-300 transition-all"
                    >
                      <div className="flex gap-3.5 items-start">
                        {bItem.cover_url ? (
                          <img
                            src={bItem.cover_url}
                            alt=""
                            className="w-16 h-24 object-contain rounded-lg bg-white dark:bg-slate-900 shadow-xs border border-slate-200 dark:border-slate-800 shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-24 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <BookOpen className="w-6 h-6 text-slate-400" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-1">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                            {bItem.title}
                          </h4>
                          {bItem.subtitle && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-1">
                              {bItem.subtitle}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">
                            <strong>Autor:</strong> {bItem.authors || '—'}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">
                            <strong>Editora:</strong> {bItem.publisher || '—'} {bItem.seal ? `(${bItem.seal})` : ''}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500">
                            ISBN: {bItem.isbn} {bItem.price ? `• R$ ${Number(bItem.price).toFixed(2).replace('.', ',')}` : ''}
                          </p>
                        </div>
                      </div>

                      {bItem.synopsis && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                          {bItem.synopsis}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        {moduleEncomendas && (
                          <button
                            type="button"
                            onClick={() => handleBookinfoAddToCart(bItem)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-200 text-xs font-bold transition-all cursor-pointer"
                          >
                            <Package className="w-3.5 h-3.5" />
                            + Adicionar à Encomenda
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleFillFromBookinfoData(bItem)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Importar para Catálogo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Estado inicial vazio */}
        {!searched && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Search className="w-12 h-12 opacity-30" />
            <p className="text-sm font-medium">Nenhuma busca realizada</p>
            <p className="text-xs">Use a barra acima para consultar um produto por ISBN, nome ou código Horus.</p>
          </div>
        )}
      </div>
    </div>
  );

  // Portal do fullscreen — renderizado direto no document.body para escapar
  // de qualquer stacking context (backdrop-blur, z-index, overflow) do layout pai
  const FullscreenPortal = isFullscreen && typeof document !== 'undefined'
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            overflowY: 'auto',
            background: 'var(--color-bg-primary, #f8fafc)',
          }}
        >
          {/* Botão fechar */}
          <button
            onClick={() => setIsFullscreen(false)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 12,
              background: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0',
              color: '#475569',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
            Sair da tela cheia
          </button>
          {PageContent}
        </div>,
        document.body
      )
    : null;

  // ──────────────────────────────────────────
  // Normal layout — sem padding extra (o layout já tem p-6)
  // ──────────────────────────────────────────
  return (
    <>
      {FullscreenPortal}
      <div>{PageContent}</div>
      <CameraBarcodeScanner
        isActive={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={handleCameraScan}
      />

      {/* ── MODAL CADASTRO RÁPIDO DE LIVRO MANUAL NO CRONUZ ── */}
      {showQuickCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#00b4b4]" />
                Cadastrar Livro no Catálogo Cronuz
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              O produto ficará registrado no Cronuz com destaque de &quot;Sem cadastro no Hórus&quot; até que seja cadastrado no ERP.
            </p>

            <form onSubmit={handleQuickCreateBook} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ISBN / Código de Barras *
                </label>
                <input
                  type="text"
                  required
                  value={quickIsbn}
                  onChange={(e) => setQuickIsbn(e.target.value)}
                  placeholder="Ex: 9788543112596"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Título do Livro *
                </label>
                <input
                  type="text"
                  required
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Título completo da obra"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Editora / Marca
                  </label>
                  <input
                    type="text"
                    value={quickPublisher}
                    onChange={(e) => setQuickPublisher(e.target.value)}
                    placeholder="Editora"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Autor
                  </label>
                  <input
                    type="text"
                    value={quickAuthor}
                    onChange={(e) => setQuickAuthor(e.target.value)}
                    placeholder="Nome do autor"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Preço de Capa no Mercado (R$)
                  </label>
                  <input
                    type="text"
                    value={quickPrice}
                    onChange={(e) => setQuickPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    URL da Imagem da Capa (Opcional)
                  </label>
                  <input
                    type="text"
                    value={quickCoverUrl}
                    onChange={(e) => setQuickCoverUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowQuickCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={quickCreateLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  {quickCreateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar no Cronuz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL ABERTURA DE ENCOMENDA PARA CLIENTE ── */}
      {showBackorderModal && moduleEncomendas && product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                Abrir Encomenda para Cliente
              </h3>
              <button
                type="button"
                onClick={() => setShowBackorderModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo do produto encomendado */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              {product.COVER_URL ? (
                <img src={product.COVER_URL} alt="" className="w-10 h-14 object-contain rounded bg-white dark:bg-slate-900 shadow-xs shrink-0" />
              ) : (
                <div className="w-10 h-14 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">
                  {product.NOM_ITEM}
                </p>
                <p className="text-[11px] text-slate-500 font-mono">
                  ISBN: {product.COD_BARRA_ITEM || product.COD_ISBN_ITEM || product.COD_ITEM}
                </p>
                {product.badge_warning && (
                  <span className="inline-block text-[10px] text-amber-600 font-semibold mt-0.5">
                    ● Sem cadastro no ERP Hórus (Catálogo Cronuz)
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmitBackorder} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    CPF ou CNPJ do Cliente
                  </label>
                  <input
                    type="text"
                    value={orderCustomerDoc}
                    onChange={(e) => setOrderCustomerDoc(e.target.value)}
                    onBlur={handleCustomerSearchByDoc}
                    placeholder="Somente dígitos"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                  {customerSearching && (
                    <span className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Verificando base...
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Quantidade Solicitada *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={orderQty}
                    onChange={(e) => setOrderQty(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  value={orderCustomerName}
                  onChange={(e) => setOrderCustomerName(e.target.value)}
                  placeholder="Nome do cliente solicitante"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp / Celular
                  </label>
                  <input
                    type="text"
                    value={orderCustomerPhone}
                    onChange={(e) => setOrderCustomerPhone(e.target.value)}
                    placeholder="(DD) 99999-9999"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail (Opcional)
                  </label>
                  <input
                    type="email"
                    value={orderCustomerEmail}
                    onChange={(e) => setOrderCustomerEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Observações Internas
                </label>
                <textarea
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Observação para compras ou atendimento..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00b4b4]/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBackorderModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={backorderSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  {backorderSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Confirmar e Abrir Encomenda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Botão Flutuante de Encomenda do Cliente (Carrinho Multi-título) ── */}
      {moduleEncomendas && mounted && encomendaCart.length > 0 && (
        <aside
          aria-label="Carrinho de Encomenda do Cliente"
          className="fixed bottom-6 right-6 z-40"
        >
          <button
            type="button"
            onClick={() => setIsEncomendaDrawerOpen(true)}
            className="flex items-center gap-3.5 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-white/20 ring-4 ring-emerald-500/20"
          >
            <div className="relative">
              <Package className="w-5 h-5 text-white" />
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-black flex items-center justify-center shadow-xs">
                {encomendaCart.length}
              </span>
            </div>
            <div className="text-left">
              <p className="text-xs font-bold leading-tight flex items-center gap-1.5">
                <span>Encomenda do Cliente</span>
                <span className="text-[10px] font-semibold bg-white/20 px-1.5 py-0.5 rounded-full">
                  {encomendaCart.reduce((acc, it) => acc + it.quantity, 0)} un
                </span>
              </p>
              <p className="text-[11px] text-white/90 font-medium">
                Total: R$ {encomendaCart.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0).toFixed(2).replace('.', ',')}
              </p>
            </div>
            <span className="ml-1 px-2.5 py-1 rounded-xl bg-white text-emerald-800 text-xs font-bold shadow-xs">
              Ver Encomenda →
            </span>
          </button>
        </aside>
      )}

      {/* ── Gaveta Lateral (Drawer) de Encomenda do Cliente ── */}
      {moduleEncomendas && (
        <CustomerEncomendaDrawer
          isOpen={isEncomendaDrawerOpen}
          onClose={() => setIsEncomendaDrawerOpen(false)}
          items={encomendaCart}
          onUpdateQuantity={handleUpdateCartQty}
          onUpdatePrice={handleUpdateCartPrice}
          onRemoveItem={handleRemoveFromCart}
          onClearCart={handleClearCart}
          branches={
            stockData && stockData.length > 0
              ? Array.from(new Set(stockData.map(s => s.filial_nome).filter(Boolean)))
              : ['Loja Principal (Balcão)']
          }
        />
      )}
    </>
  );
}

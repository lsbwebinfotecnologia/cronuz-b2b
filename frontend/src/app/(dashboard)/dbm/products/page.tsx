'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Search,
  Plus,
  ArrowLeft,
  RefreshCw,
  Edit3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  Save,
  BookOpen,
  Building2,
  Calendar,
  FileSpreadsheet,
  Info,
  DatabaseZap,
  Check,
  Barcode,
  History,
  Trash2,
  ExternalLink,
  Sparkles,
  Keyboard
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import CurrencyInput from '@/components/CurrencyInput';

interface TiragemRow {
  id: number;
  data_tiragem: string;
  tiragem: number;
  fre: string;
  da_roy: string;
  pis: string;
  da_advance: string;
  custo_db: string;
  custo_pro: string;
  custo_fin: string;
  roy: string;
  da_s: string;
  ttc: string;
}

interface ProductGridItem {
  id: number;
  sku: string;
  name: string;
  short_description?: string;
  long_description?: string;
  isbn?: string;
  ean_gtin?: string;
  additional_isbns?: string;
  barcode?: string;
  cod_dbm?: string;
  publisher_code?: string;
  pages?: number | null;
  launch_month?: number | null;
  launch_year?: number | null;
  launch_date?: string | null;
  collection?: string;
  subject?: string;
  category_name?: string;
  base_price: number;
  promotional_price?: number | null;
  cost_price?: number | null;
  weight_kg?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  length_cm?: number | null;
  binding_finish?: string;
  royalty_rule?: string;
  edition_number?: string;
  units_per_box?: number | null;
  out_of_print_date?: string;
  external_link?: string;
  royalty_company?: string;
  ebook_royalty_pct?: number | null;
  contract_signed_date?: string;
  contract_validity_years?: number | null;
  contract_expires_date?: string;
  dbm_tiragens?: string;
  cover_url?: string;
  stock_quantity: number;
  consignment_stock?: number;
  sales_365?: number;
  sales_90?: number;
  brand?: string;
  is_out_of_print?: boolean;
  status?: string;
  is_highlighted_red?: boolean;
  horus_cod_item?: number | null;
}

interface HorusEstoqueItem {
  cod_item: string;
  isbn: string;
  nome_item: string;
  editora: string;
  preco: number;
  estoque: number;
  assunto: string;
  sinopse?: string;
  qtd_caixa?: number;
  status?: string;
  data_lancamento?: string;
  already_imported?: boolean;
  local_product_id?: number | null;
  additional_isbns?: string;
}

interface DbmBookFormState {
  id?: number;
  sku: string;
  name: string;
  short_description: string;
  long_description: string;
  ean_gtin: string;
  barcode: string;
  additional_isbns: string;
  cod_dbm: string;
  horus_cod_item: string;
  brand: string;
  publisher_code: string;
  pages: string;
  base_price: number;
  launch_month: string;
  launch_year: string;
  launch_date: string;
  collection: string;
  subject: string;
  width_cm: string;
  height_cm: string;
  weight_grams: string;
  binding_finish: string;
  royalty_rule: string;
  edition_number: string;
  units_per_box: string;
  is_out_of_print: boolean;
  out_of_print_date: string;
  external_link: string;
  royalty_company: string;
  ebook_royalty_pct: number;
  contract_signed_date: string;
  contract_validity_years: string;
  contract_expires_date: string;
  cover_url: string;
  stock_quantity: number;
  consignment_stock: number;
  sales_90: number;
  sales_365: number;
  tiragens: TiragemRow[];
}

const EMPTY_BOOK_FORM: DbmBookFormState = {
  sku: '',
  name: '',
  short_description: '',
  long_description: '',
  ean_gtin: '',
  barcode: '',
  additional_isbns: '',
  cod_dbm: '',
  horus_cod_item: '',
  brand: '',
  publisher_code: '',
  pages: '',
  base_price: 0,
  launch_month: '',
  launch_year: '',
  launch_date: '',
  collection: '',
  subject: '',
  width_cm: '0',
  height_cm: '0',
  weight_grams: '0',
  binding_finish: 'Brochura',
  royalty_rule: 'Sem Royalties',
  edition_number: '1',
  units_per_box: '0',
  is_out_of_print: false,
  out_of_print_date: '',
  external_link: '',
  royalty_company: '',
  ebook_royalty_pct: 0,
  contract_signed_date: '',
  contract_validity_years: '',
  contract_expires_date: '',
  cover_url: '',
  stock_quantity: 0,
  consignment_stock: 0,
  sales_90: 0,
  sales_365: 0,
  tiragens: [
    {
      id: 1,
      data_tiragem: '',
      tiragem: 0,
      fre: '0,00%',
      da_roy: '0,00%',
      pis: '0,00%',
      da_advance: 'R$ 0,00',
      custo_db: 'R$ 0,00',
      custo_pro: 'R$ 0,00',
      custo_fin: 'R$ 0,00',
      roy: 'R$ 0,00',
      da_s: 'R$ 0,00',
      ttc: 'R$ 0,00'
    }
  ]
};

// Avalia a janela de Novidade (-9 meses até +6 meses) a partir da Data de Lançamento
function evaluateLaunchWindow(launchDateStr?: string | null): {
  status: 'PRE_LAUNCH' | 'ACTIVE_NOVELTY' | 'EXPIRING_SOON' | 'BACKLIST' | 'NONE';
  label: string;
  badgeClass: string;
  detail: string;
} {
  if (!launchDateStr) {
    return {
      status: 'NONE',
      label: 'Sem Data',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      detail: 'Data de lançamento não informada'
    };
  }
  const clean = String(launchDateStr).slice(0, 10);
  const dt = new Date(`${clean}T12:00:00`);
  if (isNaN(dt.getTime())) {
    return {
      status: 'NONE',
      label: 'Sem Data',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
      detail: 'Data inválida'
    };
  }

  const now = new Date();
  const diffDays = Math.round((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  // Limite inferior: -275 dias (~9 meses atrás) | Limite superior: +185 dias (~6 meses à frente)
  const daysRemainingAsNovelty = 275 + diffDays;

  if (diffDays > 0 && diffDays <= 185) {
    return {
      status: 'PRE_LAUNCH',
      label: `Pré-Lançamento (+${diffDays}d)`,
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      detail: `Entra em lançamento em ${diffDays} dia(s)`
    };
  }
  if (diffDays <= 0 && diffDays >= -275) {
    if (daysRemainingAsNovelty <= 30) {
      return {
        status: 'EXPIRING_SOON',
        label: `⏳ Expira em ${daysRemainingAsNovelty}d`,
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
        detail: `Sai da aba Novidades em ${daysRemainingAsNovelty} dia(s)`
      };
    }
    return {
      status: 'ACTIVE_NOVELTY',
      label: `✨ Novidade (${daysRemainingAsNovelty}d rest.)`,
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      detail: `Dentro da janela de Novidades (-9m a +6m)`
    };
  }
  return {
    status: 'BACKLIST',
    label: 'Fundo de Catálogo',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    detail: diffDays < -275 ? 'Lançado há mais de 9 meses' : 'Acima de 6 meses no futuro'
  };
}

export default function DbmProductsSearchPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<number>(() => {
    const user = getUser();
    return user?.company_id || 1;
  });

  // Abas principais: 'SEARCH' = Planilha de Pesquisa | 'FORM' = Ficha de Cadastro do Livro
  const [activeAccessTab, setActiveAccessTab] = useState<'SEARCH' | 'FORM'>('SEARCH');

  // Modo de Edição Rápida Estilo Excel direto na planilha de Pesquisa
  const [excelInlineEditMode, setExcelInlineEditMode] = useState(false);
  const [inlineSavingId, setInlineSavingId] = useState<number | null>(null);

  useEffect(() => {
    const freshUser = getUser();
    if (freshUser?.company_id) {
      setCompanyId(freshUser.company_id);
      fetchProducts(false, freshUser.company_id);
    } else {
      const token = getToken();
      if (token) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/me`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(res => res.json())
          .then(data => {
            const cid = data?.id || 1;
            setCompanyId(cid);
            fetchProducts(false, cid);
          })
          .catch(() => {
            fetchProducts(false, 1);
          });
      } else {
        fetchProducts(false, 1);
      }
    }
  }, []);

  // Filtros Superiores da Aba Pesquisa de Produtos
  const [filterTitle, setFilterTitle] = useState('');
  const [filterIsbn, setFilterIsbn] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterPublisher, setFilterPublisher] = useState('');
  const [filterLaunchWindow, setFilterLaunchWindow] = useState<'ALL' | 'NOVELTY' | 'EXPIRING' | 'BACKLIST'>('ALL');
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);

  // Estados de Dados da Planilha Principal
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [quickSearchFooter, setQuickSearchFooter] = useState('');

  // Estado do Formulário "Cadastro de Livros"
  const [bookForm, setBookForm] = useState<DbmBookFormState>(EMPTY_BOOK_FORM);
  const [newExtraIsbnInput, setNewExtraIsbnInput] = useState('');
  const [savingBook, setSavingBook] = useState(false);
  const [enrichingFromHorus, setEnrichingFromHorus] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formQuickSearch, setFormQuickSearch] = useState('');

  // Modal de Histórico de Vendas / Movimentações do Produto
  const [showSalesHistoryModal, setShowSalesHistoryModal] = useState(false);
  const [productHistoryData, setProductHistoryData] = useState<{ stock: any[]; prices: any[] } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);

  // Estados da Sincronização Horus SQL (Itens_estoque_geral)
  const [showHorusSyncModal, setShowHorusSyncModal] = useState(false);
  const [horusSearchTerm, setHorusSearchTerm] = useState('');
  const [horusEditoraFilter, setHorusEditoraFilter] = useState('');
  const [horusItems, setHorusItems] = useState<HorusEstoqueItem[]>([]);
  const [horusTotalCount, setHorusTotalCount] = useState(0);
  const [horusStats, setHorusStats] = useState({ totalAll: 0, totalImported: 0, totalNotImported: 0 });
  const [horusOffset, setHorusOffset] = useState(0);
  const [horusLimit, setHorusLimit] = useState(5000);
  const [horusFilterMode, setHorusFilterMode] = useState<'ALL' | 'ONLY_NEW' | 'ONLY_IMPORTED'>('ALL');
  const [horusOnlyWithStock, setHorusOnlyWithStock] = useState(false);
  const [loadingHorusItems, setLoadingHorusItems] = useState(false);
  const [selectedHorusCodes, setSelectedHorusCodes] = useState<Record<string, boolean>>({});
  const [horusExtraIsbnsMap, setHorusExtraIsbnsMap] = useState<Record<string, string>>({});
  const [importingHorus, setImportingHorus] = useState(false);
  const [horusSyncMessage, setHorusSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Converte um ProductGridItem em DbmBookFormState para a Ficha de Cadastro
  const mapProductToForm = (p: ProductGridItem): DbmBookFormState => {
    let parsedTiragens: TiragemRow[] = [];
    if (p.dbm_tiragens) {
      try {
        const arr = JSON.parse(p.dbm_tiragens);
        if (Array.isArray(arr) && arr.length > 0) {
          parsedTiragens = arr;
        }
      } catch {
        parsedTiragens = [];
      }
    }
    if (parsedTiragens.length === 0) {
      parsedTiragens = [
        {
          id: 1,
          data_tiragem: p.launch_date ? String(p.launch_date).slice(0, 10).split('-').reverse().join('/') : '',
          tiragem: p.stock_quantity || 0,
          fre: '0,00%',
          da_roy: p.ebook_royalty_pct ? `${Number(p.ebook_royalty_pct).toFixed(2).replace('.', ',')}%` : '0,00%',
          pis: '0,00%',
          da_advance: 'R$ 0,00',
          custo_db: p.cost_price ? `R$ ${Number(p.cost_price).toFixed(2).replace('.', ',')}` : 'R$ 0,00',
          custo_pro: 'R$ 0,00',
          custo_fin: 'R$ 0,00',
          roy: 'R$ 0,00',
          da_s: 'R$ 0,00',
          ttc: 'R$ 0,00'
        }
      ];
    }

    const launchDateStr = p.launch_date ? String(p.launch_date).slice(0, 10) : '';
    let lMonth = p.launch_month ? String(p.launch_month) : '';
    let lYear = p.launch_year ? String(p.launch_year) : '';
    if (launchDateStr && (!lMonth || !lYear)) {
      const parts = launchDateStr.split('-');
      if (parts.length === 3) {
        if (!lYear) lYear = parts[0];
        if (!lMonth) lMonth = String(parseInt(parts[1], 10));
      }
    }

    const weightGr = p.weight_kg != null ? String(Math.round(Number(p.weight_kg) * 1000)) : '0';

    return {
      id: p.id,
      sku: p.sku || String(p.horus_cod_item || p.id || ''),
      name: p.name || '',
      short_description: p.short_description || '',
      long_description: p.long_description || '',
      ean_gtin: p.ean_gtin || p.isbn || '',
      barcode: p.barcode || p.ean_gtin || p.isbn || '',
      additional_isbns: p.additional_isbns || '',
      cod_dbm: p.cod_dbm || String(p.id || p.sku || ''),
      horus_cod_item: p.horus_cod_item != null ? String(p.horus_cod_item) : (p.sku || ''),
      brand: p.brand || '',
      publisher_code: p.publisher_code || '',
      pages: p.pages != null ? String(p.pages) : '',
      base_price: Number(p.base_price || 0),
      launch_month: lMonth,
      launch_year: lYear,
      launch_date: launchDateStr,
      collection: p.collection || '',
      subject: p.subject || p.category_name || '',
      width_cm: p.width_cm != null ? String(p.width_cm) : '0',
      height_cm: p.height_cm != null ? String(p.height_cm) : '0',
      weight_grams: weightGr,
      binding_finish: p.binding_finish || (p.name?.toUpperCase().includes('E-BOOK') ? 'E-book' : 'Brochura'),
      royalty_rule: p.royalty_rule || 'Sem Royalties',
      edition_number: p.edition_number || '1',
      units_per_box: p.units_per_box != null ? String(p.units_per_box) : '0',
      is_out_of_print: Boolean(p.is_out_of_print),
      out_of_print_date: p.out_of_print_date || '',
      external_link: p.external_link || '',
      royalty_company: p.royalty_company || p.brand || '',
      ebook_royalty_pct: Number(p.ebook_royalty_pct || 0),
      contract_signed_date: p.contract_signed_date || '',
      contract_validity_years: p.contract_validity_years != null ? String(p.contract_validity_years) : '',
      contract_expires_date: p.contract_expires_date || '',
      cover_url: p.cover_url || '',
      stock_quantity: Number(p.stock_quantity || 0),
      consignment_stock: Number(p.consignment_stock || 0),
      sales_90: Number(p.sales_90 || 0),
      sales_365: Number(p.sales_365 || 0),
      tiragens: parsedTiragens
    };
  };

  // Busca de Produtos sincronizados no DBM
  const fetchProducts = async (_isSearchAction = false, overrideCompanyId?: number) => {
    setLoading(true);
    const targetCompanyId = overrideCompanyId || companyId;

    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('limit', '5000');
      params.append('source', 'dbm');
      if (targetCompanyId) params.append('company_id', String(targetCompanyId));

      const combinedQuery = [filterTitle, filterIsbn].filter(Boolean).join(' ').trim();
      if (combinedQuery) {
        params.append('search', combinedQuery);
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.items || []);

        const mapped: ProductGridItem[] = rawList.map((p: any) => {
          const stock = Number(p.stock_quantity || 0);
          const isEsgotado = Boolean(p.is_out_of_print) || p.status === 'INACTIVE';

          return {
            ...p,
            id: p.id,
            sku: p.sku || String(p.id),
            name: p.name || 'Sem Título',
            isbn: p.ean_gtin || p.isbn || p.sku || '',
            ean_gtin: p.ean_gtin || p.isbn || '',
            additional_isbns: p.additional_isbns || '',
            category_name: p.subject || p.category?.name || p.category_name || 'Geral',
            base_price: Number(p.base_price || p.price || 0),
            stock_quantity: stock,
            consignment_stock: Number(p.consignment_stock || 0),
            sales_365: Number(p.sales_365 || 0),
            sales_90: Number(p.sales_90 || 0),
            brand: p.brand?.name || p.brand || 'Própria',
            is_out_of_print: isEsgotado,
            status: p.status,
            is_highlighted_red: isEsgotado || stock <= 0,
            horus_cod_item: p.horus_cod_item
          };
        });

        setProducts(mapped);
        if (mapped.length > 0) {
          setSelectedIndex(prev => (prev >= 0 && prev < mapped.length ? prev : 0));
          if (!bookForm.id) {
            setBookForm(mapProductToForm(mapped[0]));
          }
        } else {
          setSelectedIndex(-1);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar catálogo DBM:', error);
    } finally {
      setLoading(false);
    }
  };

  // Enriquecer / Atualizar Ficha do Produto consultando o Horus (SQL + API) pelo ISBN ou Cód. Horus
  const handlePullFromHorusIntoForm = async () => {
    const queryKey = (bookForm.ean_gtin || bookForm.horus_cod_item || bookForm.sku || bookForm.name).trim();
    if (!queryKey) {
      setSaveFeedback({
        type: 'error',
        message: 'Informe o ISBN Principal ou o Cód. Horus para buscar os dados atualizados no Horus.'
      });
      return;
    }

    setEnrichingFromHorus(true);
    setSaveFeedback(null);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const params = new URLSearchParams({ search: queryKey, q: queryKey, limit: '5', offset: '0' });
      const res = await fetch(`${apiUrl}/companies/${companyId}/horus-sql/items-estoque-geral?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      const items: HorusEstoqueItem[] = data?.items || [];
      if (!res.ok || items.length === 0) {
        // Fallback para product-lookup da mesa DBM
        const fallbackRes = await fetch(
          `${apiUrl}/dbm/proposals-desk/product-lookup?q=${encodeURIComponent(queryKey)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const fallbackData = await fallbackRes.json();
        const fbItems = fallbackData?.items || [];
        if (fbItems.length === 0) {
          throw new Error(`Nenhum item encontrado no Horus para "${queryKey}".`);
        }
        const match = fbItems[0];
        const lDate = match.launch_date ? String(match.launch_date).slice(0, 10) : bookForm.launch_date;
        const parts = lDate ? lDate.split('-') : [];
        setBookForm(prev => ({
          ...prev,
          name: match.title || prev.name,
          ean_gtin: match.isbn || prev.ean_gtin,
          barcode: match.isbn || prev.barcode,
          horus_cod_item: match.cod_item ? String(match.cod_item) : prev.horus_cod_item,
          brand: match.publisher || prev.brand,
          short_description: match.author || prev.short_description,
          base_price: Number(match.unit_price || prev.base_price || 0),
          stock_quantity: Number(match.stock_available ?? prev.stock_quantity),
          consignment_stock: Number(match.consigned_balance ?? prev.consignment_stock),
          launch_date: lDate,
          launch_year: parts.length === 3 ? parts[0] : prev.launch_year,
          launch_month: parts.length === 3 ? String(parseInt(parts[1], 10)) : prev.launch_month
        }));
        setSaveFeedback({
          type: 'success',
          message: `✓ Dados sincronizados do Horus para "${match.title || queryKey}"! Pressione F2 para salvar.`
        });
        return;
      }

      // Match exato por código ou ISBN, ou primeiro da lista
      const cleanQ = queryKey.replace(/[\s-]/g, '');
      const exact =
        items.find(
          i =>
            String(i.cod_item) === cleanQ ||
            String(i.isbn || '').replace(/[\s-]/g, '') === cleanQ
        ) || items[0];

      const lDate = exact.data_lancamento ? String(exact.data_lancamento).slice(0, 10) : bookForm.launch_date;
      const parts = lDate ? lDate.split('-') : [];

      setBookForm(prev => ({
        ...prev,
        name: exact.nome_item || prev.name,
        ean_gtin: exact.isbn || prev.ean_gtin,
        barcode: exact.isbn || prev.barcode,
        horus_cod_item: exact.cod_item || prev.horus_cod_item,
        cod_dbm: prev.cod_dbm || exact.cod_item,
        brand: exact.editora || prev.brand,
        subject: exact.assunto || prev.subject,
        long_description: exact.sinopse || prev.long_description,
        base_price: Number(exact.preco || prev.base_price || 0),
        stock_quantity: Number(exact.estoque ?? prev.stock_quantity),
        units_per_box: exact.qtd_caixa ? String(exact.qtd_caixa) : prev.units_per_box,
        launch_date: lDate,
        launch_year: parts.length === 3 ? parts[0] : prev.launch_year,
        launch_month: parts.length === 3 ? String(parseInt(parts[1], 10)) : prev.launch_month
      }));

      setSaveFeedback({
        type: 'success',
        message: `✓ Dados do Horus SQL carregados (Cód. #${exact.cod_item} • Saldo: ${exact.estoque} un. • Preço: R$ ${Number(exact.preco || 0).toFixed(2)}). Clique em Salvar (F2) para gravar.`
      });
    } catch (err: any) {
      setSaveFeedback({
        type: 'error',
        message: err.message || 'Não foi possível consultar o Horus neste momento.'
      });
    } finally {
      setEnrichingFromHorus(false);
    }
  };

  // Edição rápida inline na Planilha de Pesquisa (Estilo Excel)
  const handleInlineGridChange = (productId: number, field: keyof ProductGridItem, value: any) => {
    setProducts(prev =>
      prev.map(item => (item.id === productId ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveInlineRow = async (item: ProductGridItem) => {
    setInlineSavingId(item.id);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const lDate = item.launch_date ? String(item.launch_date).slice(0, 10) : null;
      const parts = lDate ? lDate.split('-') : [];

      const payload: Record<string, any> = {
        sku: item.sku,
        name: item.name,
        ean_gtin: item.ean_gtin || item.isbn || null,
        additional_isbns: item.additional_isbns || null,
        base_price: Number(item.base_price || 0),
        units_per_box: item.units_per_box != null ? Number(item.units_per_box) : 0,
        launch_date: lDate ? new Date(`${lDate}T12:00:00`).toISOString() : null,
        launch_year: parts.length === 3 ? parseInt(parts[0], 10) : item.launch_year,
        launch_month: parts.length === 3 ? parseInt(parts[1], 10) : item.launch_month
      };

      const res = await fetch(`${apiUrl}/products/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Erro ao salvar linha');
      }
    } catch (e) {
      console.error('Erro ao salvar edição rápida na planilha:', e);
    } finally {
      setInlineSavingId(null);
    }
  };

  // Busca no Horus SQL (Itens_estoque_geral)
  const fetchHorusEstoqueGeral = async (customOffset = 0, customLimit?: number) => {
    setLoadingHorusItems(true);
    setHorusSyncMessage(null);
    const effectiveLimit = customLimit ?? horusLimit;
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (horusSearchTerm.trim()) {
        params.append('search', horusSearchTerm.trim());
        params.append('q', horusSearchTerm.trim());
      }
      if (horusEditoraFilter.trim()) params.append('editora', horusEditoraFilter.trim());
      params.append('limit', String(effectiveLimit));
      params.append('offset', String(customOffset));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/horus-sql/items-estoque-geral?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Falha ao consultar Itens_estoque_geral no Horus SQL');
      }

      const items: HorusEstoqueItem[] = data.items || [];
      setHorusItems(items);
      const totalAll = data.total_all ?? data.total_count ?? data.total ?? items.length;
      const totalImp = data.total_imported ?? items.filter(i => i.already_imported).length;
      const totalNotImp = data.total_not_imported ?? (totalAll - totalImp);
      setHorusTotalCount(totalAll);
      setHorusStats({
        totalAll,
        totalImported: totalImp,
        totalNotImported: totalNotImp
      });
      setHorusOffset(customOffset);
      if (data.message && items.length === 0) {
        setHorusSyncMessage({ type: 'error', text: data.message });
      }

      const extraMap: Record<string, string> = { ...horusExtraIsbnsMap };
      items.forEach(it => {
        if (it.additional_isbns && !extraMap[it.cod_item]) {
          extraMap[it.cod_item] = it.additional_isbns;
        } else if (it.local_product_id) {
          const foundLocal = products.find(p => p.id === it.local_product_id);
          if (foundLocal?.additional_isbns && !extraMap[it.cod_item]) {
            extraMap[it.cod_item] = foundLocal.additional_isbns;
          }
        }
      });
      setHorusExtraIsbnsMap(extraMap);
    } catch (err: any) {
      setHorusSyncMessage({ type: 'error', text: err.message || 'Erro ao conectar no Horus SQL' });
    } finally {
      setLoadingHorusItems(false);
    }
  };

  // Filtra os itens exibidos no modal de sincronização conforme as opções marcadas
  const visibleHorusItems = useMemo(() => {
    return horusItems.filter(it => {
      if (horusFilterMode === 'ONLY_NEW' && it.already_imported) return false;
      if (horusFilterMode === 'ONLY_IMPORTED' && !it.already_imported) return false;
      if (horusOnlyWithStock && Number(it.estoque || 0) <= 0) return false;
      return true;
    });
  }, [horusItems, horusFilterMode, horusOnlyWithStock]);

  const handleOpenHorusSyncModal = () => {
    setShowHorusSyncModal(true);
    setSelectedHorusCodes({});
    fetchHorusEstoqueGeral(0);
  };

  const toggleHorusItemSelection = (codItem: string) => {
    setSelectedHorusCodes(prev => ({
      ...prev,
      [codItem]: !prev[codItem]
    }));
  };

  const toggleSelectAllHorusPage = () => {
    const allSelected =
      visibleHorusItems.length > 0 && visibleHorusItems.every(i => selectedHorusCodes[i.cod_item]);
    const next = { ...selectedHorusCodes };
    visibleHorusItems.forEach(i => {
      if (allSelected) {
        delete next[i.cod_item];
      } else {
        next[i.cod_item] = true;
      }
    });
    setSelectedHorusCodes(next);
  };

  const handleSelectAllNotImportedHorus = () => {
    const next = { ...selectedHorusCodes };
    horusItems.forEach(i => {
      if (!i.already_imported) {
        next[i.cod_item] = true;
      }
    });
    setSelectedHorusCodes(next);
  };

  const handleImportSelectedHorusItems = async (openInFormAfter = false) => {
    const itemsToImport = horusItems
      .filter(i => selectedHorusCodes[i.cod_item])
      .map(i => ({
        ...i,
        additional_isbns: horusExtraIsbnsMap[i.cod_item] || ''
      }));

    if (itemsToImport.length === 0) {
      setHorusSyncMessage({ type: 'error', text: 'Selecione ao menos 1 item da lista para sincronizar.' });
      return;
    }

    setImportingHorus(true);
    setHorusSyncMessage(null);
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/horus-sql/import-items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ items: itemsToImport })
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao sincronizar itens selecionados');
      }

      setHorusSyncMessage({
        type: 'success',
        text: `Sincronização concluída! ${data.imported_count} novos livros criados e ${data.updated_count} atualizados no DBM.`
      });

      await fetchHorusEstoqueGeral(horusOffset);
      await fetchProducts(false);

      if (openInFormAfter && data.synced_product_ids?.length > 0) {
        const firstId = data.synced_product_ids[0];
        setShowHorusSyncModal(false);
        await loadSingleProductIntoForm(firstId);
        setActiveAccessTab('FORM');
      }
    } catch (err: any) {
      setHorusSyncMessage({ type: 'error', text: err.message || 'Erro ao importar itens' });
    } finally {
      setImportingHorus(false);
    }
  };

  const loadSingleProductIntoForm = async (productId: number) => {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const p = await res.json();
        setBookForm(mapProductToForm(p));
      }
    } catch (e) {
      console.error('Erro ao carregar ficha do livro DBM:', e);
    }
  };

  // Filtragem local complementar (incluindo filtro de Janela de Novidades -9m a +6m)
  const filteredProducts = useMemo(() => {
    return products.filter(item => {
      if (filterTitle && !item.name.toLowerCase().includes(filterTitle.toLowerCase())) {
        return false;
      }
      if (filterIsbn) {
        const q = filterIsbn.toLowerCase().replace(/[\s-]/g, '');
        const matchPrimary = (item.isbn || '').toLowerCase().replace(/[\s-]/g, '').includes(q);
        const matchExtra = (item.additional_isbns || '').toLowerCase().replace(/[\s-]/g, '').includes(q);
        const matchSku = (item.sku || '').toLowerCase().includes(q);
        const matchHorus = String(item.horus_cod_item || '').toLowerCase().includes(q);
        if (!matchPrimary && !matchExtra && !matchSku && !matchHorus) {
          return false;
        }
      }
      if (filterCollection) {
        const col = `${item.collection || ''} ${item.subject || ''} ${item.category_name || ''}`.toLowerCase();
        if (!col.includes(filterCollection.toLowerCase())) return false;
      }
      if (filterPublisher && !item.brand?.toLowerCase().includes(filterPublisher.toLowerCase())) {
        return false;
      }
      if (filterLaunchWindow !== 'ALL') {
        const lw = evaluateLaunchWindow(item.launch_date);
        if (filterLaunchWindow === 'NOVELTY' && lw.status !== 'ACTIVE_NOVELTY' && lw.status !== 'PRE_LAUNCH' && lw.status !== 'EXPIRING_SOON') {
          return false;
        }
        if (filterLaunchWindow === 'EXPIRING' && lw.status !== 'EXPIRING_SOON') {
          return false;
        }
        if (filterLaunchWindow === 'BACKLIST' && lw.status !== 'BACKLIST') {
          return false;
        }
      }
      if (onlyOutOfStock && item.stock_quantity > 0 && !item.is_out_of_print) {
        return false;
      }
      if (quickSearchFooter) {
        const q = quickSearchFooter.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchIsbn = item.isbn?.toLowerCase().includes(q);
        const matchExtra = item.additional_isbns?.toLowerCase().includes(q);
        const matchCod = item.sku.toLowerCase().includes(q);
        if (!matchName && !matchIsbn && !matchExtra && !matchCod) return false;
      }
      return true;
    });
  }, [products, filterTitle, filterIsbn, filterCollection, filterPublisher, filterLaunchWindow, onlyOutOfStock, quickSearchFooter]);

  // Navegação por Teclado estilo Excel na Aba Pesquisa e na Ficha
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showHorusSyncModal || showSalesHistoryModal || showLegendModal) return;

      // F2 no modo formulário salva o livro
      if (activeAccessTab === 'FORM' && e.key === 'F2') {
        e.preventDefault();
        handleSaveBookForm();
        return;
      }

      // Esc no modo formulário volta para a planilha
      if (activeAccessTab === 'FORM' && e.key === 'Escape') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          e.preventDefault();
          setActiveAccessTab('SEARCH');
          return;
        }
      }

      // Alt + Seta Esquerda / Direita navega entre os registros dentro da ficha
      if (activeAccessTab === 'FORM' && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateFormRecord(selectedIndex - 1);
        return;
      }
      if (activeAccessTab === 'FORM' && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigateFormRecord(selectedIndex + 1);
        return;
      }

      if (activeAccessTab !== 'SEARCH' || filteredProducts.length === 0) return;
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredProducts.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSelectedIndex(filteredProducts.length - 1);
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < filteredProducts.length) {
        e.preventDefault();
        handleOpenProductInAccessForm(filteredProducts[selectedIndex], selectedIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredProducts, selectedIndex, activeAccessTab, showHorusSyncModal, showSalesHistoryModal, showLegendModal, bookForm]);

  const handleOpenProductInAccessForm = (item: ProductGridItem, idx?: number) => {
    if (typeof idx === 'number') {
      setSelectedIndex(idx);
    }
    setSaveFeedback(null);
    setBookForm(mapProductToForm(item));
    setActiveAccessTab('FORM');
  };

  const handleNewBookInAccessForm = () => {
    setSaveFeedback(null);
    setSelectedIndex(-1);
    setBookForm({
      ...EMPTY_BOOK_FORM,
      sku: '',
      cod_dbm: ''
    });
    setActiveAccessTab('FORM');
  };

  const navigateFormRecord = (newIdx: number) => {
    if (filteredProducts.length === 0) return;
    const bounded = Math.max(0, Math.min(newIdx, filteredProducts.length - 1));
    setSelectedIndex(bounded);
    setSaveFeedback(null);
    setBookForm(mapProductToForm(filteredProducts[bounded]));
  };

  const handleFormFooterSearch = (term: string) => {
    setFormQuickSearch(term);
    if (!term.trim()) return;
    const q = term.trim().toLowerCase().replace(/[\s-]/g, '');
    const foundIdx = filteredProducts.findIndex(p => {
      const mName = p.name.toLowerCase().includes(term.trim().toLowerCase());
      const mIsbn = (p.ean_gtin || p.isbn || '').toLowerCase().replace(/[\s-]/g, '').includes(q);
      const mExtra = (p.additional_isbns || '').toLowerCase().replace(/[\s-]/g, '').includes(q);
      const mCod = String(p.horus_cod_item || p.sku || '').toLowerCase().includes(q);
      const mDbm = String(p.cod_dbm || p.id || '').toLowerCase().includes(q);
      return mName || mIsbn || mExtra || mCod || mDbm;
    });
    if (foundIdx >= 0) {
      navigateFormRecord(foundIdx);
    }
  };

  // Manipulação de múltiplos ISBNs (2º/3º ISBNs de E-book / Plataformas)
  const extraIsbnsList = useMemo(() => {
    if (!bookForm.additional_isbns) return [];
    return bookForm.additional_isbns
      .split(/[,;\n|]+/)
      .map(s => s.trim().replace(/[\s-]/g, ''))
      .filter(Boolean);
  }, [bookForm.additional_isbns]);

  const handleAddExtraIsbn = () => {
    const clean = newExtraIsbnInput.trim().replace(/[\s-]/g, '');
    if (!clean) return;
    if (!extraIsbnsList.includes(clean)) {
      const updated = [...extraIsbnsList, clean].join(', ');
      setBookForm(prev => ({ ...prev, additional_isbns: updated }));
    }
    setNewExtraIsbnInput('');
  };

  const handleRemoveExtraIsbn = (isbnToRemove: string) => {
    const updated = extraIsbnsList.filter(x => x !== isbnToRemove).join(', ');
    setBookForm(prev => ({ ...prev, additional_isbns: updated }));
  };

  // Manipulação da sub-planilha Excel de Tiragens
  const handleAddTiragemRow = () => {
    setBookForm(prev => {
      const nextId = prev.tiragens.length > 0 ? Math.max(...prev.tiragens.map(t => t.id)) + 1 : 1;
      return {
        ...prev,
        tiragens: [
          ...prev.tiragens,
          {
            id: nextId,
            data_tiragem: new Date().toLocaleDateString('pt-BR'),
            tiragem: 0,
            fre: '0,00%',
            da_roy: '0,00%',
            pis: '0,00%',
            da_advance: 'R$ 0,00',
            custo_db: 'R$ 0,00',
            custo_pro: 'R$ 0,00',
            custo_fin: 'R$ 0,00',
            roy: 'R$ 0,00',
            da_s: 'R$ 0,00',
            ttc: 'R$ 0,00'
          }
        ]
      };
    });
  };

  const handleUpdateTiragemCell = (rowIdx: number, field: keyof TiragemRow, value: any) => {
    setBookForm(prev => {
      const copy = [...prev.tiragens];
      copy[rowIdx] = { ...copy[rowIdx], [field]: value };
      return { ...prev, tiragens: copy };
    });
  };

  const handleDeleteTiragemRow = (rowIdx: number) => {
    setBookForm(prev => {
      const copy = prev.tiragens.filter((_, idx) => idx !== rowIdx);
      return { ...prev, tiragens: copy.length > 0 ? copy : EMPTY_BOOK_FORM.tiragens };
    });
  };

  const totalTiragemExemplares = useMemo(() => {
    return bookForm.tiragens.reduce((acc, r) => acc + (Number(r.tiragem) || 0), 0);
  }, [bookForm.tiragens]);

  // Cálculo automático de vencimento de contrato se Assinatura + Anos Validade forem preenchidos
  useEffect(() => {
    if (bookForm.contract_signed_date && bookForm.contract_validity_years) {
      const years = parseInt(bookForm.contract_validity_years, 10);
      if (!isNaN(years) && years > 0) {
        const parts = bookForm.contract_signed_date.includes('/')
          ? bookForm.contract_signed_date.split('/').reverse()
          : bookForm.contract_signed_date.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          const expYear = parseInt(parts[0], 10) + years;
          const computed = `${parts[2]}/${parts[1]}/${expYear}`;
          if (bookForm.contract_expires_date !== computed) {
            setBookForm(prev => ({ ...prev, contract_expires_date: computed }));
          }
        }
      }
    }
  }, [bookForm.contract_signed_date, bookForm.contract_validity_years]);

  // Sincroniza automaticamente Mês e Ano quando a Data de Lançamento é alterada
  const handleLaunchDateChange = (newDate: string) => {
    const parts = newDate ? newDate.split('-') : [];
    setBookForm(prev => ({
      ...prev,
      launch_date: newDate,
      launch_year: parts.length === 3 ? parts[0] : prev.launch_year,
      launch_month: parts.length === 3 ? String(parseInt(parts[1], 10)) : prev.launch_month
    }));
  };

  // Salvar Livro no Cadastro DBM (POST /products ou PUT /products/{id})
  const handleSaveBookForm = async () => {
    if (!bookForm.name.trim()) {
      setSaveFeedback({ type: 'error', message: 'Informe o Título do livro antes de salvar.' });
      return;
    }

    setSavingBook(true);
    setSaveFeedback(null);

    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      let finalAdditionalIsbns = bookForm.additional_isbns;
      if (newExtraIsbnInput.trim()) {
        const cleanPending = newExtraIsbnInput.trim().replace(/[\s-]/g, '');
        const curList = finalAdditionalIsbns
          .split(/[,;\n|]+/)
          .map(s => s.trim().replace(/[\s-]/g, ''))
          .filter(Boolean);
        if (cleanPending && !curList.includes(cleanPending)) {
          curList.push(cleanPending);
        }
        finalAdditionalIsbns = curList.join(', ');
        setNewExtraIsbnInput('');
      }

      const skuVal = (bookForm.sku || bookForm.horus_cod_item || bookForm.ean_gtin || `DBM-${Date.now()}`).trim();
      const weightKg = bookForm.weight_grams ? Number(bookForm.weight_grams) / 1000 : 0;

      const payload: Record<string, any> = {
        sku: skuVal,
        name: bookForm.name.trim(),
        short_description: bookForm.short_description.trim() || null,
        long_description: bookForm.long_description.trim() || null,
        ean_gtin: bookForm.ean_gtin.trim().replace(/[\s-]/g, '') || null,
        barcode: (bookForm.barcode || bookForm.ean_gtin).trim().replace(/[\s-]/g, '') || null,
        additional_isbns: finalAdditionalIsbns.trim() || null,
        cod_dbm: bookForm.cod_dbm.trim() || skuVal,
        horus_cod_item: bookForm.horus_cod_item && /^\d+$/.test(bookForm.horus_cod_item.trim())
          ? parseInt(bookForm.horus_cod_item.trim(), 10)
          : null,
        brand: bookForm.brand.trim() || null,
        publisher_code: bookForm.publisher_code.trim() || null,
        pages: bookForm.pages && /^\d+$/.test(bookForm.pages.trim()) ? parseInt(bookForm.pages.trim(), 10) : null,
        base_price: Number(bookForm.base_price || 0),
        launch_month: bookForm.launch_month && /^\d+$/.test(bookForm.launch_month.trim())
          ? parseInt(bookForm.launch_month.trim(), 10)
          : null,
        launch_year: bookForm.launch_year && /^\d+$/.test(bookForm.launch_year.trim())
          ? parseInt(bookForm.launch_year.trim(), 10)
          : null,
        launch_date: bookForm.launch_date ? new Date(`${bookForm.launch_date}T12:00:00`).toISOString() : null,
        collection: bookForm.collection.trim() || null,
        subject: bookForm.subject.trim() || null,
        width_cm: bookForm.width_cm ? parseFloat(String(bookForm.width_cm).replace(',', '.')) || 0 : 0,
        height_cm: bookForm.height_cm ? parseFloat(String(bookForm.height_cm).replace(',', '.')) || 0 : 0,
        weight_kg: weightKg,
        binding_finish: bookForm.binding_finish || 'Brochura',
        royalty_rule: bookForm.royalty_rule || 'Sem Royalties',
        edition_number: bookForm.edition_number.trim() || '1',
        units_per_box: bookForm.units_per_box && /^\d+$/.test(bookForm.units_per_box.trim())
          ? parseInt(bookForm.units_per_box.trim(), 10)
          : 0,
        is_out_of_print: Boolean(bookForm.is_out_of_print),
        out_of_print_date: bookForm.out_of_print_date.trim() || null,
        external_link: bookForm.external_link.trim() || null,
        royalty_company: bookForm.royalty_company.trim() || null,
        ebook_royalty_pct: Number(bookForm.ebook_royalty_pct || 0),
        contract_signed_date: bookForm.contract_signed_date.trim() || null,
        contract_validity_years: bookForm.contract_validity_years && /^\d+$/.test(bookForm.contract_validity_years.trim())
          ? parseInt(bookForm.contract_validity_years.trim(), 10)
          : null,
        contract_expires_date: bookForm.contract_expires_date.trim() || null,
        cover_url: bookForm.cover_url.trim() || null,
        stock_quantity: Number(bookForm.stock_quantity || 0),
        dbm_tiragens: JSON.stringify(bookForm.tiragens || [])
      };

      const isEditing = Boolean(bookForm.id);
      const endpoint = isEditing ? `${apiUrl}/products/${bookForm.id}` : `${apiUrl}/products/`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const saved = await res.json();
      if (!res.ok) {
        throw new Error(saved.detail || 'Não foi possível salvar o cadastro do livro no DBM.');
      }

      setBookForm(mapProductToForm(saved));
      setSaveFeedback({
        type: 'success',
        message: `✓ Livro "${saved.name}" salvo com sucesso!${
          saved.additional_isbns ? ` (ISBNs Extras ativos: ${saved.additional_isbns})` : ''
        }`
      });
      await fetchProducts(false);
    } catch (err: any) {
      setSaveFeedback({ type: 'error', message: err.message || 'Erro ao salvar cadastro DBM.' });
    } finally {
      setSavingBook(false);
    }
  };

  // Abrir Histórico de Vendas / Movimentações do Produto
  const handleOpenSalesHistory = async () => {
    setShowSalesHistoryModal(true);
    if (!bookForm.id) {
      setProductHistoryData({ stock: [], prices: [] });
      return;
    }
    setLoadingHistory(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/products/${bookForm.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProductHistoryData(data);
      } else {
        setProductHistoryData({ stock: [], prices: [] });
      }
    } catch {
      setProductHistoryData({ stock: [], prices: [] });
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleClearFilters = () => {
    setFilterTitle('');
    setFilterIsbn('');
    setFilterCollection('');
    setFilterPublisher('');
    setFilterLaunchWindow('ALL');
    setOnlyOutOfStock(false);
    setQuickSearchFooter('');
    fetchProducts(false);
  };

  const formLaunchBadge = useMemo(() => evaluateLaunchWindow(bookForm.launch_date), [bookForm.launch_date]);

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs select-none">

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA SUPERIOR DE NAVEGAÇÃO & AÇÕES RÁPIDAS (UI MODERNA + EXCEL)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Link
            href="/dbm"
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            Menu DBM
          </Link>

          <Link
            href="/dbm/customers"
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition"
          >
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            Empresas / Clientes
          </Link>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={() => setActiveAccessTab('SEARCH')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
              activeAccessTab === 'SEARCH'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 text-slate-700 dark:text-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Planilha de Produtos ({filteredProducts.length})
          </button>

          <button
            type="button"
            onClick={() => {
              if (!bookForm.id && filteredProducts.length > 0) {
                const idx = selectedIndex >= 0 ? selectedIndex : 0;
                setBookForm(mapProductToForm(filteredProducts[idx]));
              }
              setActiveAccessTab('FORM');
            }}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
              activeAccessTab === 'FORM'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 text-slate-700 dark:text-slate-300'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ficha do Livro {bookForm.id ? `#${bookForm.horus_cod_item || bookForm.id}` : '(Novo)'}
          </button>
        </div>

        {/* Botões Rápidos de Sincronização Horus SQL + Atalhos + Novo Livro */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLegendModal(true)}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg hidden md:flex items-center gap-1 transition cursor-pointer"
            title="Atalhos de teclado estilo Excel e legenda da planilha"
          >
            <Keyboard className="w-3.5 h-3.5" />
            Atalhos Excel
          </button>

          <button
            type="button"
            onClick={handleOpenHorusSyncModal}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Consultar view Itens_estoque_geral no Horus SQL e importar livros com suporte a 2º ISBN (E-book)"
          >
            <DatabaseZap className="w-3.5 h-3.5 text-amber-600" />
            Sincronizar Horus SQL
          </button>

          <button
            type="button"
            onClick={handleNewBookInAccessForm}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Livro
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 1: PLANILHA DE PRODUTOS (EXPERIÊNCIA EXCEL DE ALTA DENSIDADE)     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeAccessTab === 'SEARCH' && (
        <>
          {/* Painel de Filtros Rápidos */}
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchProducts(true);
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end"
            >
              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Título ou Autor
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={filterTitle}
                    onChange={(e) => setFilterTitle(e.target.value)}
                    placeholder="Ex: Desenhar, Bordar, Arquitetura..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  ISBN Principal, 2º ISBN (E-book) ou Cód. Horus
                </label>
                <div className="relative">
                  <Barcode className="w-3.5 h-3.5 text-indigo-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={filterIsbn}
                    onChange={(e) => setFilterIsbn(e.target.value)}
                    placeholder="97865... ou Cód Horus"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Editora / Selo
                </label>
                <input
                  type="text"
                  value={filterPublisher}
                  onChange={(e) => setFilterPublisher(e.target.value)}
                  placeholder="Ex: GG, Compor..."
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Janela Lançamento (-9m/+6m)
                </label>
                <select
                  value={filterLaunchWindow}
                  onChange={(e) => setFilterLaunchWindow(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="ALL">Todos os Livros</option>
                  <option value="NOVELTY">✨ Novidades (-9m a +6m)</option>
                  <option value="EXPIRING">⏳ Expirando (&lt; 30 dias)</option>
                  <option value="BACKLIST">📚 Fundo de Catálogo</option>
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-1.5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Filtrar
                </button>

                {(filterTitle || filterIsbn || filterCollection || filterPublisher || filterLaunchWindow !== 'ALL' || onlyOutOfStock) && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
                    title="Limpar Filtros"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </form>

            {/* Sub-barra de Controle Estilo Excel */}
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={onlyOutOfStock}
                    onChange={(e) => setOnlyOutOfStock(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                  />
                  Apenas Esgotados / Sem Saldo
                </label>

                <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 px-2.5 py-0.5 rounded-md border border-indigo-200/80">
                  <input
                    type="checkbox"
                    checked={excelInlineEditMode}
                    onChange={(e) => setExcelInlineEditMode(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-indigo-600 border-indigo-300"
                  />
                  ✏️ Modo Edição Direta na Planilha (Estilo Excel)
                </label>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Use <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">↑</kbd>{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">↓</kbd> e{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">Enter</kbd> ou{' '}
                  <strong>Duplo Clique</strong> para abrir a ficha completa
                </span>
              </div>
            </div>
          </div>

          {/* Grade Principal Estilo Planilha Excel Moderna */}
          <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white dark:bg-slate-900 relative">
            <table className="w-full border-collapse text-left table-fixed min-w-[1220px]">
              <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                <tr>
                  <th className="w-9 py-2 px-1.5 border-r border-slate-200 dark:border-slate-700 text-center">#</th>
                  <th className="w-20 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700">Cód Horus</th>
                  <th className="w-32 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700">ISBN Principal</th>
                  <th className="w-44 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-300">
                    2º ISBN / E-book
                  </th>
                  <th className="w-[26%] py-2 px-2.5 border-r border-slate-200 dark:border-slate-700">Título da Obra</th>
                  <th className="w-28 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700">Editora</th>
                  <th className="w-36 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700 text-center">
                    Lançamento / Status
                  </th>
                  <th className="w-28 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700 text-right">
                    Preço Capa
                  </th>
                  <th className="w-20 py-2 px-2.5 border-r border-slate-200 dark:border-slate-700 text-right">
                    Saldo
                  </th>
                  <th className="w-16 py-2 px-2 border-r border-slate-200 dark:border-slate-700 text-center">
                    Un/Cx
                  </th>
                  <th className="w-24 py-2 px-2 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Carregando planilha de produtos DBM...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-slate-500">
                      Nenhum livro encontrado para este filtro. Use{' '}
                      <button
                        type="button"
                        onClick={handleOpenHorusSyncModal}
                        className="font-bold text-amber-700 underline cursor-pointer"
                      >
                        Sincronizar Horus SQL
                      </button>{' '}
                      ou{' '}
                      <button
                        type="button"
                        onClick={handleNewBookInAccessForm}
                        className="font-bold text-emerald-700 underline cursor-pointer"
                      >
                        + Novo Livro
                      </button>
                      .
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    const isZeroOrOut = item.is_out_of_print || item.stock_quantity <= 0;
                    const launchInfo = evaluateLaunchWindow(item.launch_date);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedIndex(idx)}
                        onDoubleClick={() => {
                          if (!excelInlineEditMode) {
                            handleOpenProductInAccessForm(item, idx);
                          }
                        }}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/50 text-slate-900 dark:text-white font-medium ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700'
                            : isZeroOrOut
                            ? 'bg-rose-50/35 dark:bg-rose-950/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100/70'
                            : idx % 2 === 0
                            ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50'
                            : 'bg-slate-50/50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 hover:bg-slate-100/60'
                        } cursor-pointer`}
                      >
                        <td
                          className={`py-1.5 px-1.5 border-r border-slate-200/80 dark:border-slate-800 text-center font-mono text-[10px] ${
                            isSelected
                              ? 'bg-indigo-600 text-white font-bold'
                              : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          {isSelected ? '▶' : idx + 1}
                        </td>

                        <td className="py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {item.horus_cod_item || item.sku}
                        </td>

                        <td className="py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          {item.ean_gtin || item.isbn || '-'}
                        </td>

                        {/* Coluna 2º ISBN (editável inline se Modo Excel ativo) */}
                        <td className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 font-mono text-[11px] truncate bg-indigo-50/20">
                          {excelInlineEditMode ? (
                            <input
                              type="text"
                              value={item.additional_isbns || ''}
                              onChange={(e) => handleInlineGridChange(item.id, 'additional_isbns', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveInlineRow(item);
                                }
                              }}
                              placeholder="2º ISBN (Enter salva)"
                              className="w-full px-1.5 py-0.5 text-[11px] font-mono bg-white border border-indigo-300 rounded focus:outline-none focus:border-indigo-600"
                            />
                          ) : item.additional_isbns ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                              title={`ISBNs adicionais vinculados: ${item.additional_isbns}`}
                            >
                              <Barcode className="w-3 h-3 shrink-0" />
                              {item.additional_isbns}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>
                          )}
                        </td>

                        <td className="py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 truncate" title={item.name}>
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
                            {item.is_out_of_print && (
                              <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[9px] font-bold rounded shrink-0">
                                Esgotado
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 truncate text-[11px] text-slate-600 dark:text-slate-400">
                          {item.brand || '-'}
                        </td>

                        {/* Coluna Data de Lançamento + Status da Janela (-9m a +6m) */}
                        <td className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center">
                          {excelInlineEditMode ? (
                            <input
                              type="date"
                              value={item.launch_date ? String(item.launch_date).slice(0, 10) : ''}
                              onChange={(e) => handleInlineGridChange(item.id, 'launch_date', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveInlineRow(item);
                                }
                              }}
                              className="w-full px-1 py-0.5 text-[11px] font-mono bg-white border border-slate-300 rounded"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-semibold ${launchInfo.badgeClass}`}
                                title={launchInfo.detail}
                              >
                                {launchInfo.label}
                              </span>
                              {item.launch_date && (
                                <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                                  {String(item.launch_date).slice(0, 10).split('-').reverse().join('/')}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Coluna Preço de Capa */}
                        <td className="py-1 px-2.5 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-[11px] font-medium">
                          {excelInlineEditMode ? (
                            <CurrencyInput
                              value={item.base_price}
                              onChangeValue={(val) => handleInlineGridChange(item.id, 'base_price', val)}
                              prefixStr="R$ "
                              className="w-full px-1.5 py-0.5 text-[11px] font-mono text-right bg-white border border-slate-300 rounded"
                            />
                          ) : (
                            item.base_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          )}
                        </td>

                        {/* Coluna Saldo Disponível */}
                        <td
                          className={`py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-[11px] font-bold ${
                            item.stock_quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'
                          }`}
                        >
                          {item.stock_quantity}
                        </td>

                        {/* Coluna Unid/Caixa */}
                        <td className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center font-mono text-[11px] text-slate-600">
                          {excelInlineEditMode ? (
                            <input
                              type="text"
                              value={item.units_per_box ?? 0}
                              onChange={(e) => handleInlineGridChange(item.id, 'units_per_box', Number(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveInlineRow(item);
                                }
                              }}
                              className="w-full px-1 py-0.5 text-[11px] font-mono text-center bg-white border border-slate-300 rounded"
                            />
                          ) : (
                            item.units_per_box || '-'
                          )}
                        </td>

                        {/* Coluna Ação */}
                        <td className="py-1 px-2 text-center">
                          {excelInlineEditMode ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveInlineRow(item);
                              }}
                              disabled={inlineSavingId === item.id}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                            >
                              {inlineSavingId === item.id ? '...' : 'Salvar'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenProductInAccessForm(item, idx);
                              }}
                              className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-indigo-600 text-slate-700 hover:text-white border border-slate-200 transition cursor-pointer"
                            >
                              Abrir Ficha
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de Rodapé Estilo Planilha Excel */}
          <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Linha:</span>
              <button
                type="button"
                onClick={() => setSelectedIndex(0)}
                disabled={filteredProducts.length === 0 || selectedIndex <= 0}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndex(prev => Math.max(0, prev - 1))}
                disabled={filteredProducts.length === 0 || selectedIndex <= 0}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] font-bold text-slate-800">
                {filteredProducts.length > 0 ? selectedIndex + 1 : 0} de {filteredProducts.length}
              </span>
              <button
                type="button"
                onClick={() => setSelectedIndex(prev => Math.min(filteredProducts.length - 1, prev + 1))}
                disabled={filteredProducts.length === 0 || selectedIndex >= filteredProducts.length - 1}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndex(filteredProducts.length - 1)}
                disabled={filteredProducts.length === 0 || selectedIndex >= filteredProducts.length - 1}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>

              <div className="ml-2 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                <Search className="w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={quickSearchFooter}
                  onChange={(e) => setQuickSearchFooter(e.target.value)}
                  placeholder="Filtro instantâneo na grade..."
                  className="text-[11px] bg-transparent w-44 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              <span>
                Com saldo:{' '}
                <strong className="text-emerald-700 font-mono">
                  {filteredProducts.filter(p => p.stock_quantity > 0 && !p.is_out_of_print).length}
                </strong>
              </span>
              <span>•</span>
              <span>
                Com 2º ISBN (E-book):{' '}
                <strong className="text-indigo-700 font-mono">
                  {filteredProducts.filter(p => Boolean(p.additional_isbns)).length}
                </strong>
              </span>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 2: FICHA DE CADASTRO DO LIVRO (DESIGN MODERNO + EXCEL TIRAGENS)   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeAccessTab === 'FORM' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          
          {/* Cabeçalho Limpo da Ficha do Livro */}
          <div className="bg-white dark:bg-slate-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                Ficha de Cadastro do Produto
              </h2>

              {bookForm.id ? (
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
                  ID DBM #{bookForm.id} {bookForm.horus_cod_item ? `• Cód. Horus #${bookForm.horus_cod_item}` : ''}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                  Novo Cadastro DBM
                </span>
              )}

              {/* Badge Automático da Janela de Novidades (-9m a +6m) */}
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${formLaunchBadge.badgeClass}`}
                title={formLaunchBadge.detail}
              >
                {formLaunchBadge.label}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Botão de Enriquecimento Direto via API/SQL do Horus */}
              <button
                type="button"
                onClick={handlePullFromHorusIntoForm}
                disabled={enrichingFromHorus}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-lg border border-indigo-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                title="Consulta o Horus (SQL / API) pelo ISBN ou Cód. Horus e atualiza Preço, Saldo, Editora, Assunto, Caixa e Data de Lançamento"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${enrichingFromHorus ? 'animate-spin' : ''}`} />
                {enrichingFromHorus ? 'Consultando Horus...' : 'Puxar / Atualizar do Horus'}
              </button>

              <button
                type="button"
                onClick={handleOpenSalesHistory}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                Histórico
              </button>

              <button
                type="button"
                onClick={handleNewBookInAccessForm}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 flex items-center gap-1 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                Novo
              </button>

              <button
                type="button"
                onClick={handleSaveBookForm}
                disabled={savingBook}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {savingBook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar Ficha (F2)
              </button>
            </div>
          </div>

          {/* Feedback de salvamento / enriquecimento */}
          {saveFeedback && (
            <div
              className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b shrink-0 ${
                saveFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              <span>{saveFeedback.message}</span>
              <button type="button" onClick={() => setSaveFeedback(null)} className="text-xs font-bold px-2">
                ✕
              </button>
            </div>
          )}

          {/* Corpo Principal da Ficha (Cartões Modernos de Alta Densidade) */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            
            {/* BLOCO SUPERIOR: CAPA + DADOS EDITORIAIS/HORUS + COMERCIAL/CONTRATOS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
              
              {/* COLUNA ESQUERDA: CAPA + SALDOS HORUS AO VIVO (2 COLUNAS) */}
              <div className="lg:col-span-2 flex flex-col gap-2.5">
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center">
                  <div className="w-full aspect-[3/4] max-w-[145px] bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center overflow-hidden relative">
                    {bookForm.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bookForm.cover_url}
                        alt={bookForm.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-3 text-slate-400">
                        <BookOpen className="w-8 h-8 mx-auto mb-1 stroke-1" />
                        <span className="text-[10px] font-medium block leading-tight">Sem Capa</span>
                      </div>
                    )}
                  </div>
                  <div className="w-full mt-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">URL da Capa</label>
                    <input
                      type="text"
                      value={bookForm.cover_url}
                      onChange={(e) => setBookForm(prev => ({ ...prev, cover_url: e.target.value }))}
                      placeholder="https://..."
                      className="w-full px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Resumo Rápido de Estoque & Giro no Horus */}
                <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Indicadores Horus
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Disponível:</span>
                    <span
                      className={`font-mono font-bold ${
                        bookForm.stock_quantity > 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {bookForm.stock_quantity} un.
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Consignado:</span>
                    <span className="font-mono font-semibold text-slate-700">{bookForm.consignment_stock} un.</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-500">Giro 90d / 12m:</span>
                    <span className="font-mono text-[11px] text-slate-700">
                      {bookForm.sales_90} / {bookForm.sales_365}
                    </span>
                  </div>
                </div>
              </div>

              {/* COLUNA CENTRAL: IDENTIFICAÇÃO, MULTI-ISBN & METADADOS EDITORIAIS (7 COLUNAS) */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                
                {/* Linha 1: Título Principal + Subtítulo / Autor */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                  <div className="md:col-span-7">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Título da Obra *
                    </label>
                    <input
                      type="text"
                      value={bookForm.name}
                      onChange={(e) => setBookForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Nome completo do livro..."
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Subtítulo / Autor Principal
                    </label>
                    <input
                      type="text"
                      value={bookForm.short_description}
                      onChange={(e) => setBookForm(prev => ({ ...prev, short_description: e.target.value }))}
                      placeholder="Subtítulo ou autor da obra..."
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Linha 2: ISBN Principal (EAN-13) + Cód Horus + Cód DBM + Preço de Capa */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5">
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      ISBN Principal (EAN-13)
                    </label>
                    <input
                      type="text"
                      value={bookForm.ean_gtin}
                      onChange={(e) =>
                        setBookForm(prev => ({
                          ...prev,
                          ean_gtin: e.target.value,
                          barcode: prev.barcode || e.target.value
                        }))
                      }
                      placeholder="97865..."
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Cód. Horus
                    </label>
                    <input
                      type="text"
                      value={bookForm.horus_cod_item}
                      onChange={(e) => setBookForm(prev => ({ ...prev, horus_cod_item: e.target.value }))}
                      placeholder="COD_ITEM"
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Cód. DBM
                    </label>
                    <input
                      type="text"
                      value={bookForm.cod_dbm}
                      onChange={(e) => setBookForm(prev => ({ ...prev, cod_dbm: e.target.value }))}
                      placeholder=" Automático"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">
                      Preço de Capa (R$)
                    </label>
                    <CurrencyInput
                      value={bookForm.base_price}
                      onChangeValue={(val) => setBookForm(prev => ({ ...prev, base_price: val }))}
                      prefixStr="R$ "
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-bold text-right bg-indigo-50/40 border border-indigo-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Linha 3 (DESTAQUE DBM): 2º ISBN / ISBNs Adicionais (E-book / Bookwire / Pearson) */}
                <div className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/50 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-indigo-600" />
                      2º ISBN / ISBNs Adicionais (E-book • Bookwire • Pearson)
                    </label>
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                      Usado automaticamente no cruzamento de pedidos e relatórios quando diferente do ISBN impresso
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newExtraIsbnInput}
                      onChange={(e) => setNewExtraIsbnInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddExtraIsbn();
                        }
                      }}
                      placeholder="Digite o 2º ISBN (ex: 9786560920071) e pressione Enter..."
                      className="flex-1 px-2.5 py-1 text-xs font-mono bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddExtraIsbn}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg cursor-pointer shrink-0 transition"
                    >
                      + Vincular ISBN
                    </button>
                  </div>

                  {extraIsbnsList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {extraIsbnsList.map(code => (
                        <span
                          key={code}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-md text-indigo-950 dark:text-indigo-200 font-mono text-xs font-semibold shadow-2xs"
                        >
                          <Barcode className="w-3 h-3 text-indigo-600" />
                          {code}
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraIsbn(code)}
                            className="text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
                            title="Remover este ISBN secundário"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linha 4: Editora | Cód. na Editora | Coleção | Assunto / Gênero (Horus) */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5">
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Editora / Selo (Horus)
                    </label>
                    <input
                      type="text"
                      value={bookForm.brand}
                      onChange={(e) => setBookForm(prev => ({ ...prev, brand: e.target.value }))}
                      placeholder="Ex: GG Brasil, Compor..."
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Cód. Editora
                    </label>
                    <input
                      type="text"
                      value={bookForm.publisher_code}
                      onChange={(e) => setBookForm(prev => ({ ...prev, publisher_code: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Coleção
                    </label>
                    <input
                      type="text"
                      value={bookForm.collection}
                      onChange={(e) => setBookForm(prev => ({ ...prev, collection: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-2 md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Assunto / Gênero (Horus)
                    </label>
                    <input
                      type="text"
                      value={bookForm.subject}
                      onChange={(e) => setBookForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Linha 5: Data de Lançamento (Unificada) | Acabamento | Edição | Páginas | Unid/Caixa */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5">
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Data de Lançamento (Regra -9m/+6m)
                    </label>
                    <input
                      type="date"
                      value={bookForm.launch_date}
                      onChange={(e) => handleLaunchDateChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Acabamento
                    </label>
                    <select
                      value={bookForm.binding_finish}
                      onChange={(e) => setBookForm(prev => ({ ...prev, binding_finish: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Brochura">Brochura</option>
                      <option value="Capa dura">Capa dura</option>
                      <option value="E-book">E-book</option>
                      <option value="Espiral">Espiral</option>
                      <option value="Grampeado">Grampeado</option>
                    </select>
                  </div>

                  <div className="col-span-1 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Edição
                    </label>
                    <input
                      type="text"
                      value={bookForm.edition_number}
                      onChange={(e) => setBookForm(prev => ({ ...prev, edition_number: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Páginas
                    </label>
                    <input
                      type="text"
                      value={bookForm.pages}
                      onChange={(e) => setBookForm(prev => ({ ...prev, pages: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-right bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Unid. / Caixa
                    </label>
                    <input
                      type="text"
                      value={bookForm.units_per_box}
                      onChange={(e) => setBookForm(prev => ({ ...prev, units_per_box: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                {/* Linha 6: Dimensões (L x A cm) | Peso (g) | Link Externo */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5">
                  <div className="col-span-1 md:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Largura × Altura (cm)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={bookForm.width_cm}
                        onChange={(e) => setBookForm(prev => ({ ...prev, width_cm: e.target.value }))}
                        className="w-1/2 px-2 py-1.5 text-xs font-mono text-center bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                      />
                      <span className="text-xs text-slate-400">×</span>
                      <input
                        type="text"
                        value={bookForm.height_cm}
                        onChange={(e) => setBookForm(prev => ({ ...prev, height_cm: e.target.value }))}
                        className="w-1/2 px-2 py-1.5 text-xs font-mono text-center bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Peso (gramas)
                    </label>
                    <input
                      type="text"
                      value={bookForm.weight_grams}
                      onChange={(e) => setBookForm(prev => ({ ...prev, weight_grams: e.target.value }))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-right bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>

                  <div className="col-span-2 md:col-span-7">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Link da Obra / Site Editorial
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={bookForm.external_link}
                        onChange={(e) => setBookForm(prev => ({ ...prev, external_link: e.target.value }))}
                        placeholder="https://..."
                        className="flex-1 px-2.5 py-1.5 text-xs text-indigo-700 bg-slate-50/70 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-indigo-500"
                      />
                      {bookForm.external_link && (
                        <a
                          href={bookForm.external_link}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600"
                          title="Abrir Link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUNA DIREITA: ROYALTIES, CONTRATO AUTORAL & SITUAÇÃO (3 COLUNAS) */}
              <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span>Contratos & Royalties DBM</span>
                  <span className="text-[10px] font-normal text-slate-400">Direitos Autorais</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Regra de Royalties
                  </label>
                  <select
                    value={bookForm.royalty_rule}
                    onChange={(e) => setBookForm(prev => ({ ...prev, royalty_rule: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Sem Royalties">Sem Royalties</option>
                    <option value="Com Royalties">Com Royalties</option>
                    <option value="% Capa">% Sobre Preço de Capa</option>
                    <option value="% Líquido">% Sobre Receita Líquida</option>
                  </select>
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-7">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Empresa Royalties
                    </label>
                    <input
                      type="text"
                      value={bookForm.royalty_company}
                      onChange={(e) => setBookForm(prev => ({ ...prev, royalty_company: e.target.value }))}
                      placeholder="Detentor / Agência"
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      % Roy. E-book
                    </label>
                    <CurrencyInput
                      value={bookForm.ebook_royalty_pct}
                      onChangeValue={(val) => setBookForm(prev => ({ ...prev, ebook_royalty_pct: val }))}
                      suffixStr="%"
                      max={100}
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold text-right bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2 pt-1 border-t border-slate-100">
                  <div className="col-span-5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Assinatura
                    </label>
                    <input
                      type="text"
                      value={bookForm.contract_signed_date}
                      onChange={(e) => setBookForm(prev => ({ ...prev, contract_signed_date: e.target.value }))}
                      placeholder="dd/mm/aaaa"
                      className="w-full px-2 py-1.5 text-[11px] font-mono bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Anos
                    </label>
                    <input
                      type="text"
                      value={bookForm.contract_validity_years}
                      onChange={(e) => setBookForm(prev => ({ ...prev, contract_validity_years: e.target.value }))}
                      className="w-full px-2 py-1.5 text-[11px] font-mono text-center bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Vencimento
                    </label>
                    <input
                      type="text"
                      value={bookForm.contract_expires_date}
                      onChange={(e) => setBookForm(prev => ({ ...prev, contract_expires_date: e.target.value }))}
                      placeholder="dd/mm/aaaa"
                      className="w-full px-2 py-1.5 text-[11px] font-mono bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                {/* Controle de Obra Esgotada / Fora de Catálogo */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={bookForm.is_out_of_print}
                        onChange={(e) => setBookForm(prev => ({ ...prev, is_out_of_print: e.target.checked }))}
                        className="w-4 h-4 rounded text-rose-600 border-slate-300"
                      />
                      Obra Esgotada / Fora de Linha
                    </label>
                  </div>
                  {bookForm.is_out_of_print && (
                    <div>
                      <label className="block text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1">
                        Data de Esgotamento
                      </label>
                      <input
                        type="text"
                        value={bookForm.out_of_print_date}
                        onChange={(e) => setBookForm(prev => ({ ...prev, out_of_print_date: e.target.value }))}
                        placeholder="dd/mm/aaaa"
                        className="w-full px-2.5 py-1 text-xs font-mono bg-rose-50/50 border border-rose-200 rounded-lg text-rose-900"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* BLOCO INFERIOR DIVIDIDO (SUB-PLANILHA EXCEL DE TIRAGENS + SINOPSE) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
              
              {/* SUB-PLANILHA ESTILO EXCEL: TIRAGENS & CUSTOS (8 COLUNAS) */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Planilha de Tiragens & Custos de Produção
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      ({bookForm.tiragens.length} tiragem(ns) • Total: {totalTiragemExemplares.toLocaleString('pt-BR')} ex.)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTiragemRow}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-md border border-emerald-200 cursor-pointer transition"
                  >
                    + Nova Linha (Excel)
                  </button>
                </div>

                <div className="flex-1 overflow-auto max-h-[220px]">
                  <table className="w-full border-collapse text-[11px] font-mono min-w-[820px]">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 border-b border-slate-200 font-sans font-bold text-[10px] uppercase">
                      <tr>
                        <th className="w-8 py-1.5 px-1 border-r border-slate-200 text-center">#</th>
                        <th className="w-24 py-1.5 px-1.5 border-r border-slate-200 text-left">Data Tiragem</th>
                        <th className="w-20 py-1.5 px-1.5 border-r border-slate-200 text-right">Qtd. Ex.</th>
                        <th className="w-16 py-1.5 px-1.5 border-r border-slate-200 text-right">Frete</th>
                        <th className="w-16 py-1.5 px-1.5 border-r border-slate-200 text-right">DA Roy</th>
                        <th className="w-16 py-1.5 px-1.5 border-r border-slate-200 text-right">PIS</th>
                        <th className="w-24 py-1.5 px-1.5 border-r border-slate-200 text-right">Adiant. DA</th>
                        <th className="w-20 py-1.5 px-1.5 border-r border-slate-200 text-right">Custo DB</th>
                        <th className="w-20 py-1.5 px-1.5 border-r border-slate-200 text-right">Custo Pro</th>
                        <th className="w-20 py-1.5 px-1.5 border-r border-slate-200 text-right">Custo Fin</th>
                        <th className="w-16 py-1.5 px-1.5 border-r border-slate-200 text-right">Roy</th>
                        <th className="w-16 py-1.5 px-1.5 border-r border-slate-200 text-right">DA s/</th>
                        <th className="w-16 py-1.5 px-1.5 border-r border-slate-200 text-right">TTC</th>
                        <th className="w-8 py-1.5 px-1 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {bookForm.tiragens.map((row, rIdx) => (
                        <tr key={row.id || rIdx} className="hover:bg-indigo-50/30">
                          <td className="py-1 px-1 bg-slate-50 border-r border-slate-200 text-center text-[10px] text-slate-400">
                            {rIdx + 1}
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.data_tiragem}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'data_tiragem', e.target.value)}
                              placeholder="dd/mm/aaaa"
                              className="w-full px-1.5 py-1 bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.tiragem}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'tiragem', Number(e.target.value) || 0)}
                              className="w-full px-1.5 py-1 text-right font-bold bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.fre}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'fre', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.da_roy}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'da_roy', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.pis}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'pis', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.da_advance}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'da_advance', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.custo_db}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'custo_db', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.custo_pro}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'custo_pro', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.custo_fin}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'custo_fin', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.roy}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'roy', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.da_s}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'da_s', e.target.value)}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.ttc}
                              onChange={(e) => handleUpdateTiragemCell(rIdx, 'ttc', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && rIdx === bookForm.tiragens.length - 1) {
                                  e.preventDefault();
                                  handleAddTiragemRow();
                                }
                              }}
                              className="w-full px-1.5 py-1 text-right bg-transparent focus:bg-indigo-50/60 focus:outline-none"
                            />
                          </td>
                          <td className="p-0 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteTiragemRow(rIdx)}
                              className="text-slate-400 hover:text-rose-600 px-1 cursor-pointer"
                              title="Remover tiragem"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CAMPO SINOPSE (4 COLUNAS) */}
              <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Sinopse / Descrição Comercial</span>
                  <span className="text-[10px] text-slate-400">Sincronizado com Horus</span>
                </div>
                <textarea
                  value={bookForm.long_description}
                  onChange={(e) => setBookForm(prev => ({ ...prev, long_description: e.target.value }))}
                  className="w-full flex-1 min-h-[180px] p-3 text-xs bg-transparent text-slate-800 dark:text-slate-200 leading-relaxed resize-none focus:outline-none"
                  placeholder="Sinopse completa da obra..."
                />
              </div>
            </div>
          </div>

          {/* ── BARRA DE RODAPÉ DE NAVEGAÇÃO RÁPIDA ENTRE REGISTROS ── */}
          <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-500">Navegar Ficha:</span>
              <button
                type="button"
                onClick={() => navigateFormRecord(0)}
                disabled={filteredProducts.length === 0 || selectedIndex <= 0}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Primeiro Livro"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigateFormRecord(selectedIndex - 1)}
                disabled={filteredProducts.length === 0 || selectedIndex <= 0}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Livro Anterior (Alt + ←)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-slate-800">
                {selectedIndex >= 0 ? selectedIndex + 1 : 'Novo'} de {filteredProducts.length}
              </span>
              <button
                type="button"
                onClick={() => navigateFormRecord(selectedIndex + 1)}
                disabled={filteredProducts.length === 0 || selectedIndex >= filteredProducts.length - 1}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Próximo Livro (Alt + →)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigateFormRecord(filteredProducts.length - 1)}
                disabled={filteredProducts.length === 0 || selectedIndex >= filteredProducts.length - 1}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Último Livro"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>

              <div className="ml-2 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-0.5">
                <Search className="w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={formQuickSearch}
                  onChange={(e) => handleFormFooterSearch(e.target.value)}
                  placeholder="Pular para ISBN, título ou Cód..."
                  className="text-[11px] bg-transparent w-48 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveAccessTab('SEARCH')}
                className="px-3.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
              >
                Voltar à Planilha (Esc)
              </button>
              <button
                type="button"
                onClick={handleSaveBookForm}
                disabled={savingBook}
                className="px-4 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
              >
                {savingBook ? 'Salvando...' : 'Salvar (F2)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: SINCRONIZAR HORUS SQL (Itens_estoque_geral) + MULTI-ISBN        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showHorusSyncModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 select-text">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Cabeçalho Modal */}
              <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <DatabaseZap className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold">
                      Sincronizar Produtos do Horus SQL (Itens_estoque_geral) → Cadastro DBM
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Importe livros do Horus para o DBM e vincule o 2º ISBN (E-book / Bookwire / Pearson) diretamente na planilha.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHorusSyncModal(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Barra de Busca SQL e Filtros Opcionais */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchHorusEstoqueGeral(0);
                }}
                className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 space-y-2.5"
              >
                <div className="flex flex-wrap items-end gap-2.5">
                  <div className="flex-1 min-w-[220px]">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Buscar por Código Horus, ISBN ou Nome do Livro
                    </label>
                    <input
                      type="text"
                      value={horusSearchTerm}
                      onChange={(e) => setHorusSearchTerm(e.target.value)}
                      placeholder="Ex: 9786560920071, Eu sei desenhar, Bordar..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-48">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Editora</label>
                    <input
                      type="text"
                      value={horusEditoraFilter}
                      onChange={(e) => setHorusEditoraFilter(e.target.value)}
                      placeholder="Filtrar editora..."
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-40">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quantidade</label>
                    <select
                      value={horusLimit}
                      onChange={(e) => {
                        const newLim = Number(e.target.value);
                        setHorusLimit(newLim);
                        fetchHorusEstoqueGeral(0, newLim);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-500 font-semibold"
                    >
                      <option value={5000}>Todos (até 5.000)</option>
                      <option value={1000}>1.000 itens</option>
                      <option value={500}>500 itens</option>
                      <option value={100}>100 itens</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={loadingHorusItems}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    {loadingHorusItems ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Consultar Horus SQL
                  </button>
                </div>

                {/* Linha de Filtros Opcionais de Exibição */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer select-none bg-white px-2.5 py-1 rounded-md border border-slate-200 hover:border-indigo-300">
                      <input
                        type="checkbox"
                        checked={horusFilterMode === 'ONLY_NEW'}
                        onChange={(e) => setHorusFilterMode(e.target.checked ? 'ONLY_NEW' : 'ALL')}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Ocultar itens já cadastrados no DBM ({horusStats.totalNotImported} pendentes)</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer select-none bg-white px-2.5 py-1 rounded-md border border-slate-200 hover:border-indigo-300">
                      <input
                        type="checkbox"
                        checked={horusFilterMode === 'ONLY_IMPORTED'}
                        onChange={(e) => setHorusFilterMode(e.target.checked ? 'ONLY_IMPORTED' : 'ALL')}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Ocultar itens não cadastrados ({horusStats.totalImported} já no DBM)</span>
                    </label>

                    <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer select-none bg-white px-2.5 py-1 rounded-md border border-slate-200 hover:border-indigo-300">
                      <input
                        type="checkbox"
                        checked={horusOnlyWithStock}
                        onChange={(e) => setHorusOnlyWithStock(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>Apenas com Saldo &gt; 0</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                    <span>Total Horus: <strong className="text-slate-800">{horusStats.totalAll}</strong></span>
                    <span>•</span>
                    <span>Já no DBM: <strong className="text-emerald-700">{horusStats.totalImported}</strong></span>
                    <span>•</span>
                    <span>Não cadastrados: <strong className="text-amber-700">{horusStats.totalNotImported}</strong></span>
                  </div>
                </div>
              </form>

              {horusSyncMessage && (
                <div
                  className={`px-4 py-2 text-xs font-semibold border-b ${
                    horusSyncMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border-rose-200'
                  }`}
                >
                  {horusSyncMessage.text}
                </div>
              )}

              {/* Tabela de Itens do Horus SQL */}
              <div className="flex-1 overflow-auto bg-white">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="py-2 px-2.5 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={visibleHorusItems.length > 0 && visibleHorusItems.every(i => selectedHorusCodes[i.cod_item])}
                          onChange={toggleSelectAllHorusPage}
                          title="Selecionar/desmarcar todos os itens visíveis na lista"
                        />
                      </th>
                      <th className="py-2 px-2.5 w-20">Cód Horus</th>
                      <th className="py-2 px-2.5 w-32">ISBN Horus</th>
                      <th className="py-2 px-2.5 w-56 bg-indigo-50/70 text-indigo-900">
                        2º ISBN / ISBNs Extras (E-book)
                      </th>
                      <th className="py-2 px-2.5">Título no Horus</th>
                      <th className="py-2 px-2.5 w-32">Editora</th>
                      <th className="py-2 px-2.5 w-24 text-center">Lançamento</th>
                      <th className="py-2 px-2.5 w-24 text-right">Preço Capa</th>
                      <th className="py-2 px-2.5 w-16 text-right">Saldo</th>
                      <th className="py-2 px-2.5 w-28 text-center">Status DBM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {loadingHorusItems ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                          Consultando view Itens_estoque_geral no SQL Server do Horus...
                        </td>
                      </tr>
                    ) : visibleHorusItems.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          Nenhum item para exibir com o filtro atual.
                        </td>
                      </tr>
                    ) : (
                      visibleHorusItems.map(it => {
                        const isChecked = Boolean(selectedHorusCodes[it.cod_item]);
                        return (
                          <tr
                            key={it.cod_item}
                            className={isChecked ? 'bg-indigo-50/70 font-medium' : 'hover:bg-slate-50'}
                          >
                            <td className="py-1.5 px-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleHorusItemSelection(it.cod_item)}
                              />
                            </td>
                            <td className="py-1.5 px-2.5 font-mono font-bold text-slate-700">{it.cod_item}</td>
                            <td className="py-1.5 px-2.5 font-mono text-slate-600">{it.isbn || '-'}</td>
                            <td className="py-1 px-2.5 bg-indigo-50/30">
                              <input
                                type="text"
                                value={horusExtraIsbnsMap[it.cod_item] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setHorusExtraIsbnsMap(prev => ({ ...prev, [it.cod_item]: val }));
                                  if (val.trim() && !selectedHorusCodes[it.cod_item]) {
                                    setSelectedHorusCodes(prev => ({ ...prev, [it.cod_item]: true }));
                                  }
                                }}
                                placeholder="Ex: 2º ISBN (97865...)"
                                className="w-full px-2 py-0.5 text-[11px] font-mono bg-white border border-indigo-200 rounded focus:outline-none focus:border-indigo-600"
                              />
                            </td>
                            <td className="py-1.5 px-2.5 truncate max-w-xs" title={it.nome_item}>
                              {it.nome_item}
                            </td>
                            <td className="py-1.5 px-2.5 truncate text-[11px] text-slate-600">{it.editora}</td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-[11px] text-slate-500">
                              {it.data_lancamento ? String(it.data_lancamento).slice(0, 10).split('-').reverse().join('/') : '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono">
                              {Number(it.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold">{it.estoque}</td>
                            <td className="py-1.5 px-2.5 text-center">
                              {it.already_imported ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                  Já no DBM
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px]">
                                  Não sincronizado
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Rodapé do Modal de Sincronização */}
              <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-semibold">
                  <span>
                    Selecionados: <strong className="text-indigo-700">{Object.values(selectedHorusCodes).filter(Boolean).length}</strong> item(ns) • Exibindo {visibleHorusItems.length} de {horusTotalCount}
                  </span>
                  {horusStats.totalNotImported > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllNotImportedHorus}
                      className="px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold cursor-pointer transition"
                    >
                      Selecionar Todos Não Cadastrados ({horusStats.totalNotImported})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleImportSelectedHorusItems(false)}
                    disabled={importingHorus}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {importingHorus ? 'Sincronizando...' : 'Sincronizar Selecionados'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportSelectedHorusItems(true)}
                    disabled={importingHorus}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    Sincronizar e Abrir na Ficha
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHorusSyncModal(false)}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-lg cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: HISTÓRICO DE PREÇOS E MOVIMENTAÇÕES DO PRODUTO                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showSalesHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold">Histórico do Produto — {bookForm.name}</span>
                <button type="button" onClick={() => setShowSalesHistoryModal(false)} className="cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 max-h-[65vh] overflow-y-auto space-y-3 text-xs text-slate-800">
                {loadingHistory ? (
                  <p className="text-center py-6 text-slate-500">Carregando histórico...</p>
                ) : (
                  <div>
                    <h4 className="font-bold uppercase text-[11px] mb-2 text-slate-500">Histórico de Alterações de Preço</h4>
                    {productHistoryData?.prices?.length ? (
                      <table className="w-full bg-white border border-slate-200 rounded-lg overflow-hidden text-[11px]">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-2 text-left">Data</th>
                            <th className="p-2 text-left">Motivo</th>
                            <th className="p-2 text-right">Anterior</th>
                            <th className="p-2 text-right">Novo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {productHistoryData.prices.map((pr: any) => (
                            <tr key={pr.id}>
                              <td className="p-2 font-mono">{new Date(pr.created_at).toLocaleString('pt-BR')}</td>
                              <td className="p-2">{pr.reason}</td>
                              <td className="p-2 text-right font-mono">R$ {Number(pr.old_price || 0).toFixed(2)}</td>
                              <td className="p-2 text-right font-mono font-bold">R$ {Number(pr.new_price || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-slate-500 py-4 text-center bg-slate-50 rounded-lg border border-slate-100">
                        Nenhuma alteração de preço registrada para este livro.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-right">
                <button
                  type="button"
                  onClick={() => setShowSalesHistoryModal(false)}
                  className="px-4 py-1.5 bg-indigo-600 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE ATALHOS EXCEL & LEGENDA */}
      <AnimatePresence>
        {showLegendModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-md w-full text-xs text-slate-700 space-y-3 shadow-xl">
              <div className="flex items-center justify-between font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
                <span className="flex items-center gap-1.5">
                  <Keyboard className="w-4 h-4 text-indigo-600" />
                  Atalhos Estilo Excel & Legenda DBM
                </span>
                <button type="button" onClick={() => setShowLegendModal(false)} className="cursor-pointer">✕</button>
              </div>
              <div className="space-y-1.5">
                <p>• <strong>Setas ↑ / ↓ / Home / End:</strong> Navega rapidamente pelas linhas da planilha.</p>
                <p>• <strong>Enter ou Duplo Clique:</strong> Abre a Ficha de Cadastro do livro selecionado.</p>
                <p>• <strong>Modo Edição Direta (Excel):</strong> Permite editar 2º ISBN, Data de Lançamento, Preço de Capa e Unid/Caixa direto na grade pressionando <code>Enter</code>.</p>
                <p>• <strong>F2 (na Ficha):</strong> Salva imediatamente as alterações do livro.</p>
                <p>• <strong>Alt + ← / → (na Ficha):</strong> Alterna para o livro anterior ou próximo sem sair da ficha.</p>
                <p>• <strong>Janela de Novidades (-9m a +6m):</strong> Calculada automaticamente a partir da Data de Lançamento, sinalizando se o livro está em Pré-lançamento, Novidade vigente ou Expirando (&lt;30 dias).</p>
              </div>
              <div className="text-right pt-2">
                <button
                  type="button"
                  onClick={() => setShowLegendModal(false)}
                  className="px-4 py-1.5 bg-indigo-600 text-white font-bold rounded-lg cursor-pointer"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

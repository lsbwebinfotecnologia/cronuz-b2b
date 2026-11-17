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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
  Keyboard,
  Upload,
  Download,
  GripVertical,
  Columns3,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { getToken, getUser } from '@/lib/auth';
import CurrencyInput from '@/components/CurrencyInput';
import DbmPinnedNavBar from '@/components/DbmPinnedNavBar';

export type ProductColumnKey =
  | 'cod_horus'
  | 'isbn'
  | 'additional_isbns'
  | 'name'
  | 'brand'
  | 'subject'
  | 'launch_date'
  | 'base_price'
  | 'stock_quantity'
  | 'consignment_stock'
  | 'sales_365'
  | 'sales_90'
  | 'units_per_box';

export const DEFAULT_PRODUCT_COLUMNS: ProductColumnKey[] = [
  'cod_horus',
  'isbn',
  'additional_isbns',
  'name',
  'brand',
  'subject',
  'launch_date',
  'base_price',
  'stock_quantity',
  'consignment_stock',
  'sales_365',
  'sales_90',
  'units_per_box',
];

export const DEFAULT_VISIBLE_COLUMNS: Record<ProductColumnKey, boolean> = {
  cod_horus: true,
  isbn: true,
  additional_isbns: false,
  name: true,
  brand: true,
  subject: false,
  launch_date: true,
  base_price: true,
  stock_quantity: true,
  consignment_stock: true,
  sales_365: true,
  sales_90: true,
  units_per_box: true,
};

const formatProductDaysToMonths = (days: number): string => {
  const d = Math.max(1, Number(days) || 90);
  if (d === 365 || d === 360) return '12M';
  const m = d / 30;
  if (Number.isInteger(m)) return `${m}M`;
  return `${Math.max(1, Math.round(m))}M`;
};

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
  is_ebook?: boolean;
  is_out_of_print?: boolean;
  is_pre_sale?: boolean;
  horus_situacao_item?: string | null;
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
  is_ebook: boolean;
  is_out_of_print: boolean;
  horus_situacao_item: string;
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
  is_ebook: false,
  is_out_of_print: false,
  horus_situacao_item: 'Em Distribuição',
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

export type DbmProductSituationKey = 'LANCAMENTO' | 'EM_DISTRIBUICAO' | 'ESGOTADO' | 'FORA_DE_CATALOGO';

// Avalia a Situação Oficial do Item no Cadastro de Produtos DBM:
// Lançamento | Em Distribuição | Esgotado | Fora de Catálogo (sem confundir com a janela do Pedido)
function evaluateProductSituation(item: {
  horus_situacao_item?: string | null;
  is_out_of_print?: boolean;
  is_pre_sale?: boolean;
}): {
  key: DbmProductSituationKey;
  label: 'Lançamento' | 'Em Distribuição' | 'Esgotado' | 'Fora de Catálogo';
  badgeClass: string;
  detail: string;
} {
  const raw = String(item.horus_situacao_item || '').trim().toUpperCase();
  if (raw === 'FC' || raw.includes('FORA')) {
    return {
      key: 'FORA_DE_CATALOGO',
      label: 'Fora de Catálogo',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      detail: 'Item fora de catálogo editorial'
    };
  }
  if (raw === 'ES' || raw === 'FE' || raw.includes('ESGOT') || item.is_out_of_print) {
    return {
      key: 'ESGOTADO',
      label: 'Esgotado',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
      detail: 'Item esgotado'
    };
  }
  if (raw === 'LC' || raw === 'IP' || raw.includes('LANC') || raw.includes('LANÇ') || item.is_pre_sale) {
    return {
      key: 'LANCAMENTO',
      label: 'Lançamento',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      detail: 'Obra em lançamento'
    };
  }
  return {
    key: 'EM_DISTRIBUICAO',
    label: 'Em Distribuição',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    detail: 'Obra ativa em distribuição'
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
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);

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

  // Filtros Superiores da Aba Pesquisa de Produtos (Persistidos no usuário / login)
  const [filterTitle, setFilterTitle] = useState('');
  const [filterIsbn, setFilterIsbn] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterPublisher, setFilterPublisher] = useState('');
  const [filterSituation, setFilterSituation] = useState<'ALL' | DbmProductSituationKey>('ALL');
  const [hideOutOfStock, setHideOutOfStock] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const u = getUser();
      const userKey = `cronuz_dbm_hide_out_of_stock_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
      const saved = localStorage.getItem(userKey) ?? localStorage.getItem('cronuz_dbm_hide_out_of_stock');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });
  const [hideEbooks, setHideEbooks] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const u = getUser();
      const userKey = `cronuz_dbm_hide_ebooks_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
      const saved = localStorage.getItem(userKey) ?? localStorage.getItem('cronuz_dbm_hide_ebooks');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });
  const [generalSalesDays, setGeneralSalesDays] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const u = getUser();
      const deskKey = `cronuz_proposal_desk_config_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
      const rawDesk = localStorage.getItem(deskKey) || localStorage.getItem('cronuz_proposal_desk_config');
      if (rawDesk) {
        try {
          const parsed = JSON.parse(rawDesk);
          if (typeof parsed.generalSalesDays === 'number' && parsed.generalSalesDays > 0) {
            return parsed.generalSalesDays;
          }
        } catch {
          // ignore
        }
      }
      const savedDays = localStorage.getItem('cronuz_dbm_general_sales_days');
      if (savedDays && Number(savedDays) > 0) return Number(savedDays);
    }
    return 90;
  });

  // Ordem e Visibilidade das colunas da Planilha de Produtos (Salvas por Usuário)
  const [columnOrder, setColumnOrder] = useState<ProductColumnKey[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = getUser();
        const colKey = `cronuz_dbm_products_col_order_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
        const raw = localStorage.getItem(colKey) || localStorage.getItem('cronuz_dbm_products_col_order');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid: ProductColumnKey[] = [];
            for (const k of parsed) {
              if (DEFAULT_PRODUCT_COLUMNS.includes(k as ProductColumnKey) && !valid.includes(k as ProductColumnKey)) {
                valid.push(k as ProductColumnKey);
              }
            }
            for (const defK of DEFAULT_PRODUCT_COLUMNS) {
              if (!valid.includes(defK)) valid.push(defK);
            }
            return valid;
          }
        }
      } catch {
        // ignore
      }
    }
    return DEFAULT_PRODUCT_COLUMNS;
  });
  const [visibleColumns, setVisibleColumns] = useState<Record<ProductColumnKey, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = getUser();
        const visKey = `cronuz_dbm_products_visible_cols_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
        const raw = localStorage.getItem(visKey) || localStorage.getItem('cronuz_dbm_products_visible_cols');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
          }
        }
      } catch {
        // ignore
      }
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });
  const [dragColKey, setDragColKey] = useState<ProductColumnKey | null>(null);
  const [showColumnOrderModal, setShowColumnOrderModal] = useState<boolean>(false);

  // Modal de Exportação Excel (Modelos)
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportModel, setExportModel] = useState<'MODEL_1_CATALOG' | 'MODEL_2_TIRAGENS'>('MODEL_1_CATALOG');
  const [exportScope, setExportScope] = useState<'FILTERED' | 'ALL'>('FILTERED');

  // Estados de Dados da Planilha Principal
  const [products, setProducts] = useState<ProductGridItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [quickSearchFooter, setQuickSearchFooter] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [sortConfig, setSortConfig] = useState<{
    key: ProductColumnKey;
    direction: 'asc' | 'desc';
  } | null>(null);

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

  // URLs padrão e secundária de capas do Seller (mesma dinâmica do Storefront B2C)
  const [coverBaseUrl, setCoverBaseUrl] = useState<string>('');
  const [coverSecondaryBaseUrl, setCoverSecondaryBaseUrl] = useState<string>('');
  const [coverCandidateStep, setCoverCandidateStep] = useState<number>(0);

  // Estados da Importação de Planilha Excel (2 abas: Itens + Tiragens)
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [excelImportFile, setExcelImportFile] = useState<File | null>(null);
  const [excelCreateMissing, setExcelCreateMissing] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelImportResult, setExcelImportResult] = useState<any | null>(null);
  const [excelImportError, setExcelImportError] = useState<string | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Carrega configurações de URL de capa do seller
  useEffect(() => {
    if (!companyId) return;
    const token = getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${apiUrl}/companies/${companyId}/settings`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) {
          if (data.cover_image_base_url) {
            setCoverBaseUrl(String(data.cover_image_base_url).replace(/\/$/, ''));
          }
          if (data.cover_image_secondary_base_url) {
            setCoverSecondaryBaseUrl(String(data.cover_image_secondary_base_url).replace(/\/$/, ''));
          }
        }
      })
      .catch(() => {});
  }, [companyId]);

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
      is_ebook: Boolean(
        p.is_ebook ||
        String(p.binding_finish || '').toLowerCase() === 'e-book' ||
        p.name?.toUpperCase().includes('E-BOOK')
      ),
      is_out_of_print: Boolean(p.is_out_of_print),
      horus_situacao_item: evaluateProductSituation(p).label,
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
        if (data?.cover_image_base_url) {
          setCoverBaseUrl(String(data.cover_image_base_url).replace(/\/$/, ''));
        }
        if (data?.cover_image_secondary_base_url) {
          setCoverSecondaryBaseUrl(String(data.cover_image_secondary_base_url).replace(/\/$/, ''));
        }
        const rawList = Array.isArray(data) ? data : (data.items || []);

        const mapped: ProductGridItem[] = rawList.map((p: any) => {
          const stock = Number(p.stock_quantity || 0);
          const isEsgotado = Boolean(p.is_out_of_print) || p.status === 'INACTIVE';
          const isEbook =
            Boolean(p.is_ebook) ||
            String(p.binding_finish || '').toLowerCase() === 'e-book' ||
            String(p.name || '').toUpperCase().includes('E-BOOK');

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
            is_ebook: isEbook,
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
          batchEnrichCatalogMetrics(targetCompanyId, generalSalesDays);
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

  // Enriquecimento em lote de VDS365 Geral, VDS(XM) Geral, Saldo Disponível e Saldo Consignado Geral (filtrado pela filial do seller)
  const batchEnrichCatalogMetrics = async (targetCompanyId?: number, salesDays?: number) => {
    const cid = targetCompanyId || companyId;
    const days = salesDays || generalSalesDays || 90;
    try {
      const token = getToken();
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

      const res = await fetch(
        `${apiUrl}/dbm/products/batch-enrich-metrics?company_id=${cid}&general_sales_days=${days}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) return;
      const data = await res.json();
      const metricsMap = data?.metrics || {};
      if (Object.keys(metricsMap).length > 0) {
        setProducts((prev) =>
          prev.map((item) => {
            const m = metricsMap[String(item.id)];
            if (!m) return item;
            return {
              ...item,
              consignment_stock: Number(m.consignment_stock ?? item.consignment_stock ?? 0),
              sales_365: Number(m.sales_365 ?? item.sales_365 ?? 0),
              sales_90: Number(m.sales_90 ?? item.sales_90 ?? 0),
              stock_quantity: m.stock_quantity != null ? Number(m.stock_quantity) : item.stock_quantity,
            };
          })
        );
      }
    } catch {
      // silencioso em background
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

      if (bookForm.id) {
        const enrichRes = await fetch(
          `${apiUrl}/dbm/products/${bookForm.id}/enrich-from-horus?company_id=${companyId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ company_id: companyId, force_overwrite_dimensions: true })
          }
        );
        if (enrichRes.ok) {
          const enrichData = await enrichRes.json();
          if (enrichData?.product) {
            const p = enrichData.product;
            setBookForm(mapProductToForm(p));
            await fetchProducts(false);
            setSaveFeedback({
              type: 'success',
              message: `✓ Dados atualizados do Horus e salvos automaticamente! (Disponível: ${p.stock_quantity || 0} un. • Consignado: ${p.consignment_stock || 0} un. • Estoque Total: ${(p.stock_quantity || 0) + (p.consignment_stock || 0)} un.)`
            });
            return;
          }
        }
      }

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
        consignment_stock: Number((exact as any).saldo_consignado ?? prev.consignment_stock),
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

      const sitEval = evaluateProductSituation(item);
      const payload: Record<string, any> = {
        sku: item.sku,
        name: item.name,
        ean_gtin: item.ean_gtin || item.isbn || null,
        additional_isbns: item.additional_isbns || null,
        base_price: Number(item.base_price || 0),
        units_per_box: item.units_per_box != null ? Number(item.units_per_box) : 0,
        launch_date: lDate ? new Date(`${lDate}T12:00:00`).toISOString() : null,
        launch_year: parts.length === 3 ? parseInt(parts[0], 10) : item.launch_year,
        launch_month: parts.length === 3 ? parseInt(parts[1], 10) : item.launch_month,
        horus_situacao_item: item.horus_situacao_item || sitEval.label,
        is_out_of_print: sitEval.key === 'ESGOTADO' || sitEval.key === 'FORA_DE_CATALOGO',
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
        autoEnrichProductOnOpen(productId);
      }
    } catch (e) {
      console.error('Erro ao carregar ficha do livro DBM:', e);
    }
  };

  // Auto-enriquecimento e auto-salvamento silencioso ao abrir uma ficha no DBM
  // Busca no Horus (SQL + API) saldo disponível, saldo consignado, giro, peso, dimensões e capa se faltarem e já salva no banco
  const autoEnrichProductOnOpen = async (productId?: number) => {
    if (!productId || productId <= 0) return;
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(
        `${apiUrl}/dbm/products/${productId}/enrich-from-horus?company_id=${companyId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ company_id: companyId })
        }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.cover_image_base_url) {
        setCoverBaseUrl(String(data.cover_image_base_url).replace(/\/$/, ''));
      }
      if (data?.cover_image_secondary_base_url) {
        setCoverSecondaryBaseUrl(String(data.cover_image_secondary_base_url).replace(/\/$/, ''));
      }
      if (data?.product && data.product.id === productId) {
        const enrichedProd = data.product;
        setBookForm(prev => {
          if (prev.id !== productId) return prev;
          const mappedEnriched = mapProductToForm(enrichedProd);
          return {
            ...mappedEnriched,
            // Mantém cover_url se já preenchida ou usa a resolvida pelo backend
            cover_url: mappedEnriched.cover_url || prev.cover_url
          };
        });
        // Atualiza também na lista em memória para refletir saldo/consignado/peso/dimensões sem recarregar tudo
        setProducts(prev =>
          prev.map(item =>
            item.id === productId
              ? {
                  ...item,
                  ...enrichedProd,
                  isbn: enrichedProd.ean_gtin || item.isbn,
                  stock_quantity: Number(enrichedProd.stock_quantity ?? item.stock_quantity),
                  consignment_stock: Number(enrichedProd.consignment_stock ?? item.consignment_stock),
                  sales_90: Number(enrichedProd.sales_90 ?? item.sales_90),
                  sales_365: Number(enrichedProd.sales_365 ?? item.sales_365),
                  weight_kg: enrichedProd.weight_kg ?? item.weight_kg,
                  width_cm: enrichedProd.width_cm ?? item.width_cm,
                  height_cm: enrichedProd.height_cm ?? item.height_cm,
                  cover_url: enrichedProd.cover_url || item.cover_url
                }
              : item
          )
        );
      }
    } catch (e) {
      console.debug('Auto-enriquecimento DBM silencioso ignorado:', e);
    }
  };

  // Cascata de URLs candidatas da capa (mesma dinâmica da Storefront B2C)
  const coverCandidates = useMemo(() => {
    const list: string[] = [];
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const wrapProxyIfNeeded = (rawUrl: string) => {
      if (
        rawUrl.startsWith('http://') &&
        !rawUrl.startsWith('http://localhost') &&
        !rawUrl.startsWith('http://127.0.0.1')
      ) {
        return `${apiUrl}/b2c/public/cover-proxy?url=${encodeURIComponent(rawUrl)}`;
      }
      return rawUrl;
    };
    const addUnique = (url: string | null | undefined) => {
      if (!url) return;
      const trimmed = url.trim();
      if (!trimmed) return;
      const absUrl = trimmed.startsWith('http') || trimmed.startsWith('data:') ? trimmed : `${apiUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
      const finalUrl = wrapProxyIfNeeded(absUrl);
      if (!list.includes(finalUrl)) list.push(finalUrl);
    };

    if (bookForm.cover_url) {
      addUnique(bookForm.cover_url);
    }
    const cleanIsbn = String(bookForm.ean_gtin || bookForm.barcode || '').trim().replace(/[^0-9Xx]/g, '');
    if (cleanIsbn) {
      if (coverBaseUrl) {
        addUnique(`${coverBaseUrl.replace(/\/$/, '')}/${cleanIsbn}.jpg`);
      }
      if (coverSecondaryBaseUrl) {
        addUnique(`${coverSecondaryBaseUrl.replace(/\/$/, '')}/${cleanIsbn}.jpg`);
      }
      if (companyId) {
        addUnique(`/uploads/covers/${companyId}/${cleanIsbn}.jpg`);
      }
    }
    return list;
  }, [bookForm.cover_url, bookForm.ean_gtin, bookForm.barcode, coverBaseUrl, coverSecondaryBaseUrl, companyId]);

  useEffect(() => {
    setCoverCandidateStep(0);
    // Se o campo URL da Capa estiver vazio na ficha, preenche automaticamente com a URL padrão do seller + ISBN
    const cleanIsbn = String(bookForm.ean_gtin || bookForm.barcode || '').trim().replace(/[^0-9Xx]/g, '');
    if (!bookForm.cover_url && cleanIsbn && (coverBaseUrl || coverSecondaryBaseUrl)) {
      const defaultCover = coverBaseUrl
        ? `${coverBaseUrl.replace(/\/$/, '')}/${cleanIsbn}.jpg`
        : `${coverSecondaryBaseUrl.replace(/\/$/, '')}/${cleanIsbn}.jpg`;
      setBookForm(prev => (prev.cover_url ? prev : { ...prev, cover_url: defaultCover }));
    }
  }, [bookForm.id, bookForm.ean_gtin, coverBaseUrl, coverSecondaryBaseUrl]);

  // Filtragem e Ordenação Geral (aplica sobre TODO o catálogo antes da paginação)
  const filteredProducts = useMemo(() => {
    const baseFiltered = products.filter(item => {
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
      if (filterSituation !== 'ALL') {
        const sit = evaluateProductSituation(item);
        if (sit.key !== filterSituation) {
          return false;
        }
      }
      if (hideEbooks && item.is_ebook) {
        return false;
      }
      if (hideOutOfStock && (item.is_out_of_print || Number(item.stock_quantity || 0) <= 0)) {
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

    if (!sortConfig) return baseFiltered;

    const { key, direction } = sortConfig;
    const dir = direction === 'asc' ? 1 : -1;

    return [...baseFiltered].sort((a, b) => {
      if (key === 'name' || key === 'brand' || key === 'isbn' || key === 'additional_isbns' || key === 'subject') {
        const valA =
          key === 'name'
            ? (a.name || '')
            : key === 'brand'
            ? (a.brand || '')
            : key === 'additional_isbns'
            ? (a.additional_isbns || '')
            : key === 'subject'
            ? (a.subject || a.category_name || '')
            : (a.ean_gtin || a.isbn || '');
        const valB =
          key === 'name'
            ? (b.name || '')
            : key === 'brand'
            ? (b.brand || '')
            : key === 'additional_isbns'
            ? (b.additional_isbns || '')
            : key === 'subject'
            ? (b.subject || b.category_name || '')
            : (b.ean_gtin || b.isbn || '');
        return valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base', numeric: true }) * dir;
      }

      if (key === 'cod_horus') {
        const rawA = String(a.horus_cod_item ?? a.sku ?? '').trim();
        const rawB = String(b.horus_cod_item ?? b.sku ?? '').trim();
        const numA = Number(rawA);
        const numB = Number(rawB);
        if (!Number.isNaN(numA) && !Number.isNaN(numB) && rawA !== '' && rawB !== '') {
          return (numA - numB) * dir;
        }
        return rawA.localeCompare(rawB, 'pt-BR', { numeric: true }) * dir;
      }

      if (key === 'launch_date') {
        const tA = a.launch_date ? new Date(a.launch_date).getTime() : NaN;
        const tB = b.launch_date ? new Date(b.launch_date).getTime() : NaN;
        const validA = !Number.isNaN(tA);
        const validB = !Number.isNaN(tB);
        if (!validA && !validB) return 0;
        if (!validA) return 1; // Sem data vai para o final
        if (!validB) return -1;
        return (tA - tB) * dir;
      }

      if (key === 'base_price') {
        return (Number(a.base_price || 0) - Number(b.base_price || 0)) * dir;
      }
      if (key === 'stock_quantity') {
        return (Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0)) * dir;
      }
      if (key === 'consignment_stock') {
        return (Number(a.consignment_stock || 0) - Number(b.consignment_stock || 0)) * dir;
      }
      if (key === 'sales_365') {
        return (Number(a.sales_365 || 0) - Number(b.sales_365 || 0)) * dir;
      }
      if (key === 'sales_90') {
        return (Number(a.sales_90 || 0) - Number(b.sales_90 || 0)) * dir;
      }
      if (key === 'units_per_box') {
        return (Number(a.units_per_box || 0) - Number(b.units_per_box || 0)) * dir;
      }
      return 0;
    });
  }, [products, filterTitle, filterIsbn, filterCollection, filterPublisher, filterSituation, hideEbooks, hideOutOfStock, quickSearchFooter, sortConfig]);

  const handleSortProductColumn = (key: ProductColumnKey) => {
    const isTextCol = key === 'name' || key === 'brand' || key === 'isbn' || key === 'additional_isbns' || key === 'subject';
    setSortConfig(prev => {
      if (!prev || prev.key !== key) {
        return { key, direction: isTextCol ? 'asc' : 'desc' };
      }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
    setCurrentPage(1);
    setSelectedIndex(0);
  };

  const renderProductSortIcon = (key: ProductColumnKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400/70 opacity-60 group-hover:opacity-100 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
    );
  };

  // Paginação da Planilha de Produtos DBM
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProducts.length / pageSize)),
    [filteredProducts.length, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIndex(filteredProducts.length > 0 ? 0 : -1);
  }, [filterTitle, filterIsbn, filterCollection, filterPublisher, filterSituation, hideEbooks, hideOutOfStock, quickSearchFooter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (selectedIndex >= 0) {
      const targetPage = Math.floor(selectedIndex / pageSize) + 1;
      if (targetPage !== currentPage && targetPage >= 1 && targetPage <= totalPages) {
        setCurrentPage(targetPage);
      }
    }
  }, [selectedIndex, pageSize, totalPages]);

  const pageStartIdx = (currentPage - 1) * pageSize;
  const paginatedProducts = useMemo(
    () => filteredProducts.slice(pageStartIdx, pageStartIdx + pageSize),
    [filteredProducts, pageStartIdx, pageSize]
  );

  const handleGoToPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(nextPage, totalPages));
    setCurrentPage(bounded);
    const firstRowIdx = (bounded - 1) * pageSize;
    if (firstRowIdx < filteredProducts.length) {
      setSelectedIndex(firstRowIdx);
    }
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  };

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
    if (item.id) {
      autoEnrichProductOnOpen(item.id);
    }
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
    const targetItem = filteredProducts[bounded];
    setBookForm(mapProductToForm(targetItem));
    if (targetItem?.id) {
      autoEnrichProductOnOpen(targetItem.id);
    }
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
        const s = bookForm.contract_signed_date.trim();
        let day = 0;
        let month = 0;
        let yr = 0;
        if (s.includes('/')) {
          const p = s.split('/');
          if (p.length === 3 && p[2].length === 4) {
            day = parseInt(p[0], 10);
            month = parseInt(p[1], 10);
            yr = parseInt(p[2], 10);
          }
        } else if (s.includes('-')) {
          const p = s.slice(0, 10).split('-');
          if (p.length === 3 && p[0].length === 4) {
            yr = parseInt(p[0], 10);
            month = parseInt(p[1], 10);
            day = parseInt(p[2], 10);
          }
        }
        if (day > 0 && month > 0 && yr >= 1900) {
          const expYear = yr + years;
          const computed = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${expYear}`;
          if (bookForm.contract_expires_date !== computed) {
            setBookForm(prev => ({ ...prev, contract_expires_date: computed }));
          }
        }
      }
    }
  }, [bookForm.contract_signed_date, bookForm.contract_validity_years]);

  // Máscara automática DD/MM/AAAA ao digitar Data de Assinatura
  const handleContractSignedDateChange = (rawVal: string) => {
    const digits = rawVal.replace(/\D/g, '').slice(0, 8);
    let formatted = rawVal;
    if (/^\d+$/.test(rawVal.replace(/\//g, ''))) {
      if (digits.length <= 2) {
        formatted = digits;
      } else if (digits.length <= 4) {
        formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      } else {
        formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      }
    }
    setBookForm(prev => ({ ...prev, contract_signed_date: formatted }));
  };

  // Importação de Planilha Excel de 2 Abas (Itens + Tiragens)
  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setExcelImportError(null);
    setExcelImportResult(null);
    if (!f) {
      setExcelImportFile(null);
      return;
    }
    // Regra Mandatória #1: Limite rígido de 10 MB para planilhas no Frontend
    const maxBytes = 10 * 1024 * 1024;
    if (f.size > maxBytes) {
      setExcelImportError('O arquivo excede o limite máximo permitido de 10 MB para planilhas de importação.');
      setExcelImportFile(null);
      e.target.value = '';
      return;
    }
    if (!f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xlsm')) {
      setExcelImportError('Formato inválido. Selecione uma planilha Excel (.xlsx).');
      setExcelImportFile(null);
      e.target.value = '';
      return;
    }
    try {
      // Carrega o arquivo imediatamente para a memória RAM (Blob/File em memória)
      // Evita o erro nativo do Chrome "net::ERR_UPLOAD_FILE_CHANGED / Failed to fetch"
      // quando a planilha está aberta no Excel ou em pasta sincronizada (iCloud/OneDrive/Dropbox)
      const arrayBuf = await f.arrayBuffer();
      const inMemoryFile = new File(
        [arrayBuf],
        f.name,
        {
          type: f.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          lastModified: Date.now(),
        }
      );
      setExcelImportFile(inMemoryFile);
    } catch {
      setExcelImportFile(f);
    }
  };

  const handleUploadExcelLancamentos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelImportFile) {
      setExcelImportError('Selecione a planilha Excel (.xlsx) antes de importar.');
      return;
    }
    setImportingExcel(true);
    setExcelImportError(null);
    setExcelImportResult(null);
    try {
      const token = getToken();
      const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
      const isProdBrowser =
        typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';
      // Prioriza same-origin (/api) quando em produção para evitar bloqueio/CORS entre subdomínios (app.cronuzb2b -> cronuzb2b)
      const primaryBaseUrl = isProdBrowser ? '/api' : configuredApiUrl;

      const buildFormData = () => {
        const fd = new FormData();
        fd.append('file', excelImportFile);
        if (companyId) fd.append('company_id', String(companyId));
        fd.append('create_missing', excelCreateMissing ? 'true' : 'false');
        return fd;
      };

      let res: Response;
      try {
        res = await fetch(`${primaryBaseUrl}/dbm/products/import-excel-lancamentos`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: buildFormData()
        });
      } catch (networkErr) {
        if (primaryBaseUrl !== configuredApiUrl) {
          res = await fetch(`${configuredApiUrl}/dbm/products/import-excel-lancamentos`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: buildFormData()
          });
        } else {
          throw networkErr;
        }
      }

      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { detail: rawText ? `HTTP ${res.status}: ${rawText.slice(0, 200)}` : `HTTP ${res.status}` };
      }

      if (!res.ok) {
        throw new Error(data.detail || `Erro ao processar planilha (HTTP ${res.status}).`);
      }
      setExcelImportResult(data);
      await fetchProducts(false);
      if (bookForm.id) {
        await loadSingleProductIntoForm(bookForm.id);
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha ao importar planilha Excel.';
      setExcelImportError(
        msg === 'Failed to fetch'
          ? 'Falha de comunicação ao enviar a planilha (Failed to fetch). Caso a planilha esteja aberta no Excel, feche-a, selecione o arquivo novamente e clique em Processar.'
          : msg
      );
    } finally {
      setImportingExcel(false);
    }
  };

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
        is_ebook: Boolean(bookForm.is_ebook || bookForm.binding_finish === 'E-book'),
        is_out_of_print: Boolean(
          bookForm.is_out_of_print ||
          bookForm.horus_situacao_item === 'Esgotado' ||
          bookForm.horus_situacao_item === 'Fora de Catálogo'
        ),
        horus_situacao_item: bookForm.horus_situacao_item || 'Em Distribuição',
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
        consignment_stock: Number(bookForm.consignment_stock || 0),
        sales_90: Number(bookForm.sales_90 || 0),
        sales_365: Number(bookForm.sales_365 || 0),
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
    setFilterSituation('ALL');
    setQuickSearchFooter('');
    fetchProducts(false);
  };

  const saveColumnOrder = (nextOrder: ProductColumnKey[]) => {
    setColumnOrder(nextOrder);
    if (typeof window !== 'undefined') {
      try {
        const u = getUser();
        const colKey = `cronuz_dbm_products_col_order_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
        localStorage.setItem(colKey, JSON.stringify(nextOrder));
        localStorage.setItem('cronuz_dbm_products_col_order', JSON.stringify(nextOrder));
      } catch {
        // ignore
      }
    }
  };

  const saveVisibleColumns = (nextVisible: Record<ProductColumnKey, boolean>) => {
    setVisibleColumns(nextVisible);
    if (typeof window !== 'undefined') {
      try {
        const u = getUser();
        const visKey = `cronuz_dbm_products_visible_cols_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
        localStorage.setItem(visKey, JSON.stringify(nextVisible));
        localStorage.setItem('cronuz_dbm_products_visible_cols', JSON.stringify(nextVisible));
      } catch {
        // ignore
      }
    }
  };

  const handleToggleVisibleColumn = (colKey: ProductColumnKey) => {
    const next = {
      ...visibleColumns,
      [colKey]: !visibleColumns[colKey],
    };
    saveVisibleColumns(next);
  };

  const activeVisibleColumns = useMemo(
    () => columnOrder.filter((k) => visibleColumns[k] !== false),
    [columnOrder, visibleColumns]
  );

  const handleMoveColumnInOrder = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= columnOrder.length) return;
    const copy = [...columnOrder];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    saveColumnOrder(copy);
  };

  const handleDropColumnHeader = (targetKey: ProductColumnKey) => {
    if (!dragColKey || dragColKey === targetKey) {
      setDragColKey(null);
      return;
    }
    const fromIdx = columnOrder.indexOf(dragColKey);
    const toIdx = columnOrder.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) {
      setDragColKey(null);
      return;
    }
    const copy = [...columnOrder];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    saveColumnOrder(copy);
    setDragColKey(null);
  };

  const getColumnLabel = (colKey: ProductColumnKey): string => {
    switch (colKey) {
      case 'cod_horus':
        return 'Cód Horus';
      case 'isbn':
        return 'ISBN Principal';
      case 'additional_isbns':
        return '2º ISBN (E-book)';
      case 'name':
        return 'Título da Obra';
      case 'brand':
        return 'Editora';
      case 'subject':
        return 'Assunto / Gênero';
      case 'launch_date':
        return 'Situação / Lanç.';
      case 'base_price':
        return 'Preço Capa';
      case 'stock_quantity':
        return 'Saldo';
      case 'consignment_stock':
        return 'Consig. Geral';
      case 'sales_365':
        return 'VDS365';
      case 'sales_90':
        return `VDS(${formatProductDaysToMonths(generalSalesDays)})`;
      case 'units_per_box':
        return 'Un/Cx';
      default:
        return colKey;
    }
  };

  // Exportação da Planilha Geral (Modelo 1: Catálogo & Links | Modelo 2: Tiragens Gerais)
  const handleExportProductsExcel = () => {
    const sourceList = exportScope === 'FILTERED' ? filteredProducts : products;
    if (sourceList.length === 0) {
      alert('Não há livros disponíveis para exportar neste filtro.');
      return;
    }

    if (exportModel === 'MODEL_1_CATALOG') {
      // Modelo 1: (ISBN, Título, Data de lançamento, Ano, Mês, Link do item na internet)
      const rows = sourceList.map((p) => {
        const rawDate = p.launch_date ? String(p.launch_date).slice(0, 10) : '';
        const dateParts = rawDate ? rawDate.split('-') : [];
        const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
        const yearVal = p.launch_year || (dateParts.length === 3 ? Number(dateParts[0]) : '');
        const monthVal = p.launch_month || (dateParts.length === 3 ? Number(dateParts[1]) : '');
        return {
          ISBN: p.ean_gtin || p.isbn || '',
          Título: p.name || '',
          'Data de Lançamento': formattedDate,
          Ano: yearVal,
          Mês: monthVal,
          'Link do Item na Internet': p.external_link || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 18 }, // ISBN
        { wch: 48 }, // Título
        { wch: 18 }, // Data de Lançamento
        { wch: 10 }, // Ano
        { wch: 10 }, // Mês
        { wch: 52 }, // Link do Item na Internet
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Modelo 1 - Catalogo');
      XLSX.writeFile(wb, `DBM_Produtos_Modelo1_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setShowExportModal(false);
      return;
    }

    // Modelo 2: Tiragens Gerais de Todos os Itens (ISBN, Título + Dados da Tiragem)
    const tiragensRows: Record<string, any>[] = [];
    for (const p of sourceList) {
      let parsed: TiragemRow[] = [];
      if (p.dbm_tiragens) {
        try {
          const arr = JSON.parse(p.dbm_tiragens);
          if (Array.isArray(arr)) parsed = arr;
        } catch {
          parsed = [];
        }
      }
      if (parsed.length === 0) {
        tiragensRows.push({
          ISBN: p.ean_gtin || p.isbn || '',
          Título: p.name || '',
          'Cód. Horus': p.horus_cod_item || p.sku || '',
          'Nº Tiragem': 1,
          'Data Tiragem': p.launch_date ? String(p.launch_date).slice(0, 10).split('-').reverse().join('/') : '',
          'Qtd. Exemplares': Number(p.stock_quantity || 0),
          Frete: '0,00%',
          'DA Roy': p.ebook_royalty_pct ? `${Number(p.ebook_royalty_pct).toFixed(2).replace('.', ',')}%` : '0,00%',
          PIS: '0,00%',
          'Adiant. DA': 'R$ 0,00',
          'Custo DB': p.cost_price ? `R$ ${Number(p.cost_price).toFixed(2).replace('.', ',')}` : 'R$ 0,00',
          'Custo Pro': 'R$ 0,00',
          'Custo Fin': 'R$ 0,00',
          Roy: 'R$ 0,00',
          'DA s/': 'R$ 0,00',
          TTC: 'R$ 0,00',
        });
      } else {
        parsed.forEach((t, idx) => {
          tiragensRows.push({
            ISBN: p.ean_gtin || p.isbn || '',
            Título: p.name || '',
            'Cód. Horus': p.horus_cod_item || p.sku || '',
            'Nº Tiragem': idx + 1,
            'Data Tiragem': t.data_tiragem || '',
            'Qtd. Exemplares': Number(t.tiragem || 0),
            Frete: t.fre || '0,00%',
            'DA Roy': t.da_roy || '0,00%',
            PIS: t.pis || '0,00%',
            'Adiant. DA': t.da_advance || 'R$ 0,00',
            'Custo DB': t.custo_db || 'R$ 0,00',
            'Custo Pro': t.custo_pro || 'R$ 0,00',
            'Custo Fin': t.custo_fin || 'R$ 0,00',
            Roy: t.roy || 'R$ 0,00',
            'DA s/': t.da_s || 'R$ 0,00',
            TTC: t.ttc || 'R$ 0,00',
          });
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(tiragensRows);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 44 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tiragens Gerais DBM');
    XLSX.writeFile(wb, `DBM_Tiragens_Gerais_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportModal(false);
  };

  // Exportação das Tiragens de um Único Item aberto na Ficha
  const handleExportSingleBookTiragensExcel = () => {
    const rows = (bookForm.tiragens || []).map((t, idx) => ({
      ISBN: bookForm.ean_gtin || bookForm.barcode || '',
      Título: bookForm.name || '',
      'Cód. Horus': bookForm.horus_cod_item || bookForm.sku || '',
      'Nº Tiragem': idx + 1,
      'Data Tiragem': t.data_tiragem || '',
      'Qtd. Exemplares': Number(t.tiragem || 0),
      Frete: t.fre || '0,00%',
      'DA Roy': t.da_roy || '0,00%',
      PIS: t.pis || '0,00%',
      'Adiant. DA': t.da_advance || 'R$ 0,00',
      'Custo DB': t.custo_db || 'R$ 0,00',
      'Custo Pro': t.custo_pro || 'R$ 0,00',
      'Custo Fin': t.custo_fin || 'R$ 0,00',
      Roy: t.roy || 'R$ 0,00',
      'DA s/': t.da_s || 'R$ 0,00',
      TTC: t.ttc || 'R$ 0,00',
    }));

    if (rows.length === 0) {
      alert('Este livro ainda não possui linhas de tiragem para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 44 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tiragens do Livro');
    const safeSlug = (bookForm.ean_gtin || bookForm.horus_cod_item || bookForm.name || 'Livro')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    XLSX.writeFile(wb, `DBM_Tiragens_${safeSlug}.xlsx`);
  };

  const handleDeleteProductFromList = async (item: ProductGridItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Deseja realmente excluir o livro "${item.name}" (Cód. #${item.horus_cod_item || item.sku || item.id}) da listagem DBM?`)) {
      return;
    }

    setDeletingProductId(item.id);
    try {
      const token = getToken();
      const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
      const isProdBrowser =
        typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';
      const primaryBaseUrl = isProdBrowser ? '/api' : configuredApiUrl;

      let res: Response;
      try {
        res = await fetch(`${primaryBaseUrl}/dbm/products/${item.id}?company_id=${companyId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        res = await fetch(`${configuredApiUrl}/dbm/products/${item.id}?company_id=${companyId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Não foi possível excluir o item (HTTP ${res.status}).`);
      }

      setProducts(prev => prev.filter(p => p.id !== item.id));
      if (bookForm.id === item.id) {
        setBookForm(EMPTY_BOOK_FORM);
      }
    } catch (err: any) {
      alert(err?.message || 'Erro ao excluir item do cadastro DBM.');
    } finally {
      setDeletingProductId(null);
    }
  };

  const formLaunchBadge = useMemo(
    () => evaluateProductSituation(bookForm),
    [bookForm.horus_situacao_item, bookForm.is_out_of_print]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs select-none">

      {/* ── Barra de Menus Fixos Persistentes por Usuário ───────────────── */}
      <DbmPinnedNavBar className="rounded-none border-x-0 border-t-0 shrink-0" />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA SUPERIOR DE NAVEGAÇÃO & AÇÕES RÁPIDAS (UI MODERNA + EXCEL)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto">
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

        {/* Botões Rápidos de Configurações, Exportação, Importação, Sincronização Horus SQL + Novo Livro */}
        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={() => setShowColumnOrderModal(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Configurar quais colunas exibir no grid, alterar a ordem das colunas e preferências padrão"
          >
            <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
            Configurações
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Exportar planilha Excel (Modelo 1: Catálogo & Links | Modelo 2: Tiragens Gerais)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            Exportar Excel
          </button>

          <button
            type="button"
            onClick={() => {
              setExcelImportError(null);
              setExcelImportResult(null);
              setShowExcelImportModal(true);
            }}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Importar planilha Excel de 2 abas (Planilha1: Itens + TIRAGENS) cruzando por ISBN e Cód. Produto"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            Importar Excel (Itens + Tiragens)
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
                  Situação do Item
                </label>
                <select
                  value={filterSituation}
                  onChange={(e) => setFilterSituation(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="ALL">Todas as Situações</option>
                  <option value="EM_DISTRIBUICAO">Em Distribuição</option>
                  <option value="LANCAMENTO">Lançamento</option>
                  <option value="ESGOTADO">Esgotado</option>
                  <option value="FORA_DE_CATALOGO">Fora de Catálogo</option>
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

                {(filterTitle || filterIsbn || filterCollection || filterPublisher || filterSituation !== 'ALL') && (
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

            {/* Sub-barra de Controle Estilo Excel (Salva por Usuário no Login) */}
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={hideEbooks}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHideEbooks(val);
                      if (typeof window !== 'undefined') {
                        const u = getUser();
                        const userKey = `cronuz_dbm_hide_ebooks_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
                        localStorage.setItem(userKey, String(val));
                        localStorage.setItem('cronuz_dbm_hide_ebooks', String(val));
                      }
                    }}
                    className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                  />
                  Não mostrar E-books
                </label>

                <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={hideOutOfStock}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setHideOutOfStock(val);
                      if (typeof window !== 'undefined') {
                        const u = getUser();
                        const userKey = `cronuz_dbm_hide_out_of_stock_${u?.company_id || 'default'}_${u?.id || u?.email || 'user'}`;
                        localStorage.setItem(userKey, String(val));
                        localStorage.setItem('cronuz_dbm_hide_out_of_stock', String(val));
                      }
                    }}
                    className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
                  />
                  Não mostrar Esgotados / Sem Saldo
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

                <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

                {/* Configurador de Dias Vendas Geral (sincronizado com VDS(XM)) */}
                <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-[11px]">
                  <span className="text-slate-500 font-semibold">Vds Geral:</span>
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={generalSalesDays}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 90);
                      setGeneralSalesDays(val);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('cronuz_dbm_general_sales_days', String(val));
                      }
                    }}
                    onBlur={() => batchEnrichCatalogMetrics(companyId, generalSalesDays)}
                    className="w-12 text-center font-mono font-bold text-indigo-700 bg-white dark:bg-slate-900 border border-slate-300 rounded px-1 py-0.2"
                    title="Dias configurados para a coluna de Vendas Gerais VDS(XM)"
                  />
                  <span className="text-slate-400">d ({formatProductDaysToMonths(generalSalesDays)})</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Arraste os cabeçalhos para mover colunas • Use{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">↑</kbd>{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">↓</kbd> e{' '}
                  <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded font-mono text-[10px]">Enter</kbd>
                </span>
              </div>
            </div>
          </div>

          {/* Grade Principal Estilo Planilha Excel Moderna */}
          <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white dark:bg-slate-900 relative">
            <table className="w-full border-collapse text-left table-fixed min-w-[1260px]">
              <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-slate-300 dark:border-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider select-none">
                <tr>
                  <th className="w-9 py-2 px-1.5 border-r border-slate-200 dark:border-slate-700 text-center">#</th>
                  {activeVisibleColumns.map((colKey) => {
                    const widthClass =
                      colKey === 'cod_horus'
                        ? 'w-20'
                        : colKey === 'isbn'
                        ? 'w-32'
                        : colKey === 'additional_isbns'
                        ? 'w-32'
                        : colKey === 'name'
                        ? 'w-[24%]'
                        : colKey === 'brand'
                        ? 'w-28'
                        : colKey === 'subject'
                        ? 'w-28'
                        : colKey === 'launch_date'
                        ? 'w-36 text-center'
                        : colKey === 'base_price'
                        ? 'w-24 text-right'
                        : colKey === 'stock_quantity'
                        ? 'w-20 text-right'
                        : colKey === 'consignment_stock'
                        ? 'w-24 text-right'
                        : colKey === 'sales_365'
                        ? 'w-20 text-right'
                        : colKey === 'sales_90'
                        ? 'w-20 text-right'
                        : 'w-16 text-center';

                    const alignClass =
                      colKey === 'base_price' ||
                      colKey === 'stock_quantity' ||
                      colKey === 'consignment_stock' ||
                      colKey === 'sales_365' ||
                      colKey === 'sales_90'
                        ? 'justify-end'
                        : colKey === 'launch_date' || colKey === 'units_per_box'
                        ? 'justify-center'
                        : 'justify-between';

                    return (
                      <th
                        key={colKey}
                        draggable
                        onDragStart={() => setDragColKey(colKey)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropColumnHeader(colKey)}
                        onClick={() => handleSortProductColumn(colKey)}
                        title={`Clique para ordenar todo o catálogo por ${getColumnLabel(colKey)} • Arraste para mover a coluna`}
                        className={`group ${widthClass} py-2 px-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition-colors ${
                          dragColKey === colKey ? 'opacity-50 bg-indigo-100' : ''
                        }`}
                      >
                        <div className={`flex items-center ${alignClass} gap-1`}>
                          <span className="truncate">{getColumnLabel(colKey)}</span>
                          {renderProductSortIcon(colKey)}
                        </div>
                      </th>
                    );
                  })}
                  <th className="w-24 py-2 px-2 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 text-[13px] font-bold">
                {loading ? (
                  <tr>
                    <td colSpan={activeVisibleColumns.length + 2} className="py-16 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                      Carregando planilha de produtos DBM...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={activeVisibleColumns.length + 2} className="py-16 text-center text-slate-500">
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
                  paginatedProducts.map((item, localIdx) => {
                    const idx = pageStartIdx + localIdx;
                    const isSelected = idx === selectedIndex;
                    const isZeroOrOut = item.is_out_of_print || item.stock_quantity <= 0;
                    const sitInfo = evaluateProductSituation(item);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedIndex(idx)}
                        onDoubleClick={() => {
                          if (!excelInlineEditMode) {
                            handleOpenProductInAccessForm(item, idx);
                          }
                        }}
                        className={`transition-colors font-bold ${
                          isSelected
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/50 text-slate-900 dark:text-white ring-1 ring-inset ring-indigo-300 dark:ring-indigo-700'
                            : isZeroOrOut
                            ? 'bg-rose-50/35 dark:bg-rose-950/10 text-slate-800 dark:text-slate-200 hover:bg-slate-100/70'
                            : idx % 2 === 0
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-50'
                            : 'bg-slate-50/50 dark:bg-slate-900/40 text-slate-900 dark:text-slate-100 hover:bg-slate-100/60'
                        } cursor-pointer`}
                      >
                        <td
                          className={`py-1.5 px-1.5 border-r border-slate-200/80 dark:border-slate-800 text-center font-mono text-xs font-bold ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-500'
                          }`}
                        >
                          {isSelected ? '▶' : idx + 1}
                        </td>

                        {activeVisibleColumns.map((colKey) => {
                          if (colKey === 'cod_horus') {
                            return (
                              <td
                                key={colKey}
                                className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate"
                              >
                                {item.horus_cod_item || item.sku}
                              </td>
                            );
                          }
                          if (colKey === 'isbn') {
                            return (
                              <td
                                key={colKey}
                                className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate"
                              >
                                {item.ean_gtin || item.isbn || '-'}
                              </td>
                            );
                          }
                          if (colKey === 'additional_isbns') {
                            return (
                              <td
                                key={colKey}
                                className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate"
                              >
                                {item.additional_isbns || '-'}
                              </td>
                            );
                          }
                          if (colKey === 'name') {
                            return (
                              <td
                                key={colKey}
                                className="py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 truncate"
                                title={item.name}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="truncate font-bold text-[13px] text-slate-900 dark:text-white">
                                    {item.name}
                                  </span>
                                  {item.is_ebook && (
                                    <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded shrink-0">
                                      E-book
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          }
                          if (colKey === 'brand') {
                            return (
                              <td
                                key={colKey}
                                className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 truncate text-xs font-bold text-slate-700 dark:text-slate-300"
                              >
                                {item.brand || '-'}
                              </td>
                            );
                          }
                          if (colKey === 'subject') {
                            return (
                              <td
                                key={colKey}
                                className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 truncate text-xs font-bold text-slate-700 dark:text-slate-300"
                              >
                                {item.subject || item.category_name || '-'}
                              </td>
                            );
                          }
                          if (colKey === 'launch_date') {
                            return (
                              <td
                                key={colKey}
                                className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center"
                              >
                                {excelInlineEditMode ? (
                                  <div className="flex flex-col gap-0.5">
                                    <select
                                      value={sitInfo.label}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        handleInlineGridChange(item.id, 'horus_situacao_item', val);
                                        handleInlineGridChange(
                                          item.id,
                                          'is_out_of_print',
                                          val === 'Esgotado' || val === 'Fora de Catálogo'
                                        );
                                      }}
                                      className="w-full px-1 py-0.5 text-[11px] font-bold bg-white border border-slate-300 rounded"
                                    >
                                      <option value="Em Distribuição">Em Distribuição</option>
                                      <option value="Lançamento">Lançamento</option>
                                      <option value="Esgotado">Esgotado</option>
                                      <option value="Fora de Catálogo">Fora de Catálogo</option>
                                    </select>
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
                                      className="w-full px-1 py-0.5 text-[11px] font-mono font-bold bg-white border border-slate-300 rounded"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center leading-tight">
                                    <span
                                      className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${sitInfo.badgeClass}`}
                                      title={sitInfo.detail}
                                    >
                                      {sitInfo.label}
                                    </span>
                                    {item.launch_date && (
                                      <span className="text-[10px] font-mono font-bold text-slate-500 mt-0.5">
                                        {String(item.launch_date).slice(0, 10).split('-').reverse().join('/')}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'base_price') {
                            return (
                              <td
                                key={colKey}
                                className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold text-slate-900 dark:text-white"
                              >
                                {excelInlineEditMode ? (
                                  <CurrencyInput
                                    value={item.base_price}
                                    onChangeValue={(val) => handleInlineGridChange(item.id, 'base_price', val)}
                                    prefixStr="R$ "
                                    className="w-full px-1.5 py-0.5 text-xs font-mono font-bold text-right bg-white border border-slate-300 rounded"
                                  />
                                ) : (
                                  item.base_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'stock_quantity') {
                            return (
                              <td
                                key={colKey}
                                className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-extrabold ${
                                  item.stock_quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'
                                }`}
                              >
                                {item.stock_quantity}
                              </td>
                            );
                          }
                          if (colKey === 'consignment_stock') {
                            const consigVal = Number(item.consignment_stock || 0);
                            return (
                              <td
                                key={colKey}
                                className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold ${
                                  consigVal > 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-400'
                                }`}
                              >
                                {consigVal.toLocaleString('pt-BR')}
                              </td>
                            );
                          }
                          if (colKey === 'sales_365') {
                            const s365Val = Number(item.sales_365 || 0);
                            return (
                              <td
                                key={colKey}
                                className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold ${
                                  s365Val > 0 ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'
                                }`}
                              >
                                {s365Val.toLocaleString('pt-BR')}
                              </td>
                            );
                          }
                          if (colKey === 'sales_90') {
                            const s90Val = Number(item.sales_90 || 0);
                            return (
                              <td
                                key={colKey}
                                className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold ${
                                  s90Val > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'
                                }`}
                              >
                                {s90Val.toLocaleString('pt-BR')}
                              </td>
                            );
                          }
                          return (
                            <td
                              key={colKey}
                              className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-300"
                            >
                              {excelInlineEditMode ? (
                                <input
                                  type="text"
                                  value={item.units_per_box ?? 0}
                                  onChange={(e) =>
                                    handleInlineGridChange(item.id, 'units_per_box', Number(e.target.value) || 0)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveInlineRow(item);
                                    }
                                  }}
                                  className="w-full px-1 py-0.5 text-xs font-mono font-bold text-center bg-white border border-slate-300 rounded"
                                />
                              ) : (
                                item.units_per_box || '-'
                              )}
                            </td>
                          );
                        })}

                        {/* Coluna Ação */}
                        <td className="py-1 px-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
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

                            <button
                              type="button"
                              disabled={deletingProductId === item.id}
                              onClick={(e) => handleDeleteProductFromList(item, e)}
                              title="Excluir item do cadastro DBM"
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de Rodapé Estilo Planilha Excel + Paginação Completa */}
          <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 shrink-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-500">Linha:</span>
              <button
                type="button"
                onClick={() => setSelectedIndex(0)}
                disabled={filteredProducts.length === 0 || selectedIndex <= 0}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Primeira linha (Home)"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndex(prev => Math.max(0, prev - 1))}
                disabled={filteredProducts.length === 0 || selectedIndex <= 0}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Linha anterior (↑)"
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
                title="Próxima linha (↓)"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndex(filteredProducts.length - 1)}
                disabled={filteredProducts.length === 0 || selectedIndex >= filteredProducts.length - 1}
                className="p-1 rounded hover:bg-slate-100 border border-slate-200 disabled:opacity-40 cursor-pointer"
                title="Última linha (End)"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

              {/* Controles de Paginação */}
              <div className="flex items-center gap-1">
                <span className="font-semibold text-slate-500">Página:</span>
                <button
                  type="button"
                  onClick={() => handleGoToPage(1)}
                  disabled={currentPage <= 1}
                  className="px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-[11px] font-semibold cursor-pointer"
                  title="Primeira página"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => handleGoToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-[11px] font-semibold cursor-pointer"
                >
                  Anterior
                </button>
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-mono text-[11px] font-bold">
                  Pág. {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handleGoToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-[11px] font-semibold cursor-pointer"
                >
                  Próxima
                </button>
                <button
                  type="button"
                  onClick={() => handleGoToPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 text-[11px] font-semibold cursor-pointer"
                  title="Última página"
                >
                  »
                </button>

                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 50)}
                  className="ml-1 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Itens exibidos por página"
                >
                  <option value={25}>25 / pág.</option>
                  <option value={50}>50 / pág.</option>
                  <option value={100}>100 / pág.</option>
                  <option value={250}>250 / pág.</option>
                  <option value={500}>500 / pág.</option>
                </select>
              </div>

              <div className="ml-1 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5">
                <Search className="w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  value={quickSearchFooter}
                  onChange={(e) => setQuickSearchFooter(e.target.value)}
                  placeholder="Filtro instantâneo na grade..."
                  className="text-[11px] bg-transparent w-40 focus:outline-none text-slate-800"
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
                    {coverCandidates.length > 0 && coverCandidateStep < coverCandidates.length ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverCandidates[coverCandidateStep]}
                        alt={bookForm.name}
                        className="w-full h-full object-contain"
                        onError={() => {
                          setCoverCandidateStep(prev => prev + 1);
                        }}
                      />
                    ) : (
                      <div className="text-center p-3 text-slate-400">
                        <BookOpen className="w-8 h-8 mx-auto mb-1 stroke-1" />
                        <span className="text-[10px] font-medium block leading-tight">Sem Capa</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumo Rápido de Estoque Disponível, Saldo Consignado e Estoque Total no Horus */}
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
                    <span className="font-mono font-semibold text-amber-700">{bookForm.consignment_stock} un.</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 bg-indigo-50/50 -mx-1.5 px-1.5 py-1 rounded">
                    <span className="text-indigo-900 font-bold text-[11px]">Estoque Total:</span>
                    <span className="font-mono font-bold text-indigo-700">
                      {(Number(bookForm.stock_quantity || 0) + Number(bookForm.consignment_stock || 0))} un.
                    </span>
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

                {/* Linha 5: Data de Lançamento | Acabamento | Edição | Páginas | Unid/Caixa */}
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5">
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Data de Lançamento
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
                      <option value="Capa Dura">Capa Dura</option>
                      <option value="Cartonado">Cartonado</option>
                      <option value="E-book">E-book</option>
                      <option value="Espiral">Espiral</option>
                      <option value="Grampeado">Grampeado</option>
                      <option value="Flexível">Flexível</option>
                      <option value="Box / Kit">Box / Kit</option>
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
                    <option value="Royalties">Royalties</option>
                    <option value="Coedição">Coedição</option>
                    <option value="Com Royalties">Com Royalties</option>
                    <option value="Royalties % Capa">Royalties % Capa</option>
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
                      onChange={(e) => handleContractSignedDateChange(e.target.value)}
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
                      onChange={(e) => setBookForm(prev => ({ ...prev, contract_validity_years: e.target.value.replace(/\D/g, '') }))}
                      placeholder="Ex: 5"
                      className="w-full px-2 py-1.5 text-[11px] font-mono text-center bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">
                      Vencimento
                    </label>
                    <input
                      type="text"
                      value={bookForm.contract_expires_date}
                      onChange={(e) => setBookForm(prev => ({ ...prev, contract_expires_date: e.target.value }))}
                      placeholder="dd/mm/aaaa"
                      className="w-full px-2 py-1.5 text-[11px] font-mono font-bold bg-indigo-50/40 border border-indigo-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                {/* Controle de Situação do Item e E-book */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Situação do Item
                    </label>
                    <select
                      value={bookForm.horus_situacao_item || 'Em Distribuição'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBookForm(prev => ({
                          ...prev,
                          horus_situacao_item: val,
                          is_out_of_print: val === 'Esgotado' || val === 'Fora de Catálogo',
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-bold bg-slate-50/70 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Em Distribuição">Em Distribuição</option>
                      <option value="Lançamento">Lançamento</option>
                      <option value="Esgotado">Esgotado</option>
                      <option value="Fora de Catálogo">Fora de Catálogo</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                      <input
                        type="checkbox"
                        checked={bookForm.is_ebook}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBookForm(prev => ({
                            ...prev,
                            is_ebook: checked,
                            binding_finish: checked ? 'E-book' : prev.binding_finish === 'E-book' ? 'Brochura' : prev.binding_finish
                          }));
                        }}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300"
                      />
                      É E-book / Livro Digital
                    </label>
                    {bookForm.is_ebook && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-full">
                        Digital
                      </span>
                    )}
                  </div>

                  {(bookForm.is_out_of_print ||
                    bookForm.horus_situacao_item === 'Esgotado' ||
                    bookForm.horus_situacao_item === 'Fora de Catálogo') && (
                    <div>
                      <label className="block text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-1">
                        Data de Esgotamento / Saída
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
                <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Planilha de Tiragens & Custos de Produção
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      ({bookForm.tiragens.length} tiragem(ns) • Total: {totalTiragemExemplares.toLocaleString('pt-BR')} ex.)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleExportSingleBookTiragensExcel}
                      className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] rounded-md border border-indigo-200 cursor-pointer transition inline-flex items-center gap-1"
                      title="Exportar para Excel as tiragens deste livro (com ISBN, Título e dados de produção)"
                    >
                      <Download className="w-3 h-3 text-indigo-600" />
                      Exportar Tiragens (Excel)
                    </button>
                    <button
                      type="button"
                      onClick={handleAddTiragemRow}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-md border border-emerald-200 cursor-pointer transition"
                    >
                      + Nova Linha (Excel)
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto max-h-[240px]">
                  <table className="w-full border-collapse text-xs font-mono font-bold min-w-[820px]">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 font-sans font-extrabold text-[11px] uppercase">
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

      {/* MODAL DE IMPORTAÇÃO DE PLANILHA EXCEL (2 ABAS: ITENS + TIRAGENS) */}
      <AnimatePresence>
        {showExcelImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 select-text">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold">
                      Importar Planilha Excel (Itens + Tiragens) → Cadastro DBM
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Atualiza dados editoriais, link do site, contrato autoral e todas as tiragens cruzando pelo ISBN e Cod_Prod.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExcelImportModal(false)}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUploadExcelLancamentos} className="p-5 space-y-4 text-xs text-slate-700">
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5 text-indigo-950">
                  <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                    <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                    Como funciona o cruzamento automático (2 Abas):
                  </div>
                  <p className="text-[11px] leading-relaxed text-indigo-900/90">
                    • <strong>Aba 1 (Planilha1 / Itens):</strong> Cruza cada livro pelo <code>ISBN</code> (ou <code>CodProdHorus</code>) e preenche Data de Lançamento, Páginas, Edição, Assunto, Sinopse, Dimensões (Largura × Altura), Peso (gramas), Acabamento, Unidades/Caixa, Link da Obra (<code>LinkGGbrasil</code>), Contrato Autoral (Assinatura, Anos de Validade e Vencimento automático) e % Royalties E-book.
                  </p>
                  <p className="text-[11px] leading-relaxed text-indigo-900/90">
                    • <strong>Aba 2 (TIRAGENS):</strong> Cruza pelo <code>Cod_Prod == cod_prod</code> e preenche todas as linhas na <strong>Planilha de Tiragens &amp; Custos de Produção</strong> de cada livro (inclusive quando houver mais de uma tiragem para o mesmo título).
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Selecione a Planilha Excel (.XLSX — máx. 10 MB)
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm"
                    onChange={handleExcelFileChange}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                  />
                  {excelImportFile && (
                    <p className="mt-1.5 text-[11px] text-emerald-700 font-semibold">
                      Arquivo selecionado: {excelImportFile.name} ({(excelImportFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 w-full">
                  <input
                    type="checkbox"
                    checked={excelCreateMissing}
                    onChange={(e) => setExcelCreateMissing(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 w-4 h-4"
                  />
                  <span>Criar automaticamente no DBM os livros da planilha que ainda não estiverem cadastrados</span>
                </label>

                {excelImportError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 font-semibold">
                    {excelImportError}
                  </div>
                )}

                {excelImportResult && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 space-y-1.5">
                    <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      {excelImportResult.message}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                      <div className="bg-white/80 p-2 rounded border border-emerald-200">
                        <span className="text-slate-500 block text-[10px]">Atualizados</span>
                        <strong className="text-emerald-800 text-sm">{excelImportResult.updated_products_count}</strong>
                      </div>
                      <div className="bg-white/80 p-2 rounded border border-emerald-200">
                        <span className="text-slate-500 block text-[10px]">Criados</span>
                        <strong className="text-indigo-800 text-sm">{excelImportResult.created_products_count}</strong>
                      </div>
                      <div className="bg-white/80 p-2 rounded border border-emerald-200">
                        <span className="text-slate-500 block text-[10px]">Obras c/ Tiragens</span>
                        <strong className="text-emerald-800 text-sm">{excelImportResult.matched_tiragens_books}</strong>
                      </div>
                      <div className="bg-white/80 p-2 rounded border border-emerald-200">
                        <span className="text-slate-500 block text-[10px]">Total Tiragens</span>
                        <strong className="text-emerald-800 text-sm">{excelImportResult.matched_tiragens_rows}</strong>
                      </div>
                    </div>
                    {excelImportResult.not_found_count > 0 && (
                      <p className="text-[11px] text-amber-800 pt-1">
                        • {excelImportResult.not_found_count} linha(s) da planilha não encontraram ISBN/Cód. Horus correspondente no banco (marque a opção acima se quiser cadastrá-las).
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowExcelImportModal(false)}
                    className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-200 cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={importingExcel || !excelImportFile}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {importingExcel ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Importando Planilha...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        Processar e Atualizar Dados
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE EXPORTAÇÃO DE PLANILHAS EXCEL (MODELO 1 E TIRAGENS GERAIS) */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden text-xs text-slate-700 dark:text-slate-200"
            >
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold">Exportar Planilha Excel — Produtos DBM</h3>
                    <p className="text-[11px] text-slate-300">
                      Selecione o modelo de planilha que deseja gerar
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Escolha o Modelo de Exportação
                  </label>

                  {/* Modelo 1 */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      exportModel === 'MODEL_1_CATALOG'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400 ring-1 ring-emerald-400'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportModel"
                      checked={exportModel === 'MODEL_1_CATALOG'}
                      onChange={() => setExportModel('MODEL_1_CATALOG')}
                      className="mt-0.5 text-emerald-600"
                    />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        Modelo 1 — Catálogo, Datas de Lançamento & Link da Internet
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Colunas: <b>ISBN</b>, <b>Título</b>, <b>Data de Lançamento</b>, <b>Ano</b>, <b>Mês</b> e{' '}
                        <b>Link do Item na Internet</b>.
                      </p>
                    </div>
                  </label>

                  {/* Modelo 2: Tiragens Gerais */}
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      exportModel === 'MODEL_2_TIRAGENS'
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-400 ring-1 ring-indigo-400'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportModel"
                      checked={exportModel === 'MODEL_2_TIRAGENS'}
                      onChange={() => setExportModel('MODEL_2_TIRAGENS')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        Modelo 2 — Tiragens Gerais (Todos os Itens)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Exporta todas as tiragens cadastradas com <b>ISBN</b>, <b>Título</b>, <b>Cód. Horus</b>,{' '}
                        <b>Nº Tiragem</b>, <b>Data Tiragem</b>, <b>Qtd. Exemplares</b> e custos de produção.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Escopo da exportação */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Quais itens exportar?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportScope('FILTERED')}
                      className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                        exportScope === 'FILTERED'
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Itens do filtro atual ({filteredProducts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportScope('ALL')}
                      className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                        exportScope === 'ALL'
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Catálogo completo ({products.length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExportProductsExcel}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Planilha Excel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIGURAÇÕES DO GRID DE PRODUTOS (EXIBIÇÃO + ORDEM DAS COLUNAS, SALVO POR USUÁRIO) */}
      <AnimatePresence>
        {showColumnOrderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden text-xs text-slate-700 dark:text-slate-200"
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Configurações da Grade de Produtos
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Marque o que deseja exibir no grid e ordene as colunas (salvo no seu usuário).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowColumnOrderModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Colunas Exibidas no Grid & Ordem de Exibição
                  </div>
                  {columnOrder.map((colKey, idx) => {
                    const isVis = visibleColumns[colKey] !== false;
                    return (
                      <div
                        key={colKey}
                        draggable
                        onDragStart={() => setDragColKey(colKey)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDropColumnHeader(colKey)}
                        className={`flex items-center justify-between gap-2 p-2 rounded-xl border transition-all ${
                          isVis
                            ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
                          <input
                            type="checkbox"
                            checked={isVis}
                            onChange={() => handleToggleVisibleColumn(colKey)}
                            className="w-4 h-4 rounded text-indigo-600 border-slate-300 cursor-pointer"
                          />
                          <span className="w-5 text-center font-mono text-[10px] text-slate-400">{idx + 1}.</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">{getColumnLabel(colKey)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveColumnInOrder(idx, -1)}
                            className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-30 cursor-pointer"
                            title="Mover para a esquerda / cima"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === columnOrder.length - 1}
                            onClick={() => handleMoveColumnInOrder(idx, 1)}
                            className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 disabled:opacity-30 cursor-pointer"
                            title="Mover para a direita / baixo"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    saveColumnOrder(DEFAULT_PRODUCT_COLUMNS);
                    saveVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar Padrão
                </button>
                <button
                  type="button"
                  onClick={() => setShowColumnOrderModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                >
                  Salvar e Fechar
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
                <p>• <strong>Modo Edição Direta (Excel):</strong> Permite editar Situação do Item, Data de Lançamento, Preço de Capa e Unid/Caixa direto na grade pressionando <code>Enter</code>.</p>
                <p>• <strong>F2 (na Ficha):</strong> Salva imediatamente as alterações do livro.</p>
                <p>• <strong>Alt + ← / → (na Ficha):</strong> Alterna para o livro anterior ou próximo sem sair da ficha.</p>
                <p>• <strong>Situação do Item:</strong> Classifica a obra em <strong>Em Distribuição</strong>, <strong>Lançamento</strong>, <strong>Esgotado</strong> ou <strong>Fora de Catálogo</strong>.</p>
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

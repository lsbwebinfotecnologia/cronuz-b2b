'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Barcode,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  DatabaseZap,
  Download,
  Eye,
  FileSpreadsheet,
  GripVertical,
  Info,
  Layers,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

interface ConfiguredBranch {
  id: number;
  nome: string;
  cnpj: string;
  cod_empresa: number;
  cod_filial: number;
  cod_local: number | null;
  locais: number[];
  label: string;
}

interface BranchBreakdown {
  branch_id: number;
  branch_name: string;
  cod_empresa: number;
  cod_filial: number;
  cod_local: number | null;
  locais: number[];
  stock_available: number;
  stock_physical: number;
  consigned_sent: number;
  consigned_received: number;
  cost_price: number;
  sales_365: number;
  sales_period: number;
  last_entry_date: string | null;
  last_entry_qty: number;
  last_entry_cost: number;
  last_entry_type: string | null;
  last_entry_cfop: string | null;
  last_entry_nf: string | null;
}

interface AnaliseItemRow {
  id: number;
  sku: string;
  name: string;
  isbn: string;
  ean_gtin?: string;
  additional_isbns?: string;
  brand?: string;
  subject?: string;
  base_price: number;
  cost_price: number;
  stock_quantity: number;
  consignment_stock: number;
  consigned_received: number;
  sales_365: number;
  sales_period: number;
  units_per_box?: number;
  launch_date?: string;
  horus_cod_item?: number;
  horus_situacao_item?: string;
  is_ebook?: boolean;
  is_out_of_print?: boolean;
  status?: string;
  last_entry_date?: string | null;
  last_entry_qty?: number;
  last_entry_cost?: number;
  last_entry_type?: string | null;
  last_entry_cfop?: string | null;
  last_entry_nf?: string | null;
  last_entry_branch?: string | null;
  branches_breakdown?: BranchBreakdown[];
}

interface HorusEstoqueItem {
  cod_item: string;
  isbn: string;
  nome_item: string;
  editora: string;
  assunto?: string;
  preco: number;
  estoque: number;
  qtd_caixa?: number;
  data_lancamento?: string | null;
  already_imported: boolean;
  existing_additional_isbns?: string;
}

type ColumnKey =
  | 'cod_horus'
  | 'isbn'
  | 'name'
  | 'brand'
  | 'subject'
  | 'situation'
  | 'base_price'
  | 'cost_price'
  | 'stock_quantity'
  | 'consignment_stock'
  | 'consigned_received'
  | 'sales_365'
  | 'sales_period'
  | 'replenishment_suggestion'
  | 'last_entry'
  | 'units_per_box';

const DEFAULT_COLUMNS: ColumnKey[] = [
  'cod_horus',
  'isbn',
  'name',
  'brand',
  'situation',
  'base_price',
  'cost_price',
  'stock_quantity',
  'consignment_stock',
  'consigned_received',
  'sales_365',
  'sales_period',
  'replenishment_suggestion',
  'last_entry',
  'units_per_box',
];

const DEFAULT_VISIBLE_COLS: Record<ColumnKey, boolean> = {
  cod_horus: true,
  isbn: true,
  name: true,
  brand: true,
  subject: false,
  situation: true,
  base_price: true,
  cost_price: true,
  stock_quantity: true,
  consignment_stock: true,
  consigned_received: true,
  sales_365: true,
  sales_period: true,
  replenishment_suggestion: true,
  last_entry: true,
  units_per_box: true,
};

function formatBrDate(iso?: string | null): string {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return s;
}

function evaluateSituation(item: AnaliseItemRow) {
  const rawSit = String(item.horus_situacao_item || '').trim().toUpperCase();
  if (rawSit.includes('FORA') || rawSit === 'FC') {
    return {
      key: 'FORA_DE_CATALOGO',
      label: 'Fora de Catálogo',
      badgeClass: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
  }
  if (Boolean(item.is_out_of_print) || rawSit.includes('ESGOT') || rawSit === 'FE' || rawSit === 'ES') {
    return {
      key: 'ESGOTADO',
      label: 'Esgotado',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    };
  }
  if (rawSit.includes('LANC') || rawSit.includes('LANÇ')) {
    return {
      key: 'LANCAMENTO',
      label: 'Lançamento',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    };
  }
  if (item.launch_date) {
    const dt = new Date(`${String(item.launch_date).slice(0, 10)}T12:00:00`);
    if (!isNaN(dt.getTime())) {
      const diffDays = Math.round((dt.getTime() - Date.now()) / 86400000);
      if (diffDays >= -270 && diffDays <= 180) {
        return {
          key: 'LANCAMENTO',
          label: 'Lançamento',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
        };
      }
    }
  }
  return {
    key: 'EM_DISTRIBUICAO',
    label: 'Em Distribuição',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
  };
}

export default function HorusAnaliseItensPage() {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  const [companyId, setCompanyId] = useState<number>(1);

  // Filiais configuradas em /logistics/branches
  const [branches, setBranches] = useState<ConfiguredBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');

  // Status de Sincronização Horus SQL <-> Cronuz + Background Worker
  const [syncStatus, setSyncStatus] = useState<{
    horus_total: number;
    synced_count: number;
    missing_count: number;
    percent_complete: number;
    sql_connected: boolean;
    sql_error: string | null;
    background_sync: {
      is_running: boolean;
      processed_in_run: number;
      created_in_run: number;
      updated_in_run: number;
      last_cod_item: number;
      status_message: string;
      last_error: string | null;
    };
  } | null>(null);
  const [startingBgSync, setStartingBgSync] = useState(false);

  // Filtros de Pesquisa e Período de Vendas
  const [filterTitle, setFilterTitle] = useState('');
  const [filterIsbn, setFilterIsbn] = useState('');
  const [filterPublisher, setFilterPublisher] = useState('');
  const [filterSituation, setFilterSituation] = useState<'ALL' | 'EM_DISTRIBUICAO' | 'LANCAMENTO' | 'ESGOTADO' | 'FORA_DE_CATALOGO'>('ALL');
  const [hideEbooks, setHideEbooks] = useState<boolean>(true);
  const [hideOutOfStock, setHideOutOfStock] = useState<boolean>(false);

  // Filtro de Período de Vendas (Dias ou Intervalo de Datas)
  const [salesFilterMode, setSalesFilterMode] = useState<'DAYS' | 'DATES'>('DAYS');
  const [salesDays, setSalesDays] = useState<number>(90);
  const [salesStartDate, setSalesStartDate] = useState<string>('');
  const [salesEndDate, setSalesEndDate] = useState<string>('');

  // Alerta Geral de Estoque (sincronizado com /settings)
  const [stockAlertThreshold, setStockAlertThreshold] = useState<number>(0);

  // Dados da Planilha e Paginação
  const [products, setProducts] = useState<AnaliseItemRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [enrichingPage, setEnrichingPage] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [quickSearchFooter, setQuickSearchFooter] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: ColumnKey; direction: 'asc' | 'desc' } | null>(null);

  // Colunas Visíveis e Ordem
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = getUser();
        const k = `cronuz_analise_itens_cols_${u?.company_id || 'def'}_${u?.id || 'u'}`;
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const missing = DEFAULT_COLUMNS.filter((c) => !parsed.includes(c));
            return [...parsed, ...missing];
          }
        }
      } catch {}
    }
    return DEFAULT_COLUMNS;
  });
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const u = getUser();
        const k = `cronuz_analise_itens_vis_${u?.company_id || 'def'}_${u?.id || 'u'}`;
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return { ...DEFAULT_VISIBLE_COLS, ...parsed };
        }
      } catch {}
    }
    return DEFAULT_VISIBLE_COLS;
  });
  const [dragColKey, setDragColKey] = useState<ColumnKey | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Modal de Raio-X por Filial (Detalhamento Multi-Filial do Item)
  const [detailModalItem, setDetailModalItem] = useState<AnaliseItemRow | null>(null);

  // Modal de Exportação Excel Multi-Filial
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportModel, setExportModel] = useState<'MULTIBRANCH_REPLENISHMENT' | 'CONSOLIDATED'>('MULTIBRANCH_REPLENISHMENT');
  const [exportBranchScope, setExportBranchScope] = useState<string>('CURRENT');
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  // Modal de Sincronização Manual Segura em Lotes (Chunked Sync)
  const [showHorusSyncModal, setShowHorusSyncModal] = useState(false);
  const [horusSearchTerm, setHorusSearchTerm] = useState('');
  const [horusEditoraFilter, setHorusEditoraFilter] = useState('');
  const [horusItems, setHorusItems] = useState<HorusEstoqueItem[]>([]);
  const [horusStats, setHorusStats] = useState({ totalAll: 0, totalImported: 0, totalNotImported: 0 });
  const [horusLimit, setHorusLimit] = useState(500);
  const [horusFilterMode, setHorusFilterMode] = useState<'ALL' | 'ONLY_NEW' | 'ONLY_IMPORTED'>('ONLY_NEW');
  const [horusOnlyWithStock, setHorusOnlyWithStock] = useState(false);
  const [loadingHorusItems, setLoadingHorusItems] = useState(false);
  const [selectedHorusCodes, setSelectedHorusCodes] = useState<Record<string, boolean>>({});
  const [importingHorus, setImportingHorus] = useState(false);
  const [importProgressText, setImportProgressText] = useState<string>('');
  const [horusSyncMessage, setHorusSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = getUser();
    const cid = user?.company_id || 1;
    setCompanyId(cid);
    loadInitialContext(cid);
  }, []);

  const loadInitialContext = async (cid: number) => {
    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    // 1. Configurações Gerais do Seller (Alerta de Estoque)
    fetch(`${apiUrl}/companies/${cid}/settings`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.stock_alert_threshold !== undefined) {
          setStockAlertThreshold(Math.max(0, Number(d.stock_alert_threshold) || 0));
        }
      })
      .catch(() => {});

    // 2. Filiais do Seller (/logistics/branches)
    fetch(`${apiUrl}/horus-analise-itens/branches?company_id=${cid}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.branches)) {
          setBranches(d.branches);
        }
      })
      .catch(() => {});

    // 3. Status de Sincronização (Total Horus vs Cronuz vs Faltando)
    fetchSyncStatus(cid);

    // 4. Lista inicial de produtos
    fetchProducts(cid);
  };

  const fetchSyncStatus = async (cidOverride?: number, force = false) => {
    const cid = cidOverride || companyId;
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/horus-analise-itens/sync-status?company_id=${cid}&force_count=${force}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch {}
  };

  // Polling automático enquanto o Background Sync estiver rodando
  useEffect(() => {
    if (!syncStatus?.background_sync?.is_running) return;
    const timer = setInterval(() => {
      fetchSyncStatus(companyId, false);
    }, 2800);
    return () => clearInterval(timer);
  }, [syncStatus?.background_sync?.is_running, companyId]);

  const handleStartBackgroundSync = async (onlyWithStock = false) => {
    setStartingBgSync(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-analise-itens/background-sync/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_id: companyId,
          only_with_stock: onlyWithStock,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Não foi possível iniciar a sincronização em segundo plano.');
        return;
      }
      toast.success(data.message || 'Sincronização em segundo plano iniciada!');
      await fetchSyncStatus(companyId, false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao iniciar sincronização em segundo plano.');
    } finally {
      setStartingBgSync(false);
    }
  };

  const handleStopBackgroundSync = async () => {
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/horus-analise-itens/background-sync/stop?company_id=${companyId}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      toast.info(data.message || 'Pausa solicitada ao worker.');
      await fetchSyncStatus(companyId, false);
    } catch {}
  };

  const fetchProducts = async (overrideCid?: number) => {
    setLoading(true);
    const cid = overrideCid || companyId;
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('limit', '5000');
      params.append('source', 'dbm');
      params.append('company_id', String(cid));

      const combined = [filterTitle, filterIsbn].filter(Boolean).join(' ').trim();
      if (combined) params.append('search', combined);

      const res = await fetch(`${apiUrl}/products/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : data.items || [];
        const mapped: AnaliseItemRow[] = rawList.map((p: any) => ({
          id: p.id,
          sku: p.sku || String(p.id),
          name: p.name || 'Sem Título',
          isbn: p.ean_gtin || p.isbn || p.sku || '',
          ean_gtin: p.ean_gtin || p.isbn || '',
          additional_isbns: p.additional_isbns || '',
          brand: p.brand?.name || p.brand || 'Editora',
          subject: p.subject || p.category?.name || p.category_name || 'Geral',
          base_price: Number(p.base_price || p.price || 0),
          cost_price: Number(p.cost_price || 0),
          stock_quantity: Number(p.stock_quantity || 0),
          consignment_stock: Number(p.consignment_stock || 0),
          consigned_received: 0,
          sales_365: Number(p.sales_365 || 0),
          sales_period: Number(p.sales_90 || 0),
          units_per_box: Number(p.units_per_box || 0),
          launch_date: p.launch_date,
          horus_cod_item: p.horus_cod_item,
          horus_situacao_item: p.horus_situacao_item,
          is_ebook:
            Boolean(p.is_ebook) ||
            String(p.binding_finish || '').toLowerCase() === 'e-book' ||
            String(p.name || '').toUpperCase().includes('E-BOOK'),
          is_out_of_print: Boolean(p.is_out_of_print) || p.status === 'INACTIVE',
          status: p.status,
        }));
        setProducts(mapped);
        setCurrentPage(1);
        setSelectedIndex(mapped.length > 0 ? 0 : -1);
      }
    } catch (e) {
      console.error('Erro ao carregar produtos em Análise de Itens:', e);
    } finally {
      setLoading(false);
    }
  };

  // Filtragem e Ordenação local instantânea
  const filteredProducts = useMemo(() => {
    const base = products.filter((item) => {
      if (hideEbooks && item.is_ebook) return false;
      if (hideOutOfStock && (item.is_out_of_print || item.stock_quantity <= 0)) return false;

      if (filterTitle.trim()) {
        const q = filterTitle.toLowerCase();
        const matchT =
          item.name?.toLowerCase().includes(q) ||
          item.subject?.toLowerCase().includes(q);
        if (!matchT) return false;
      }

      if (filterIsbn.trim()) {
        const qClean = filterIsbn.trim().replace(/[\s-]/g, '').toLowerCase();
        const m1 = (item.ean_gtin || item.isbn || '').replace(/[\s-]/g, '').toLowerCase().includes(qClean);
        const m2 = (item.additional_isbns || '').replace(/[\s-]/g, '').toLowerCase().includes(qClean);
        const m3 = String(item.horus_cod_item || item.sku || '').toLowerCase().includes(qClean);
        if (!m1 && !m2 && !m3) return false;
      }

      if (filterPublisher.trim()) {
        const qPub = filterPublisher.toLowerCase();
        if (!item.brand?.toLowerCase().includes(qPub)) return false;
      }

      if (filterSituation !== 'ALL') {
        const sit = evaluateSituation(item);
        if (sit.key !== filterSituation) return false;
      }

      if (quickSearchFooter.trim()) {
        const qf = quickSearchFooter.toLowerCase();
        const m =
          item.name?.toLowerCase().includes(qf) ||
          item.isbn?.toLowerCase().includes(qf) ||
          String(item.horus_cod_item || '').includes(qf) ||
          item.brand?.toLowerCase().includes(qf);
        if (!m) return false;
      }

      return true;
    });

    if (!sortConfig) return base;
    const { key, direction } = sortConfig;
    const mult = direction === 'asc' ? 1 : -1;

    return [...base].sort((a, b) => {
      if (key === 'name' || key === 'brand' || key === 'subject' || key === 'isbn' || key === 'situation') {
        const sA = key === 'situation' ? evaluateSituation(a).label : String((a as any)[key] || '');
        const sB = key === 'situation' ? evaluateSituation(b).label : String((b as any)[key] || '');
        return sA.localeCompare(sB, 'pt-BR', { numeric: true }) * mult;
      }
      if (key === 'last_entry') {
        const dA = a.last_entry_date || '';
        const dB = b.last_entry_date || '';
        return dA.localeCompare(dB) * mult;
      }
      const getNum = (it: AnaliseItemRow): number => {
        switch (key) {
          case 'cod_horus':
            return Number(it.horus_cod_item || 0);
          case 'base_price':
            return Number(it.base_price || 0);
          case 'cost_price':
            return Number(it.cost_price || 0);
          case 'stock_quantity':
            return Number(it.stock_quantity || 0);
          case 'consignment_stock':
            return Number(it.consignment_stock || 0);
          case 'consigned_received':
            return Number(it.consigned_received || 0);
          case 'sales_365':
            return Number(it.sales_365 || 0);
          case 'sales_period':
            return Number(it.sales_period || 0);
          case 'replenishment_suggestion':
            return Math.max(0, Number(it.sales_period || 0) - Math.max(0, Number(it.stock_quantity || 0)));
          case 'units_per_box':
            return Number(it.units_per_box || 0);
          default:
            return 0;
        }
      };
      return (getNum(a) - getNum(b)) * mult;
    });
  }, [
    products,
    hideEbooks,
    hideOutOfStock,
    filterTitle,
    filterIsbn,
    filterPublisher,
    filterSituation,
    quickSearchFooter,
    sortConfig,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIdx = (safeCurrentPage - 1) * pageSize;
  const paginatedProducts = useMemo(() => {
    return filteredProducts.slice(pageStartIdx, pageStartIdx + pageSize);
  }, [filteredProducts, pageStartIdx, pageSize]);

  // Enriquecimento em tempo real dos itens visíveis na página atual (Multi-Filial: Saldos, Custos, Consignado Env/Rec, Vendas & Última Entrada)
  const enrichCurrentPageItems = async (itemsToEnrich: AnaliseItemRow[]) => {
    if (!itemsToEnrich.length || !companyId) return;
    const pIds = itemsToEnrich.map((i) => i.id).filter(Boolean);
    if (!pIds.length) return;

    setEnrichingPage(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-analise-itens/enrich-page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: selectedBranchId,
          product_ids: pIds,
          sales_days: salesDays,
          sales_start_date: salesFilterMode === 'DATES' && salesStartDate ? salesStartDate : null,
          sales_end_date: salesFilterMode === 'DATES' && salesEndDate ? salesEndDate : null,
        }),
      });
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
              horus_cod_item: m.horus_cod_item ?? item.horus_cod_item,
              stock_quantity: Number(m.stock_quantity ?? item.stock_quantity ?? 0),
              consignment_stock: Number(m.consignment_stock ?? item.consignment_stock ?? 0),
              consigned_received: Number(m.consigned_received ?? item.consigned_received ?? 0),
              cost_price: Number(m.cost_price ?? item.cost_price ?? 0),
              sales_365: Number(m.sales_365 ?? item.sales_365 ?? 0),
              sales_period: Number(m.sales_period ?? item.sales_period ?? 0),
              last_entry_date: m.last_entry_date ?? item.last_entry_date,
              last_entry_qty: Number(m.last_entry_qty ?? item.last_entry_qty ?? 0),
              last_entry_cost: Number(m.last_entry_cost ?? item.last_entry_cost ?? 0),
              last_entry_type: m.last_entry_type ?? item.last_entry_type,
              last_entry_cfop: m.last_entry_cfop ?? item.last_entry_cfop,
              last_entry_nf: m.last_entry_nf ?? item.last_entry_nf,
              last_entry_branch: m.last_entry_branch ?? item.last_entry_branch,
              branches_breakdown: m.branches_breakdown ?? item.branches_breakdown,
            };
          })
        );
      }
    } catch {
      // silencioso
    } finally {
      setEnrichingPage(false);
    }
  };

  // Dispara enriquecimento da página sempre que mudar de página, de filial ou de período de vendas
  useEffect(() => {
    if (paginatedProducts.length > 0) {
      enrichCurrentPageItems(paginatedProducts);
    }
  }, [
    safeCurrentPage,
    pageSize,
    selectedBranchId,
    salesFilterMode,
    salesDays,
    salesStartDate,
    salesEndDate,
    products.length,
  ]);

  const activeVisibleColumns = useMemo(
    () => columnOrder.filter((colKey) => visibleColumns[colKey] !== false),
    [columnOrder, visibleColumns]
  );

  const periodBadgeLabel = useMemo(() => {
    if (salesFilterMode === 'DATES' && salesStartDate) {
      return `${formatBrDate(salesStartDate)} a ${salesEndDate ? formatBrDate(salesEndDate) : 'Hoje'}`;
    }
    return `${salesDays}d`;
  }, [salesFilterMode, salesDays, salesStartDate, salesEndDate]);

  const getColumnLabel = (colKey: ColumnKey): string => {
    switch (colKey) {
      case 'cod_horus':
        return 'Cód Horus';
      case 'isbn':
        return 'ISBN';
      case 'name':
        return 'Título da Obra';
      case 'brand':
        return 'Editora';
      case 'subject':
        return 'Assunto';
      case 'situation':
        return 'Situação do Item';
      case 'base_price':
        return 'Preço Capa';
      case 'cost_price':
        return 'Custo Filial';
      case 'stock_quantity':
        return 'Saldo Disp.';
      case 'consignment_stock':
        return 'Consig. Env.';
      case 'consigned_received':
        return 'Consig. Rec.';
      case 'sales_365':
        return 'VDS 365d';
      case 'sales_period':
        return `VDS (${periodBadgeLabel})`;
      case 'replenishment_suggestion':
        return 'Sug. Reposição';
      case 'last_entry':
        return 'Últ. Entrada (Compra/Consig)';
      case 'units_per_box':
        return 'Un/Cx';
    }
  };

  const handleSortColumn = (colKey: ColumnKey) => {
    const isText = colKey === 'name' || colKey === 'brand' || colKey === 'subject' || colKey === 'isbn' || colKey === 'situation';
    setSortConfig((prev) => {
      if (!prev || prev.key !== colKey) {
        return { key: colKey, direction: isText ? 'asc' : 'desc' };
      }
      if (prev.direction === (isText ? 'asc' : 'desc')) {
        return { key: colKey, direction: isText ? 'desc' : 'asc' };
      }
      return null;
    });
  };

  const renderSortIcon = (colKey: ColumnKey) => {
    if (!sortConfig || sortConfig.key !== colKey) {
      return <ArrowUpDown className="w-3 h-3 opacity-35 group-hover:opacity-80 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-emerald-600 shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-emerald-600 shrink-0" />
    );
  };

  const saveColumnOrder = (newOrder: ColumnKey[]) => {
    setColumnOrder(newOrder);
    if (typeof window !== 'undefined') {
      const u = getUser();
      const k = `cronuz_analise_itens_cols_${u?.company_id || 'def'}_${u?.id || 'u'}`;
      localStorage.setItem(k, JSON.stringify(newOrder));
    }
  };

  const saveVisibleColumns = (newVis: Record<ColumnKey, boolean>) => {
    setVisibleColumns(newVis);
    if (typeof window !== 'undefined') {
      const u = getUser();
      const k = `cronuz_analise_itens_vis_${u?.company_id || 'def'}_${u?.id || 'u'}`;
      localStorage.setItem(k, JSON.stringify(newVis));
    }
  };

  const handleSaveStockAlertThreshold = async (newThreshold: number) => {
    const cleanVal = Math.max(0, Math.floor(Number(newThreshold) || 0));
    setStockAlertThreshold(cleanVal);
    if (!companyId) return;
    try {
      const token = getToken();
      await fetch(`${apiUrl}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ stock_alert_threshold: cleanVal }),
      });
    } catch {}
  };

  // Exportação Segura do Relatório Excel Multi-Filial
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const token = getToken();
      const targetBranch = exportBranchScope === 'ALL' ? 'ALL' : selectedBranchId;
      const params = new URLSearchParams({
        company_id: String(companyId),
        branch_id: targetBranch,
        model: exportModel,
        hide_ebooks: String(hideEbooks),
        hide_out_of_stock: String(hideOutOfStock),
        sales_days: String(salesDays),
      });
      const combinedSearch = [filterTitle, filterIsbn].filter(Boolean).join(' ').trim();
      if (combinedSearch) params.append('search', combinedSearch);
      if (filterPublisher.trim()) params.append('publisher', filterPublisher.trim());
      if (salesFilterMode === 'DATES' && salesStartDate) {
        params.append('sales_start_date', salesStartDate);
        if (salesEndDate) params.append('sales_end_date', salesEndDate);
      }

      const res = await fetch(`${apiUrl}/horus-analise-itens/export-excel?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Falha ao exportar relatório (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download =
        exportModel === 'MULTIBRANCH_REPLENISHMENT'
          ? `Analise_Itens_Por_Filial_Reposicao_${today}.xlsx`
          : `Analise_Itens_Consolidado_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Relatório Excel gerado com sucesso!');
      setShowExportModal(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar relatório Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Modal de Sincronização Manual Segura em Lotes (Chunked Sync) ────────────
  const fetchHorusEstoqueModal = async (customLimit?: number) => {
    setLoadingHorusItems(true);
    setHorusSyncMessage(null);
    const effLimit = customLimit ?? horusLimit;
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (horusSearchTerm.trim()) {
        params.append('search', horusSearchTerm.trim());
        params.append('q', horusSearchTerm.trim());
      }
      if (horusEditoraFilter.trim()) params.append('editora', horusEditoraFilter.trim());
      params.append('limit', String(effLimit));
      params.append('offset', '0');

      const res = await fetch(
        `${apiUrl}/companies/${companyId}/horus-sql/items-estoque-geral?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao consultar Itens_estoque_geral no Horus SQL');
      }
      const list: HorusEstoqueItem[] = data.items || [];
      setHorusItems(list);
      setHorusStats({
        totalAll: Number(data.total_all ?? list.length),
        totalImported: Number(data.total_imported ?? list.filter((i) => i.already_imported).length),
        totalNotImported: Number(data.total_not_imported ?? list.filter((i) => !i.already_imported).length),
      });
      const autoSel: Record<string, boolean> = {};
      list.forEach((it) => {
        if (!it.already_imported) autoSel[it.cod_item] = true;
      });
      setSelectedHorusCodes(autoSel);
    } catch (err: any) {
      setHorusSyncMessage({ type: 'error', text: err.message || 'Erro ao consultar Horus SQL' });
    } finally {
      setLoadingHorusItems(false);
    }
  };

  const displayedHorusItems = useMemo(() => {
    return horusItems.filter((it) => {
      if (horusFilterMode === 'ONLY_NEW' && it.already_imported) return false;
      if (horusFilterMode === 'ONLY_IMPORTED' && !it.already_imported) return false;
      if (horusOnlyWithStock && Number(it.estoque || 0) <= 0) return false;
      return true;
    });
  }, [horusItems, horusFilterMode, horusOnlyWithStock]);

  const handleChunkedImportSelectedHorus = async () => {
    const selectedList = displayedHorusItems.filter((it) => selectedHorusCodes[it.cod_item]);
    if (selectedList.length === 0) {
      setHorusSyncMessage({ type: 'error', text: 'Selecione ao menos um item para sincronizar.' });
      return;
    }

    setImportingHorus(true);
    setHorusSyncMessage(null);
    const token = getToken();
    const chunkSize = 200;
    let totalCreated = 0;
    let totalUpdated = 0;

    try {
      for (let i = 0; i < selectedList.length; i += chunkSize) {
        const chunk = selectedList.slice(i, i + chunkSize);
        setImportProgressText(
          `Sincronizando lote ${Math.floor(i / chunkSize) + 1} de ${Math.ceil(selectedList.length / chunkSize)} (${Math.min(i + chunk.length, selectedList.length)}/${selectedList.length} itens)...`
        );
        const payloadItems = chunk.map((it) => ({
          cod_item: it.cod_item,
          isbn: it.isbn,
          nome_item: it.nome_item,
          editora: it.editora,
          assunto: it.assunto || '',
          preco: it.preco,
          estoque: it.estoque,
          qtd_caixa: it.qtd_caixa || 0,
          data_lancamento: it.data_lancamento || null,
        }));

        const res = await fetch(`${apiUrl}/companies/${companyId}/horus-sql/import-items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ items: payloadItems }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || `Falha no lote ${Math.floor(i / chunkSize) + 1}`);
        }
        totalCreated += Number(data.created || 0);
        totalUpdated += Number(data.updated || 0);
      }

      setHorusSyncMessage({
        type: 'success',
        text: `✓ Sincronização em lotes concluída com segurança! (${totalCreated} criados • ${totalUpdated} atualizados)`,
      });
      await fetchSyncStatus(companyId, true);
      await fetchProducts(companyId);
    } catch (err: any) {
      setHorusSyncMessage({
        type: 'error',
        text: err.message || 'Falha ao sincronizar lote de produtos.',
      });
    } finally {
      setImportingHorus(false);
      setImportProgressText('');
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none overflow-hidden">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA SUPERIOR: TÍTULO + STATUS DE SYNC EM 2º PLANO + AÇÕES           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-black text-slate-900 dark:text-white">
                  Horus Direct — Análise de Itens &amp; Reposição Multi-Filial
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                  {filteredProducts.length.toLocaleString('pt-BR')} itens
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Saldos por filial/local (/logistics/branches), Custo Médio, Consignado Enviado &amp; Recebido, Vendas por Período e Última Entrada (Compra/Consignação).
              </p>
            </div>
          </div>

          {/* Card Compacto de Progresso de Sincronização Horus SQL <-> Cronuz */}
          {syncStatus && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/60 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-slate-500">
                    Horus SQL: <strong className="text-slate-900 dark:text-white">{syncStatus.horus_total.toLocaleString('pt-BR')}</strong>
                  </span>
                  <span>•</span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    No Cronuz: <strong>{syncStatus.synced_count.toLocaleString('pt-BR')}</strong> ({syncStatus.percent_complete}%)
                  </span>
                  <span>•</span>
                  <span className={syncStatus.missing_count > 0 ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-emerald-600 font-bold'}>
                    Faltam: {syncStatus.missing_count.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="w-56 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      syncStatus.background_sync.is_running ? 'bg-indigo-600 animate-pulse' : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, syncStatus.percent_complete))}%` }}
                  />
                </div>
              </div>

              {syncStatus.background_sync.is_running ? (
                <button
                  type="button"
                  onClick={handleStopBackgroundSync}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
                  title={syncStatus.background_sync.status_message}
                >
                  <Pause className="w-3 h-3" />
                  <span>Pausar 2º Plano ({syncStatus.background_sync.processed_in_run.toLocaleString('pt-BR')})</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={startingBgSync || !syncStatus.sql_connected}
                  onClick={() => handleStartBackgroundSync(false)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Sincroniza todos os itens do Horus SQL para o Cronuz em segundo plano (lotes seguros de 400 itens sem travar a tela)"
                >
                  {startingBgSync ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  <span>Sincronizar Tudo em 2º Plano</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Botões Rápidos de Configurações, Exportação Multi-Filial e Consulta Horus SQL */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
            Configurações
          </button>

          <button
            type="button"
            onClick={() => {
              setShowHorusSyncModal(true);
              fetchHorusEstoqueModal(500);
            }}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <DatabaseZap className="w-3.5 h-3.5 text-amber-600" />
            Consultar / Importar Horus SQL
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Relatório Excel (Por Filial)
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA DE FILTROS: EMPRESA/FILIAL (/logistics/branches) + PERÍODO + BUSCA */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 shrink-0 space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchProducts(companyId);
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end"
        >
          {/* Seletor de Filial Configurada (/logistics/branches) */}
          <div className="md:col-span-3">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                Empresa / Filial / Local (Logística)
              </label>
              <Link
                href="/logistics/branches"
                className="text-[10px] font-bold text-indigo-600 hover:underline"
                title="Gerenciar filiais e locais de estoque configurados"
              >
                Configurar Filiais →
              </Link>
            </div>
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs font-bold bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="ALL">
                  🏢 Todas as Filiais Configuradas ({branches.length} {branches.length === 1 ? 'filial' : 'filiais'})
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Título ou Assunto
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterTitle}
                onChange={(e) => setFilterTitle(e.target.value)}
                placeholder="Ex: Filosofia, Arte, Romance..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              ISBN ou Cód. Horus
            </label>
            <div className="relative">
              <Barcode className="w-3.5 h-3.5 text-indigo-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterIsbn}
                onChange={(e) => setFilterIsbn(e.target.value)}
                placeholder="97865... ou Cód"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
              placeholder="Filtrar editora..."
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-1.5">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loading || enrichingPage ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              Analisar
            </button>
            {(filterTitle || filterIsbn || filterPublisher || filterSituation !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setFilterTitle('');
                  setFilterIsbn('');
                  setFilterPublisher('');
                  setFilterSituation('ALL');
                }}
                className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>
        </form>

        {/* Sub-barra: Filtro de Período das Vendas + Opções de Visualização */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={hideEbooks}
                onChange={(e) => setHideEbooks(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
              />
              Não mostrar E-books
            </label>

            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={hideOutOfStock}
                onChange={(e) => setHideOutOfStock(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 border-slate-300"
              />
              Apenas com Saldo Disponível (&gt; 0)
            </label>

            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700" />

            {/* Filtro de Período de Vendas (Por Dias ou Por Datas) */}
            <div className="inline-flex flex-wrap items-center gap-1.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800 rounded-lg px-2.5 py-1 text-[11px]">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-bold text-indigo-900 dark:text-indigo-300">Período de Vendas:</span>
              <select
                value={salesFilterMode}
                onChange={(e) => setSalesFilterMode(e.target.value as 'DAYS' | 'DATES')}
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 font-bold text-slate-800 dark:text-slate-200"
              >
                <option value="DAYS">Últimos X Dias</option>
                <option value="DATES">Intervalo de Datas</option>
              </select>

              {salesFilterMode === 'DAYS' ? (
                <div className="inline-flex items-center gap-1">
                  {[30, 60, 90, 180, 365].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSalesDays(d)}
                      className={`px-1.5 py-0.5 rounded font-mono font-bold cursor-pointer ${
                        salesDays === d
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-900 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={salesDays}
                    onChange={(e) => setSalesDays(Math.max(1, parseInt(e.target.value, 10) || 90))}
                    className="w-14 text-center font-mono font-bold text-indigo-700 bg-white dark:bg-slate-900 border border-slate-300 rounded px-1 py-0.5"
                  />
                </div>
              ) : (
                <div className="inline-flex items-center gap-1">
                  <input
                    type="date"
                    value={salesStartDate}
                    onChange={(e) => setSalesStartDate(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[11px]"
                  />
                  <span>até</span>
                  <input
                    type="date"
                    value={salesEndDate}
                    onChange={(e) => setSalesEndDate(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[11px]"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {enrichingPage && (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Conciliando saldos, custos, consignados e última entrada no SQL...
              </span>
            )}
            <span>Duplo clique na linha para abrir o Raio-X por Filial</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* GRADE PRINCIPAL DE ALTA DENSIDADE (ESTILO EXCEL MULTI-FILIAL)         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white dark:bg-slate-900 relative">
        <table className="w-full border-collapse text-left table-fixed min-w-[1480px]">
          <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-xs border-b border-slate-300 dark:border-slate-700 text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider select-none">
            <tr>
              <th className="w-9 py-2 px-1.5 border-r border-slate-200 dark:border-slate-700 text-center">#</th>
              {activeVisibleColumns.map((colKey) => {
                const widthClass =
                  colKey === 'cod_horus'
                    ? 'w-20'
                    : colKey === 'isbn'
                    ? 'w-32'
                    : colKey === 'name'
                    ? 'w-[20%]'
                    : colKey === 'brand'
                    ? 'w-28'
                    : colKey === 'subject'
                    ? 'w-28'
                    : colKey === 'situation'
                    ? 'w-32 text-center'
                    : colKey === 'base_price'
                    ? 'w-24 text-right'
                    : colKey === 'cost_price'
                    ? 'w-24 text-right'
                    : colKey === 'stock_quantity'
                    ? 'w-24 text-right'
                    : colKey === 'consignment_stock'
                    ? 'w-24 text-right'
                    : colKey === 'consigned_received'
                    ? 'w-24 text-right'
                    : colKey === 'sales_365'
                    ? 'w-20 text-right'
                    : colKey === 'sales_period'
                    ? 'w-24 text-right'
                    : colKey === 'replenishment_suggestion'
                    ? 'w-24 text-right'
                    : colKey === 'last_entry'
                    ? 'w-48 text-center'
                    : 'w-16 text-center';

                return (
                  <th
                    key={colKey}
                    onClick={() => handleSortColumn(colKey)}
                    className={`group ${widthClass} py-2 px-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition-colors`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{getColumnLabel(colKey)}</span>
                      {renderSortIcon(colKey)}
                    </div>
                  </th>
                );
              })}
              <th className="w-24 py-2 px-2 text-center">Filiais</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 text-[13px] font-bold">
            {loading ? (
              <tr>
                <td colSpan={activeVisibleColumns.length + 2} className="py-16 text-center text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                  Carregando itens para análise multi-filial...
                </td>
              </tr>
            ) : paginatedProducts.length === 0 ? (
              <tr>
                <td colSpan={activeVisibleColumns.length + 2} className="py-16 text-center text-slate-500 space-y-2">
                  <p>Nenhum item encontrado na base local para este filtro.</p>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleStartBackgroundSync(false)}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs cursor-pointer"
                    >
                      ⚡ Sincronizar Acervo do Horus SQL em 2º Plano
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowHorusSyncModal(true);
                        fetchHorusEstoqueModal(500);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs cursor-pointer"
                    >
                      Consultar Horus SQL Manualmente
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedProducts.map((item, localIdx) => {
                const idx = pageStartIdx + localIdx;
                const isSelected = idx === selectedIndex;
                const isLowStockAlert = stockAlertThreshold > 0 && item.stock_quantity <= stockAlertThreshold;
                const sitInfo = evaluateSituation(item);
                const sugRep = Math.max(0, Number(item.sales_period || 0) - Math.max(0, Number(item.stock_quantity || 0)));

                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedIndex(idx)}
                    onDoubleClick={() => setDetailModalItem(item)}
                    className={`transition-colors font-bold cursor-pointer ${
                      isSelected
                        ? isLowStockAlert
                          ? 'bg-rose-100/85 dark:bg-rose-950/60 ring-1 ring-inset ring-rose-300'
                          : 'bg-indigo-50/90 dark:bg-indigo-950/50 ring-1 ring-inset ring-indigo-300'
                        : isLowStockAlert
                        ? 'bg-rose-50/75 dark:bg-rose-950/25 hover:bg-rose-100/60'
                        : idx % 2 === 0
                        ? 'bg-white dark:bg-slate-900 hover:bg-slate-50'
                        : 'bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-100/60'
                    }`}
                  >
                    <td
                      className={`py-1.5 px-1.5 border-r border-slate-200/80 dark:border-slate-800 text-center font-mono text-xs font-bold ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-500'
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
                      if (colKey === 'name') {
                        return (
                          <td
                            key={colKey}
                            className="py-1.5 px-2.5 border-r border-slate-200/80 dark:border-slate-800 truncate"
                            title={item.name}
                          >
                            <span className="truncate font-bold text-[13px] text-slate-900 dark:text-white">
                              {item.name}
                            </span>
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
                            {item.subject || '-'}
                          </td>
                        );
                      }
                      if (colKey === 'situation') {
                        return (
                          <td
                            key={colKey}
                            className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center"
                          >
                            <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold ${sitInfo.badgeClass}`}>
                              {sitInfo.label}
                            </span>
                          </td>
                        );
                      }
                      if (colKey === 'base_price') {
                        return (
                          <td
                            key={colKey}
                            className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold text-slate-900 dark:text-white"
                          >
                            {item.base_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                        );
                      }
                      if (colKey === 'cost_price') {
                        const cVal = Number(item.cost_price || item.last_entry_cost || 0);
                        return (
                          <td
                            key={colKey}
                            className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold text-amber-800 dark:text-amber-300"
                            title="Custo Médio / Unitário na Filial selecionada (TABELA_SALDO_ITENS_GERAL)"
                          >
                            {cVal > 0
                              ? cVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                              : '—'}
                          </td>
                        );
                      }
                      if (colKey === 'stock_quantity') {
                        return (
                          <td
                            key={colKey}
                            className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-extrabold ${
                              isLowStockAlert
                                ? 'bg-rose-100/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                                : item.stock_quantity > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-600'
                            }`}
                          >
                            {isLowStockAlert ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-100/90 border border-rose-200 text-rose-700 font-extrabold">
                                {item.stock_quantity}
                              </span>
                            ) : (
                              item.stock_quantity
                            )}
                          </td>
                        );
                      }
                      if (colKey === 'consignment_stock') {
                        const cEnv = Number(item.consignment_stock || 0);
                        return (
                          <td
                            key={colKey}
                            className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold ${
                              cEnv > 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-400'
                            }`}
                            title="Saldo Consignado Enviado (em clientes)"
                          >
                            {cEnv.toLocaleString('pt-BR')}
                          </td>
                        );
                      }
                      if (colKey === 'consigned_received') {
                        const cRec = Number(item.consigned_received || 0);
                        return (
                          <td
                            key={colKey}
                            className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold ${
                              cRec > 0 ? 'text-purple-700 dark:text-purple-400' : 'text-slate-400'
                            }`}
                            title="Saldo Consignado Recebido de fornecedores/editoras na filial (SALDO_CONSIGNADO_RECEBIDO)"
                          >
                            {cRec.toLocaleString('pt-BR')}
                          </td>
                        );
                      }
                      if (colKey === 'sales_365') {
                        const s365 = Number(item.sales_365 || 0);
                        return (
                          <td
                            key={colKey}
                            className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-bold ${
                              s365 > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
                            }`}
                          >
                            {s365.toLocaleString('pt-BR')}
                          </td>
                        );
                      }
                      if (colKey === 'sales_period') {
                        const sPer = Number(item.sales_period || 0);
                        return (
                          <td
                            key={colKey}
                            className={`py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-extrabold ${
                              sPer > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            {sPer.toLocaleString('pt-BR')}
                          </td>
                        );
                      }
                      if (colKey === 'replenishment_suggestion') {
                        return (
                          <td
                            key={colKey}
                            className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-right font-mono text-xs font-extrabold"
                            title="Sugestão de Reposição = Vendas no Período - Saldo Disponível"
                          >
                            {sugRep > 0 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold">
                                +{sugRep}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                        );
                      }
                      if (colKey === 'last_entry') {
                        if (!item.last_entry_date) {
                          return (
                            <td
                              key={colKey}
                              className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center text-[11px] text-slate-400 font-mono"
                            >
                              —
                            </td>
                          );
                        }
                        const isConsig = item.last_entry_type === 'CONSIG. RECEBIDA';
                        return (
                          <td
                            key={colKey}
                            className="py-1 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center"
                            title={`Última Entrada (${item.last_entry_type || 'COMPRA'} • CFOP ${item.last_entry_cfop || ''} • Qtd: ${item.last_entry_qty || 0} un • Custo: R$ ${Number(item.last_entry_cost || 0).toFixed(2)}${item.last_entry_nf ? ` • NF ${item.last_entry_nf}` : ''})`}
                          >
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-[11px] font-extrabold text-slate-800 dark:text-slate-100">
                                  {formatBrDate(item.last_entry_date)}
                                </span>
                                <span
                                  className={`px-1 py-0.2 rounded text-[9px] font-bold border ${
                                    isConsig
                                      ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  }`}
                                >
                                  {isConsig ? 'CONSIG' : 'COMPRA'} {item.last_entry_cfop ? `(${item.last_entry_cfop})` : ''}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">
                                {item.last_entry_qty || 0} un
                                {Number(item.last_entry_cost || 0) > 0
                                  ? ` • R$ ${Number(item.last_entry_cost).toFixed(2).replace('.', ',')}`
                                  : ''}
                              </span>
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={colKey}
                          className="py-1.5 px-2 border-r border-slate-200/80 dark:border-slate-800 text-center font-mono text-xs font-bold text-slate-600"
                        >
                          {item.units_per_box || '-'}
                        </td>
                      );
                    })}

                    <td className="py-1 px-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailModalItem(item);
                        }}
                        className="px-2 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Filiais</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA INFERIOR DE NAVEGAÇÃO ESTILO ACCESS / EXCEL                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-slate-100 dark:bg-slate-900 border-t border-slate-300 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 font-semibold">Página:</span>
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage(1)}
            className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40 cursor-pointer"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold disabled:opacity-40 cursor-pointer"
          >
            Anterior
          </button>
          <span className="px-2.5 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-indigo-700">
            Pág. {safeCurrentPage} de {totalPages}
          </span>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold disabled:opacity-40 cursor-pointer"
          >
            Próxima
          </button>
          <button
            type="button"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40 cursor-pointer"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="ml-1 px-2 py-0.5 bg-white border border-slate-300 rounded font-mono font-bold text-xs"
          >
            <option value={25}>25 / pág</option>
            <option value={50}>50 / pág</option>
            <option value={100}>100 / pág</option>
          </select>

          <div className="relative ml-2">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickSearchFooter}
              onChange={(e) => {
                setQuickSearchFooter(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filtro instantâneo na grade..."
              className="pl-6 pr-2 py-0.5 bg-white border border-slate-300 rounded text-xs w-48"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-600">
          <span>
            Com saldo (&gt;0):{' '}
            <strong className="text-emerald-700">
              {filteredProducts.filter((p) => p.stock_quantity > 0).length}
            </strong>
          </span>
          <span>•</span>
          <span>
            Filial Ativa:{' '}
            <strong className="text-indigo-700">
              {selectedBranchId === 'ALL'
                ? `Todas (${branches.length})`
                : branches.find((b) => String(b.id) === selectedBranchId)?.nome || 'Padrão'}
            </strong>
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: RAIO-X MULTI-FILIAL DO ITEM (SALDO, CUSTO, CONSIG E ÚLT. ENTRADA POR FILIAL) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {detailModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-text">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden text-xs"
            >
              <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 block">
                    Raio-X Multi-Filial • Cód. Horus #{detailModalItem.horus_cod_item || detailModalItem.sku} • ISBN{' '}
                    {detailModalItem.ean_gtin || detailModalItem.isbn}
                  </span>
                  <h3 className="text-sm font-black">{detailModalItem.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailModalItem(null)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-700 dark:text-slate-200">
                      <tr>
                        <th className="p-2.5 border-r border-slate-200">Filial / Loja</th>
                        <th className="p-2.5 border-r border-slate-200 text-center">Emp / Fil / Local</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Custo Médio</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Saldo Disp.</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Consig. Env.</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Consig. Rec.</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Vendas 365d</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Vendas ({periodBadgeLabel})</th>
                        <th className="p-2.5 border-r border-slate-200 text-right">Sug. Reposição</th>
                        <th className="p-2.5 text-center">Última Entrada (Compra / Consig)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-xs font-bold">
                      {(detailModalItem.branches_breakdown && detailModalItem.branches_breakdown.length > 0
                        ? detailModalItem.branches_breakdown
                        : branches.map((b) => ({
                            branch_id: b.id,
                            branch_name: b.nome,
                            cod_empresa: b.cod_empresa,
                            cod_filial: b.cod_filial,
                            cod_local: b.cod_local,
                            locais: b.locais,
                            stock_available: detailModalItem.stock_quantity,
                            stock_physical: detailModalItem.stock_quantity,
                            consigned_sent: detailModalItem.consignment_stock,
                            consigned_received: detailModalItem.consigned_received,
                            cost_price: detailModalItem.cost_price,
                            sales_365: detailModalItem.sales_365,
                            sales_period: detailModalItem.sales_period,
                            last_entry_date: detailModalItem.last_entry_date || null,
                            last_entry_qty: detailModalItem.last_entry_qty || 0,
                            last_entry_cost: detailModalItem.last_entry_cost || 0,
                            last_entry_type: detailModalItem.last_entry_type || null,
                            last_entry_cfop: detailModalItem.last_entry_cfop || null,
                            last_entry_nf: detailModalItem.last_entry_nf || null,
                          }))
                      ).map((b) => {
                        const sug = Math.max(0, Number(b.sales_period || 0) - Math.max(0, Number(b.stock_available || 0)));
                        return (
                          <tr key={b.branch_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2.5 border-r border-slate-200 font-sans font-extrabold text-slate-900 dark:text-white">
                              {b.branch_name}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 text-center text-slate-600">
                              Emp {b.cod_empresa} • Fil {b.cod_filial}
                              {b.locais && b.locais.length > 0 ? ` • Loc ${b.locais.join(',')}` : ''}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 text-right text-amber-800">
                              {Number(b.cost_price || 0) > 0
                                ? Number(b.cost_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : '—'}
                            </td>
                            <td
                              className={`p-2.5 border-r border-slate-200 text-right font-extrabold ${
                                b.stock_available > 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {b.stock_available}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 text-right text-indigo-700">
                              {b.consigned_sent}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 text-right text-purple-700">
                              {b.consigned_received}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 text-right">{b.sales_365}</td>
                            <td className="p-2.5 border-r border-slate-200 text-right text-emerald-700 font-extrabold">
                              {b.sales_period}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 text-right">
                              {sug > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold">
                                  +{sug}
                                </span>
                              ) : (
                                '0'
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              {b.last_entry_date ? (
                                <div className="flex flex-col items-center leading-tight">
                                  <span className="font-extrabold text-slate-900 dark:text-white">
                                    {formatBrDate(b.last_entry_date)} • {b.last_entry_type} (CFOP {b.last_entry_cfop})
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Qtd: {b.last_entry_qty} un
                                    {Number(b.last_entry_cost || 0) > 0
                                      ? ` • Custo Ent: R$ ${Number(b.last_entry_cost).toFixed(2).replace('.', ',')}`
                                      : ''}
                                    {b.last_entry_nf ? ` • NF #${b.last_entry_nf}` : ''}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">Sem entrada registrada</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailModalItem(null)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: EXPORTAÇÃO DE RELATÓRIO EXCEL MULTI-FILIAL (REPOSIÇÃO & CUSTO) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden text-xs"
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-bold">Exportar Relatório Excel — Análise de Itens</h3>
                    <p className="text-[11px] text-slate-300">
                      Período de vendas selecionado: <strong>{periodBadgeLabel}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Modelo do Relatório
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      exportModel === 'MULTIBRANCH_REPLENISHMENT'
                        ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={exportModel === 'MULTIBRANCH_REPLENISHMENT'}
                      onChange={() => setExportModel('MULTIBRANCH_REPLENISHMENT')}
                      className="mt-0.5 text-emerald-600"
                    />
                    <div>
                      <div className="font-bold text-slate-900">
                        Modelo Padrão — Análise de Estoque, Custo &amp; Reposição por Filial (Linhas por Filial)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Repete as linhas para cada filial configurada, exibindo <b>Empresa</b>, <b>Filial</b>,{' '}
                        <b>Local</b>, <b>Saldo Disponível</b>, <b>Custo Médio por Filial</b>,{' '}
                        <b>Consignado Enviado</b>, <b>Consignado Recebido</b>, <b>Vendas no Período</b>,{' '}
                        <b>Sugestão de Reposição</b> e <b>Última Entrada (Compra ou Consignação Recebida, sem ajuste)</b> com data, CFOP e custo.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      exportModel === 'CONSOLIDATED'
                        ? 'bg-indigo-50/70 border-indigo-500 ring-1 ring-indigo-500'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={exportModel === 'CONSOLIDATED'}
                      onChange={() => setExportModel('CONSOLIDATED')}
                      className="mt-0.5 text-indigo-600"
                    />
                    <div>
                      <div className="font-bold text-slate-900">
                        Modelo 2 — Consolidado Geral (1 Linha por Produto)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Soma os saldos, consignados e vendas de todas as filiais filtradas em uma única linha por obra.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Escopo de Filiais na Exportação
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportBranchScope('CURRENT')}
                      className={`p-2 rounded-lg border text-left cursor-pointer ${
                        exportBranchScope === 'CURRENT'
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Filtro atual ({selectedBranchId === 'ALL' ? `Todas (${branches.length})` : branches.find((b) => String(b.id) === selectedBranchId)?.nome})
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportBranchScope('ALL')}
                      className={`p-2 rounded-lg border text-left cursor-pointer ${
                        exportBranchScope === 'ALL'
                          ? 'bg-slate-900 text-white border-slate-900 font-bold'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Todas as Filiais ({branches.length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowExportModal(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={exportingExcel}
                    onClick={handleExportExcel}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {exportingExcel ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Gerando Planilha Segura...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Baixar Relatório Excel
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: CONFIGURAÇÕES DE COLUNAS E ALERTA DE ESTOQUE                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden text-xs"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold">Configurações da Grade — Análise de Itens</h3>
                </div>
                <button type="button" onClick={() => setShowSettingsModal(false)} className="cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase text-rose-700">
                      Alerta de Estoque (Geral)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-100 border border-rose-200 text-rose-700 text-[10px] font-mono font-extrabold">
                      {stockAlertThreshold > 0 ? `≤ ${stockAlertThreshold} un.` : 'Desativado'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Ex: 250"
                      value={stockAlertThreshold ? String(stockAlertThreshold) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        handleSaveStockAlertThreshold(raw ? parseInt(raw, 10) : 0);
                      }}
                      className="w-32 px-2.5 py-1.5 text-xs font-mono font-extrabold bg-white border border-rose-200 rounded-lg"
                    />
                    <span className="text-[11px] text-slate-500">unidades (0 = desativar)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Colunas Exibidas no Grid
                  </div>
                  {columnOrder.map((colKey, idx) => {
                    const isVis = visibleColumns[colKey] !== false;
                    return (
                      <div
                        key={colKey}
                        className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
                          isVis ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-slate-50 opacity-70'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isVis}
                            onChange={() =>
                              saveVisibleColumns({ ...visibleColumns, [colKey]: !isVis })
                            }
                            className="w-4 h-4 rounded text-indigo-600"
                          />
                          <span className="font-bold text-slate-800">{getColumnLabel(colKey)}</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              const copy = [...columnOrder];
                              const tmp = copy[idx - 1];
                              copy[idx - 1] = copy[idx];
                              copy[idx] = tmp;
                              saveColumnOrder(copy);
                            }}
                            className="p-1 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === columnOrder.length - 1}
                            onClick={() => {
                              const copy = [...columnOrder];
                              const tmp = copy[idx + 1];
                              copy[idx + 1] = copy[idx];
                              copy[idx] = tmp;
                              saveColumnOrder(copy);
                            }}
                            className="p-1 rounded hover:bg-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    saveColumnOrder(DEFAULT_COLUMNS);
                    saveVisibleColumns(DEFAULT_VISIBLE_COLS);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar Padrão
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer"
                >
                  Salvar e Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 4: CONSULTA E IMPORTAÇÃO MANUAL EM LOTES SEGUROS (CHUNKED)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showHorusSyncModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 select-text">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-xs"
            >
              <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <DatabaseZap className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold">
                      Sincronizar Produtos do Horus SQL (Itens_estoque_geral) → Cronuz
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      Envio protegido em lotes automáticos de 200 itens (evita timeout / Failed to fetch) ou use o botão &ldquo;Sincronizar Tudo em 2º Plano&rdquo;.
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

              <div className="p-4 border-b border-slate-200 space-y-3 bg-slate-50">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    fetchHorusEstoqueModal();
                  }}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end"
                >
                  <div className="md:col-span-5">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Buscar por Código Horus, ISBN ou Nome do Livro
                    </label>
                    <input
                      type="text"
                      value={horusSearchTerm}
                      onChange={(e) => setHorusSearchTerm(e.target.value)}
                      placeholder="Ex: 97865..., Título..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Editora
                    </label>
                    <input
                      type="text"
                      value={horusEditoraFilter}
                      onChange={(e) => setHorusEditoraFilter(e.target.value)}
                      placeholder="Filtrar editora..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Quantidade
                    </label>
                    <select
                      value={horusLimit}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setHorusLimit(v);
                        fetchHorusEstoqueModal(v);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                    >
                      <option value={250}>250 itens</option>
                      <option value={500}>500 itens</option>
                      <option value={1000}>1.000 itens</option>
                      <option value={2500}>2.500 itens</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={loadingHorusItems}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {loadingHorusItems ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Consultar SQL
                    </button>
                  </div>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 cursor-pointer font-semibold">
                      <input
                        type="checkbox"
                        checked={horusFilterMode === 'ONLY_NEW'}
                        onChange={(e) => setHorusFilterMode(e.target.checked ? 'ONLY_NEW' : 'ALL')}
                      />
                      <span>Ocultar itens já cadastrados ({horusStats.totalNotImported} pendentes nesta lista)</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 cursor-pointer font-semibold">
                      <input
                        type="checkbox"
                        checked={horusOnlyWithStock}
                        onChange={(e) => setHorusOnlyWithStock(e.target.checked)}
                      />
                      <span>Apenas com Saldo &gt; 0</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowHorusSyncModal(false);
                      handleStartBackgroundSync(horusOnlyWithStock);
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Sincronizar Todo o Acervo em 2º Plano ({syncStatus?.missing_count.toLocaleString('pt-BR')} faltando)</span>
                  </button>
                </div>

                {horusSyncMessage && (
                  <div
                    className={`p-2.5 rounded-xl border font-semibold ${
                      horusSyncMessage.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    {horusSyncMessage.text}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">
                    <tr>
                      <th className="p-2 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            displayedHorusItems.length > 0 &&
                            displayedHorusItems.every((i) => selectedHorusCodes[i.cod_item])
                          }
                          onChange={(e) => {
                            const next: Record<string, boolean> = {};
                            if (e.target.checked) {
                              displayedHorusItems.forEach((i) => {
                                next[i.cod_item] = true;
                              });
                            }
                            setSelectedHorusCodes(next);
                          }}
                        />
                      </th>
                      <th className="p-2 w-24">Cód Horus</th>
                      <th className="p-2 w-36">ISBN Horus</th>
                      <th className="p-2">Título no Horus</th>
                      <th className="p-2 w-40">Editora</th>
                      <th className="p-2 w-28 text-right">Preço Capa</th>
                      <th className="p-2 w-24 text-right">Saldo</th>
                      <th className="p-2 w-28 text-center">Status Cronuz</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-xs font-bold">
                    {displayedHorusItems.map((it) => (
                      <tr key={it.cod_item} className="hover:bg-slate-50">
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedHorusCodes[it.cod_item])}
                            onChange={(e) =>
                              setSelectedHorusCodes((prev) => ({
                                ...prev,
                                [it.cod_item]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="p-2">{it.cod_item}</td>
                        <td className="p-2">{it.isbn}</td>
                        <td className="p-2 font-sans font-bold text-slate-900">{it.nome_item}</td>
                        <td className="p-2 font-sans text-slate-600">{it.editora}</td>
                        <td className="p-2 text-right">
                          {Number(it.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className={`p-2 text-right ${it.estoque > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {it.estoque}
                        </td>
                        <td className="p-2 text-center font-sans">
                          {it.already_imported ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px]">
                              Já no Cronuz
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px]">
                              Faltando
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-600">
                  Selecionados:{' '}
                  <strong>{displayedHorusItems.filter((i) => selectedHorusCodes[i.cod_item]).length}</strong> item(ns)
                  {importProgressText && (
                    <span className="ml-2 text-indigo-600 font-bold">{importProgressText}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={importingHorus}
                    onClick={handleChunkedImportSelectedHorus}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    {importingHorus ? 'Sincronizando em Lotes...' : 'Sincronizar Selecionados (Em Lotes Seguros)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHorusSyncModal(false)}
                    className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

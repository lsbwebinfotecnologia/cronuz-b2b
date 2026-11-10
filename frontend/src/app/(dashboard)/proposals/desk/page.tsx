'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { 
  Building2, 
  ArrowLeft, 
  Sparkles, 
  FileSpreadsheet, 
  FileText, 
  Mail, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Layers, 
  Package, 
  DollarSign, 
  Scale, 
  RotateCcw, 
  Trash2, 
  Plus, 
  Check, 
  Settings2, 
  Save, 
  RefreshCw,
  BookOpen,
  Search,
  Filter,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  CreditCard,
  Calendar,
  Keyboard,
  Eye,
  EyeOff,
  Clock,
  TrendingUp,
  Percent,
  CheckCheck,
  Send,
  History,
  ShoppingCart,
  Loader2,
  HelpCircle,
  Columns3,
  SlidersHorizontal
} from 'lucide-react';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import { getUser, getToken } from '@/lib/auth';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Tipagem dos Status Customizáveis por Seller ─────────────────────────────
export type PhaseKey = 'RASCUNHO' | 'EM_ANALISE' | 'NEGOCIACAO' | 'APROVADO' | 'CONVERTIDO' | 'CANCELADO';

export interface SellerCustomStatus {
  id: string;
  name: string;
  phase: PhaseKey;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  description: string;
}

export interface ProposalDeskConfig {
  showDiscountInGrid: boolean;
  showIsbnInGrid: boolean;
  showCoverPriceInGrid: boolean;
  showQuickDiscountInput?: boolean;
  hideEbooksInSearch?: boolean;
  hideOutOfPrintInSearch?: boolean;
  clientSalesDays: number;
  generalSalesDays: number;
  replenishmentSalesDays: number;
  globalDiscountInput: number;
  columnWidths: Record<string, number>;
  statuses: SellerCustomStatus[];
}

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  select: 34,
  rowNum: 34,
  situation: 78,
  origin: 86,
  isbn: 112,
  title: 240,
  subject: 135,
  coverPrice: 78,
  discountPercent: 64,
  netPrice: 78,
  requestedQty: 66,
  subtotal: 88,
  consignedQty: 62,
  clientSalesX: 68,
  horusStock: 68,
  boxUnits: 48,
  generalSales365: 62,
  generalSalesX: 68,
  action: 82,
};

const getDeskStorageKey = () => {
  if (typeof window === 'undefined') return 'cronuz_proposal_desk_config';
  try {
    const user = getUser();
    const userId = user?.id || user?.email || 'user';
    const companyId = user?.company_id || 'default';
    return `cronuz_proposal_desk_config_${companyId}_${userId}`;
  } catch {
    return 'cronuz_proposal_desk_config';
  }
};

const INITIAL_SELLER_STATUSES: SellerCustomStatus[] = [
  {
    id: 'st-1',
    name: 'Em Digitação',
    phase: 'RASCUNHO',
    color: 'slate',
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeBorder: 'border-slate-300 dark:border-slate-700',
    badgeText: 'text-slate-700 dark:text-slate-300',
    description: 'Proposta em elaboração inicial pelo vendedor'
  },
  {
    id: 'st-2',
    name: 'Aguardando Análise Comercial',
    phase: 'EM_ANALISE',
    color: 'amber',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    badgeBorder: 'border-amber-200 dark:border-amber-800',
    badgeText: 'text-amber-700 dark:text-amber-300',
    description: 'Aguardando validação de descontos e alçadas'
  },
  {
    id: 'st-3',
    name: 'Enviado ao Cliente / Negociação',
    phase: 'NEGOCIACAO',
    color: 'sky',
    badgeBg: 'bg-sky-50 dark:bg-sky-950/40',
    badgeBorder: 'border-sky-200 dark:border-sky-800',
    badgeText: 'text-sky-700 dark:text-sky-300',
    description: 'Proposta entregue ao comprador para aceite'
  },
  {
    id: 'st-4',
    name: 'Aprovado pelo Comprador',
    phase: 'APROVADO',
    color: 'emerald',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    description: 'Aprovado com pedido mínimo atingido, pronto p/ faturar'
  },
  {
    id: 'st-5',
    name: 'Convertido em Pedido Horus',
    phase: 'CONVERTIDO',
    color: 'indigo',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    badgeBorder: 'border-indigo-200 dark:border-indigo-800',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    description: 'Pedido oficial inserido no ERP Horus'
  },
  {
    id: 'st-6',
    name: 'Declinado / Recusado',
    phase: 'CANCELADO',
    color: 'rose',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/40',
    badgeBorder: 'border-rose-200 dark:border-rose-800',
    badgeText: 'text-rose-700 dark:text-rose-300',
    description: 'Condições não atendidas ou desistência'
  },
];

export type TabCategory = 'pedido' | 'reposicao' | 'novidades' | 'fundo' | 'ultimo_acerto';
export type DeskTab = TabCategory | 'consolidado';

export type SortKey =
  | 'situation'
  | 'originCategory'
  | 'isbn'
  | 'title'
  | 'subject'
  | 'coverPrice'
  | 'discountPercent'
  | 'netPrice'
  | 'requestedQty'
  | 'subtotal'
  | 'consignedQty'
  | 'clientSalesX'
  | 'horusStock'
  | 'boxUnits'
  | 'generalSales365'
  | 'generalSalesX';

// ── Tipagens dos Itens da Grade DBM (Access / Excel) ────────────────────────
export interface DbmItem {
  id: string;
  isbn: string;
  sku?: string;
  title: string;
  publisher: string;
  subject: string;            // Assunto / Categoria (Coluna dedicada)
  coverPrice: number;         // Preço Capa
  discountPercent: number;    // Desconto %
  requestedQty: number;       // Qtd Pedida
  approvedQty: number;        // Qtd Atendida
  consignedQty: number;       // Consignado com o cliente
  clientSalesX: number;       // Vendas desse cliente no período {x}
  horusStock: number;         // Estoque Disponível Horus
  boxUnits: number;           // Unidades por caixa (CX)
  generalSales365: number;    // Vendas Cliente/Geral últimos 365 dias
  generalSalesX: number;      // Vendas Geral no período {x}
  situation: 'DISPONIVEL' | 'PARCIAL' | 'SEM_ESTOQUE' | 'BLOQUEADO';
  tabCategory: TabCategory;
  originCategory?: TabCategory; // Origem quando visualizado no consolidado
  isAddedToOrder?: boolean;     // Se foi adicionado ao pedido/proposta comercial
  lastSaleQty?: number;         // Quantidade na última venda/acerto
  lastSaleDate?: string;        // Data da última venda/acerto
  replenishmentReason?: string; // Origem na reposição (Consignado API / Venda X dias)
  notes?: string;
  // Metadados de Lançamento (Regra Novidades: -9 meses a +6 meses)
  launchDate?: string | null;
  launchMonthYear?: string | null;
  daysToExpire?: number | null;
  launchStatus?: 'PRE_LANCAMENTO' | 'VIGENTE' | 'EXPIRANDO' | 'EXPIRADO' | null;
  launchLabel?: string | null;
}

const EMPTY_OPERATIONS_METRICS = {
  remessa: { totalValue: 0, totalUnits: 0, date: '—', doc: '—' },
  venda: { totalValue: 0, totalUnits: 0, date: '—', doc: '—' },
  acerto: { totalValue: 0, totalUnits: 0, date: '—', doc: '—' },
  devolucao: { totalValue: 0, totalUnits: 0, date: '—', doc: '—' }
};

const CATALOG_SEARCH_TABS: DeskTab[] = ['reposicao', 'novidades', 'fundo', 'ultimo_acerto'];

export default function ProposalsDeskPage() {
  // ── 1. Estado do Cliente Selecionado (Tela inicia LIMPA até selecionar cliente) ─
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number>('');
  const [customer, setCustomer] = useState<any | null>(null);
  const [isLoadingCustomerContext, setIsLoadingCustomerContext] = useState<boolean>(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);

  // ── 2. Mini Métricas de Últimas Operações (Carregadas ao selecionar cliente) ─
  const [operationsMetrics, setOperationsMetrics] = useState(EMPTY_OPERATIONS_METRICS);

  // ── 3. Central de Origem de Pedidos & Parametrizações de Análise ───────────
  const [isIntakeDrawerOpen, setIsIntakeDrawerOpen] = useState(false);
  const [intakeSource, setIntakeSource] = useState<'excel' | 'pdf' | 'text'>('text');
  const [rawText, setRawText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);

  // Parametrizações de Vendas Solicitadas (Dias Cliente, Dias Geral e Dias Base Reposição)
  const [clientSalesDays, setClientSalesDays] = useState<number>(30);
  const [generalSalesDays, setGeneralSalesDays] = useState<number>(90);
  const [replenishmentSalesDays, setReplenishmentSalesDays] = useState<number>(90);
  const [isReplenishmentConfigOpen, setIsReplenishmentConfigOpen] = useState<boolean>(false);
  const [isLoadingReplenishment, setIsLoadingReplenishment] = useState<boolean>(false);
  const [replenishmentMeta, setReplenishmentMeta] = useState<{
    consignedCount: number;
    consignedFromApiCount: number;
    consignedFromSqlCount: number;
    salesHistoryCount: number;
    days: number;
    apiDiagnostic?: any;
    sqlDiagnostic?: any;
  } | null>(null);
  const [showReplenishmentDiag, setShowReplenishmentDiag] = useState<boolean>(false);

  // ── 3.1 Visibilidade de Colunas no Grid (ISBN, Capa, Desconto) e Configurações Gerais DBM ─
  const [showIsbnInGrid, setShowIsbnInGrid] = useState<boolean>(true);
  const [showCoverPriceInGrid, setShowCoverPriceInGrid] = useState<boolean>(true);
  const [showDiscountInGrid, setShowDiscountInGrid] = useState<boolean>(true);
  const [showQuickDiscountInput, setShowQuickDiscountInput] = useState<boolean>(true);
  const [hideEbooksInSearch, setHideEbooksInSearch] = useState<boolean>(true);
  const [hideOutOfPrintInSearch, setHideOutOfPrintInSearch] = useState<boolean>(true);
  const [globalDiscountInput, setGlobalDiscountInput] = useState<number>(50.0);

  // ── 3.2 Larguras de Colunas Estilo Excel (Persistidas por Usuário) ─────────
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const resizingColRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // ── 3.3 Ordenação de Colunas (A-Z / Maior para Menor) ──────────────────────
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

  // ── 3.4 Seleção Múltipla (Checkboxes) nas Abas de Catálogo ─────────────────
  const [selectedCheckedIds, setSelectedCheckedIds] = useState<Record<string, boolean>>({});

  // ── 3.5 Modal de Documentação Rápida (Guia de Regras da Mesa) ──────────────
  const [isRulesGuideOpen, setIsRulesGuideOpen] = useState<boolean>(false);

  // ── 4. Abas Comerciais de Catálogo ────────────────────────────────────────
  // Ordem oficial: pedido ➔ reposicao ➔ novidades ➔ fundo ➔ ultimo_acerto ➔ consolidado
  const [activeTab, setActiveTab] = useState<DeskTab>('pedido');

  // ── 4.1 Estado da Aba Último Acerto / Venda (Sob Demanda) ─────────────────
  const [lastOpTypeSelected, setLastOpTypeSelected] = useState<'ACERTO' | 'VENDA' | null>(null);
  const [isLoadingLastOp, setIsLoadingLastOp] = useState<boolean>(false);
  const [lastOpInvoiceMeta, setLastOpInvoiceMeta] = useState<{
    operationType: string;
    doc: string;
    date: string;
    cfop: string;
    totalUnits: number;
    totalValue: number;
    source: string;
  } | null>(null);

  // ── 4.2 Barra de Digitação Manual Dinâmica por Teclado (Aba Pedido) ────────
  const [manualQuery, setManualQuery] = useState<string>('');
  const [manualSuggestions, setManualSuggestions] = useState<any[]>([]);
  const [isSearchingManual, setIsSearchingManual] = useState<boolean>(false);
  const [showManualDropdown, setShowManualDropdown] = useState<boolean>(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number>(0);
  const [selectedManualProduct, setSelectedManualProduct] = useState<any | null>(null);
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualDiscount, setManualDiscount] = useState<number>(50.0);

  const manualSearchInputRef = useRef<HTMLInputElement | null>(null);
  const manualQtyInputRef = useRef<HTMLInputElement | null>(null);
  const manualDiscInputRef = useRef<HTMLInputElement | null>(null);
  const manualDropdownWrapperRef = useRef<HTMLDivElement | null>(null);

  // ── 5. Status da Proposta e Pipeline Customizável (Persistente por Seller) ─
  const [availableStatuses, setAvailableStatuses] = useState<SellerCustomStatus[]>(INITIAL_SELLER_STATUSES);
  const [tempStatuses, setTempStatuses] = useState<SellerCustomStatus[]>(INITIAL_SELLER_STATUSES);
  const [currentStatusId, setCurrentStatusId] = useState<string>('st-2'); // Aguardando Análise Comercial
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // ── 5.1 Estado do Modal e Envio ao Hórus ERP ─────────────────────────────
  const [isSendHorusModalOpen, setIsSendHorusModalOpen] = useState(false);
  const [isSendingToHorus, setIsSendingToHorus] = useState(false);
  const [horusSuccessResponse, setHorusSuccessResponse] = useState<{
    orderNumber: number;
    date: string;
    totalPieces: number;
    totalValue: number;
  } | null>(null);

  // ── Persistência de Configurações no LocalStorage (Por Usuário/Seller) ─────
  useEffect(() => {
    try {
      const key = getDeskStorageKey();
      const raw = localStorage.getItem(key) || localStorage.getItem('cronuz_proposal_desk_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.showDiscountInGrid === 'boolean') {
          setShowDiscountInGrid(parsed.showDiscountInGrid);
        }
        if (typeof parsed.showIsbnInGrid === 'boolean') {
          setShowIsbnInGrid(parsed.showIsbnInGrid);
        }
        if (typeof parsed.showCoverPriceInGrid === 'boolean') {
          setShowCoverPriceInGrid(parsed.showCoverPriceInGrid);
        }
        if (typeof parsed.showQuickDiscountInput === 'boolean') {
          setShowQuickDiscountInput(parsed.showQuickDiscountInput);
        }
        if (typeof parsed.hideEbooksInSearch === 'boolean') {
          setHideEbooksInSearch(parsed.hideEbooksInSearch);
        } else {
          const sharedHideEbooks = localStorage.getItem('cronuz_dbm_hide_ebooks');
          if (sharedHideEbooks !== null) {
            setHideEbooksInSearch(sharedHideEbooks === 'true');
          }
        }
        if (typeof parsed.hideOutOfPrintInSearch === 'boolean') {
          setHideOutOfPrintInSearch(parsed.hideOutOfPrintInSearch);
        }
        if (typeof parsed.clientSalesDays === 'number') {
          setClientSalesDays(parsed.clientSalesDays);
        }
        if (typeof parsed.generalSalesDays === 'number') {
          setGeneralSalesDays(parsed.generalSalesDays);
        }
        if (typeof parsed.replenishmentSalesDays === 'number') {
          setReplenishmentSalesDays(parsed.replenishmentSalesDays);
        }
        if (typeof parsed.globalDiscountInput === 'number') {
          setGlobalDiscountInput(parsed.globalDiscountInput);
          setManualDiscount(parsed.globalDiscountInput);
        }
        if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
          setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...parsed.columnWidths });
        }
        if (Array.isArray(parsed.statuses) && parsed.statuses.length > 0) {
          setAvailableStatuses(parsed.statuses);
          setTempStatuses(parsed.statuses);
        }
      }
    } catch (e) {
      console.error('Erro ao recuperar configurações salvas da mesa:', e);
    }
  }, []);

  const saveConfigToStorage = useCallback((partial: Partial<ProposalDeskConfig>) => {
    try {
      const key = getDeskStorageKey();
      const currentRaw = localStorage.getItem(key);
      const current: ProposalDeskConfig = currentRaw ? JSON.parse(currentRaw) : {
        showDiscountInGrid,
        showIsbnInGrid,
        showCoverPriceInGrid,
        showQuickDiscountInput,
        hideEbooksInSearch,
        hideOutOfPrintInSearch,
        clientSalesDays,
        generalSalesDays,
        replenishmentSalesDays,
        globalDiscountInput,
        columnWidths,
        statuses: availableStatuses
      };

      const updated = {
        ...current,
        ...partial
      };

      localStorage.setItem(key, JSON.stringify(updated));
      if (typeof updated.hideEbooksInSearch === 'boolean') {
        localStorage.setItem('cronuz_dbm_hide_ebooks', String(updated.hideEbooksInSearch));
      }
    } catch (e) {
      console.error('Erro ao gravar configurações no localStorage:', e);
    }
  }, [
    showDiscountInGrid,
    showIsbnInGrid,
    showCoverPriceInGrid,
    showQuickDiscountInput,
    hideEbooksInSearch,
    hideOutOfPrintInSearch,
    clientSalesDays,
    generalSalesDays,
    replenishmentSalesDays,
    globalDiscountInput,
    columnWidths,
    availableStatuses
  ]);

  const handleToggleColumnVisibility = (col: 'isbn' | 'cover' | 'discount') => {
    if (col === 'isbn') {
      const next = !showIsbnInGrid;
      setShowIsbnInGrid(next);
      saveConfigToStorage({ showIsbnInGrid: next });
    } else if (col === 'cover') {
      const next = !showCoverPriceInGrid;
      setShowCoverPriceInGrid(next);
      saveConfigToStorage({ showCoverPriceInGrid: next });
    } else {
      const next = !showDiscountInGrid;
      setShowDiscountInGrid(next);
      saveConfigToStorage({ showDiscountInGrid: next });
    }
  };

  // ── Redimensionamento de Colunas Estilo Excel (Drag & Save) ────────────────
  const handleStartColumnResize = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = columnWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 90;
    const startX = e.clientX;
    let lastComputedWidth = startWidth;

    resizingColRef.current = {
      key: colKey,
      startX,
      startWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const activeResize = resizingColRef.current;
      if (!activeResize) return;
      const targetKey = activeResize.key;
      const deltaX = moveEvent.clientX - activeResize.startX;
      const newWidth = Math.max(38, Math.min(600, activeResize.startWidth + deltaX));
      lastComputedWidth = newWidth;
      setColumnWidths(prev => ({
        ...prev,
        [targetKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      const activeResize = resizingColRef.current;
      resizingColRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (activeResize) {
        const finalKey = activeResize.key;
        const finalWidth = lastComputedWidth;
        setColumnWidths(prev => {
          const updated = { ...prev, [finalKey]: finalWidth };
          saveConfigToStorage({ columnWidths: updated });
          return updated;
        });
      }
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    saveConfigToStorage({ columnWidths: DEFAULT_COLUMN_WIDTHS });
    toast.success('Larguras das colunas restauradas para o padrão.');
  };

  // ── 6. Filtros Locais da Grade DBM ────────────────────────────────────────
  const [gridSearch, setGridSearch] = useState('');
  const [situationFilter, setSituationFilter] = useState<'ALL' | 'DISPONIVEL' | 'PARCIAL' | 'SEM_ESTOQUE'>('ALL');

  const activeStatus = useMemo(() => {
    return availableStatuses.find(s => s.id === currentStatusId) || availableStatuses[0];
  }, [availableStatuses, currentStatusId]);

  // ── 7. Itens da Grade DBM (Inicia VAZIO até selecionar cliente) ───────────
  const [items, setItems] = useState<DbmItem[]>([]);
  const [proposalId, setProposalId] = useState<number | null>(null);
  const [proposalLocalId, setProposalLocalId] = useState<number | null>(null);
  const [isSavingProposal, setIsSavingProposal] = useState(false);
  const urlInitializedRef = useRef(false);

  // ── 8. Controles de Layout e Navegação Estilo Access ───────────────────────
  const [isGridMaximized, setIsGridMaximized] = useState(false);
  const [showHistoryCards, setShowHistoryCards] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string>('');

  // Conversor de item da API para DbmItem da grade
  const mapApiItemToDbmItem = useCallback((raw: any, tabCat: TabCategory, defaultDisc: number): DbmItem => {
    const stock = Math.max(0, Number(raw.stockAvailable ?? raw.horusStock ?? 0));
    const reqQty = Math.max(0, Number(raw.requestedQty ?? 0));
    const appQty = reqQty > 0 ? Math.min(reqQty, stock) : 0;
    const disc = Number(raw.discountPct ?? raw.discountPercent ?? defaultDisc);
    const sit: DbmItem['situation'] = stock <= 0
      ? 'SEM_ESTOQUE'
      : (reqQty > 0 && appQty < reqQty)
        ? 'PARCIAL'
        : 'DISPONIVEL';

    return {
      id: String(raw.id || `${tabCat}-${raw.isbn}-${Math.random().toString(36).slice(2, 7)}`),
      isbn: String(raw.isbn || '').trim(),
      sku: String(raw.sku || raw.isbn || '').trim(),
      title: String(raw.title || `Item ${raw.isbn}`),
      publisher: String(raw.publisher || 'Editora'),
      subject: String(raw.subject || 'Catálogo'),
      coverPrice: Number(raw.coverPrice || 0),
      discountPercent: disc,
      requestedQty: reqQty,
      approvedQty: appQty,
      consignedQty: Number(raw.consignedBalance ?? raw.consignedQty ?? 0),
      clientSalesX: Number(raw.clientSalesPeriod ?? raw.clientSalesX ?? 0),
      horusStock: stock,
      boxUnits: Number(raw.boxQty ?? raw.boxUnits ?? 12),
      generalSales365: Number(raw.clientSales365d ?? raw.generalSales365 ?? 0),
      generalSalesX: Number(raw.generalSalesPeriod ?? raw.generalSalesX ?? 0),
      situation: sit,
      tabCategory: tabCat,
      originCategory: tabCat,
      isAddedToOrder: Boolean(raw.isAddedToOrder) || reqQty > 0,
      lastSaleQty: raw.lastOperationQty ? Number(raw.lastOperationQty) : undefined,
      lastSaleDate: raw.lastSaleDate || undefined,
      replenishmentReason: raw.replenishmentReason || undefined,
      launchDate: raw.launchDate || null,
      launchMonthYear: raw.launchMonthYear || null,
      daysToExpire: raw.daysToExpire ?? null,
      launchStatus: raw.launchStatus || null,
      launchLabel: raw.launchLabel || null,
    };
  }, []);

  // Carrega dados híbridos do cliente (4 cards + Novidades e Fundo) ao selecionar no Autocomplete
  // Se custId for vazio, carrega apenas Novidades e Fundo de Catálogo gerais do Seller
  const loadCustomerDeskData = useCallback(async (custId?: string | number, fallbackCustObj?: any, savedProposalItems?: DbmItem[]) => {
    setIsLoadingCatalog(true);
    setSelectedCheckedIds({});
    setLastOpInvoiceMeta(null);
    setLastOpTypeSelected(null);
    setReplenishmentMeta(null);

    let resolvedDisc = globalDiscountInput;

    if (!custId) {
      setCustomer(null);
      setOperationsMetrics(EMPTY_OPERATIONS_METRICS);
      setIsLoadingCustomerContext(false);
    } else {
      setIsLoadingCustomerContext(true);
      try {
        const resCtx = await fetch(`${API_URL}/dbm/proposals-desk/customer-context/${custId}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (resCtx.ok) {
          const dataCtx = await resCtx.json();
          const c = dataCtx.customer || {};
          resolvedDisc = Number(c.defaultDiscount || fallbackCustObj?.discount || globalDiscountInput || 35);
          setGlobalDiscountInput(resolvedDisc);
          setManualDiscount(resolvedDisc);
          setCustomer({
            id: c.id || custId,
            name: c.name || fallbackCustObj?.name || 'Cliente Selecionado',
            corporate_name: c.corporate_name || c.name || fallbackCustObj?.corporate_name,
            document: c.document || fallbackCustObj?.document || '—',
            nickname: c.name || fallbackCustObj?.name,
            minOrderValue: Number(c.minOrderValue ?? fallbackCustObj?.min_order_total ?? 0),
            creditLimit: Number(c.creditLimit ?? fallbackCustObj?.credit_limit ?? 0),
            openDebts: Number(c.usedCredit ?? fallbackCustObj?.open_debts ?? 0),
            overdueDebt: Number(c.overdueDebt ?? 0),
            consignedTotalUnits: Number(c.consignedTotalUnits ?? 0),
            consignedTotalValue: Number(c.consignedTotalValue ?? 0),
            paymentCondition: fallbackCustObj?.payment_condition || '30 DDL',
            commercialPolicy: c.canal || fallbackCustObj?.commercial_policy?.name || 'Tabela Comercial Padrão',
            city: c.city || fallbackCustObj?.city || '—',
            state: c.uf || fallbackCustObj?.state || '—',
            horus_cod_cli: c.horus_cod_cli || fallbackCustObj?.horus_cod_cli || '—',
            observations: c.observations || ''
          });
          if (dataCtx.operationsMetrics) {
            setOperationsMetrics(dataCtx.operationsMetrics);
          }
        } else if (fallbackCustObj) {
          setCustomer({
            id: fallbackCustObj.id,
            name: fallbackCustObj.name,
            corporate_name: fallbackCustObj.corporate_name || fallbackCustObj.name,
            document: fallbackCustObj.document || '—',
            nickname: fallbackCustObj.name,
            minOrderValue: Number(fallbackCustObj.min_order_total ?? 0),
            creditLimit: fallbackCustObj.credit_limit || 0,
            openDebts: fallbackCustObj.open_debts || 0,
            paymentCondition: fallbackCustObj.payment_condition || '30 DDL',
            commercialPolicy: fallbackCustObj.commercial_policy?.name || 'Tabela Comercial Padrão',
            city: fallbackCustObj.city || '—',
            state: fallbackCustObj.state || '—',
            horus_cod_cli: fallbackCustObj.horus_cod_cli || '—'
          });
        }
      } catch (e) {
        console.error('Erro ao carregar contexto do cliente:', e);
      } finally {
        setIsLoadingCustomerContext(false);
      }
    }

    try {
      const custQueryParam = custId ? `customer_id=${custId}&` : '';
      const resCat = await fetch(
        `${API_URL}/dbm/proposals-desk/catalog-tabs?${custQueryParam}client_sales_days=${clientSalesDays}&general_sales_days=${generalSalesDays}&limit=50&hide_ebooks=${hideEbooksInSearch}&hide_out_of_print=${hideOutOfPrintInSearch}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      if (resCat.ok) {
        const dataCat = await resCat.json();
        const savedOrderIsbns = new Set(
          (savedProposalItems || []).filter(it => it.tabCategory === 'pedido').map(it => it.isbn)
        );
        const savedByIsbn = new Map<string, DbmItem>();
        for (const sItem of (savedProposalItems || [])) {
          if (sItem.isbn && sItem.tabCategory !== 'pedido') {
            savedByIsbn.set(sItem.isbn, sItem);
          }
        }

        // Filtra estritamente horusStock > 0 e garante sem duplicidade entre Novidades e Fundo
        const usedIsbns = new Set<string>(savedOrderIsbns);
        const novList: DbmItem[] = [];
        for (const r of (dataCat.novidades || [])) {
          const mapped = mapApiItemToDbmItem(r, 'novidades', resolvedDisc);
          if (mapped.horusStock > 0 && mapped.isbn && !usedIsbns.has(mapped.isbn)) {
            usedIsbns.add(mapped.isbn);
            const savedMatch = savedByIsbn.get(mapped.isbn);
            if (savedMatch) {
              novList.push({
                ...mapped,
                requestedQty: savedMatch.requestedQty,
                approvedQty: Math.min(savedMatch.requestedQty, mapped.horusStock),
                discountPercent: savedMatch.discountPercent,
                isAddedToOrder: savedMatch.isAddedToOrder,
              });
              savedByIsbn.delete(mapped.isbn);
            } else {
              novList.push(mapped);
            }
          }
        }
        const fndList: DbmItem[] = [];
        for (const r of (dataCat.fundo || [])) {
          const mapped = mapApiItemToDbmItem(r, 'fundo', resolvedDisc);
          if (mapped.horusStock > 0 && mapped.isbn && !usedIsbns.has(mapped.isbn)) {
            usedIsbns.add(mapped.isbn);
            const savedMatch = savedByIsbn.get(mapped.isbn);
            if (savedMatch) {
              fndList.push({
                ...mapped,
                requestedQty: savedMatch.requestedQty,
                approvedQty: Math.min(savedMatch.requestedQty, mapped.horusStock),
                discountPercent: savedMatch.discountPercent,
                isAddedToOrder: savedMatch.isAddedToOrder,
              });
              savedByIsbn.delete(mapped.isbn);
            } else {
              fndList.push(mapped);
            }
          }
        }

        const savedPedidoOnly = (savedProposalItems || []).filter(it => it.tabCategory === 'pedido');
        const remainingSavedOther = Array.from(savedByIsbn.values());
        setItems([...savedPedidoOnly, ...remainingSavedOther, ...novList, ...fndList]);
      } else {
        let errDetail = `HTTP ${resCat.status}`;
        try {
          const errJson = await resCat.json();
          errDetail = errJson?.detail || errJson?.message || errDetail;
        } catch {
          // ignore
        }
        toast.error(`Falha ao carregar abas de catálogo (${errDetail})`);
        setItems(savedProposalItems || []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Erro ao carregar abas de catálogo:', e);
      toast.error(`Erro ao carregar abas de catálogo (${msg})`);
      setItems(savedProposalItems || []);
    } finally {
      setIsLoadingCatalog(false);
      setTimeout(() => {
        manualSearchInputRef.current?.focus();
      }, 150);
    }
  }, [clientSalesDays, generalSalesDays, globalDiscountInput, hideEbooksInSearch, hideOutOfPrintInSearch, mapApiItemToDbmItem]);

  // Inicializa cliente ou proposta salva via parâmetros da URL (?customer_id= ou ?proposal_id=)
  useEffect(() => {
    if (urlInitializedRef.current || typeof window === 'undefined') return;
    urlInitializedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const propIdParam = params.get('proposal_id');
    const custIdParam = params.get('customer_id');

    if (propIdParam) {
      (async () => {
        try {
          const res = await fetch(`${API_URL}/dbm/proposals/${propIdParam}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
          });
          if (res.ok) {
            const p = await res.json();
            setProposalId(p.id);
            setProposalLocalId(p.local_id || p.id);
            if (p.status_id) {
              setCurrentStatusId(p.status_id);
            }
            const restoredItems: DbmItem[] = Array.isArray(p.items) ? p.items : [];
            if (p.customer_id) {
              setSelectedCustomerId(String(p.customer_id));
              await loadCustomerDeskData(p.customer_id, undefined, restoredItems);
              if (restoredItems.length > 0) {
                setActiveTab('consolidado');
              }
            }
          }
        } catch (err) {
          console.error('Erro ao abrir proposta salva:', err);
        }
      })();
    } else if (custIdParam) {
      setSelectedCustomerId(String(custIdParam));
      loadCustomerDeskData(custIdParam);
    } else {
      loadCustomerDeskData('');
    }
  }, [loadCustomerDeskData]);

  // ── 4.3 Busca Sob Demanda da Aba REPOSIÇÃO (Consignado API + Histórico de Vendas nos Últimos X Dias) ─
  const handleFetchReplenishment = async () => {
    if (!customer?.id) {
      toast.error('Selecione um cliente primeiro para buscar itens de reposição.');
      return;
    }

    setIsLoadingReplenishment(true);
    try {
      // Coleta ISBNs que já estão no Pedido ou em Novidades para não repetir
      const existingIsbns = items
        .filter(it => it.tabCategory === 'pedido' || it.tabCategory === 'novidades')
        .map(it => it.isbn)
        .filter(Boolean)
        .join(',');

      const res = await fetch(
        `${API_URL}/dbm/proposals-desk/replenishment-items?customer_id=${customer.id}&replenishment_sales_days=${replenishmentSalesDays}&client_sales_days=${clientSalesDays}&general_sales_days=${generalSalesDays}&hide_ebooks=${hideEbooksInSearch}&hide_out_of_print=${hideOutOfPrintInSearch}&exclude_isbns=${encodeURIComponent(existingIsbns)}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      if (!res.ok) {
        let errorDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) {
            errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          } else if (errJson?.message) {
            errorDetail = errJson.message;
          }
        } catch {
          const errText = await res.text().catch(() => '');
          if (errText) errorDetail = `HTTP ${res.status}: ${errText.slice(0, 180)}`;
        }
        throw new Error(`Falha ao buscar itens de reposição (${errorDetail})`);
      }
      const data = await res.json();
      const loadedRep: DbmItem[] = (data.items || [])
        .map((r: any) => mapApiItemToDbmItem(r, 'reposicao', globalDiscountInput))
        .filter((it: DbmItem) => it.horusStock > 0);

      setReplenishmentMeta({
        consignedCount: Number(data.consignedItemsCount ?? data.consignedCount ?? 0),
        consignedFromApiCount: Number(data.consignedFromApiCount ?? 0),
        consignedFromSqlCount: Number(data.consignedFromSqlCount ?? 0),
        salesHistoryCount: Number(data.soldInWindowCount ?? data.salesHistoryCount ?? 0),
        days: Number(data.replenishmentSalesDays || replenishmentSalesDays),
        apiDiagnostic: data.apiDiagnostic || null,
        sqlDiagnostic: data.sqlDiagnostic || null,
      });

      setItems(prev => {
        // Preserva itens de reposição que já tinham sido adicionados ao pedido pelo usuário
        const keptAddedRep = prev.filter(it => it.tabCategory === 'reposicao' && it.isAddedToOrder);
        const keptIsbns = new Set(keptAddedRep.map(it => it.isbn));
        const otherTabs = prev.filter(it => it.tabCategory !== 'reposicao');
        const otherOccupiedIsbns = new Set(
          otherTabs
            .filter(it => it.tabCategory === 'pedido' || it.tabCategory === 'novidades')
            .map(it => it.isbn)
        );

        const freshRep = loadedRep.filter(
          it => !keptIsbns.has(it.isbn) && !otherOccupiedIsbns.has(it.isbn)
        );
        const repAllIsbns = new Set([...Array.from(keptIsbns), ...freshRep.map(it => it.isbn)]);

        // Garante que itens carregados em Reposição não fiquem duplicados em Fundo ou Último Acerto
        const deduplicatedOthers = otherTabs.filter(it => {
          if ((it.tabCategory === 'fundo' || it.tabCategory === 'ultimo_acerto') && !it.isAddedToOrder) {
            return !repAllIsbns.has(it.isbn);
          }
          return true;
        });

        return [...deduplicatedOthers, ...keptAddedRep, ...freshRep];
      });

      if (loadedRep.length > 0) {
        const consigOriginLabel = Number(data.consignedFromApiCount || 0) > 0
          ? `Consignado API: ${data.consignedFromApiCount}`
          : `Consignado BD: ${data.consignedFromSqlCount || 0}`;
        toast.success(
          `${loadedRep.length} itens carregados na Reposição (${consigOriginLabel} • Vendas ${replenishmentSalesDays}d: ${data.soldInWindowCount || 0}).`
        );
      } else {
        toast.info(
          `Nenhum item com saldo disponível encontrado no consignado ou histórico dos últimos ${replenishmentSalesDays} dias (que já não esteja no Pedido/Novidades).`
        );
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao buscar itens de reposição.');
    } finally {
      setIsLoadingReplenishment(false);
    }
  };

  // Busca sob demanda de Último Acerto (CFOP 5113/5114/6113/6114) ou Última Venda
  const handleFetchLastOperation = async (opType: 'ACERTO' | 'VENDA') => {
    if (!customer?.id) {
      toast.error('Selecione um cliente primeiro para buscar os itens da última operação.');
      return;
    }
    setLastOpTypeSelected(opType);
    setIsLoadingLastOp(true);
    try {
      const existingIsbns = items
        .filter(it => it.tabCategory !== 'ultimo_acerto')
        .map(it => it.isbn)
        .filter(Boolean)
        .join(',');

      const res = await fetch(
        `${API_URL}/dbm/proposals-desk/last-operation-items?customer_id=${customer.id}&operation_type=${opType}&client_sales_days=${clientSalesDays}&general_sales_days=${generalSalesDays}&hide_ebooks=${hideEbooksInSearch}&hide_out_of_print=${hideOutOfPrintInSearch}&exclude_isbns=${encodeURIComponent(existingIsbns)}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      if (!res.ok) {
        let errorDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) {
            errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          } else if (errJson?.message) {
            errorDetail = errJson.message;
          }
        } catch {
          const errText = await res.text().catch(() => '');
          if (errText) errorDetail = `HTTP ${res.status}: ${errText.slice(0, 180)}`;
        }
        throw new Error(`Falha ao consultar última operação (${errorDetail})`);
      }
      const data = await res.json();
      setLastOpInvoiceMeta(data.invoice || null);
      const loadedItems: DbmItem[] = (data.items || [])
        .map((r: any) => {
          const mapped = mapApiItemToDbmItem(r, 'ultimo_acerto', globalDiscountInput);
          if (data.invoice?.date && data.invoice.date !== '—') {
            mapped.lastSaleDate = data.invoice.date;
          }
          return mapped;
        })
        .filter((it: DbmItem) => it.horusStock > 0);

      setItems(prev => {
        const withoutLastOp = prev.filter(it => it.tabCategory !== 'ultimo_acerto');
        const occupiedIsbns = new Set(withoutLastOp.map(it => it.isbn));
        const uniqueLoaded = loadedItems.filter(it => !occupiedIsbns.has(it.isbn));
        return [...withoutLastOp, ...uniqueLoaded];
      });

      if (loadedItems.length > 0) {
        toast.success(`${loadedItems.length} itens com estoque carregados (${opType === 'ACERTO' ? 'Último Acerto' : 'Última Venda'} • ${data.invoice?.doc || ''})`);
      } else {
        toast.info(`Nenhum item inédito com saldo em estoque encontrado na última nota de ${opType === 'ACERTO' ? 'Acerto (CFOP 5113/5114/6113/6114)' : 'Venda'}.`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao buscar itens da última operação.');
    } finally {
      setIsLoadingLastOp(false);
    }
  };

  // Autocomplete da Barra de Digitação Manual por Teclado
  useEffect(() => {
    if (!customer?.id) return;
    const term = manualQuery.trim();
    if (term.length < 2 || (selectedManualProduct && (term === selectedManualProduct.isbn || term === `${selectedManualProduct.isbn} - ${selectedManualProduct.title}`))) {
      setManualSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingManual(true);
      try {
        const res = await fetch(
          `${API_URL}/dbm/proposals-desk/product-lookup?q=${encodeURIComponent(term)}&customer_id=${customer.id}&client_sales_days=${clientSalesDays}&general_sales_days=${generalSalesDays}&hide_ebooks=${hideEbooksInSearch}&hide_out_of_print=${hideOutOfPrintInSearch}&limit=12`,
          { headers: { 'Authorization': `Bearer ${getToken()}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const list = data.items || [];
          setManualSuggestions(list);
          setSelectedSuggestionIdx(0);
          setShowManualDropdown(list.length > 0);
        }
      } catch (e) {
        console.error('Erro no lookup manual de produto:', e);
      } finally {
        setIsSearchingManual(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [manualQuery, customer?.id, clientSalesDays, generalSalesDays, selectedManualProduct]);

  // Fecha dropdown manual ao clicar fora
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (manualDropdownWrapperRef.current && !manualDropdownWrapperRef.current.contains(e.target as Node)) {
        setShowManualDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelectManualSuggestion = (prod: any) => {
    setSelectedManualProduct(prod);
    setManualQuery(`${prod.isbn} - ${prod.title}`);
    setShowManualDropdown(false);
    if (prod.discountPct && prod.discountPct > 0) {
      setManualDiscount(Number(prod.discountPct));
    }
    setTimeout(() => {
      manualQtyInputRef.current?.focus();
      manualQtyInputRef.current?.select();
    }, 20);
  };

  const handleAddManualProductToOrder = async () => {
    if (!customer?.id) {
      toast.error('Selecione o cliente antes de digitar itens no pedido.');
      return;
    }

    let prodToUse = selectedManualProduct;

    if (!prodToUse && manualQuery.trim().length >= 2) {
      if (manualSuggestions.length > 0) {
        prodToUse = manualSuggestions[selectedSuggestionIdx] || manualSuggestions[0];
      } else {
        try {
          setIsSearchingManual(true);
          const res = await fetch(
            `${API_URL}/dbm/proposals-desk/product-lookup?q=${encodeURIComponent(manualQuery.trim())}&customer_id=${customer.id}&client_sales_days=${clientSalesDays}&general_sales_days=${generalSalesDays}&hide_ebooks=${hideEbooksInSearch}&hide_out_of_print=${hideOutOfPrintInSearch}&limit=5`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.items && data.items.length > 0) {
              prodToUse = data.items[0];
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsSearchingManual(false);
        }
      }
    }

    if (!prodToUse) {
      toast.warning('Nenhum produto localizado para o código/título informado.');
      manualSearchInputRef.current?.focus();
      return;
    }

    const qtyToAdd = Math.max(1, Number(manualQty) || 1);
    const discToApply = Math.min(100, Math.max(0, Number(manualDiscount) || globalDiscountInput || 0));
    const targetIsbn = String(prodToUse.isbn || '').trim();

    setItems(prev => {
      // Remove este ISBN de qualquer outra aba de catálogo para manter exclusividade estrita
      const cleanedPrev = prev.filter(it => !(it.tabCategory !== 'pedido' && it.isbn === targetIsbn));

      const existingPedidoIdx = cleanedPrev.findIndex(
        it => it.tabCategory === 'pedido' && it.isbn === targetIsbn
      );
      if (existingPedidoIdx >= 0) {
        const updated = [...cleanedPrev];
        const cur = updated[existingPedidoIdx];
        const nextReq = cur.requestedQty + qtyToAdd;
        const nextApp = Math.min(nextReq, cur.horusStock);
        updated[existingPedidoIdx] = {
          ...cur,
          requestedQty: nextReq,
          approvedQty: nextApp,
          discountPercent: discToApply,
          isAddedToOrder: true,
          situation: nextApp === 0 ? 'SEM_ESTOQUE' : nextApp < nextReq ? 'PARCIAL' : 'DISPONIVEL'
        };
        setSelectedRowId(cur.id);
        return updated;
      } else {
        const newItem = mapApiItemToDbmItem(
          {
            ...prodToUse,
            requestedQty: qtyToAdd,
            discountPct: discToApply,
          },
          'pedido',
          discToApply
        );
        newItem.id = `ped-man-${prodToUse.isbn}-${Date.now()}`;
        newItem.isAddedToOrder = true;
        setSelectedRowId(newItem.id);
        return [newItem, ...cleanedPrev];
      }
    });

    setSelectedManualProduct(null);
    setManualQuery('');
    setManualSuggestions([]);
    setShowManualDropdown(false);
    setManualQty(1);
    setTimeout(() => {
      manualSearchInputRef.current?.focus();
    }, 20);
  };

  // ── 8. Exclusividade Estrita Entre Abas + Filtro de Estoque (> 0 exceto Pedido) ──
  // Regra 3 e Regra 6:
  // - Itens em 'pedido' NUNCA se repetem em 'reposicao', 'novidades', 'fundo' ou 'ultimo_acerto'.
  // - Itens em 'novidades' não se repetem em 'reposicao', 'fundo' ou 'ultimo_acerto'.
  // - Itens em 'reposicao' não se repetem em 'fundo' ou 'ultimo_acerto'.
  // - Itens em 'fundo' não se repetem em 'ultimo_acerto'.
  // - Em 'reposicao', 'novidades', 'fundo' e 'ultimo_acerto', NUNCA exibe itens com saldo estoque zerado (horusStock <= 0).
  const exclusiveItemsByTab = useMemo(() => {
    const claimedIsbns = new Set<string>();

    const pedidoList: DbmItem[] = [];
    for (const it of items) {
      if (it.tabCategory === 'pedido') {
        if (it.isbn) claimedIsbns.add(it.isbn);
        pedidoList.push(it);
      }
    }

    const novidadesList: DbmItem[] = [];
    for (const it of items) {
      if (it.tabCategory === 'novidades' && it.horusStock > 0) {
        if (it.isbn && claimedIsbns.has(it.isbn)) continue;
        if (it.isbn) claimedIsbns.add(it.isbn);
        novidadesList.push(it);
      }
    }

    const reposicaoList: DbmItem[] = [];
    for (const it of items) {
      if (it.tabCategory === 'reposicao' && it.horusStock > 0) {
        if (it.isbn && claimedIsbns.has(it.isbn)) continue;
        if (it.isbn) claimedIsbns.add(it.isbn);
        reposicaoList.push(it);
      }
    }

    const fundoList: DbmItem[] = [];
    for (const it of items) {
      if (it.tabCategory === 'fundo' && it.horusStock > 0) {
        if (it.isbn && claimedIsbns.has(it.isbn)) continue;
        if (it.isbn) claimedIsbns.add(it.isbn);
        fundoList.push(it);
      }
    }

    const ultimoAcertoList: DbmItem[] = [];
    for (const it of items) {
      if (it.tabCategory === 'ultimo_acerto' && it.horusStock > 0) {
        if (it.isbn && claimedIsbns.has(it.isbn)) continue;
        if (it.isbn) claimedIsbns.add(it.isbn);
        ultimoAcertoList.push(it);
      }
    }

    // Consolidado reúne todos os itens do Pedido + todos os itens adicionados das outras abas
    const allExclusive = [
      ...pedidoList,
      ...reposicaoList,
      ...novidadesList,
      ...fundoList,
      ...ultimoAcertoList,
    ];

    const consolidadoList = allExclusive.filter(
      it => it.tabCategory === 'pedido' || it.isAddedToOrder === true
    );

    return {
      pedido: pedidoList,
      reposicao: reposicaoList,
      novidades: novidadesList,
      fundo: fundoList,
      ultimo_acerto: ultimoAcertoList,
      consolidado: consolidadoList,
    };
  }, [items]);

  const proposalItems = exclusiveItemsByTab.consolidado;

  // Itens da aba ativa + Filtros + Ordenação clicável em qualquer coluna
  const activeItems = useMemo(() => {
    const baseList = exclusiveItemsByTab[activeTab] || [];

    const filtered = baseList.filter(item => {
      if (situationFilter !== 'ALL' && item.situation !== situationFilter) return false;
      if (gridSearch.trim()) {
        const q = gridSearch.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.isbn.toLowerCase().includes(q) ||
          item.subject.toLowerCase().includes(q) ||
          item.publisher.toLowerCase().includes(q) ||
          (item.notes && item.notes.toLowerCase().includes(q))
        );
      }
      return true;
    });

    if (!sortConfig) return filtered;

    const { key, direction } = sortConfig;
    const dirMultiplier = direction === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (key === 'title' || key === 'subject' || key === 'isbn' || key === 'situation' || key === 'originCategory') {
        const valA = String(
          key === 'originCategory' ? (a.originCategory || a.tabCategory) : a[key] || ''
        ).toLowerCase();
        const valB = String(
          key === 'originCategory' ? (b.originCategory || b.tabCategory) : b[key] || ''
        ).toLowerCase();
        return valA.localeCompare(valB, 'pt-BR', { numeric: true }) * dirMultiplier;
      }

      const getNum = (item: DbmItem): number => {
        const net = item.coverPrice * (1 - item.discountPercent / 100);
        switch (key) {
          case 'coverPrice': return item.coverPrice;
          case 'discountPercent': return item.discountPercent;
          case 'netPrice': return net;
          case 'requestedQty': return item.requestedQty;
          case 'subtotal': return net * item.approvedQty;
          case 'consignedQty': return item.consignedQty;
          case 'clientSalesX': return item.clientSalesX;
          case 'horusStock': return item.horusStock;
          case 'boxUnits': return item.boxUnits;
          case 'generalSales365': return item.generalSales365;
          case 'generalSalesX': return item.generalSalesX;
          default: return 0;
        }
      };

      return (getNum(a) - getNum(b)) * dirMultiplier;
    });
  }, [exclusiveItemsByTab, activeTab, situationFilter, gridSearch, sortConfig]);

  const handleSortColumn = (key: SortKey) => {
    const isTextCol = key === 'title' || key === 'subject' || key === 'isbn' || key === 'situation' || key === 'originCategory';
    setSortConfig(prev => {
      if (!prev || prev.key !== key) {
        // Texto começa A->Z ('asc'), números começam Maior->Menor ('desc')
        return { key, direction: isTextCol ? 'asc' : 'desc' };
      }
      if (prev.direction === (isTextCol ? 'asc' : 'desc')) {
        return { key, direction: isTextCol ? 'desc' : 'asc' };
      }
      return null; // 3º clique limpa ordenação
    });
  };

  const renderSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ChevronsUpDown className="h-2.5 w-2.5 opacity-35 group-hover:opacity-80 shrink-0" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
    ) : (
      <ChevronDown className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
    );
  };

  const summary = useMemo(() => {
    let totalCover = 0;
    let totalNet = 0;
    let totalRequestedPieces = 0;
    let totalApprovedPieces = 0;

    for (const it of proposalItems) {
      const netUnit = it.coverPrice * (1 - it.discountPercent / 100);
      totalCover += it.coverPrice * it.approvedQty;
      totalNet += netUnit * it.approvedQty;
      totalRequestedPieces += it.requestedQty;
      totalApprovedPieces += it.approvedQty;
    }

    const minOrder = customer?.minOrderValue || 0;
    const diffToMin = minOrder - totalNet;
    const minOrderReached = totalNet >= minOrder;
    const averageDiscount = totalCover > 0 ? ((totalCover - totalNet) / totalCover) * 100 : 0;

    return {
      totalCover,
      totalNet,
      totalRequestedPieces,
      totalApprovedPieces,
      minOrder,
      diffToMin,
      minOrderReached,
      averageDiscount
    };
  }, [proposalItems, customer]);

  // ── 9. Ações da Grade DBM ─────────────────────────────────────────────────
  const handleAnalyzeOrder = async () => {
    if (!customer) {
      alert('Selecione um cliente antes de analisar ou importar itens para o pedido.');
      return;
    }

    if ((intakeSource === 'pdf' || intakeSource === 'excel') && !uploadedFile) {
      alert(
        intakeSource === 'pdf'
          ? 'Selecione um arquivo PDF antes de clicar em Analisar e Carregar na Grade.'
          : 'Selecione uma planilha (.xlsx, .xls ou .csv) antes de clicar em Analisar e Carregar na Grade.'
      );
      return;
    }

    if (intakeSource === 'text' && !rawText.trim()) {
      alert('Cole o texto com os ISBNs e quantidades antes de clicar em Analisar e Carregar na Grade.');
      return;
    }

    if (uploadedFile && uploadedFile.size > 10 * 1024 * 1024) {
      alert('O arquivo excede o limite máximo permitido de 10 MB para importação.');
      return;
    }

    setIsAnalysing(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('customer_id', String(customer.id));
      formData.append('client_sales_days', String(clientSalesDays));
      formData.append('general_sales_days', String(generalSalesDays));
      formData.append('default_discount', String(globalDiscountInput || 40));

      if ((intakeSource === 'pdf' || intakeSource === 'excel') && uploadedFile) {
        formData.append('file', uploadedFile);
      } else {
        formData.append('raw_text', rawText);
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dbm/proposals-desk/import-order`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || 'Falha ao processar o arquivo enviado.');
        return;
      }

      const data = await res.json();
      const rawItems: any[] = data.items || [];

      if (rawItems.length === 0) {
        alert(data.message || 'Nenhum ISBN de 10 ou 13 dígitos foi localizado no arquivo/texto enviado.');
        return;
      }

      const importedDbmItems: DbmItem[] = rawItems.map((raw, idx) => {
        const mapped = mapApiItemToDbmItem(raw, 'pedido', globalDiscountInput || 40);
        const reqQty = Math.max(1, Number(raw.requestedQty ?? 1));
        const approved = Math.min(reqQty, mapped.horusStock);
        const foundInCat = raw.foundInCatalog !== false;
        return {
          ...mapped,
          id: `imp-${mapped.isbn}-${Date.now()}-${idx}`,
          tabCategory: 'pedido',
          originCategory: 'pedido',
          isAddedToOrder: true,
          requestedQty: reqQty,
          approvedQty: approved,
          discountPercent: Number(raw.discountPct ?? globalDiscountInput ?? 40),
          situation: !foundInCat || approved === 0 ? 'SEM_ESTOQUE' : approved < reqQty ? 'PARCIAL' : 'DISPONIVEL',
          notes: !foundInCat ? 'Não localizado no acervo' : mapped.notes,
        };
      });

      const importedIsbnSet = new Set(importedDbmItems.map(it => it.isbn));

      setItems(prev => {
        // Regra 3: Qualquer item que entrou no Pedido é removido das demais abas (Novidades, Reposição, Fundo, Último Acerto)
        const updated = prev.filter(it => !(it.tabCategory !== 'pedido' && importedIsbnSet.has(it.isbn)));
        const toPrepend: DbmItem[] = [];

        for (const imp of importedDbmItems) {
          const existingIdx = updated.findIndex(
            it => it.tabCategory === 'pedido' && it.isbn === imp.isbn
          );
          if (existingIdx >= 0) {
            const curr = updated[existingIdx];
            const newReq = curr.requestedQty + imp.requestedQty;
            const newApp = Math.min(newReq, curr.horusStock);
            updated[existingIdx] = {
              ...curr,
              requestedQty: newReq,
              approvedQty: newApp,
              isAddedToOrder: true,
              situation: newApp === 0 ? 'SEM_ESTOQUE' : newApp < newReq ? 'PARCIAL' : 'DISPONIVEL',
            };
          } else {
            toPrepend.push(imp);
          }
        }

        return [...toPrepend, ...updated];
      });

      toast.success(`${importedDbmItems.length} itens importados para o Pedido (e removidos das abas de sugestão para evitar duplicidade).`);
      setIsIntakeDrawerOpen(false);
      setActiveTab('pedido');
    } catch (e) {
      console.error('Erro ao analisar pedido:', e);
      alert('Ocorreu um erro ao importar o pedido. Verifique o arquivo e tente novamente.');
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleUpdateItemQty = (id: string, newQty: number) => {
    const cleanQty = Math.max(0, newQty);
    setItems(prev => prev.map(it => {
      if (it.id === id) {
        const approved = Math.min(cleanQty, it.horusStock);
        // Preserva isAddedToOrder caso já tenha sido adicionado (mesmo com Qtd = 0)
        // Se digitou quantidade > 0 em uma aba de catálogo, também marca como adicionado
        const addedFlag = it.tabCategory === 'pedido' || it.isAddedToOrder === true || cleanQty > 0;
        return {
          ...it,
          requestedQty: cleanQty,
          approvedQty: approved,
          isAddedToOrder: addedFlag,
          situation: it.horusStock <= 0
            ? 'SEM_ESTOQUE'
            : (cleanQty > 0 && approved < cleanQty)
              ? 'PARCIAL'
              : 'DISPONIVEL'
        };
      }
      return it;
    }));
  };

  const handleUpdateItemDiscount = (id: string, newDiscount: number) => {
    setItems(prev => prev.map(it => {
      if (it.id === id) {
        return { ...it, discountPercent: Math.min(100, Math.max(0, newDiscount)) };
      }
      return it;
    }));
  };

  const handleApplyGlobalDiscount = (discount: number) => {
    const clamped = Math.min(100, Math.max(0, discount));
    setGlobalDiscountInput(clamped);
    saveConfigToStorage({ globalDiscountInput: clamped });
    setItems(prev => prev.map(it => ({
      ...it,
      discountPercent: clamped
    })));
  };

  // Remove do Pedido Consolidado (ou desmarca "Adicionado")
  const handleRemoveItem = (id: string) => {
    const target = items.find(it => it.id === id);
    if (!target) return;

    if (target.tabCategory === 'pedido') {
      setItems(prev => prev.filter(it => it.id !== id));
    } else {
      setItems(prev => prev.map(it => {
        if (it.id === id) {
          return {
            ...it,
            isAddedToOrder: false,
            requestedQty: 0,
            approvedQty: 0,
            situation: it.horusStock > 0 ? 'DISPONIVEL' : 'SEM_ESTOQUE'
          };
        }
        return it;
      }));
    }
  };

  // Regra 11: Sempre que adicionar item de Reposição, Novidades, Fundo ou Último Acerto,
  // marca que já foi adicionado ao pedido (isAddedToOrder: true) e envia com QUANTIDADE ZERADA (requestedQty: 0)
  const handleAddCatalogItemToOrder = (item: DbmItem) => {
    setItems(prev => prev.map(it => {
      if (it.id === item.id) {
        return {
          ...it,
          isAddedToOrder: true,
          requestedQty: 0,
          approvedQty: 0,
          situation: it.horusStock > 0 ? 'DISPONIVEL' : 'SEM_ESTOQUE'
        };
      }
      return it;
    }));
  };

  // Regra 9 & 11: Botão Único "Adicionar" nas abas Reposição, Novidades, Fundo e Último Acerto
  // Adiciona todos os itens selecionados (checkboxes) ou a linha ativa com quantidade 0 e coloca no Consolidado
  const isCatalogSearchTab = CATALOG_SEARCH_TABS.includes(activeTab);

  const checkedIdsInActiveTab = useMemo(() => {
    if (!isCatalogSearchTab) return [];
    return activeItems.filter(it => selectedCheckedIds[it.id]).map(it => it.id);
  }, [activeItems, selectedCheckedIds, isCatalogSearchTab]);

  const isAllActiveTabChecked = useMemo(() => {
    if (!isCatalogSearchTab || activeItems.length === 0) return false;
    return activeItems.every(it => Boolean(selectedCheckedIds[it.id]));
  }, [activeItems, selectedCheckedIds, isCatalogSearchTab]);

  const handleToggleSelectAllActiveTab = () => {
    if (!isCatalogSearchTab || activeItems.length === 0) return;
    if (isAllActiveTabChecked) {
      setSelectedCheckedIds(prev => {
        const next = { ...prev };
        for (const it of activeItems) {
          delete next[it.id];
        }
        return next;
      });
    } else {
      setSelectedCheckedIds(prev => {
        const next = { ...prev };
        for (const it of activeItems) {
          next[it.id] = true;
        }
        return next;
      });
    }
  };

  const handleToggleRowCheckbox = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedCheckedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleBatchAddSelectedToOrder = () => {
    if (!isCatalogSearchTab) return;
    const targetIds = checkedIdsInActiveTab.length > 0
      ? checkedIdsInActiveTab
      : (selectedRowId && activeItems.some(it => it.id === selectedRowId) ? [selectedRowId] : []);

    if (targetIds.length === 0) {
      toast.warning('Selecione ao menos um item (ou marque todos) para adicionar ao pedido.');
      return;
    }

    const idSet = new Set(targetIds);
    setItems(prev => prev.map(it => {
      if (idSet.has(it.id)) {
        // Se já estava adicionado com quantidade > 0, mantém a quantidade; caso contrário entra com Qtd = 0 (Regra 11)
        const nextReq = it.isAddedToOrder && it.requestedQty > 0 ? it.requestedQty : 0;
        const nextApp = Math.min(nextReq, it.horusStock);
        return {
          ...it,
          isAddedToOrder: true,
          requestedQty: nextReq,
          approvedQty: nextApp,
          situation: it.horusStock > 0 ? 'DISPONIVEL' : 'SEM_ESTOQUE',
        };
      }
      return it;
    }));

    // Limpa seleção dos checkboxes da aba após adicionar
    setSelectedCheckedIds(prev => {
      const next = { ...prev };
      for (const id of targetIds) {
        delete next[id];
      }
      return next;
    });

    toast.success(
      `${targetIds.length} ${targetIds.length === 1 ? 'item adicionado' : 'itens adicionados'} ao Pedido Consolidado (com Qtd 0 pronta para preenchimento).`
    );
  };

  // Regra 10: Ao selecionar a linha (ou marcar itens) e apertar DELETE nas abas
  // Novidades, Reposição, Último Acerto ou Fundo, elimina o item daquela pesquisa.
  const handleEliminateFromSearchTab = useCallback((idsToDelete: string[]) => {
    if (idsToDelete.length === 0) return;
    const delSet = new Set(idsToDelete);

    const currentIdx = activeItems.findIndex(it => delSet.has(it.id));
    const remainingInView = activeItems.filter(it => !delSet.has(it.id));
    const nextSelected = remainingInView[Math.min(currentIdx, remainingInView.length - 1)]?.id || '';

    setItems(prev => prev.filter(it => !delSet.has(it.id)));
    setSelectedCheckedIds(prev => {
      const next = { ...prev };
      for (const id of idsToDelete) delete next[id];
      return next;
    });
    setSelectedRowId(nextSelected);
    toast.info(
      `${idsToDelete.length} ${idsToDelete.length === 1 ? 'item eliminado' : 'itens eliminados'} desta pesquisa.`
    );
  }, [activeItems]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      if (!CATALOG_SEARCH_TABS.includes(activeTab)) return;

      // Ignora se o foco estiver dentro de um input, textarea ou select editável
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        const isCheckbox = tag === 'input' && (activeEl as HTMLInputElement).type === 'checkbox';
        if ((tag === 'input' && !isCheckbox) || tag === 'textarea' || tag === 'select' || activeEl.isContentEditable) {
          return;
        }
      }

      const targets = checkedIdsInActiveTab.length > 0
        ? checkedIdsInActiveTab
        : (selectedRowId && activeItems.some(it => it.id === selectedRowId) ? [selectedRowId] : []);

      if (targets.length > 0) {
        e.preventDefault();
        handleEliminateFromSearchTab(targets);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, checkedIdsInActiveTab, selectedRowId, activeItems, handleEliminateFromSearchTab]);

  const getOriginBadge = (origin: TabCategory | undefined, tabCategory: TabCategory) => {
    const cat = origin || tabCategory;
    switch (cat) {
      case 'pedido':
        return { label: 'Pedido', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700' };
      case 'reposicao':
        return { label: 'Reposição', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' };
      case 'novidades':
        return { label: 'Novidade', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' };
      case 'fundo':
        return { label: 'Fundo', bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-800 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800' };
      case 'ultimo_acerto':
        return { label: 'Últ. Acerto/Venda', bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' };
      default:
        return { label: 'Catálogo', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200' };
    }
  };

  // Navegação no estilo Excel/Access: Setas para Cima/Baixo, Tab e Enter
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: 'discount' | 'qty',
    totalRows: number
  ) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextIndex = (rowIndex + 1) % totalRows;
      const nextInput = document.getElementById(`cell-${field}-${nextIndex}`) as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (rowIndex - 1 + totalRows) % totalRows;
      const prevInput = document.getElementById(`cell-${field}-${prevIndex}`) as HTMLInputElement | null;
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    } else if (e.key === 'ArrowRight' && field === 'discount') {
      const input = e.currentTarget;
      if (input.selectionStart === input.value.length) {
        e.preventDefault();
        const qtyInput = document.getElementById(`cell-qty-${rowIndex}`) as HTMLInputElement | null;
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }
    } else if (e.key === 'ArrowLeft' && field === 'qty') {
      const input = e.currentTarget;
      if (input.selectionStart === 0) {
        e.preventDefault();
        const discountInput = document.getElementById(`cell-discount-${rowIndex}`) as HTMLInputElement | null;
        if (discountInput) {
          discountInput.focus();
          discountInput.select();
        }
      }
    }
  };

  const handleExportConsolidatedExcel = () => {
    if (proposalItems.length === 0) {
      toast.warning('Não há itens no Pedido Consolidado para exportar.');
      return;
    }

    const rows = proposalItems.map((it) => {
      const originBadge = getOriginBadge(it.originCategory, it.tabCategory);
      const qty = it.requestedQty > 0 ? it.requestedQty : it.approvedQty;
      return {
        ISBN: it.isbn || '',
        Título: it.title || '',
        Quantidade: Number(qty || 0),
        Assunto: it.subject || '',
        Origem: originBadge.label,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 18 }, // ISBN
      { wch: 46 }, // Título
      { wch: 12 }, // Quantidade
      { wch: 24 }, // Assunto
      { wch: 18 }, // Origem
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pedido Consolidado');

    const custSlug = (customer?.name || 'Cliente')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 28);
    const numLabel = proposalLocalId || proposalId || 'Novo';
    XLSX.writeFile(workbook, `Pedido_Consolidado_DBM_${numLabel}_${custSlug}.xlsx`);
    toast.success('Planilha Excel do Pedido Consolidado gerada com sucesso!');
  };

  const handleNewProposalInDesk = () => {
    setProposalId(null);
    setProposalLocalId(null);
    setSelectedCustomerId('');
    setCustomer(null);
    setOperationsMetrics(EMPTY_OPERATIONS_METRICS);
    setSelectedCheckedIds({});
    setSelectedRowId('');
    setLastOpInvoiceMeta(null);
    setLastOpTypeSelected(null);
    setReplenishmentMeta(null);
    setManualQuery('');
    setManualSuggestions([]);
    setSelectedManualProduct(null);
    setActiveTab('pedido');
    if (availableStatuses.length > 0) {
      setCurrentStatusId(availableStatuses[0].id);
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/proposals/desk');
    }
    loadCustomerDeskData('');
    toast.info('Mesa limpa para iniciar um Novo Orçamento. Selecione o cliente acima.');
  };

  const handleSaveProposal = async (overrideStatus?: SellerCustomStatus) => {
    if (!customer) {
      toast.error('Selecione um cliente antes de salvar o orçamento.');
      return;
    }

    const statusToSave = overrideStatus || activeStatus;
    setIsSavingProposal(true);
    try {
      const payload = {
        id: proposalId || undefined,
        customer_id: Number(customer.id),
        customer_name: customer.name || customer.corporate_name || 'Cliente',
        customer_document: customer.document !== '—' ? customer.document : null,
        horus_cod_cli: customer.horus_cod_cli && customer.horus_cod_cli !== '—' ? Number(customer.horus_cod_cli) : null,
        status_id: statusToSave.id,
        status_name: statusToSave.name,
        status_phase: statusToSave.phase,
        total_titles: proposalItems.length,
        total_requested_qty: summary.totalRequestedPieces,
        total_approved_qty: summary.totalApprovedPieces,
        total_cover_value: Number(summary.totalCover.toFixed(2)),
        total_net_value: Number(summary.totalNet.toFixed(2)),
        average_discount: Number(summary.averageDiscount.toFixed(2)),
        global_discount: Number(globalDiscountInput || 0),
        min_order_value: Number(summary.minOrder || 0),
        items: proposalItems,
        notes: customer.observations || null,
      };

      const res = await fetch(`${API_URL}/dbm/proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Falha ao salvar orçamento.');
      }

      const data = await res.json();
      if (data.proposal) {
        setProposalId(data.proposal.id);
        setProposalLocalId(data.proposal.local_id || data.proposal.id);
      }
      toast.success(`Orçamento #${data.proposal?.local_id || data.proposal?.id || ''} salvo com sucesso!`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar orçamento.');
    } finally {
      setIsSavingProposal(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 p-2 sm:p-4 space-y-3 font-sans">
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. BARRA DE COMANDO SUPERIOR (Bem Distribuída, Fluida e Sem Gargalo) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-2.5">
        
        {/* Esquerda: Voltar + Título + Campo de Busca de Cliente Compacto */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 flex-1 min-w-[280px]">
          <Link 
            href="/dbm/proposals"
            title="Voltar para listagem de orçamentos e propostas DBM"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          
          <div className="shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block leading-none">
              Gestão de Vendas DBM
            </span>
            <h1 className="text-sm font-black text-slate-900 dark:text-white leading-tight flex items-center gap-1.5 whitespace-nowrap">
              <span>Orçamentos & Propostas</span>
              {proposalLocalId && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-mono text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                  #{proposalLocalId}
                </span>
              )}
            </h1>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block shrink-0" />

          {/* Autocomplete do Cliente em formato compacto de barra sem sobreposição */}
          <div className="w-full sm:w-64 lg:w-72 xl:w-80 min-w-0 shrink">
            <CustomerAutocomplete
              compact
              value={selectedCustomerId}
              onChange={(id, cust) => {
                setSelectedCustomerId(id);
                setProposalId(null);
                setProposalLocalId(null);
                loadCustomerDeskData(id, cust);
              }}
              placeholder="🔍 Selecionar cliente (nome ou CNPJ)..."
            />
          </div>
        </div>

        {/* Direita: Importar Pedido + Status do Seller + Configurações + Salvar + Novo Orçamento + Ajuda (?) */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          
          {/* Botão de Toggle da Gaveta de Origem / Leitura de Pedidos */}
          <button
            type="button"
            title="Importar Pedido via Planilha Excel, PDF ou Texto colado"
            onClick={() => setIsIntakeDrawerOpen(!isIntakeDrawerOpen)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm whitespace-nowrap ${
              isIntakeDrawerOpen 
                ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500' 
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>Importar Pedido</span>
            <span className="text-[10px] font-mono opacity-80 hidden 2xl:inline">(Excel / PDF / Texto)</span>
            {isIntakeDrawerOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>

          {/* Seletor de Status Customizável */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${activeStatus.badgeBg} ${activeStatus.badgeBorder} ${activeStatus.badgeText}`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              <span>{activeStatus.name}</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-1.5 space-y-1">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase text-slate-400">
                  Status Customizado pelo Seller
                </div>
                {availableStatuses.map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setCurrentStatusId(st.id);
                      setIsStatusDropdownOpen(false);
                      if (proposalId && customer) {
                        handleSaveProposal(st);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                      st.id === currentStatusId ? 'bg-slate-100 dark:bg-slate-800 font-bold' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                      <span className={`h-2 w-2 rounded-full ${st.badgeText} bg-current`} />
                      {st.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">({st.phase})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setTempStatuses([...availableStatuses]);
              setSaveSuccessMessage(null);
              setIsConfigModalOpen(true);
            }}
            title="Configurar preferências da mesa, larguras e status deste Seller"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={!customer || isSavingProposal}
            onClick={() => handleSaveProposal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSavingProposal ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {proposalId ? 'Atualizar' : 'Salvar'}
          </button>

          <button
            type="button"
            onClick={handleNewProposalInDesk}
            title="Limpar a mesa atual e iniciar um Novo Orçamento sem precisar voltar"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo Orçamento</span>
          </button>

          {/* Ícone de Interrogação (?) no Canto Direito para Consultar Regras da Mesa */}
          <button
            type="button"
            onClick={() => setIsRulesGuideOpen(true)}
            title="Guia Rápido: Regras de Negócio e Atalhos da Mesa DBM"
            className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. BARRA DE DADOS DO CLIENTE & MINI CARDS DE HISTÓRICO EXPANDIDOS   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!customer ? (
        <div className="bg-white dark:bg-slate-900 px-4 py-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
              {isLoadingCustomerContext ? <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" /> : <Search className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {isLoadingCustomerContext ? 'Carregando dados híbridos do cliente (Hórus + Cronuz)...' : 'Selecione um cliente acima para iniciar a análise comercial'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Assim que o cliente for selecionado, os cards de Última Remessa, Venda, Acerto, Devolução e as abas de catálogo serão preenchidos automaticamente.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
            Aguardando seleção de cliente
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Faixa do Cliente */}
          <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                <span className="text-[10px] uppercase font-bold text-slate-400">Cliente:</span>
                <span className="truncate max-w-[200px] sm:max-w-xs">{customer.corporate_name || customer.name}</span>
                {isLoadingCustomerContext && (
                  <RefreshCw className="h-3 w-3 animate-spin text-indigo-600 ml-1" />
                )}
              </div>

              <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">CNPJ:</span>
                <span>{customer.document}</span>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">Apelido:</span>
                <span className="truncate max-w-[150px]">{customer.nickname || customer.name}</span>
              </div>

              <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                <Scale className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[10px] font-bold uppercase text-indigo-900 dark:text-indigo-300">Ped. Mín:</span>
                <span className="font-bold text-indigo-950 dark:text-white font-mono">
                  {customer.minOrderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className={`text-[9px] font-black px-1 rounded ${
                  summary.minOrderReached ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {summary.minOrderReached ? '✓ OK' : 'PENDENTE'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHistoryCards(!showHistoryCards)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-700 shadow-2xs"
                title={showHistoryCards ? "Recolher cards para dar espaço total à grade" : "Expandir cards de histórico"}
              >
                {showHistoryCards ? <EyeOff className="h-3.5 w-3.5 text-slate-500" /> : <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
                <span>{showHistoryCards ? "Ocultar Cards (Foco na Grade)" : "Exibir Cards de Histórico"}</span>
              </button>

              <div className="text-[11px] text-slate-400 font-medium hidden lg:block">
                {customer.city} / {customer.state} • Cód. #{customer.horus_cod_cli} • {customer.paymentCondition}
              </div>
            </div>
          </div>

          {/* 4 Cards de Histórico de Operações */}
          {showHistoryCards ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 animate-in fade-in duration-200">
              
              {/* Card Remessa */}
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-indigo-400 transition-colors">
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    Última Remessa
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 font-mono font-bold text-xs text-indigo-950 dark:text-indigo-200 shadow-2xs">
                    <Calendar className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                    {operationsMetrics.remessa.date}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-0.5">
                  <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                    {operationsMetrics.remessa.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {operationsMetrics.remessa.totalUnits} un • {operationsMetrics.remessa.doc}
                  </span>
                </div>
              </div>

              {/* Card Venda */}
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-emerald-400 transition-colors">
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Última Venda
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 font-mono font-bold text-xs text-emerald-950 dark:text-emerald-200 shadow-2xs">
                    <Calendar className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    {operationsMetrics.venda.date}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-0.5">
                  <span className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-400">
                    {operationsMetrics.venda.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {operationsMetrics.venda.totalUnits} un • {operationsMetrics.venda.doc}
                  </span>
                </div>
              </div>

              {/* Card Acerto */}
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-sky-400 transition-colors">
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                    <Scale className="h-3.5 w-3.5" />
                    Último Acerto
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 font-mono font-bold text-xs text-sky-950 dark:text-sky-200 shadow-2xs">
                    <Calendar className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                    {operationsMetrics.acerto.date}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-0.5">
                  <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                    {operationsMetrics.acerto.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {operationsMetrics.acerto.totalUnits} un • {operationsMetrics.acerto.doc}
                  </span>
                </div>
              </div>

              {/* Card Devolução */}
              <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-amber-400 transition-colors">
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Última Devolução
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 font-mono font-bold text-xs text-amber-950 dark:text-amber-200 shadow-2xs">
                    <Calendar className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    {operationsMetrics.devolucao.date}
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-0.5">
                  <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                    {operationsMetrics.devolucao.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    {operationsMetrics.devolucao.totalUnits} un • {operationsMetrics.devolucao.doc}
                  </span>
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white/90 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs text-[11px] flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-400 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">📦 Remessa ({operationsMetrics.remessa.date}):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{operationsMetrics.remessa.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  <span className="text-[10px] text-slate-400">({operationsMetrics.remessa.totalUnits} un)</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">💰 Venda ({operationsMetrics.venda.date}):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{operationsMetrics.venda.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  <span className="text-[10px] text-slate-400">({operationsMetrics.venda.totalUnits} un)</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700 hidden md:inline">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-bold text-sky-600 dark:text-sky-400">⚖️ Acerto ({operationsMetrics.acerto.date}):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{operationsMetrics.acerto.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </span>
                <span className="text-slate-300 dark:text-slate-700 hidden lg:inline">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-bold text-amber-600 dark:text-amber-400">🔄 Devolução ({operationsMetrics.devolucao.date}):</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{operationsMetrics.devolucao.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryCards(true)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Expandir Detalhes
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 3. GAVETA RETRÁTIL DE IMPORTAÇÃO INTELIGENTE (EXCEL, PDF, TEXTO)     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isIntakeDrawerOpen && (
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 shadow-md animate-in slide-in-from-top-2 duration-150 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Importar Itens do Pedido (Captura Automática de ISBNs & Quantidades)</span>
            </div>

            {/* Alternador de Origem */}
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIntakeSource('text')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeSource === 'text' ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                ✉️ E-mail / Texto
              </button>
              <button
                type="button"
                onClick={() => {
                  setIntakeSource('excel');
                  if (uploadedFile && uploadedFile.name.toLowerCase().endsWith('.pdf')) {
                    setUploadedFile(null);
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeSource === 'excel' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📊 Planilha (.xlsx / .xls / .csv)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIntakeSource('pdf');
                  if (uploadedFile && !uploadedFile.name.toLowerCase().endsWith('.pdf')) {
                    setUploadedFile(null);
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeSource === 'pdf' ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📄 PDF
              </button>
            </div>
          </div>

          {intakeSource === 'text' && (
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Cole aqui o e-mail, mensagem de WhatsApp ou tabela copiada com ISBNs e quantidades (ex: 9788535914849 10)..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          )}

          {intakeSource === 'excel' && (
            <div className="border border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-center bg-emerald-50/20">
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                id="excel-file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && f.size > 10 * 1024 * 1024) {
                    alert('O arquivo excede o limite máximo permitido de 10 MB para planilhas.');
                    e.target.value = '';
                    return;
                  }
                  setUploadedFile(f);
                }}
              />
              <label htmlFor="excel-file" className="cursor-pointer text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                {uploadedFile ? `${uploadedFile.name} (Clique para trocar)` : 'Clique para selecionar Planilha (.xlsx, .xls ou .csv)'}
              </label>
            </div>
          )}

          {intakeSource === 'pdf' && (
            <div className="border border-dashed border-rose-300 dark:border-rose-800 rounded-lg p-3 text-center bg-rose-50/20">
              <input
                type="file"
                accept=".pdf"
                id="pdf-file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && f.size > 10 * 1024 * 1024) {
                    alert('O arquivo excede o limite máximo permitido de 10 MB para PDFs.');
                    e.target.value = '';
                    return;
                  }
                  setUploadedFile(f);
                }}
              />
              <label htmlFor="pdf-file" className="cursor-pointer text-xs text-rose-700 dark:text-rose-400 font-bold flex items-center justify-center gap-2">
                <FileText className="h-4 w-4" />
                {uploadedFile ? `${uploadedFile.name} (Clique para trocar)` : 'Clique para selecionar Ordem de Compra em PDF'}
              </label>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              Os itens importados entram na aba <b>Pedido</b> e são automaticamente ocultados das abas de sugestão para não duplicar.
            </span>
            <button
              type="button"
              onClick={handleAnalyzeOrder}
              disabled={isAnalysing}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-all disabled:opacity-50"
            >
              {isAnalysing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              ⚡ Analisar e Carregar na Grade
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 4. A GRADE DBM ACCESS/EXCEL NO TOPO (HERO / PROTAGONISTA DA TELA)    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={`bg-white dark:bg-slate-900 border transition-all duration-150 overflow-hidden flex flex-col ${
        isGridMaximized 
          ? 'fixed inset-2 sm:inset-3 z-50 rounded-xl border-indigo-500 shadow-2xl' 
          : 'rounded-xl border-slate-200 dark:border-slate-800 shadow-sm'
      }`}>
        
        {/* Barra 1: Toolbar de Filtros, Parâmetros, Colunas Visíveis e Ferramentas */}
        <div className="px-3 py-2 bg-slate-50/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          
          {/* Esquerda da Toolbar: Busca Rápida + Filtros de Situação */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Campo de Busca Rápida */}
            <div className="relative">
              <input
                type="text"
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                placeholder="Filtrar por ISBN, título, assunto..."
                className="w-44 sm:w-56 pl-7 pr-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-1.5" />
            </div>

            {/* Filtro Rápido de Situação */}
            <div className="inline-flex rounded-md p-0.5 bg-slate-200/60 dark:bg-slate-800 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setSituationFilter('ALL')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'ALL' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSituationFilter('DISPONIVEL')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'DISPONIVEL' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Disponíveis
              </button>
              <button
                type="button"
                onClick={() => setSituationFilter('PARCIAL')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'PARCIAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Parciais
              </button>
              {(activeTab === 'pedido' || activeTab === 'consolidado') && (
                <button
                  type="button"
                  onClick={() => setSituationFilter('SEM_ESTOQUE')}
                  className={`px-2 py-0.5 rounded ${situationFilter === 'SEM_ESTOQUE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500'}`}
                >
                  Faltas
                </button>
              )}
            </div>
          </div>

          {/* Direita da Toolbar: Parâmetros de Vendas + Toggles de Colunas (ISBN, Capa, Desconto) + Maximizar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Parametrização Rápida de Vendas na Grade */}
            <div className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
              <div className="flex items-center gap-1" title="Dias de histórico para vendas deste cliente">
                <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[10px] uppercase font-bold text-slate-500">VdsCli:</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={clientSalesDays}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    setClientSalesDays(val);
                    saveConfigToStorage({ clientSalesDays: val });
                  }}
                  className="w-12 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1 py-0.5 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400">d</span>
              </div>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <div className="flex items-center gap-1" title="Dias de histórico para vendas gerais da distribuidora">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] uppercase font-bold text-slate-500">VdsGeral:</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={generalSalesDays}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    setGeneralSalesDays(val);
                    saveConfigToStorage({ generalSalesDays: val });
                  }}
                  className="w-12 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1 py-0.5 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400">d</span>
              </div>
            </div>

            {/* Regra 7: Opção de ativar/desativar no grid de todas as abas os campos ISBN, Capa e Desconto */}
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xs text-[11px]">
              <Columns3 className="h-3.5 w-3.5 text-slate-400 mr-0.5" />
              <span className="text-[10px] font-bold uppercase text-slate-400 hidden xl:inline mr-1">Colunas:</span>
              <button
                type="button"
                onClick={() => handleToggleColumnVisibility('isbn')}
                className={`px-1.5 py-0.5 rounded font-semibold transition-all border ${
                  showIsbnInGrid
                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-indigo-600 dark:border-indigo-500'
                    : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-900 dark:border-slate-700 line-through'
                }`}
                title="Exibir ou ocultar a coluna ISBN em todas as abas"
              >
                ISBN
              </button>
              <button
                type="button"
                onClick={() => handleToggleColumnVisibility('cover')}
                className={`px-1.5 py-0.5 rounded font-semibold transition-all border ${
                  showCoverPriceInGrid
                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-indigo-600 dark:border-indigo-500'
                    : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-900 dark:border-slate-700 line-through'
                }`}
                title="Exibir ou ocultar a coluna Preço de Capa em todas as abas"
              >
                Capa
              </button>
              <button
                type="button"
                onClick={() => handleToggleColumnVisibility('discount')}
                className={`px-1.5 py-0.5 rounded font-semibold transition-all border ${
                  showDiscountInGrid
                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-indigo-600 dark:border-indigo-500'
                    : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-900 dark:border-slate-700 line-through'
                }`}
                title="Exibir ou ocultar as colunas de Desconto %, Preço Líquido e Subtotal em todas as abas"
              >
                Desconto
              </button>
            </div>

            {/* Botão Tela Cheia / Sair Tela Cheia */}
            <button
              type="button"
              onClick={() => setIsGridMaximized(!isGridMaximized)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all border shadow-2xs shrink-0 ${
                isGridMaximized 
                  ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700' 
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title={isGridMaximized ? "Sair do modo tela cheia" : "Maximizar grade para tela cheia estilo Excel/Access"}
            >
              {isGridMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isGridMaximized ? "Sair Tela Cheia" : "Tela Cheia"}</span>
            </button>
          </div>

        </div>

        {/* Barra 2: Abas Comerciais na Nova Sequência Oficial (Regra 1):
            1. Pedidos -> 2. Reposição -> 3. Novidades -> 4. Fundo de Catálogo -> 5. Último Acerto / Venda -> 6. Pedido Consolidado */}
        <div className="px-3 pt-2 bg-slate-50/80 dark:bg-slate-850/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            
            {/* 1. Pedidos */}
            <button
              type="button"
              onClick={() => setActiveTab('pedido')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'pedido'
                  ? 'bg-white dark:bg-slate-900 border-slate-800 dark:border-indigo-400 text-slate-900 dark:text-white border-b-white dark:border-b-slate-900 -mb-px shadow-2xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <Package className="h-3.5 w-3.5 text-slate-500" />
              <span>Pedidos</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'pedido'
                  ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
              }`}>
                {exclusiveItemsByTab.pedido.length}
              </span>
            </button>

            {/* 2. Reposição */}
            <button
              type="button"
              onClick={() => setActiveTab('reposicao')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'reposicao'
                  ? 'bg-white dark:bg-slate-900 border-slate-800 dark:border-indigo-400 text-slate-900 dark:text-white border-b-white dark:border-b-slate-900 -mb-px shadow-2xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Reposição</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'reposicao'
                  ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
              }`}>
                {exclusiveItemsByTab.reposicao.length}
              </span>
              {exclusiveItemsByTab.reposicao.filter(it => it.isAddedToOrder).length > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-mono font-bold border border-emerald-200 dark:border-emerald-800" title="Itens adicionados ao pedido desta aba">
                  ✓ {exclusiveItemsByTab.reposicao.filter(it => it.isAddedToOrder).length}
                </span>
              )}
            </button>

            {/* 3. Novidades */}
            <button
              type="button"
              onClick={() => setActiveTab('novidades')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'novidades'
                  ? 'bg-white dark:bg-slate-900 border-slate-800 dark:border-indigo-400 text-slate-900 dark:text-white border-b-white dark:border-b-slate-900 -mb-px shadow-2xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-slate-500" />
              <span>Novidades</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'novidades'
                  ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
              }`}>
                {exclusiveItemsByTab.novidades.length}
              </span>
              {exclusiveItemsByTab.novidades.filter(it => it.isAddedToOrder).length > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-mono font-bold border border-emerald-200 dark:border-emerald-800" title="Itens adicionados ao pedido desta aba">
                  ✓ {exclusiveItemsByTab.novidades.filter(it => it.isAddedToOrder).length}
                </span>
              )}
            </button>

            {/* 4. Fundo de Catálogo */}
            <button
              type="button"
              onClick={() => setActiveTab('fundo')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'fundo'
                  ? 'bg-white dark:bg-slate-900 border-slate-800 dark:border-indigo-400 text-slate-900 dark:text-white border-b-white dark:border-b-slate-900 -mb-px shadow-2xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-slate-500" />
              <span>Fundo de Catálogo</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'fundo'
                  ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
              }`}>
                {exclusiveItemsByTab.fundo.length}
              </span>
              {exclusiveItemsByTab.fundo.filter(it => it.isAddedToOrder).length > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-mono font-bold border border-emerald-200 dark:border-emerald-800" title="Itens adicionados ao pedido desta aba">
                  ✓ {exclusiveItemsByTab.fundo.filter(it => it.isAddedToOrder).length}
                </span>
              )}
            </button>

            {/* 5. Último Acerto / Venda */}
            <button
              type="button"
              onClick={() => setActiveTab('ultimo_acerto')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-t-md border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'ultimo_acerto'
                  ? 'bg-white dark:bg-slate-900 border-slate-800 dark:border-indigo-400 text-slate-900 dark:text-white border-b-white dark:border-b-slate-900 -mb-px shadow-2xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/60'
              }`}
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
              <span>Último Acerto / Venda</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'ultimo_acerto'
                  ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800/80 dark:text-slate-400'
              }`}>
                {exclusiveItemsByTab.ultimo_acerto.length}
              </span>
              {exclusiveItemsByTab.ultimo_acerto.filter(it => it.isAddedToOrder).length > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-mono font-bold border border-emerald-200 dark:border-emerald-800" title="Itens adicionados ao pedido desta aba">
                  ✓ {exclusiveItemsByTab.ultimo_acerto.filter(it => it.isAddedToOrder).length}
                </span>
              )}
            </button>

            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* 6. Pedido Consolidado */}
            <button
              type="button"
              onClick={() => setActiveTab('consolidado')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-t-md border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'consolidado'
                  ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 border-b-white dark:border-b-slate-900 -mb-px shadow-2xs'
                  : 'bg-slate-100/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200/60'
              }`}
            >
              <Layers className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Pedido Consolidado</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-600 text-white font-mono font-bold">
                {proposalItems.length}
              </span>
            </button>
          </div>

          {/* Botão discreto para restaurar larguras de colunas se necessário */}
          <div className="hidden lg:flex items-center gap-2 pb-1 text-[10px] text-slate-400 shrink-0">
            <span title="Arraste a borda direita de qualquer cabeçalho da tabela para ajustar a largura da coluna">
              ↔ Colunas redimensionáveis (salvo p/ seu usuário)
            </span>
            <button
              type="button"
              onClick={handleResetColumnWidths}
              className="text-slate-400 hover:text-indigo-600 underline"
              title="Restaurar larguras originais das colunas"
            >
              Restaurar
            </button>
          </div>
        </div>

        {/* ── SUB-BARRA 1: DIGITAÇÃO MANUAL RÁPIDA POR TECLADO (ABA PEDIDOS) ── */}
        {activeTab === 'pedido' && (
          <div className="px-3 py-2 bg-slate-50/90 dark:bg-slate-850/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0">
                <Plus className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Digitação Rápida:
              </span>

              {/* Campo 1: Busca de Produto (ISBN, Código ou Título) */}
              <div ref={manualDropdownWrapperRef} className="relative flex-1 max-w-md min-w-[220px]">
                <input
                  ref={manualSearchInputRef}
                  type="text"
                  disabled={!customer}
                  value={manualQuery}
                  onChange={(e) => {
                    setManualQuery(e.target.value);
                    if (selectedManualProduct && e.target.value !== `${selectedManualProduct.isbn} - ${selectedManualProduct.title}`) {
                      setSelectedManualProduct(null);
                    }
                  }}
                  onFocus={() => {
                    if (manualSuggestions.length > 0) setShowManualDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (manualSuggestions.length > 0) {
                        setShowManualDropdown(true);
                        setSelectedSuggestionIdx((prev: number) => (prev + 1) % manualSuggestions.length);
                      }
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (manualSuggestions.length > 0) {
                        setShowManualDropdown(true);
                        setSelectedSuggestionIdx((prev: number) => (prev - 1 + manualSuggestions.length) % manualSuggestions.length);
                      }
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (showManualDropdown && manualSuggestions[selectedSuggestionIdx]) {
                        handleSelectManualSuggestion(manualSuggestions[selectedSuggestionIdx]);
                      } else if (selectedManualProduct) {
                        manualQtyInputRef.current?.focus();
                        manualQtyInputRef.current?.select();
                      }
                    } else if (e.key === 'Escape') {
                      setShowManualDropdown(false);
                    }
                  }}
                  placeholder={customer ? "Digite ISBN, Cód. Hórus ou Título e tecle Enter..." : "Selecione o cliente primeiro..."}
                  className="w-full pl-2.5 pr-7 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
                {isSearchingManual && (
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-500 animate-spin absolute right-2 top-1.5" />
                )}

                {showManualDropdown && manualSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-40 max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {manualSuggestions.map((sug, sIdx) => (
                      <button
                        key={`${sug.isbn}-${sug.horusCode}-${sIdx}`}
                        type="button"
                        onClick={() => handleSelectManualSuggestion(sug)}
                        className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          sIdx === selectedSuggestionIdx
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-200 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-sans font-medium text-slate-900 dark:text-white">
                            {sug.title}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
                            <span>ISBN: {sug.isbn}</span>
                            <span>•</span>
                            <span>{sug.subject || sug.publisher}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                            {Number(sug.coverPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <span className={`text-[10px] font-bold ${Number(sug.horusStock || 0) > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            Est: {sug.horusStock ?? 0} un
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Campo 2: Quantidade */}
              <div className="flex items-center gap-1">
                <label className="text-[10px] uppercase font-bold text-slate-500">Qtd:</label>
                <input
                  ref={manualQtyInputRef}
                  type="number"
                  min={1}
                  disabled={!customer}
                  value={manualQty}
                  onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (showQuickDiscountInput && manualDiscInputRef.current) {
                        manualDiscInputRef.current.focus();
                        manualDiscInputRef.current.select();
                      } else {
                        handleAddManualProductToOrder();
                      }
                    }
                  }}
                  className="w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-center text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
              </div>

              {/* Campo 3: Desconto % (Ocultável nas Configurações da Mesa) */}
              {showQuickDiscountInput && (
                <div className="flex items-center gap-1">
                  <label className="text-[10px] uppercase font-bold text-slate-500">Desc%:</label>
                  <input
                    ref={manualDiscInputRef}
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    disabled={!customer}
                    value={manualDiscount}
                    onChange={(e) => setManualDiscount(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddManualProductToOrder();
                      }
                    }}
                    className="w-16 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-right text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={!customer || (!selectedManualProduct && manualSuggestions.length === 0)}
                onClick={() => handleAddManualProductToOrder()}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Incluir (Enter)</span>
              </button>
            </div>

            <span className="text-[10px] text-slate-400 font-mono hidden xl:inline">
              {showQuickDiscountInput
                ? '⌨️ Fluxo contínuo: Digite ISBN/Título ➔ Enter ➔ Qtd ➔ Enter ➔ Desc% ➔ Enter'
                : '⌨️ Fluxo contínuo: Digite ISBN/Título ➔ Enter ➔ Qtd ➔ Enter'}
            </span>
          </div>
        )}

        {/* ── SUB-BARRA UNIFICADA DAS ABAS DE PESQUISA/CATÁLOGO (Reposição, Novidades, Fundo, Último Acerto) ── */}
        {isCatalogSearchTab && (
          <div className="px-3 py-2 bg-slate-50/95 dark:bg-slate-850/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            
            {/* Esquerda: Controles específicos da aba ativa */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* ABA REPOSIÇÃO (Regra 8): Botão Buscar + Configuração Discreta de X dias */}
              {activeTab === 'reposicao' && (
                <>
                  <button
                    type="button"
                    disabled={!customer || isLoadingReplenishment}
                    onClick={handleFetchReplenishment}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold shadow-2xs transition-all disabled:opacity-50"
                    title="Coleta os itens com saldo consignado ativo no cliente (via API Horus) + histórico de itens vendidos ao cliente nos últimos X dias"
                  >
                    {isLoadingReplenishment ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                    <span>Buscar</span>
                  </button>

                  {/* Abinha discreta para configurar a base de dias da Reposição */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsReplenishmentConfigOpen(!isReplenishmentConfigOpen)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                        isReplenishmentConfigOpen
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-300'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                      title="Configurar a janela de dias do histórico de vendas do cliente usada na busca de Reposição"
                    >
                      <SlidersHorizontal className="h-3 w-3 text-slate-400" />
                      <span>Base Vendas: <b>{replenishmentSalesDays}d</b></span>
                    </button>

                    {isReplenishmentConfigOpen && (
                      <div className="absolute left-0 mt-1.5 w-72 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                            Base Histórica de Reposição
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsReplenishmentConfigOpen(false)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">
                          Ao clicar em <b>Buscar</b>, o sistema traz os itens com <b>Saldo Consignado (API)</b> + itens vendidos ao cliente nos últimos <b>X dias</b>:
                        </p>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={730}
                            value={replenishmentSalesDays}
                            onChange={(e) => {
                              const v = Math.max(1, parseInt(e.target.value) || 90);
                              setReplenishmentSalesDays(v);
                              saveConfigToStorage({ replenishmentSalesDays: v });
                            }}
                            className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-center font-mono font-bold text-xs text-indigo-600"
                          />
                          <span className="text-[11px] text-slate-500">dias</span>
                          <div className="flex gap-1 ml-auto">
                            {[30, 60, 90, 180].map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => {
                                  setReplenishmentSalesDays(d);
                                  saveConfigToStorage({ replenishmentSalesDays: d });
                                }}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  replenishmentSalesDays === d
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {d}d
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {replenishmentMeta && (
                    <div className="relative flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                        Consignado API: <b>{replenishmentMeta.consignedFromApiCount}</b>
                        {replenishmentMeta.consignedFromSqlCount > 0 && (
                          <> • Consignado BD: <b className="text-indigo-600 dark:text-indigo-400">{replenishmentMeta.consignedFromSqlCount}</b></>
                        )}
                        {' '}• Histórico BD ({replenishmentMeta.days}d): <b className="text-emerald-600 dark:text-emerald-400">{replenishmentMeta.salesHistoryCount}</b>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowReplenishmentDiag(!showReplenishmentDiag)}
                        className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50"
                        title="Ver retorno detalhado da API Horus e consultas SQL de Consignação e Vendas"
                      >
                        {showReplenishmentDiag ? 'Ocultar Retorno API/BD' : 'Ver Retorno API/BD'}
                      </button>

                      {showReplenishmentDiag && (
                        <div className="absolute left-0 top-7 w-[520px] max-w-[90vw] p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl z-50 text-[11px] space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              Diagnóstico Híbrido: API Horus + Banco SQL Server
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowReplenishmentDiag(false)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {replenishmentMeta.apiDiagnostic && (
                            <div className="space-y-1 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="font-bold text-slate-700 dark:text-slate-200">
                                1. API Horus ({replenishmentMeta.apiDiagnostic.endpoint}) — Status: <span className="text-amber-600 dark:text-amber-400">{replenishmentMeta.apiDiagnostic.status}</span>
                              </div>
                              <div className="text-slate-600 dark:text-slate-300">
                                {replenishmentMeta.apiDiagnostic.message}
                              </div>
                              <pre className="text-[10px] font-mono bg-slate-900 text-slate-100 p-2 rounded overflow-x-auto max-h-32">
                                {JSON.stringify(replenishmentMeta.apiDiagnostic.rawResponse, null, 2)}
                              </pre>
                            </div>
                          )}
                          {replenishmentMeta.sqlDiagnostic && (
                            <div className="space-y-1 bg-indigo-50/50 dark:bg-indigo-950/30 p-2 rounded-lg border border-indigo-200 dark:border-indigo-800">
                              <div className="font-bold text-indigo-900 dark:text-indigo-200">
                                2. Banco de Dados SQL Server (COD_CLI #{replenishmentMeta.sqlDiagnostic.codCli} • Filial #{replenishmentMeta.sqlDiagnostic.codFilial})
                              </div>
                              <div className="text-slate-700 dark:text-slate-300 font-mono text-[10px]">
                                • Consignação ({replenishmentMeta.sqlDiagnostic.consignmentSource}): <b>{replenishmentMeta.sqlDiagnostic.consignedSkusFound} SKUs</b> com saldo &gt; 0 no cliente<br />
                                • Vendas/Acertos (NF_MESTRE + NF_ITENS últimos {replenishmentMeta.sqlDiagnostic.salesWindowDays}d): <b>{replenishmentMeta.sqlDiagnostic.salesSkusFound} SKUs</b> ({replenishmentMeta.sqlDiagnostic.salesTotalUnits} exemplares)
                              </div>
                              {Array.isArray(replenishmentMeta.sqlDiagnostic.sqlErrors) && replenishmentMeta.sqlDiagnostic.sqlErrors.length > 0 && (
                                <div className="mt-1.5 p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-mono text-[10px] space-y-0.5">
                                  <div className="font-bold">Avisos / Erros SQL detectados:</div>
                                  {replenishmentMeta.sqlDiagnostic.sqlErrors.map((errStr: string, idx: number) => (
                                    <div key={idx}>• {errStr}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ABA NOVIDADES */}
              {activeTab === 'novidades' && (
                <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>
                    Janela de Novidades: <strong>-9 meses</strong> até <strong>+6 meses</strong> (apenas com estoque disponível e fora do Pedido).
                  </span>
                  <button
                    type="button"
                    disabled={isLoadingCatalog}
                    onClick={() => loadCustomerDeskData(selectedCustomerId || '', customer, items.filter(it => it.tabCategory === 'pedido'))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingCatalog ? 'animate-spin text-indigo-600' : ''}`} />
                    <span>Atualizar Novidades</span>
                  </button>
                </div>
              )}

              {/* ABA FUNDO DE CATÁLOGO */}
              {activeTab === 'fundo' && (
                <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                  <BookOpen className="h-3.5 w-3.5 text-sky-600" />
                  <span>
                    Fundo de Catálogo: títulos de giro consolidado com saldo disponível (sem repetir itens de Pedido, Reposição ou Novidades).
                  </span>
                  <button
                    type="button"
                    disabled={isLoadingCatalog}
                    onClick={() => loadCustomerDeskData(selectedCustomerId || '', customer, items.filter(it => it.tabCategory === 'pedido'))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingCatalog ? 'animate-spin text-indigo-600' : ''}`} />
                    <span>Atualizar Catálogo</span>
                  </button>
                </div>
              )}

              {/* ABA ÚLTIMO ACERTO / VENDA */}
              {activeTab === 'ultimo_acerto' && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!customer || isLoadingLastOp}
                    onClick={() => handleFetchLastOperation('ACERTO')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                      lastOpTypeSelected === 'ACERTO'
                        ? 'bg-slate-800 text-white border-slate-800 dark:bg-indigo-600 dark:border-indigo-500 shadow-2xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                    } disabled:opacity-50`}
                  >
                    {isLoadingLastOp && lastOpTypeSelected === 'ACERTO' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Scale className="h-3 w-3" />
                    )}
                    <span>Último Acerto (CFOP 5113/5114/6113/6114)</span>
                  </button>

                  <button
                    type="button"
                    disabled={!customer || isLoadingLastOp}
                    onClick={() => handleFetchLastOperation('VENDA')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                      lastOpTypeSelected === 'VENDA'
                        ? 'bg-slate-800 text-white border-slate-800 dark:bg-indigo-600 dark:border-indigo-500 shadow-2xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                    } disabled:opacity-50`}
                  >
                    {isLoadingLastOp && lastOpTypeSelected === 'VENDA' ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <DollarSign className="h-3 w-3" />
                    )}
                    <span>Última Venda Firme</span>
                  </button>

                  {lastOpInvoiceMeta && (
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      {lastOpInvoiceMeta.doc} • <b>{lastOpInvoiceMeta.date}</b> {lastOpInvoiceMeta.cfop ? `(CFOP ${lastOpInvoiceMeta.cfop})` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Direita (Regra 9, 10 e 11): Selecionar Todos + Atalho Delete + Botão Único "Adicionar" */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <span className="text-[10px] font-mono text-slate-400 hidden xl:inline" title="Selecione uma linha ou marque caixas e aperte a tecla Delete no teclado para eliminar da pesquisa">
                ⌨️ Tecla <b>Delete</b> remove da pesquisa
              </span>

              <button
                type="button"
                disabled={activeItems.length === 0}
                onClick={handleToggleSelectAllActiveTab}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors disabled:opacity-40"
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={isAllActiveTabChecked}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 pointer-events-none"
                />
                <span>{isAllActiveTabChecked ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
              </button>

              {/* Botão Único "Adicionar" em cada opção (Reposição, Novidades, Fundo, Último Acerto) */}
              <button
                type="button"
                disabled={checkedIdsInActiveTab.length === 0 && !selectedRowId}
                onClick={handleBatchAddSelectedToOrder}
                className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Adiciona os itens selecionados ao Pedido Consolidado com quantidade 0 (prontos para digitação)"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  Adicionar{checkedIdsInActiveTab.length > 0 ? ` (${checkedIdsInActiveTab.length})` : ''}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── BANNER DA ABA CONSOLIDADA (AÇÕES DE ENVIO AO HÓRUS) ───────────── */}
        {activeTab === 'consolidado' && (
          <div className="px-3.5 py-2 bg-slate-100/90 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Resumo por Origem:
              </span>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono font-medium">
                  Pedidos: <b>{proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'pedido').length}</b>
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono font-medium">
                  Reposição: <b>{proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'reposicao').length}</b>
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono font-medium">
                  Novidades: <b>{proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'novidades').length}</b>
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono font-medium">
                  Fundo: <b>{proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'fundo').length}</b>
                </span>
                <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-mono font-medium">
                  Últ. Acerto/Venda: <b>{proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'ultimo_acerto').length}</b>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-right hidden sm:block">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">Total Consolidado</span>
                <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">
                  {summary.totalApprovedPieces} un • {summary.totalNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>

              <button
                type="button"
                onClick={handleExportConsolidatedExcel}
                disabled={proposalItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700 text-xs font-bold shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Exportar Pedido Consolidado para Excel (ISBN, Título, Quantidade, Assunto e Origem)"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                <span>Exportar Excel</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSendHorusModalOpen(true)}
                disabled={proposalItems.length === 0 || !customer}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Enviar para o Hórus</span>
              </button>
            </div>
          </div>
        )}

        {/* ── TABELA ESTILO EXCEL / ACCESS COM COLUNAS ORDENÁVEIS E REDIMENSIONÁVEIS ── */}
        <div className={`overflow-x-auto overflow-y-auto transition-all ${
          isGridMaximized 
            ? 'flex-1 min-h-0' 
            : showHistoryCards 
              ? 'max-h-[calc(100vh-320px)] min-h-[440px]' 
              : 'max-h-[calc(100vh-230px)] min-h-[550px]'
        }`}>
          <table
            className="text-left border-collapse text-xs select-text"
            style={{
              tableLayout: 'fixed',
              width: `${
                (isCatalogSearchTab ? (columnWidths.select || 34) : 0) +
                (columnWidths.rowNum || 34) +
                (columnWidths.situation || 78) +
                (activeTab === 'consolidado' ? (columnWidths.origin || 86) : 0) +
                (showIsbnInGrid ? (columnWidths.isbn || 112) : 0) +
                (columnWidths.title || 240) +
                (columnWidths.subject || 135) +
                (showCoverPriceInGrid ? (columnWidths.coverPrice || 78) : 0) +
                (showDiscountInGrid
                  ? (columnWidths.discountPercent || 64) +
                    (columnWidths.netPrice || 78) +
                    (columnWidths.subtotal || 88)
                  : 0) +
                (columnWidths.requestedQty || 66) +
                (columnWidths.consignedQty || 62) +
                (columnWidths.clientSalesX || 68) +
                (columnWidths.horusStock || 68) +
                (columnWidths.boxUnits || 48) +
                (columnWidths.generalSales365 || 62) +
                (columnWidths.generalSalesX || 68) +
                (columnWidths.action || 82)
              }px`
            }}
          >
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-semibold uppercase tracking-tight text-slate-600 dark:text-slate-300">
                
                {/* Checkbox nas abas de pesquisa/catálogo */}
                {isCatalogSearchTab && (
                  <th
                    style={{ width: columnWidths.select || 34 }}
                    className="py-1.5 px-1 text-center border-r border-slate-200/70 dark:border-slate-700/60"
                    title="Selecionar/Desmarcar todos os itens visíveis nesta aba"
                  >
                    <input
                      type="checkbox"
                      checked={isAllActiveTabChecked}
                      onChange={handleToggleSelectAllActiveTab}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                )}

                {/* # Seletor de linha */}
                <th
                  style={{ width: columnWidths.rowNum || 34 }}
                  className="py-1.5 px-1 text-center text-slate-400 border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  #
                </th>

                {/* Situação */}
                <th
                  style={{ width: columnWidths.situation }}
                  onClick={() => handleSortColumn('situation')}
                  className="group relative py-1.5 px-1.5 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">Sit.</span>
                    {renderSortIcon('situation')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'situation')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Origem (Exclusiva da Aba Consolidada) */}
                {activeTab === 'consolidado' && (
                  <th
                    style={{ width: columnWidths.origin }}
                    onClick={() => handleSortColumn('originCategory')}
                    className="group relative py-1.5 px-1.5 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className="truncate">Origem</span>
                      {renderSortIcon('originCategory')}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartColumnResize(e, 'origin')}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                    />
                  </th>
                )}

                {/* ISBN (Ocultável pela Regra 7) */}
                {showIsbnInGrid && (
                  <th
                    style={{ width: columnWidths.isbn }}
                    onClick={() => handleSortColumn('isbn')}
                    className="group relative py-1.5 px-1.5 font-mono cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">ISBN</span>
                      {renderSortIcon('isbn')}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartColumnResize(e, 'isbn')}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                    />
                  </th>
                )}

                {/* Título */}
                <th
                  style={{ width: columnWidths.title }}
                  onClick={() => handleSortColumn('title')}
                  className="group relative py-1.5 px-1.5 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">Título</span>
                    {renderSortIcon('title')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'title')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Assunto (Regra 5: Coluna dedicada separada) */}
                <th
                  style={{ width: columnWidths.subject }}
                  onClick={() => handleSortColumn('subject')}
                  className="group relative py-1.5 px-1.5 cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">Assunto</span>
                    {renderSortIcon('subject')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'subject')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Capa (Ocultável pela Regra 7) */}
                {showCoverPriceInGrid && (
                  <th
                    style={{ width: columnWidths.coverPrice }}
                    onClick={() => handleSortColumn('coverPrice')}
                    className="group relative py-1.5 px-1.5 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="truncate">Capa</span>
                      {renderSortIcon('coverPrice')}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartColumnResize(e, 'coverPrice')}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                    />
                  </th>
                )}

                {/* Desc% (Ocultável pela Regra 7) */}
                {showDiscountInGrid && (
                  <th
                    style={{ width: columnWidths.discountPercent }}
                    onClick={() => handleSortColumn('discountPercent')}
                    className="group relative py-1.5 px-1 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="truncate">Desc%</span>
                      {renderSortIcon('discountPercent')}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartColumnResize(e, 'discountPercent')}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                    />
                  </th>
                )}

                {/* Líq. (Ocultável pela Regra 7) */}
                {showDiscountInGrid && (
                  <th
                    style={{ width: columnWidths.netPrice }}
                    onClick={() => handleSortColumn('netPrice')}
                    className="group relative py-1.5 px-1.5 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="truncate">Líq.</span>
                      {renderSortIcon('netPrice')}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartColumnResize(e, 'netPrice')}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                    />
                  </th>
                )}

                {/* Qtd */}
                <th
                  style={{ width: columnWidths.requestedQty }}
                  onClick={() => handleSortColumn('requestedQty')}
                  className="group relative py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate">Qtd</span>
                    {renderSortIcon('requestedQty')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'requestedQty')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Subtotal */}
                {showDiscountInGrid && (
                  <th
                    style={{ width: columnWidths.subtotal }}
                    onClick={() => handleSortColumn('subtotal')}
                    className="group relative py-1.5 px-1.5 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="truncate">Subtotal</span>
                      {renderSortIcon('subtotal')}
                    </div>
                    <div
                      onMouseDown={(e) => handleStartColumnResize(e, 'subtotal')}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                    />
                  </th>
                )}

                {/* Consignado */}
                <th
                  style={{ width: columnWidths.consignedQty }}
                  onClick={() => handleSortColumn('consignedQty')}
                  className="group relative py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate">Consig</span>
                    {renderSortIcon('consignedQty')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'consignedQty')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Cli(Xd) */}
                <th
                  style={{ width: columnWidths.clientSalesX }}
                  onClick={() => handleSortColumn('clientSalesX')}
                  className="group relative py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate">Cli({clientSalesDays}d)</span>
                    {renderSortIcon('clientSalesX')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'clientSalesX')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Estoque */}
                <th
                  style={{ width: columnWidths.horusStock }}
                  onClick={() => handleSortColumn('horusStock')}
                  className="group relative py-1.5 px-1.5 text-right cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span className="truncate">Estoque</span>
                    {renderSortIcon('horusStock')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'horusStock')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* CX */}
                <th
                  style={{ width: columnWidths.boxUnits }}
                  onClick={() => handleSortColumn('boxUnits')}
                  className="group relative py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate">CX</span>
                    {renderSortIcon('boxUnits')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'boxUnits')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* 365d */}
                <th
                  style={{ width: columnWidths.generalSales365 }}
                  onClick={() => handleSortColumn('generalSales365')}
                  className="group relative py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate">365d</span>
                    {renderSortIcon('generalSales365')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'generalSales365')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Ger(Xd) */}
                <th
                  style={{ width: columnWidths.generalSalesX }}
                  onClick={() => handleSortColumn('generalSalesX')}
                  className="group relative py-1.5 px-1 text-center cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-700/70 select-none border-r border-slate-200/70 dark:border-slate-700/60"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="truncate">Ger({generalSalesDays}d)</span>
                    {renderSortIcon('generalSalesX')}
                  </div>
                  <div
                    onMouseDown={(e) => handleStartColumnResize(e, 'generalSalesX')}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/60"
                  />
                </th>

                {/* Ação */}
                <th
                  style={{ width: columnWidths.action }}
                  className="py-1.5 px-1 text-center"
                >
                  Status / Ação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
              {activeItems.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-12 text-center text-slate-400 font-sans text-xs">
                    {isLoadingCatalog || isLoadingLastOp || isLoadingReplenishment ? (
                      <span className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Consultando base híbrida Hórus + Cronuz...
                      </span>
                    ) : !customer && (activeTab === 'pedido' || activeTab === 'reposicao' || activeTab === 'ultimo_acerto') ? (
                      <span>Selecione um cliente no topo da tela para carregar os itens deste cliente e iniciar o orçamento.</span>
                    ) : activeTab === 'reposicao' && !replenishmentMeta && !isLoadingReplenishment ? (
                      <span>
                        Clique no botão <b>&ldquo;Buscar&rdquo;</b> acima para coletar os itens com <b>Saldo Consignado (API)</b> e o <b>Histórico de Vendas ({replenishmentSalesDays} dias)</b> deste cliente.
                      </span>
                    ) : activeTab === 'ultimo_acerto' && !lastOpTypeSelected ? (
                      <span>
                        Clique em <b>&ldquo;Último Acerto&rdquo;</b> ou <b>&ldquo;Última Venda Firme&rdquo;</b> acima para carregar os itens da nota fiscal do cliente.
                      </span>
                    ) : (
                      <span>Nenhum item localizado para os filtros informados nesta aba.</span>
                    )}
                  </td>
                </tr>
              ) : (
                activeItems.map((it, idx) => {
                  const netPrice = it.coverPrice * (1 - it.discountPercent / 100);
                  const subtotal = netPrice * it.approvedQty;
                  const isSelected = selectedRowId === it.id;
                  const isChecked = Boolean(selectedCheckedIds[it.id]);
                  const isItemInOrder = it.tabCategory === 'pedido' || it.isAddedToOrder === true;

                  return (
                    <tr 
                      key={it.id} 
                      onClick={() => setSelectedRowId(it.id)}
                      className={`transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-slate-800 ring-1 ring-inset ring-slate-300 dark:ring-slate-600'
                          : isChecked
                            ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                            : it.situation === 'SEM_ESTOQUE' 
                              ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40' 
                              : isItemInOrder && activeTab !== 'pedido' && activeTab !== 'consolidado'
                                ? 'bg-emerald-50/25 dark:bg-emerald-950/15 hover:bg-emerald-50/40'
                                : idx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-850/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60' : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Checkbox de Seleção nas Abas de Pesquisa/Catálogo */}
                      {isCatalogSearchTab && (
                        <td
                          onClick={(e) => handleToggleRowCheckbox(it.id, e)}
                          className="py-1 px-1 text-center border-r border-slate-100 dark:border-slate-800/60"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                          />
                        </td>
                      )}

                      {/* Seletor de Linha Estilo Access/Excel */}
                      <td 
                        onClick={() => setSelectedRowId(it.id)}
                        className={`py-1 px-1 text-center text-xs font-sans select-none cursor-pointer transition-colors border-r border-slate-100 dark:border-slate-800/60 ${
                          isSelected 
                            ? 'bg-slate-800 text-white font-bold' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title="Linha ativa (Pressione Delete nas abas de sugestão para remover da pesquisa)"
                      >
                        {isSelected ? '▶' : idx + 1}
                      </td>

                      {/* Situação */}
                      <td className="py-1 px-1.5 whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-100 dark:border-slate-800/60">
                        {it.situation === 'DISPONIVEL' && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50">
                            ✓ Disp
                          </span>
                        )}
                        {it.situation === 'PARCIAL' && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50">
                            ⚠ Parcial
                          </span>
                        )}
                        {it.situation === 'SEM_ESTOQUE' && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/50">
                            ✗ Falta
                          </span>
                        )}
                      </td>

                      {/* Coluna Origem (Exclusiva da Aba Consolidada) */}
                      {activeTab === 'consolidado' && (
                        <td className="py-1 px-1 text-center whitespace-nowrap overflow-hidden text-ellipsis border-r border-slate-100 dark:border-slate-800/60">
                          {(() => {
                            const orig = it.originCategory || it.tabCategory;
                            const b = getOriginBadge(orig, it.tabCategory);
                            return (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${b.bg} ${b.border} ${b.text}`}>
                                {b.label}
                              </span>
                            );
                          })()}
                        </td>
                      )}

                      {/* EAN / ISBN (Ocultável) */}
                      {showIsbnInGrid && (
                        <td className="py-1 px-1.5 font-medium text-slate-700 dark:text-slate-300 font-mono text-[10px] truncate border-r border-slate-100 dark:border-slate-800/60" title={it.isbn}>
                          {it.isbn}
                        </td>
                      )}

                      {/* Título (Separado do Assunto) */}
                      <td className="py-1 px-1.5 overflow-hidden border-r border-slate-100 dark:border-slate-800/60" title={it.title}>
                        <div className="font-sans font-medium text-slate-800 dark:text-slate-100 truncate text-[11px] flex items-center gap-1">
                          <span className="truncate">{it.title}</span>
                          {it.launchLabel && (
                            <span
                              className={`shrink-0 px-1 py-0.2 rounded text-[8px] font-mono font-semibold border ${
                                it.launchStatus === 'PRE_LANCAMENTO'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                  : it.launchStatus === 'EXPIRANDO'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                              }`}
                              title={it.launchDate ? `Data de lançamento: ${it.launchDate}` : it.launchLabel}
                            >
                              {it.launchLabel}
                            </span>
                          )}
                        </div>
                        {(it.lastSaleQty || it.notes) && (
                          <div className="font-sans text-[9px] text-slate-400 truncate leading-tight flex items-center gap-1">
                            {it.lastSaleQty && (
                              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                                Últ. op: {it.lastSaleQty} un ({it.lastSaleDate})
                              </span>
                            )}
                            {it.notes && (
                              <span className="text-rose-500 font-semibold">• {it.notes}</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Assunto (Regra 5: Coluna dedicada) */}
                      <td className="py-1 px-1.5 font-sans text-[10px] text-slate-600 dark:text-slate-400 truncate border-r border-slate-100 dark:border-slate-800/60" title={it.subject}>
                        {it.subject || '—'}
                      </td>

                      {/* Preço Capa (Ocultável pela Regra 7) */}
                      {showCoverPriceInGrid && (
                        <td className="py-1 px-1.5 text-right text-slate-600 dark:text-slate-400 font-mono text-[11px] truncate border-r border-slate-100 dark:border-slate-800/60">
                          {it.coverPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      )}

                      {/* Desconto % (Ocultável pela Regra 7) */}
                      {showDiscountInGrid && (
                        <td className="py-1 px-1 text-right border-r border-slate-100 dark:border-slate-800/60">
                          <input
                            id={`cell-discount-${idx}`}
                            type="number"
                            value={it.discountPercent}
                            min={0}
                            max={100}
                            step={0.5}
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setSelectedRowId(it.id);
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'discount', activeItems.length)}
                            onChange={(e) => handleUpdateItemDiscount(it.id, parseFloat(e.target.value) || 0)}
                            className="w-full max-w-[54px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-0.5 text-right text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500 font-mono"
                          />
                        </td>
                      )}

                      {/* Preço Líquido (Ocultável pela Regra 7) */}
                      {showDiscountInGrid && (
                        <td className="py-1 px-1.5 text-right font-medium text-slate-800 dark:text-slate-200 font-mono text-[11px] truncate border-r border-slate-100 dark:border-slate-800/60">
                          {netPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      )}

                      {/* Qtd (Pedida) - Permite 0 quando adicionado (Regra 11) */}
                      <td className="py-1 px-1 text-center border-r border-slate-100 dark:border-slate-800/60">
                        <input
                          id={`cell-qty-${idx}`}
                          type="number"
                          value={it.requestedQty}
                          min={0}
                          onFocus={(e) => {
                            e.currentTarget.select();
                            setSelectedRowId(it.id);
                          }}
                          onKeyDown={(e) => handleCellKeyDown(e, idx, 'qty', activeItems.length)}
                          onChange={(e) => handleUpdateItemQty(it.id, parseInt(e.target.value, 10) || 0)}
                          className={`w-full max-w-[56px] rounded border px-1 py-0.5 text-center text-xs font-bold focus:outline-none focus:ring-1 font-mono ${
                            isItemInOrder
                              ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 focus:ring-emerald-500'
                              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-slate-500'
                          }`}
                        />
                      </td>

                      {/* Subtotal */}
                      {showDiscountInGrid && (
                        <td className="py-1 px-1.5 text-right font-bold text-slate-900 dark:text-slate-100 font-mono text-[11px] truncate border-r border-slate-100 dark:border-slate-800/60">
                          {isItemInOrder
                            ? subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : netPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          }
                        </td>
                      )}

                      {/* Consignado */}
                      <td className="py-1 px-1 text-center font-mono border-r border-slate-100 dark:border-slate-800/60">
                        {it.consignedQty > 0 ? (
                          <span 
                            className="inline-block px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[10px]" 
                            title={`${it.consignedQty} unidades atualmente em consignação no cliente`}
                          >
                            {it.consignedQty}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">0</span>
                        )}
                      </td>

                      {/* VdsCli {x}d */}
                      <td className="py-1 px-1 text-center font-mono font-medium text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800/60">
                        <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px]" title={`Vendas do cliente nos últimos ${clientSalesDays} dias`}>
                          {it.clientSalesX || 0}
                        </span>
                      </td>

                      {/* Disponível (Estoque Horus) */}
                      <td className={`py-1 px-1.5 text-right font-mono font-semibold border-r border-slate-100 dark:border-slate-800/60 ${
                        it.horusStock === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {it.horusStock}
                      </td>

                      {/* Unid(CX) */}
                      <td className="py-1 px-1 text-center font-mono text-slate-500 dark:text-slate-400 text-[10px] border-r border-slate-100 dark:border-slate-800/60">
                        {it.boxUnits || '-'}
                      </td>

                      {/* VdsGeral 365d */}
                      <td className="py-1 px-1 text-center font-mono text-slate-600 dark:text-slate-400 text-[10px] border-r border-slate-100 dark:border-slate-800/60">
                        {it.generalSales365?.toLocaleString('pt-BR') || 0}
                      </td>

                      {/* VdsGeral {x}d */}
                      <td className="py-1 px-1 text-center font-mono font-medium text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800/60">
                        <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px]" title={`Vendas gerais da distribuidora nos últimos ${generalSalesDays} dias`}>
                          {it.generalSalesX?.toLocaleString('pt-BR') || 0}
                        </span>
                      </td>

                      {/* Status / Ação (Regra 11: Marca visualmente "✓ Adicionado" com opção de remover) */}
                      <td className="py-1 px-1 text-center whitespace-nowrap">
                        {activeTab === 'pedido' || activeTab === 'consolidado' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(it.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remover item do pedido consolidado"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : isItemInOrder ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveItem(it.id);
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-700 border border-emerald-300 hover:border-rose-300 text-[9px] font-bold transition-all group"
                            title="Item já adicionado ao pedido e ao Consolidado! Clique caso queira desmarcar"
                          >
                            <Check className="h-2.5 w-2.5 group-hover:hidden" />
                            <X className="h-2.5 w-2.5 hidden group-hover:inline" />
                            <span className="group-hover:hidden">Adicionado</span>
                            <span className="hidden group-hover:inline">Retirar</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddCatalogItemToOrder(it);
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 hover:text-emerald-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 text-[9px] font-semibold transition-all"
                            title="Adicionar ao pedido com Qtd 0"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Adicionar
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

        {/* ── RODAPÉ TOTALIZADOR ESTILO ACCESS (Sempre Visível) ─────────────── */}
        <div className="p-2.5 bg-slate-100 dark:bg-slate-850 border-t border-slate-300 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          
          {/* Termômetro de Pedido Mínimo */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 shrink-0">
              <Scale className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Pedido Mínimo: {summary.minOrder.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>

            <div className="w-36 sm:w-44 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${summary.minOrderReached ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, (summary.totalNet / (summary.minOrder || 1)) * 100)}%` }}
              />
            </div>

            <span className={`text-[11px] font-bold shrink-0 ${summary.minOrderReached ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {summary.minOrderReached 
                ? '✓ Atingido!' 
                : `Faltam ${summary.diffToMin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
              }
            </span>
          </div>

          {/* Totais Gerais & Entrada de Desconto Global no Rodapé */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-5 shrink-0 text-right">
            <div>
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Peças</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {summary.totalApprovedPieces} / {summary.totalRequestedPieces}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Total Capa</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {summary.totalCover.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>

            {/* Campo Editável de Desconto Geral no Rodapé */}
            <div className="flex flex-col items-end pl-2 border-l border-slate-300 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                <Percent className="h-3 w-3" />
                Desconto Geral
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={globalDiscountInput}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    handleApplyGlobalDiscount(val);
                  }}
                  className="w-16 rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-right font-mono font-black text-xs text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  title="Digite o desconto geral para aplicar a todos os itens da proposta"
                />
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 font-mono">%</span>
              </div>
              {!showDiscountInGrid && (
                <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold">
                  (Aplicado aos itens)
                </span>
              )}
            </div>

            <div className="pl-4 border-l border-slate-300 dark:border-slate-700">
              <span className="text-[10px] uppercase text-slate-400 block font-bold">Total Líquido</span>
              <span className="text-base font-mono font-black text-emerald-600 dark:text-emerald-400">
                {summary.totalNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 5. MODAL DE DOCUMENTAÇÃO RÁPIDA: REGRAS DA MESA DBM (AUTOEXPLICATIVO) */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isRulesGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                <HelpCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Guia Rápido — Regras & Atalhos da Mesa de Orçamentos DBM</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRulesGuideOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 text-xs text-slate-600 dark:text-slate-300">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  1. Sequência de Trabalho das Abas
                </div>
                <p>
                  A ordem segue o fluxo operacional: <b>Pedidos</b> ➔ <b>Reposição</b> ➔ <b>Novidades</b> ➔ <b>Fundo de Catálogo</b> ➔ <b>Último Acerto / Venda</b> ➔ <b>Pedido Consolidado</b>.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  2. Exclusividade entre Abas & Estoque Disponível
                </div>
                <p>
                  • Nenhum ISBN se repete entre as abas de classificação: o que está em <b>Pedidos</b> não aparece em <b>Reposição</b> ou <b>Novidades</b>, e o que está em <b>Novidades</b> não se repete em <b>Reposição</b> ou <b>Fundo</b>. Somente o <b>Pedido Consolidado</b> unifica todos os itens.<br />
                  • Nas abas de sugestão (<b>Reposição</b>, <b>Novidades</b>, <b>Fundo</b> e <b>Último Acerto</b>), itens com <b>estoque zerado</b> são ocultados automaticamente.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  3. Aba Reposição (Botão Buscar + Base Vendas X Dias)
                </div>
                <p>
                  Ao clicar em <b>Buscar</b> na aba <b>Reposição</b>, o sistema consulta o <b>Saldo Consignado ativo no cliente (via API Hórus)</b> somado ao <b>histórico de itens vendidos ao cliente nos últimos X dias</b> (configurável no botão discreto <i>Base Vendas: Xd</i> ao lado da busca).
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  4. Seleção em Lote, Botão Adicionar (Qtd = 0) e Tecla Delete
                </div>
                <p>
                  • Marque todos ou selecione itens individualmente e clique no botão único <b>Adicionar</b>: os itens recebem a marcação <b>✓ Adicionado</b>, vão para o <b>Pedido Consolidado</b> e entram com <b>Quantidade 0</b> para preenchimento manual.<br />
                  • Pressione a tecla <b>Delete</b> sobre qualquer linha selecionada nas abas de pesquisa (<i>Reposição, Novidades, Fundo, Último Acerto</i>) para eliminar o item daquela pesquisa.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  5. Experiência Excel: Largura de Colunas, Ordenação e Ocultação
                </div>
                <p>
                  • <b>Redimensionar Colunas</b>: arraste a borda direita de qualquer cabeçalho da grade (fica salvo automaticamente para o seu usuário).<br />
                  • <b>Ordenar</b>: clique no título de qualquer coluna para ordenar (<i>A → Z</i> em textos ou <i>Maior → Menor</i> em números).<br />
                  • <b>Colunas Visíveis</b>: ative ou desative <b>ISBN</b>, <b>Capa</b> e <b>Desconto</b> a qualquer momento na barra superior da grade.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsRulesGuideOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-indigo-600 text-white text-xs font-bold"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 6. MODAL DE CONFIGURAÇÃO DE STATUS E PREFERÊNCIAS (POR SELLER)      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
            
            {/* Cabeçalho do Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-sm">
                <Settings2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Configurações da Mesa & Status do Seller</span>
              </div>
              <button 
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {saveSuccessMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCheck className="h-4 w-4 text-emerald-600" />
                <span>{saveSuccessMessage}</span>
              </div>
            )}

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              
              {/* Seção 1: Colunas Visíveis no Grid */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Columns3 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Colunas Visíveis na Grade (Todas as Abas)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs font-semibold">
                    <span>Coluna ISBN</span>
                    <input
                      type="checkbox"
                      checked={showIsbnInGrid}
                      onChange={(e) => setShowIsbnInGrid(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs font-semibold">
                    <span>Coluna Capa</span>
                    <input
                      type="checkbox"
                      checked={showCoverPriceInGrid}
                      onChange={(e) => setShowCoverPriceInGrid(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs font-semibold">
                    <span>Colunas Desconto (Grade)</span>
                    <input
                      type="checkbox"
                      checked={showDiscountInGrid}
                      onChange={(e) => setShowDiscountInGrid(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs font-semibold">
                    <span>Campo DESC% na Digitação Rápida</span>
                    <input
                      type="checkbox"
                      checked={showQuickDiscountInput}
                      onChange={(e) => setShowQuickDiscountInput(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                  </label>
                </div>

                {/* Configuração Geral de Pesquisa DBM (E-books & Esgotados) */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2">
                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Configuração Geral de Pesquisa DBM</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs font-semibold">
                      <span>Não mostrar E-books nas pesquisas</span>
                      <input
                        type="checkbox"
                        checked={hideEbooksInSearch}
                        onChange={(e) => setHideEbooksInSearch(e.target.checked)}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer text-xs font-semibold">
                      <span>Não mostrar Esgotados nas pesquisas</span>
                      <input
                        type="checkbox"
                        checked={hideOutOfPrintInSearch}
                        onChange={(e) => setHideOutOfPrintInSearch(e.target.checked)}
                        className="h-4 w-4 rounded text-indigo-600"
                      />
                    </label>
                  </div>
                </div>

                {/* Parâmetros Padrão de Dias */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Dias Vendas Cliente
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={clientSalesDays}
                        onChange={(e) => setClientSalesDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-bold font-mono text-indigo-600 text-center"
                      />
                      <span className="text-xs text-slate-400">dias</span>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Dias Vendas Geral
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={generalSalesDays}
                        onChange={(e) => setGeneralSalesDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-bold font-mono text-emerald-600 text-center"
                      />
                      <span className="text-xs text-slate-400">dias</span>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Base Busca Reposição
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={730}
                        value={replenishmentSalesDays}
                        onChange={(e) => setReplenishmentSalesDays(Math.max(1, parseInt(e.target.value) || 90))}
                        className="w-16 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-bold font-mono text-indigo-600 text-center"
                      />
                      <span className="text-xs text-slate-400">dias</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 2: Personalização dos Status da Proposta */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Nomenclaturas de Status do Pipeline (Por Seller)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {tempStatuses.length} fases mapeadas
                  </span>
                </div>

                <div className="space-y-2">
                  {tempStatuses.map((st) => (
                    <div key={st.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${st.badgeBg} ${st.badgeBorder} ${st.badgeText} border`}>
                          Fase: {st.phase}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {st.id}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={st.name}
                          onChange={(e) => {
                            const updated = tempStatuses.map(s => s.id === st.id ? { ...s, name: e.target.value } : s);
                            setTempStatuses(updated);
                          }}
                          className="flex-1 text-xs font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Nome personalizado deste status..."
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        {st.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Rodapé com Ações */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setTempStatuses(INITIAL_SELLER_STATUSES);
                  setShowDiscountInGrid(true);
                  setShowIsbnInGrid(true);
                  setShowCoverPriceInGrid(true);
                  setShowQuickDiscountInput(true);
                  setHideEbooksInSearch(true);
                  setHideOutOfPrintInSearch(true);
                  setClientSalesDays(30);
                  setGeneralSalesDays(90);
                  setReplenishmentSalesDays(90);
                  setColumnWidths(DEFAULT_COLUMN_WIDTHS);
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                Restaurar Padrões
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAvailableStatuses(tempStatuses);
                    saveConfigToStorage({
                      statuses: tempStatuses,
                      showDiscountInGrid,
                      showIsbnInGrid,
                      showCoverPriceInGrid,
                      showQuickDiscountInput,
                      hideEbooksInSearch,
                      hideOutOfPrintInSearch,
                      clientSalesDays,
                      generalSalesDays,
                      replenishmentSalesDays,
                      globalDiscountInput,
                      columnWidths
                    });
                    if (customer?.id) {
                      loadCustomerDeskData(customer.id);
                    }
                    setSaveSuccessMessage('Configurações salvas e gravadas com sucesso para seu usuário!');
                    setTimeout(() => {
                      setSaveSuccessMessage(null);
                      setIsConfigModalOpen(false);
                    }, 900);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Salvar Configurações
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 7. MODAL DE TRANSMISSÃO CONSOLIDADA AO HÓRUS ERP                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {isSendHorusModalOpen && customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    Transmitir Pedido Consolidado ao Hórus ERP
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Validação prévia das origens, alçadas comerciais e reserva de estoque
                  </p>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => {
                  setIsSendHorusModalOpen(false);
                  setHorusSuccessResponse(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 text-xs">
              
              {horusSuccessResponse ? (
                <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-3 animate-in zoom-in-95">
                  <div className="h-12 w-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-emerald-900 dark:text-emerald-200">
                      Pedido Integrado no Hórus com Sucesso!
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                      Número do Pedido Hórus: <strong>#{horusSuccessResponse.orderNumber}</strong>
                    </p>
                  </div>
                  <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 max-w-sm mx-auto text-left space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Cliente:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{customer.corporate_name}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Total de Peças:</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{horusSuccessResponse.totalPieces} un</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Valor Faturável:</span>
                      <span className="font-bold font-mono text-emerald-700 dark:text-emerald-300">
                        {horusSuccessResponse.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Status da Proposta:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">Convertido em Pedido Horus</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Comprador / Destinatário</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {customer.corporate_name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 block">
                        CNPJ: {customer.document} • Hórus Cód: {customer.horus_cod_cli}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Condição de Pagamento</span>
                      <span className="font-bold text-indigo-700 dark:text-indigo-400">
                        {customer.paymentCondition}
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        {customer.commercialPolicy}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Composição dos Itens Consolidados ({proposalItems.length} títulos)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                        <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 block">Pedidos</span>
                        <span className="text-base font-black font-mono text-indigo-900 dark:text-indigo-200">
                          {proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'pedido').length}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 block">Reposição</span>
                        <span className="text-base font-black font-mono text-emerald-900 dark:text-emerald-200">
                          {proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'reposicao').length}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block">Novidades</span>
                        <span className="text-base font-black font-mono text-amber-900 dark:text-amber-200">
                          {proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'novidades').length}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
                        <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 block">Fundo</span>
                        <span className="text-base font-black font-mono text-sky-900 dark:text-sky-200">
                          {proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'fundo').length}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
                        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 block">Último Acerto</span>
                        <span className="text-base font-black font-mono text-purple-900 dark:text-purple-200">
                          {proposalItems.filter(i => (i.originCategory || i.tabCategory) === 'ultimo_acerto').length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-500">
                          <tr>
                            <th className="p-1.5 pl-2.5">Título</th>
                            <th className="p-1.5 text-center">Origem</th>
                            <th className="p-1.5 text-center font-mono">Qtd</th>
                            <th className="p-1.5 text-right font-mono">Líquido</th>
                            <th className="p-1.5 pr-2.5 text-right font-mono">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                          {proposalItems.map((item) => {
                            const net = item.coverPrice * (1 - item.discountPercent / 100);
                            const sub = net * item.approvedQty;
                            const orig = item.originCategory || item.tabCategory;
                            const b = getOriginBadge(orig, item.tabCategory);
                            return (
                              <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                                <td className="p-1.5 pl-2.5 font-sans font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={item.title}>
                                  {item.title}
                                </td>
                                <td className="p-1.5 text-center">
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${b.bg} ${b.border} ${b.text}`}>
                                    {b.label}
                                  </span>
                                </td>
                                <td className="p-1.5 text-center font-bold text-slate-900 dark:text-white">
                                  {item.approvedQty}
                                </td>
                                <td className="p-1.5 text-right text-slate-500">
                                  {net.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                                <td className="p-1.5 pr-2.5 text-right font-bold text-slate-900 dark:text-white">
                                  {sub.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Validação Pedido Mínimo</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {summary.minOrder.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded ${
                          summary.minOrderReached ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                        }`}>
                          {summary.minOrderReached ? '✓ ALCANÇADO' : 'PENDENTE'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total de Peças</span>
                        <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                          {summary.totalApprovedPieces} un
                        </span>
                      </div>
                      <div className="pl-3 border-l border-slate-300 dark:border-slate-700">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Líquido Faturável</span>
                        <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {summary.totalNet.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              {horusSuccessResponse ? (
                <div className="w-full flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSendHorusModalOpen(false);
                      setHorusSuccessResponse(null);
                    }}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors"
                  >
                    Concluir e Fechar
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsSendHorusModalOpen(false)}
                    disabled={isSendingToHorus}
                    className="px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    disabled={isSendingToHorus || proposalItems.length === 0}
                    onClick={() => {
                      setIsSendingToHorus(true);
                      setTimeout(() => {
                        setIsSendingToHorus(false);
                        setHorusSuccessResponse({
                          orderNumber: 29482,
                          date: new Date().toLocaleDateString('pt-BR'),
                          totalPieces: summary.totalApprovedPieces,
                          totalValue: summary.totalNet
                        });
                        setCurrentStatusId('st-5');
                      }, 1000);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {isSendingToHorus ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Transmitindo ao Hórus...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        <span>🚀 Confirmar Transmissão ao Hórus</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

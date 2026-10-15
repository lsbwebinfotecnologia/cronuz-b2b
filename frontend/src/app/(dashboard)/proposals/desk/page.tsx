'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  CheckCheck
} from 'lucide-react';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import { getUser } from '@/lib/auth';

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
  clientSalesDays: number;
  generalSalesDays: number;
  globalDiscountInput: number;
  statuses: SellerCustomStatus[];
}

const getDeskStorageKey = () => {
  if (typeof window === 'undefined') return 'cronuz_proposal_desk_config';
  try {
    const user = getUser();
    const companyId = user?.company_id || user?.id || 'default';
    return `cronuz_proposal_desk_config_${companyId}`;
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

// ── Tipagens dos Itens da Grade DBM (Access) ────────────────────────────────
export interface DbmItem {
  id: string;
  isbn: string;
  title: string;
  publisher: string;
  subject: string;            // Assunto / Categoria
  coverPrice: number;         // Preço Capa
  discountPercent: number;    // Desconto %
  requestedQty: number;       // Qtd Pedida
  approvedQty: number;        // Qtd Atendida
  consignedQty: number;       // Consignado com o cliente
  clientSalesX: number;       // Vendas desse cliente no período {x}
  horusStock: number;         // Estoque Disponível Horus
  boxUnits: number;           // Unidades por caixa (CX)
  generalSales365: number;    // Vendas Geral últimos 365 dias
  generalSalesX: number;      // Vendas Geral no período {x}
  situation: 'DISPONIVEL' | 'PARCIAL' | 'SEM_ESTOQUE' | 'BLOQUEADO';
  tabCategory: 'pedido' | 'novidades' | 'reposicao' | 'fundo';
  notes?: string;
}

export default function ProposalsDeskPage() {
  // ── 1. Estado do Cliente Selecionado ──────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number>('1');
  const [customer, setCustomer] = useState<any>({
    id: 1,
    name: 'ANNE LOUISE GALANTE DE ALMEIDA',
    corporate_name: 'ANNE LOUISE GALANTE DE ALMEIDA',
    document: '31388484000111',
    nickname: 'Anne Lousie galante de Alemida',
    minOrderValue: 600.00,
    creditLimit: 30000.00,
    openDebts: 0.0,
    paymentCondition: '30 DDL',
    commercialPolicy: 'Tabela Comercial Padrão',
    city: 'São Paulo',
    state: 'SP',
    horus_cod_cli: 10420
  });

  // ── 2. Mini Métricas de Últimas Operações ─────────────────────────────────
  const [operationsMetrics] = useState({
    remessa: { totalValue: 14850.00, totalUnits: 280, date: '12/10/2026', doc: 'NF 019.284' },
    venda: { totalValue: 8420.00, totalUnits: 145, date: '08/10/2026', doc: 'NF 019.102' },
    acerto: { totalValue: 5210.00, totalUnits: 92, date: '30/09/2026', doc: 'Quinq. #42' },
    devolucao: { totalValue: 1130.00, totalUnits: 18, date: '25/09/2026', doc: 'Avaria/Sobra' }
  });

  // ── 3. Central de Origem de Pedidos & Parametrizações de Análise ───────────
  const [isIntakeDrawerOpen, setIsIntakeDrawerOpen] = useState(false);
  const [intakeSource, setIntakeSource] = useState<'excel' | 'pdf' | 'text'>('text');
  const [rawText, setRawText] = useState(
    `9788535902777 - 15 un\n9788501012345 - 20 un\n9788532511010 x 10\n9786555320893 5`
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);

  // Parametrizações de Vendas Solicitadas (Dias Cliente e Dias Geral)
  const [clientSalesDays, setClientSalesDays] = useState<number>(30);
  const [generalSalesDays, setGeneralSalesDays] = useState<number>(90);

  // Configuração de Segurança e Visualização de Desconto
  const [showDiscountInGrid, setShowDiscountInGrid] = useState<boolean>(true);
  const [globalDiscountInput, setGlobalDiscountInput] = useState<number>(50.0);

  // ── 4. Abas Comerciais de Catálogo ────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'pedido' | 'novidades' | 'reposicao' | 'fundo'>('pedido');

  // ── 5. Status da Proposta e Pipeline Customizável (Persistente por Seller) ─
  const [availableStatuses, setAvailableStatuses] = useState<SellerCustomStatus[]>(INITIAL_SELLER_STATUSES);
  const [tempStatuses, setTempStatuses] = useState<SellerCustomStatus[]>(INITIAL_SELLER_STATUSES);
  const [currentStatusId, setCurrentStatusId] = useState<string>('st-2'); // Aguardando Análise Comercial
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // ── Persistência de Configurações no LocalStorage (Por Seller/Login) ───────
  useEffect(() => {
    try {
      const key = getDeskStorageKey();
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.showDiscountInGrid === 'boolean') {
          setShowDiscountInGrid(parsed.showDiscountInGrid);
        }
        if (typeof parsed.clientSalesDays === 'number') {
          setClientSalesDays(parsed.clientSalesDays);
        }
        if (typeof parsed.generalSalesDays === 'number') {
          setGeneralSalesDays(parsed.generalSalesDays);
        }
        if (typeof parsed.globalDiscountInput === 'number') {
          setGlobalDiscountInput(parsed.globalDiscountInput);
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

  const saveConfigToStorage = (partial: Partial<ProposalDeskConfig>) => {
    try {
      const key = getDeskStorageKey();
      const currentRaw = localStorage.getItem(key);
      const current: ProposalDeskConfig = currentRaw ? JSON.parse(currentRaw) : {
        showDiscountInGrid,
        clientSalesDays,
        generalSalesDays,
        globalDiscountInput,
        statuses: availableStatuses
      };

      const updated = {
        ...current,
        ...partial
      };

      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao gravar configurações no localStorage:', e);
    }
  };

  const handleToggleDiscountInGrid = () => {
    const nextVal = !showDiscountInGrid;
    setShowDiscountInGrid(nextVal);
    saveConfigToStorage({ showDiscountInGrid: nextVal });
  };

  // ── 6. Filtros Locais da Grade DBM ────────────────────────────────────────
  const [gridSearch, setGridSearch] = useState('');
  const [situationFilter, setSituationFilter] = useState<'ALL' | 'DISPONIVEL' | 'PARCIAL' | 'SEM_ESTOQUE'>('ALL');

  const activeStatus = useMemo(() => {
    return availableStatuses.find(s => s.id === currentStatusId) || availableStatuses[0];
  }, [availableStatuses, currentStatusId]);

  // ── 7. Itens da Grade DBM (Access) ────────────────────────────────────────
  const [items, setItems] = useState<DbmItem[]>([
    {
      id: 'item-1',
      isbn: '9788535902777',
      title: 'O Hobbit: Edição Ilustrada de Luxo',
      publisher: 'HarperCollins Brasil',
      subject: 'Literatura / Fantasia',
      coverPrice: 79.90,
      discountPercent: 50.0,
      requestedQty: 15,
      approvedQty: 15,
      consignedQty: 12,
      clientSalesX: 8,
      horusStock: 142,
      boxUnits: 20,
      generalSales365: 1840,
      generalSalesX: 320,
      situation: 'DISPONIVEL',
      tabCategory: 'pedido'
    },
    {
      id: 'item-2',
      isbn: '9788501012345',
      title: 'Cem Anos de Solidão (Capa Dura)',
      publisher: 'Record',
      subject: 'Ficção Clássica',
      coverPrice: 89.90,
      discountPercent: 48.0,
      requestedQty: 20,
      approvedQty: 18,
      consignedQty: 0,
      clientSalesX: 14,
      horusStock: 18,
      boxUnits: 15,
      generalSales365: 980,
      generalSalesX: 210,
      situation: 'PARCIAL',
      notes: 'Estoque Horus limitado a 18 unidades',
      tabCategory: 'pedido'
    },
    {
      id: 'item-3',
      isbn: '9788532511010',
      title: 'Harry Potter e a Pedra Filosofal',
      publisher: 'Rocco',
      subject: 'Infantojuvenil',
      coverPrice: 59.90,
      discountPercent: 50.0,
      requestedQty: 10,
      approvedQty: 10,
      consignedQty: 25,
      clientSalesX: 22,
      horusStock: 250,
      boxUnits: 24,
      generalSales365: 4200,
      generalSalesX: 890,
      situation: 'DISPONIVEL',
      tabCategory: 'pedido'
    },
    {
      id: 'item-4',
      isbn: '9786555320893',
      title: 'A Paciente Silenciosa: Best-Seller Internacional',
      publisher: 'Record',
      subject: 'Suspense / Thriller',
      coverPrice: 64.90,
      discountPercent: 50.0,
      requestedQty: 5,
      approvedQty: 0,
      consignedQty: 6,
      clientSalesX: 4,
      horusStock: 0,
      boxUnits: 20,
      generalSales365: 3100,
      generalSalesX: 540,
      situation: 'SEM_ESTOQUE',
      notes: 'Ruptura momentânea na filial',
      tabCategory: 'pedido'
    },
    // Novidades
    {
      id: 'nov-1',
      isbn: '9786588439128',
      title: 'Lançamento: O Algoritmo da Consciência Humana',
      publisher: 'Editora Cronuz Books',
      subject: 'Tecnologia / Filosofia',
      coverPrice: 69.90,
      discountPercent: 52.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 0,
      clientSalesX: 0,
      horusStock: 400,
      boxUnits: 20,
      generalSales365: 640,
      generalSalesX: 180,
      situation: 'DISPONIVEL',
      tabCategory: 'novidades'
    },
    {
      id: 'nov-2',
      isbn: '9786588439135',
      title: 'Lançamento: Guia Prático de Gestão Editorial 2026',
      publisher: 'Editora Cronuz Books',
      subject: 'Negócios / Editorial',
      coverPrice: 84.00,
      discountPercent: 50.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 0,
      clientSalesX: 0,
      horusStock: 180,
      boxUnits: 15,
      generalSales365: 320,
      generalSalesX: 95,
      situation: 'DISPONIVEL',
      tabCategory: 'novidades'
    },
    {
      id: 'nov-3',
      isbn: '9786559210459',
      title: 'Inteligência Artificial Aplicada ao Varejo',
      publisher: 'Alta Books',
      subject: 'Negócios / IA',
      coverPrice: 92.00,
      discountPercent: 50.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 0,
      clientSalesX: 0,
      horusStock: 120,
      boxUnits: 12,
      generalSales365: 890,
      generalSalesX: 240,
      situation: 'DISPONIVEL',
      tabCategory: 'novidades'
    },
    // Reposição
    {
      id: 'rep-1',
      isbn: '9788576572008',
      title: 'Duna (Edição Especial)',
      publisher: 'Aleph',
      subject: 'Ficção Científica',
      coverPrice: 119.00,
      discountPercent: 50.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 18,
      clientSalesX: 35,
      horusStock: 95,
      boxUnits: 10,
      generalSales365: 1420,
      generalSalesX: 310,
      situation: 'DISPONIVEL',
      notes: 'Cliente vendeu 35 un nos últimos dias configurados',
      tabCategory: 'reposicao'
    },
    {
      id: 'rep-2',
      isbn: '9788535914848',
      title: '1984 (Edição Comemorativa)',
      publisher: 'Companhia das Letras',
      subject: 'Ficção / Distopia',
      coverPrice: 64.90,
      discountPercent: 50.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 10,
      clientSalesX: 28,
      horusStock: 210,
      boxUnits: 25,
      generalSales365: 2950,
      generalSalesX: 580,
      situation: 'DISPONIVEL',
      notes: 'Giro alto no cliente (média recorrente)',
      tabCategory: 'reposicao'
    },
    // Fundo
    {
      id: 'fun-1',
      isbn: '9788520921004',
      title: 'Grande Sertão: Veredas',
      publisher: 'Companhia das Letras',
      subject: 'Literatura Brasileira',
      coverPrice: 94.90,
      discountPercent: 45.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 4,
      clientSalesX: 6,
      horusStock: 64,
      boxUnits: 12,
      generalSales365: 540,
      generalSalesX: 110,
      situation: 'DISPONIVEL',
      tabCategory: 'fundo'
    },
    {
      id: 'fun-2',
      isbn: '9788535904832',
      title: 'Dom Casmurro (Edição Crítica)',
      publisher: 'Penguin Companhia',
      subject: 'Literatura Clássica',
      coverPrice: 49.90,
      discountPercent: 48.0,
      requestedQty: 0,
      approvedQty: 0,
      consignedQty: 8,
      clientSalesX: 12,
      horusStock: 115,
      boxUnits: 30,
      generalSales365: 1120,
      generalSalesX: 190,
      situation: 'DISPONIVEL',
      tabCategory: 'fundo'
    }
  ]);

  // ── 8. Controles de Layout e Navegação Estilo Access ───────────────────────
  const [isGridMaximized, setIsGridMaximized] = useState(false);
  const [showHistoryCards, setShowHistoryCards] = useState(true);
  const [selectedRowId, setSelectedRowId] = useState<string>('item-1');

  // ── 8. Cálculos Financeiros e Totais ───────────────────────────────────────
  const activeItems = useMemo(() => {
    return items.filter(item => {
      if (item.tabCategory !== activeTab) return false;
      if (situationFilter !== 'ALL' && item.situation !== situationFilter) return false;
      if (gridSearch.trim()) {
        const q = gridSearch.toLowerCase();
        return item.title.toLowerCase().includes(q) || 
               item.isbn.includes(q) || 
               item.publisher.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, activeTab, situationFilter, gridSearch]);

  const proposalItems = useMemo(() => {
    return items.filter(item => item.tabCategory === 'pedido');
  }, [items]);

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
  const handleAnalyzeOrder = () => {
    setIsAnalysing(true);
    setTimeout(() => {
      setIsAnalysing(false);
      setIsIntakeDrawerOpen(false);
      setActiveTab('pedido');
    }, 600);
  };

  const handleUpdateItemQty = (id: string, newQty: number) => {
    setItems(prev => prev.map(it => {
      if (it.id === id) {
        const approved = Math.min(newQty, it.horusStock);
        return {
          ...it,
          requestedQty: newQty,
          approvedQty: approved,
          situation: approved === 0 ? 'SEM_ESTOQUE' : approved < newQty ? 'PARCIAL' : 'DISPONIVEL'
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
    setItems(prev => prev.map(it => ({
      ...it,
      discountPercent: clamped
    })));
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const handleAddCatalogItemToOrder = (item: DbmItem) => {
    setItems(prev => [
      ...prev.filter(it => it.id !== item.id),
      {
        ...item,
        tabCategory: 'pedido',
        requestedQty: 5,
        approvedQty: Math.min(5, item.horusStock),
      }
    ]);
    setActiveTab('pedido');
  };

  // Navegação no estilo Access: Setas para Cima/Baixo, Tab e Enter
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

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 p-2 sm:p-4 space-y-3 font-sans">
      
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. BARRA DE COMANDO SUPERIOR (Densa, Compacta e Direta)              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        
        {/* Esquerda: Voltar + Título + Campo de Busca de Cliente Compacto */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Link 
            href="/proposals"
            title="Voltar para listagem de propostas"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          
          <div className="shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block leading-none">
              Gestão de Vendas DBM
            </span>
            <h1 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
              Orçamentos & Propostas
            </h1>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block shrink-0" />

          {/* Autocomplete do Cliente em formato compacto de barra */}
          <div className="flex-1 max-w-md min-w-[240px]">
            <CustomerAutocomplete
              value={selectedCustomerId}
              onChange={(id, cust) => {
                setSelectedCustomerId(id);
                if (cust) {
                  setCustomer({
                    id: cust.id,
                    name: cust.name,
                    corporate_name: cust.corporate_name || cust.name,
                    document: cust.document || '00.000.000/0000-00',
                    nickname: cust.name,
                    minOrderValue: cust.min_order_total || 600.00,
                    creditLimit: cust.credit_limit || 30000.00,
                    openDebts: cust.open_debts || 0.0,
                    paymentCondition: cust.payment_condition || '30 DDL',
                    commercialPolicy: cust.commercial_policy?.name || 'Tabela Comercial Padrão',
                    city: cust.city || 'São Paulo',
                    state: cust.state || 'SP',
                    horus_cod_cli: cust.horus_cod_cli || 10420
                  });
                }
              }}
              placeholder="🔍 Selecione o Cliente (Nome, CNPJ ou Apelido)..."
            />
          </div>
        </div>

        {/* Direita: Inserção de Pedido + Status do Seller + Botão Salvar */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          
          {/* Botão de Toggle da Gaveta de Origem / Leitura de Pedidos */}
          <button
            type="button"
            onClick={() => setIsIntakeDrawerOpen(!isIntakeDrawerOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${
              isIntakeDrawerOpen 
                ? 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500' 
                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Importar Pedido</span>
            <span className="text-[10px] font-mono opacity-80">(Excel / PDF / Texto)</span>
            {isIntakeDrawerOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
            title="Configurar preferências da mesa e status deste Seller"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            Salvar
          </button>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. BARRA DE DADOS DO CLIENTE & MINI CARDS DE HISTÓRICO EXPANDIDOS   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        {/* Faixa do Cliente */}
        <div className="bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cliente:</span>
              <span className="truncate max-w-[200px] sm:max-w-xs">{customer.corporate_name || customer.name}</span>
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

        {/* 4 Cards de Histórico de Operações (Com DATAS EM GRANDE DESTAQUE) */}
        {showHistoryCards ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 animate-in fade-in duration-200">
            
            {/* Card Remessa */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:border-indigo-400 transition-colors">
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Última Remessa
                </span>
                {/* DATA EM GRANDE DESTAQUE */}
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
                {/* DATA EM GRANDE DESTAQUE */}
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
                {/* DATA EM GRANDE DESTAQUE */}
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
                {/* DATA EM GRANDE DESTAQUE */}
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
                onClick={() => setIntakeSource('excel')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeSource === 'excel' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📊 Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => setIntakeSource('pdf')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  intakeSource === 'pdf' ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📄 PDF
              </button>
            </div>
          </div>

          {/* Campo correspondente à origem */}
          {intakeSource === 'text' && (
            <textarea
              rows={3}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Cole aqui o e-mail, mensagem de WhatsApp ou tabela copiada com ISBNs e quantidades..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          )}

          {intakeSource === 'excel' && (
            <div className="border border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-center bg-emerald-50/20">
              <input type="file" accept=".xlsx,.csv" id="excel-file" className="hidden" onChange={(e) => setUploadedFile(e.target.files?.[0] || null)} />
              <label htmlFor="excel-file" className="cursor-pointer text-xs text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                {uploadedFile ? uploadedFile.name : 'Clique para selecionar arquivo Excel (.xlsx ou .csv)'}
              </label>
            </div>
          )}

          {intakeSource === 'pdf' && (
            <div className="border border-dashed border-rose-300 dark:border-rose-800 rounded-lg p-3 text-center bg-rose-50/20">
              <input type="file" accept=".pdf" id="pdf-file" className="hidden" onChange={(e) => setUploadedFile(e.target.files?.[0] || null)} />
              <label htmlFor="pdf-file" className="cursor-pointer text-xs text-rose-700 dark:text-rose-400 font-bold flex items-center justify-center gap-2">
                <FileText className="h-4 w-4" />
                {uploadedFile ? uploadedFile.name : 'Clique para selecionar Ordem de Compra em PDF'}
              </label>
            </div>
          )}

          {/* Parametrização da Análise de Vendas (Cliente e Geral) */}
          <div className="bg-slate-50 dark:bg-slate-850 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  Histórico Vendas Cliente:
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={clientSalesDays}
                  onChange={(e) => setClientSalesDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-0.5 font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400 text-center focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-500 font-medium">dias</span>
                <div className="inline-flex gap-1 ml-1">
                  {[15, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setClientSalesDays(d)}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${
                        clientSalesDays === d 
                          ? 'bg-indigo-600 text-white shadow-2xs' 
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Histórico Vendas Geral:
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={generalSalesDays}
                  onChange={(e) => setGeneralSalesDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-0.5 font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400 text-center focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-500 font-medium">dias</span>
                <div className="inline-flex gap-1 ml-1">
                  {[30, 60, 90, 180].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setGeneralSalesDays(d)}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all ${
                        generalSalesDays === d 
                          ? 'bg-emerald-600 text-white shadow-2xs' 
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              A inteligência analisa os ISBNs, consulta estoque físico no Horus, vendas do cliente e vendas gerais.
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
      {/* 4. A GRADE DBM ACCESS NO TOPO (HERO / PROTAGONISTA DA TELA)          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={`bg-white dark:bg-slate-900 border transition-all duration-150 overflow-hidden flex flex-col ${
        isGridMaximized 
          ? 'fixed inset-2 sm:inset-3 z-50 rounded-xl border-indigo-500 shadow-2xl' 
          : 'rounded-xl border-slate-200 dark:border-slate-800 shadow-sm'
      }`}>
        
        {/* Barra 1: Toolbar de Filtros, Parâmetros e Ferramentas (Linha Superior com 100% de espaço) */}
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
              <button
                type="button"
                onClick={() => setSituationFilter('SEM_ESTOQUE')}
                className={`px-2 py-0.5 rounded ${situationFilter === 'SEM_ESTOQUE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500'}`}
              >
                Faltas
              </button>
            </div>
          </div>

          {/* Direita da Toolbar: Parametrizações Rápidas (3 dígitos) + Segurança Desconto + Maximizar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Parametrização Rápida de Vendas na Grade (Alargado para caber até 3 dígitos com conforto) */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs shadow-2xs">
              <div className="flex items-center gap-1" title="Dias de histórico para vendas deste cliente (até 3 dígitos)">
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
                  className="w-14 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 font-mono focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400">d</span>
              </div>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <div className="flex items-center gap-1" title="Dias de histórico para vendas gerais da distribuidora (até 3 dígitos)">
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
                  className="w-14 rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400">d</span>
              </div>
            </div>

            {/* Alternador de Segurança: Exibir / Ocultar Desconto nos Itens */}
            <button
              type="button"
              onClick={handleToggleDiscountInGrid}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all border shadow-2xs ${
                showDiscountInGrid 
                  ? 'bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700' 
                  : 'bg-amber-100 hover:bg-amber-200/80 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800'
              }`}
              title={showDiscountInGrid ? "Ocultar colunas de desconto, preço líquido e subtotal no grid (exibir totais só no rodapé)" : "Exibir desconto, preço líquido e subtotal no grid"}
            >
              {showDiscountInGrid ? <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> : <EyeOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
              <span>{showDiscountInGrid ? "Desc. no Grid: Ativo" : "Desc. no Grid: Oculto"}</span>
            </button>

            {/* Botão Tela Cheia / Sair Tela Cheia */}
            <button
              type="button"
              onClick={() => setIsGridMaximized(!isGridMaximized)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all border shadow-2xs shrink-0 ${
                isGridMaximized 
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500' 
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
              title={isGridMaximized ? "Sair do modo tela cheia" : "Maximizar grade para tela cheia estilo Access"}
            >
              {isGridMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span>{isGridMaximized ? "Sair Tela Cheia" : "Tela Cheia"}</span>
            </button>
          </div>

        </div>

        {/* Barra 2: Abas Comerciais Jogadas para Baixo (Linha Exclusiva, sem engargalar com os outros campos) */}
        <div className="px-3 pt-2 bg-slate-100/70 dark:bg-slate-850/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Aba 1: pedido */}
            <button
              type="button"
              onClick={() => setActiveTab('pedido')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'pedido'
                  ? 'bg-white dark:bg-slate-900 border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>pedido</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-mono font-black">
                {items.filter(it => it.tabCategory === 'pedido').length}
              </span>
            </button>

            {/* Aba 2: novidades */}
            <button
              type="button"
              onClick={() => setActiveTab('novidades')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'novidades'
                  ? 'bg-white dark:bg-slate-900 border-amber-500 dark:border-amber-400 text-amber-800 dark:text-amber-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>novidades</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono font-black">
                {items.filter(it => it.tabCategory === 'novidades').length}
              </span>
            </button>

            {/* Aba 3: reposição */}
            <button
              type="button"
              onClick={() => setActiveTab('reposicao')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'reposicao'
                  ? 'bg-white dark:bg-slate-900 border-emerald-600 dark:border-emerald-400 text-emerald-800 dark:text-emerald-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5 text-emerald-500" />
              <span>reposição</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-black">
                {items.filter(it => it.tabCategory === 'reposicao').length}
              </span>
            </button>

            {/* Aba 4: fundo de catálogo */}
            <button
              type="button"
              onClick={() => setActiveTab('fundo')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-t-lg border-t-2 border-x transition-all shrink-0 ${
                activeTab === 'fundo'
                  ? 'bg-white dark:bg-slate-900 border-sky-600 dark:border-sky-400 text-sky-800 dark:text-sky-400 border-b-white dark:border-b-slate-900 -mb-px shadow-xs'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-sky-500" />
              <span>fundo de catálogo</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-mono font-black">
                {items.filter(it => it.tabCategory === 'fundo').length}
              </span>
            </button>
          </div>
        </div>

        {/* ── TABELA DENSA TIPO ACCESS COM CAMPOS COMERCIAIS ADJACENTES ─────── */}
        {/* Ordem: Capa -> Desc % -> Líquido -> Qtd -> Subtotal (juntos e próximos) */}
        <div className={`overflow-x-auto overflow-y-auto transition-all ${
          isGridMaximized 
            ? 'flex-1 min-h-0' 
            : showHistoryCards 
              ? 'max-h-[calc(100vh-320px)] min-h-[440px]' 
              : 'max-h-[calc(100vh-230px)] min-h-[550px]'
        }`}>
          <table className="w-full text-left border-collapse text-xs select-text">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-slate-200/90 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                <th className="py-2 px-2 w-9 text-center text-slate-400">#</th>
                <th className="py-2 px-2 w-20">Situação</th>
                <th className="py-2 px-2 w-32 font-mono">EAN / ISBN</th>
                <th className="py-2 px-2 min-w-[180px]">Título da Obra</th>
                <th className="py-2 px-2 w-28">Assunto</th>

                {/* BLOCO COMERCIAL (AGRUPADOS E PRÓXIMOS) */}
                <th className="py-2 px-2 text-right w-22 bg-indigo-50/40 dark:bg-indigo-950/20">Preço Capa</th>
                {showDiscountInGrid && (
                  <th className="py-2 px-2 text-right w-16 bg-indigo-50/40 dark:bg-indigo-950/20">Desc %</th>
                )}
                {showDiscountInGrid && (
                  <th className="py-2 px-2 text-right w-22 bg-indigo-50/40 dark:bg-indigo-950/20">Preço Líq.</th>
                )}
                <th className="py-2 px-2 text-center w-16 bg-indigo-50/40 dark:bg-indigo-950/20">Qtd</th>
                {showDiscountInGrid && (
                  <th className="py-2 px-2 text-right w-24 bg-indigo-50/40 dark:bg-indigo-950/20">Subtotal</th>
                )}

                {/* BLOCO ANALÍTICO / LOGÍSTICO */}
                <th className="py-2 px-2 text-center w-20">Consignado</th>
                <th className="py-2 px-2 text-center w-24 text-indigo-700 dark:text-indigo-400">
                  VdsCli ({clientSalesDays}d)
                </th>
                <th className="py-2 px-2 text-right w-20">Disponível</th>
                <th className="py-2 px-2 text-center w-16">Unid(CX)</th>
                <th className="py-2 px-2 text-center w-24">VdsGeral 365d</th>
                <th className="py-2 px-2 text-center w-24 text-emerald-700 dark:text-emerald-400">
                  VdsGeral ({generalSalesDays}d)
                </th>
                <th className="py-2 px-2 text-center w-12">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-mono text-[11px]">
              {activeItems.length === 0 ? (
                <tr>
                  <td colSpan={showDiscountInGrid ? 17 : 14} className="py-12 text-center text-slate-400 font-sans text-xs">
                    Nenhum item localizado para os filtros informados nesta aba.
                  </td>
                </tr>
              ) : (
                activeItems.map((it, idx) => {
                  const netPrice = it.coverPrice * (1 - it.discountPercent / 100);
                  const subtotal = netPrice * it.approvedQty;
                  const isSelected = selectedRowId === it.id;

                  return (
                    <tr 
                      key={it.id} 
                      onClick={() => setSelectedRowId(it.id)}
                      className={`transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/60 ring-1 ring-inset ring-indigo-400 dark:ring-indigo-600'
                          : it.situation === 'SEM_ESTOQUE' 
                            ? 'bg-rose-50/30 dark:bg-rose-950/15 hover:bg-rose-50/60' 
                            : idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-850/20 hover:bg-indigo-50/30' : 'hover:bg-indigo-50/30'
                      }`}
                    >
                      {/* Seletor de Linha Estilo Microsoft Access */}
                      <td 
                        onClick={() => setSelectedRowId(it.id)}
                        className={`py-1.5 px-2 text-center text-xs font-sans w-9 select-none cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-indigo-600 text-white font-black' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        title="Linha ativa (Estilo Access)"
                      >
                        {isSelected ? '▶' : idx + 1}
                      </td>

                      {/* Situação */}
                      <td className="py-1.5 px-2 whitespace-nowrap">
                        {it.situation === 'DISPONIVEL' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            ✓ DISP.
                          </span>
                        )}
                        {it.situation === 'PARCIAL' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            ⚠ PARCIAL
                          </span>
                        )}
                        {it.situation === 'SEM_ESTOQUE' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            ✗ FALTA
                          </span>
                        )}
                      </td>

                      {/* EAN / ISBN */}
                      <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {it.isbn}
                      </td>

                      {/* Título da Obra */}
                      <td className="py-1.5 px-2 font-sans font-medium text-slate-900 dark:text-white max-w-xs truncate" title={it.title}>
                        <span className="truncate block">{it.title}</span>
                        {it.notes && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-normal truncate">
                            ↳ {it.notes}
                          </span>
                        )}
                      </td>

                      {/* Assunto */}
                      <td className="py-1.5 px-2 font-sans text-[11px] truncate max-w-[120px]" title={it.subject}>
                        <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate max-w-full">
                          {it.subject}
                        </span>
                      </td>

                      {/* ── BLOCO COMERCIAL (AGRUPADOS E PRÓXIMOS) ────────────────── */}

                      {/* Preço Capa */}
                      <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-400 font-mono bg-indigo-50/20 dark:bg-indigo-950/10">
                        {it.coverPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>

                      {/* Desconto % Editável (Condicional conforme segurança) */}
                      {showDiscountInGrid && (
                        <td className="py-1.5 px-2 text-right bg-indigo-50/20 dark:bg-indigo-950/10">
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
                            className="w-14 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                          />
                        </td>
                      )}

                      {/* Preço Líquido (Condicional conforme segurança) */}
                      {showDiscountInGrid && (
                        <td className="py-1.5 px-2 text-right font-bold text-slate-900 dark:text-white font-mono bg-indigo-50/20 dark:bg-indigo-950/10">
                          {netPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      )}

                      {/* Qtd (Pedida) */}
                      <td className="py-1.5 px-2 text-center bg-indigo-50/20 dark:bg-indigo-950/10">
                        {activeTab === 'pedido' ? (
                          <input
                            id={`cell-qty-${idx}`}
                            type="number"
                            value={it.requestedQty}
                            min={1}
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setSelectedRowId(it.id);
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, idx, 'qty', activeItems.length)}
                            onChange={(e) => handleUpdateItemQty(it.id, parseInt(e.target.value) || 0)}
                            className="w-13 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-0.5 text-center text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddCatalogItemToOrder(it)}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border dark:border-indigo-800 text-[11px] font-bold transition-all"
                            title="Adicionar à proposta"
                          >
                            + Pedir
                          </button>
                        )}
                      </td>

                      {/* Subtotal (Condicional conforme segurança) */}
                      {showDiscountInGrid && (
                        <td className="py-1.5 px-2 text-right font-black text-slate-900 dark:text-white font-mono bg-indigo-50/30 dark:bg-indigo-950/20">
                          {activeTab === 'pedido' 
                            ? subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : netPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          }
                        </td>
                      )}

                      {/* ── BLOCO ANALÍTICO / LOGÍSTICO ───────────────────────────── */}

                      {/* Consignado */}
                      <td className="py-1.5 px-2 text-center font-mono">
                        {it.consignedQty > 0 ? (
                          <span 
                            className="inline-block px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-bold text-[10px]" 
                            title={`${it.consignedQty} unidades atualmente em consignação no cliente`}
                          >
                            {it.consignedQty}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">0</span>
                        )}
                      </td>

                      {/* VdsCli {x}d */}
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/60 text-[11px]" title={`Vendas do cliente nos últimos ${clientSalesDays} dias`}>
                          {it.clientSalesX || 0}
                        </span>
                      </td>

                      {/* Disponível (Estoque Horus) */}
                      <td className={`py-1.5 px-2 text-right font-mono font-bold ${
                        it.horusStock === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                      }`}>
                        {it.horusStock}
                      </td>

                      {/* Unid(CX) */}
                      <td className="py-1.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                        {it.boxUnits || '-'}
                      </td>

                      {/* VdsGeral 365d */}
                      <td className="py-1.5 px-2 text-center font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                        {it.generalSales365?.toLocaleString('pt-BR') || 0}
                      </td>

                      {/* VdsGeral {x}d */}
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 text-[11px]" title={`Vendas gerais da distribuidora nos últimos ${generalSalesDays} dias`}>
                          {it.generalSalesX?.toLocaleString('pt-BR') || 0}
                        </span>
                      </td>

                      {/* Ação */}
                      <td className="py-1.5 px-2 text-center">
                        {activeTab === 'pedido' ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(it.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Remover item da proposta"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddCatalogItemToOrder(it)}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 text-[10px] font-bold shadow-xs"
                            title="Adicionar item ao Pedido Comercial"
                          >
                            <Plus className="h-3 w-3" />
                            Pedir
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

            {/* Campo Editável de Desconto Geral no Rodapé (Aplica a todos os itens) */}
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
      {/* 5. MODAL DE CONFIGURAÇÃO DE STATUS E PREFERÊNCIAS (POR SELLER)      */}
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

            {/* Feedback de Sucesso ao Gravar */}
            {saveSuccessMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCheck className="h-4 w-4 text-emerald-600" />
                <span>{saveSuccessMessage}</span>
              </div>
            )}

            {/* Conteúdo com Scroll */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              
              {/* Seção 1: Segurança e Exibição de Valores Comerciais */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Segurança e Visualização de Desconto no Grid</span>
                </div>
                
                <label className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      Exibir colunas comerciais calculadas na grade
                    </span>
                    <span className="text-[11px] text-slate-500 block leading-tight">
                      Quando ativado, exibe as colunas <strong>Desc %</strong>, <strong>Preço Líq.</strong> e <strong>Subtotal</strong>. Quando desativado, oculta-as e preserva os cálculos exclusivamente no rodapé financeiro.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={showDiscountInGrid}
                    onChange={(e) => setShowDiscountInGrid(e.target.checked)}
                    className="h-4 w-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-600"
                  />
                </label>

                {/* Parâmetros Padrão de Dias */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Dias Histórico Cliente (VdsCli)
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
                      Dias Histórico Geral (VdsGeral)
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
                  setClientSalesDays(30);
                  setGeneralSalesDays(90);
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
                      clientSalesDays,
                      generalSalesDays,
                      globalDiscountInput
                    });
                    setSaveSuccessMessage('Configurações salvas e gravadas com sucesso para este seller!');
                    setTimeout(() => {
                      setSaveSuccessMessage(null);
                      setIsConfigModalOpen(false);
                    }, 1000);
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

    </div>
  );
}

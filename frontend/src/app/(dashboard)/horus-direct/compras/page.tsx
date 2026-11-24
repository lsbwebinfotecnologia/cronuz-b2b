'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  Columns3,
  DatabaseZap,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  FileWarning,
  History,
  Mail,
  Maximize2,
  Minimize2,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';
import HorusComprasPinnedNavBar, {
  ComprasInternalTab,
} from '@/components/HorusComprasPinnedNavBar';

const MAX_SHEET_BYTES = 10 * 1024 * 1024; // 10 MB (Regra Mandatória AGENTS.md Seção 1)
const MAX_XML_BYTES = 10 * 1024 * 1024;   // 10 MB para documentos fiscais XML (AGENTS.md Seção 1.3)

interface BranchConfigData {
  cod_local_default: number | null;
  cod_departamento_default: number | null;
  cod_centro_custo_default: number | null;
  compra_consig_default: string;
  email_enabled: boolean;
  sender_name: string;
  sender_email: string;
  reply_to_email: string;
  cc_emails: string;
  email_subject_template: string;
  email_body_template: string;
}

interface PurchaseBranch {
  id: number;
  nome: string;
  cnpj: string;
  cod_empresa: number;
  cod_filial: number;
  cod_local: number | null;
  locais: number[];
  label: string;
  configured_suppliers_count: number;
  configured_publishers_count: number;
  config: BranchConfigData;
}

interface ConfiguredDiscountItem {
  id: number;
  cod_editora: number;
  nome_editora: string;
  desconto_percentual: number;
  cnpj_fornecedor?: string;
  email_fornecedor?: string;
  updated_by_name?: string;
  updated_at?: string;
}

interface SupplierSummary {
  cod_empresa: number;
  cod_filial: number;
  cod_grp_fornecedor: number;
  cod_fornecedor: number;
  nom_fornecedor: string;
  nom_fantasia: string;
  cnpj: string;
  email: string;
  prazo_pagamentos: string;
  prazo_entrega: number;
  fat_minimo: number;
  nom_grupo: string;
  grp_cod_departamento: number | null;
  is_configured?: boolean;
  configured_publishers_count?: number;
}

interface SuggestedPublisher {
  cod_editora: number;
  nome_editora: string;
  horus_discount: number;
  qtd_skus_historico?: number;
  source: string;
  already_configured: boolean;
}

interface NfHistoryRow {
  cod_nf: number;
  nro_nf: string;
  cfop: string;
  tipo?: string;
  data_nf: string | null;
  vlr_bruto: number;
  vlr_liquido: number;
  vlr_desconto?: number;
  cod_pedido?: number | null;
  sit_nf: string;
  qtd_skus: number;
  qtd_exemplares: number;
}

interface HorusRecentOrderRow {
  cod_pedido: number;
  dat_pedido: string | null;
  status_horus: string;
  status_label: string;
  compra_consig: string;
  qtd_itens: number;
  vlr_bruto: number;
  vlr_desconto: number;
  vlr_liquido: number;
  per_desconto: number;
  nom_usuario: string;
}

interface SupplierOverviewData {
  branch: PurchaseBranch;
  supplier: SupplierSummary;
  is_ready_for_purchase: boolean;
  configured_discounts: ConfiguredDiscountItem[];
  horus_suggested_publishers: SuggestedPublisher[];
  history: {
    entradas_compra: NfHistoryRow[];
    consignacoes_recebidas: NfHistoryRow[];
    acertos_consignacao: NfHistoryRow[];
    devolucoes: NfHistoryRow[];
    pedidos_compra_horus: HorusRecentOrderRow[];
    consigned_balance_summary: { total_skus: number; total_units: number };
  };
}

interface CartPurchaseItem {
  cod_item: number;
  isbn: string;
  nome_item: string;
  cod_editora: number | null;
  nome_editora: string;
  vlr_capa: number;
  qtd_caixa: number;
  situacao_item: string;
  stock_available: number;
  stock_physical: number;
  consigned_sent: number;
  consigned_received: number;
  awaiting_delivery: number;
  cost_price: number;
  min_stock: number;
  sales_90: number;
  sales_365: number;
  last_entry_date: string | null;
  last_entry_qty: number;
  last_entry_type: string | null;
  quantity: number;
  publisher_configured: boolean;
  discount_pct: number;
  unit_net_price: number;
  subtotal_gross: number;
  subtotal_net: number;
  validation_warning: string | null;
}

interface SavedPurchaseOrder {
  id: number;
  branch_id: number;
  branch_name: string;
  branch_cnpj?: string | null;
  cod_empresa: number;
  cod_filial: number;
  cod_grp_fornecedor: number;
  cod_fornecedor: number;
  cnpj_fornecedor: string | null;
  nome_fornecedor: string;
  email_fornecedor: string | null;
  horus_cod_pedido: number | null;
  compra_consig: string;
  status: string;
  horus_status: string;
  status_label: string;
  xml_status: string;
  xml_status_label: string;
  last_xml_audit_id: number | null;
  last_nfe_number: string | null;
  last_nfe_series: string | null;
  last_nfe_key: string | null;
  xml_checked_at: string | null;
  xml_checked_by_name: string | null;
  total_skus: number;
  total_quantity: number;
  total_gross: number;
  total_discount: number;
  total_net: number;
  avg_discount_pct: number;
  observations: string | null;
  excel_exported_count: number;
  last_excel_exported_at: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface XmlAuditSummary {
  id: number;
  order_id: number;
  branch_id: number;
  branch_name: string | null;
  horus_cod_pedido: number | null;
  order_horus_status: string | null;
  order_status: string | null;
  nome_fornecedor: string | null;
  cnpj_fornecedor: string | null;
  chave_acesso: string | null;
  numero_nf: string;
  serie_nf: string | null;
  data_emissao: string | null;
  nat_op: string | null;
  emit_cnpj: string | null;
  emit_nome: string | null;
  dest_cnpj: string | null;
  dest_nome: string | null;
  xml_xped: string | null;
  order_total_qty: number;
  xml_total_qty: number;
  order_total_gross: number;
  xml_total_gross: number;
  order_total_discount: number;
  xml_total_discount: number;
  order_total_net: number;
  xml_total_products_net: number;
  xml_total_nf: number;
  xml_frete: number;
  xml_ipi_st_outros: number;
  diagnostic_status: 'MATCH_100' | 'HAS_DIVERGENCE';
  matched_ok_count: number;
  divergent_items_count: number;
  diff_cover_count: number;
  diff_discount_count: number;
  diff_qty_count: number;
  extra_in_xml_count: number;
  missing_in_xml_count: number;
  header_warnings: string[];
  decision_status: 'PENDING_REVIEW' | 'XML_OK' | 'ACCEPTED_WITH_DIVERGENCE' | 'REJECTED';
  decision_label: string;
  decision_notes: string | null;
  uploaded_by_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface XmlAuditItemRow {
  id: number;
  order_item_id: number | null;
  xml_n_item: number | null;
  cod_item: number | null;
  isbn: string | null;
  xml_ean: string | null;
  xml_cprod: string | null;
  title: string;
  nome_editora: string | null;
  cfop: string | null;
  order_qty: number;
  order_cover_price: number;
  order_discount_pct: number;
  order_unit_net: number;
  order_subtotal_net: number;
  xml_qty: number;
  xml_cover_price: number;
  xml_discount_pct: number;
  xml_effective_discount_pct: number;
  xml_unit_net: number;
  xml_subtotal_net: number;
  line_status: 'OK' | 'DIVERGENT';
  has_qty_diff: boolean;
  has_cover_diff: boolean;
  has_discount_diff: boolean;
  is_extra_in_xml: boolean;
  is_missing_in_xml: boolean;
  divergence_tags: string[];
  divergence_summary: string | null;
  item_note: string | null;
}

interface XmlKpiCounters {
  total: number;
  pending_review: number;
  xml_ok: number;
  accepted_with_divergence: number;
  rejected: number;
  has_divergence: number;
}

type DeskHeroSubTab =
  | 'PEDIDO'
  | 'SELOS_DESCONTOS'
  | 'ENTRADAS'
  | 'CONSIG_ACERTOS'
  | 'DEVOLUCOES_PEDIDOS';

function formatMoney(v: number): string {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTimeBr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return clean;
}

function formatCnpj(raw?: string | null): string {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return raw || '—';
}

function getXmlDecisionBadgeClass(xmlStatus?: string | null): string {
  switch (xmlStatus) {
    case 'XML_OK':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    case 'PENDING_REVIEW':
      return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    case 'ACCEPTED_WITH_DIVERGENCE':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
}

function formatTagLabel(tag: string): { text: string; cls: string } {
  switch (tag) {
    case 'CAPA_MAIOR':
      return { text: 'Capa XML Maior', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'CAPA_MENOR':
      return { text: 'Capa XML Menor', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'FATURADO_LIQUIDO_SEM_VDESC':
      return { text: 'NF s/ Destacar Capa/Desc.', cls: 'bg-sky-100 text-sky-900 border-sky-300' };
    case 'DESCONTO_MENOR':
      return { text: 'Desconto XML Menor!', cls: 'bg-rose-100 text-rose-900 border-rose-300' };
    case 'DESCONTO_MAIOR':
      return { text: 'Desconto XML Maior', cls: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
    case 'QTD_MAIOR':
      return { text: 'Qtd XML Maior', cls: 'bg-purple-100 text-purple-900 border-purple-300' };
    case 'QTD_MENOR':
      return { text: 'Qtd XML Menor', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'ITEM_NAO_PEDIDO':
      return { text: 'Item Extra (Não Pedido)', cls: 'bg-rose-100 text-rose-900 border-rose-300' };
    case 'ITEM_FALTANTE_XML':
      return { text: 'Faltante no XML', cls: 'bg-slate-200 text-slate-800 border-slate-400' };
    default:
      return { text: '100% OK', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
  }
}

export default function HorusDirectComprasPage() {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  const [companyId, setCompanyId] = useState<number>(1);
  const [activeMainTab, setActiveMainTab] = useState<ComprasInternalTab>('DESK');

  // 1. Filiais
  const [branches, setBranches] = useState<PurchaseBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);

  // 2. Seletor / Pesquisa de Fornecedor no Topo (Estilo DBM CustomerAutocomplete)
  const supplierDropdownRef = useRef<HTMLDivElement | null>(null);
  const supplierSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [isSupplierPickerOpen, setIsSupplierPickerOpen] = useState<boolean>(false);
  const [supplierPickerMode, setSupplierPickerMode] = useState<'SAVED' | 'HORUS'>('SAVED');
  const [supplierQuery, setSupplierQuery] = useState<string>('');
  const [savedSuppliersList, setSavedSuppliersList] = useState<SupplierSummary[]>([]);
  const [horusSuppliersList, setHorusSuppliersList] = useState<SupplierSummary[]>([]);
  const [hasSearchedHorusSuppliers, setHasSearchedHorusSuppliers] = useState<boolean>(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState<boolean>(false);

  const [supplierOverview, setSupplierOverview] = useState<SupplierOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  const [showSupplierHistoryCards, setShowSupplierHistoryCards] = useState<boolean>(true);
  const [deskHeroTab, setDeskHeroTab] = useState<DeskHeroSubTab>('PEDIDO');

  // Toggles visuais da grade principal (estilo DBM Gestão de Pedidos)
  const [isGridMaximized, setIsGridMaximized] = useState<boolean>(false);
  const [gridFilterTerm, setGridFilterTerm] = useState<string>('');
  const [showColIsbn, setShowColIsbn] = useState<boolean>(true);
  const [showColSaldos, setShowColSaldos] = useState<boolean>(true);
  const [showColPrices, setShowColPrices] = useState<boolean>(true);

  // Gaveta Retrátil de Importação de Planilha / Texto no topo (igual ao DBM)
  const [isIntakeDrawerOpen, setIsIntakeDrawerOpen] = useState<boolean>(false);
  const [intakeMode, setIntakeMode] = useState<'EXCEL' | 'TEXT'>('EXCEL');
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetPastedText, setSheetPastedText] = useState<string>('');
  const [importingSheet, setImportingSheet] = useState<boolean>(false);
  const [lastNotFoundIsbns, setLastNotFoundIsbns] = useState<string[]>([]);

  // 3. Modal de Vínculo de Múltiplos Selos/Editoras + Desconto (%) no Fornecedor
  const [showAddPublisherModal, setShowAddPublisherModal] = useState<boolean>(false);
  const [pubSearchTerm, setPubSearchTerm] = useState<string>('');
  const [pubSearchResults, setPubSearchResults] = useState<
    Array<{ cod_editora: number; nome_editora: string; qtd_itens: number }>
  >([]);
  const [loadingPubSearch, setLoadingPubSearch] = useState<boolean>(false);
  const [selectedPubsForSupplier, setSelectedPubsForSupplier] = useState<
    Record<number, { cod_editora: number; nome_editora: string }>
  >({});
  const [batchDiscountPct, setBatchDiscountPct] = useState<number>(50);
  const [savingSupplierDiscounts, setSavingSupplierDiscounts] = useState<boolean>(false);

  const [editingDiscountId, setEditingDiscountId] = useState<number | null>(null);
  const [editingDiscountPct, setEditingDiscountPct] = useState<number>(0);

  // 4. Pesquisa de Itens e Grade Principal do Pedido
  const [itemSearchTerm, setItemSearchTerm] = useState<string>('');
  const [itemSearchDefaultQty, setItemSearchDefaultQty] = useState<number>(1);
  const [itemLookupResults, setItemLookupResults] = useState<CartPurchaseItem[]>([]);
  const [searchingItems, setSearchingItems] = useState<boolean>(false);

  const [cartItems, setCartItems] = useState<CartPurchaseItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(0);
  const [checkedCartCods, setCheckedCartCods] = useState<Record<number, boolean>>({});
  const [compraConsig, setCompraConsig] = useState<'N' | 'S'>('N');
  const [orderObservations, setOrderObservations] = useState<string>('');
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);

  // 5. Modal de Conciliação de Editora/Selo (Cronuz + Horus ITENS_ESTOQUE_GERAL)
  const [showReconcileModal, setShowReconcileModal] = useState<boolean>(false);
  const [reconcileItems, setReconcileItems] = useState<CartPurchaseItem[]>([]);
  const [reconcileSearch, setReconcileSearch] = useState<string>('');
  const [reconcilePubOptions, setReconcilePubOptions] = useState<
    Array<{ cod_editora: number; nome_editora: string; qtd_itens: number }>
  >([]);
  const [selectedReconcilePub, setSelectedReconcilePub] = useState<{
    cod_editora: number;
    nome_editora: string;
  } | null>(null);
  const [savingReconcile, setSavingReconcile] = useState<boolean>(false);

  // 6. Pedidos Gerados (AP / AE / XML OK)
  const [ordersList, setOrdersList] = useState<SavedPurchaseOrder[]>([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(0);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [orderSearchFilter, setOrderSearchFilter] = useState<string>('');

  const [exportPromptOrder, setExportPromptOrder] = useState<{
    id: number;
    horus_cod_pedido: number | null;
    horus_status: string;
    nome_fornecedor: string;
  } | null>(null);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  const [detailModalData, setDetailModalData] = useState<{
    order: SavedPurchaseOrder;
    items: any[];
    logs: any[];
  } | null>(null);
  const [loadingOrderDetail, setLoadingOrderDetail] = useState<boolean>(false);

  // 7. Central de Auditoria & Análise Posterior de XML da NF-e
  const xmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const [xmlTargetOrderId, setXmlTargetOrderId] = useState<string>('');
  const [xmlUploadFile, setXmlUploadFile] = useState<File | null>(null);
  const [xmlAutoAcceptIfOk, setXmlAutoAcceptIfOk] = useState<boolean>(true);
  const [xmlAdvanceHorusToAe, setXmlAdvanceHorusToAe] = useState<boolean>(true);
  const [analyzingXml, setAnalyzingXml] = useState<boolean>(false);

  const [xmlAuditsList, setXmlAuditsList] = useState<XmlAuditSummary[]>([]);
  const [xmlKpis, setXmlKpis] = useState<XmlKpiCounters>({
    total: 0,
    pending_review: 0,
    xml_ok: 0,
    accepted_with_divergence: 0,
    rejected: 0,
    has_divergence: 0,
  });
  const [selectedXmlIndex, setSelectedXmlIndex] = useState<number>(0);
  const [loadingXmlAudits, setLoadingXmlAudits] = useState<boolean>(false);
  const [xmlDecisionFilter, setXmlDecisionFilter] = useState<string>('ALL');
  const [xmlDivergenceAxisFilter, setXmlDivergenceAxisFilter] = useState<string>('ALL');
  const [xmlSearchFilter, setXmlSearchFilter] = useState<string>('');

  const [xmlAuditDetailModal, setXmlAuditDetailModal] = useState<{
    audit: XmlAuditSummary;
    items: XmlAuditItemRow[];
    order_logs: any[];
  } | null>(null);
  const [loadingXmlAuditDetail, setLoadingXmlAuditDetail] = useState<boolean>(false);
  const [xmlModalItemFilter, setXmlModalItemFilter] = useState<'ALL' | 'DIVERGENT' | 'OK'>('ALL');
  const [decisionNotesDraft, setDecisionNotesDraft] = useState<string>('');
  const [itemNotesDraft, setItemNotesDraft] = useState<Record<number, string>>({});
  const [decisionAdvanceToAe, setDecisionAdvanceToAe] = useState<boolean>(true);
  const [savingXmlDecision, setSavingXmlDecision] = useState<boolean>(false);

  // 8. Parametrização & Template de E-mail da Filial
  const [branchConfigForm, setBranchConfigForm] = useState<BranchConfigData>({
    cod_local_default: null,
    cod_departamento_default: null,
    cod_centro_custo_default: null,
    compra_consig_default: 'N',
    email_enabled: false,
    sender_name: '',
    sender_email: '',
    reply_to_email: '',
    cc_emails: '',
    email_subject_template: '',
    email_body_template: '',
  });
  const [branchDepartments, setBranchDepartments] = useState<
    Array<{ cod_departamento: number; nom_departamento: string }>
  >([]);
  const [savingBranchConfig, setSavingBranchConfig] = useState<boolean>(false);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  );

  // Fecha popover de fornecedor ao clicar fora
  useEffect(() => {
    const onOutside = (ev: MouseEvent) => {
      if (
        supplierDropdownRef.current &&
        !supplierDropdownRef.current.contains(ev.target as Node)
      ) {
        setIsSupplierPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // ── Inicialização de Empresa e Filiais ─────────────────────────────────────
  const fetchBranches = useCallback(
    async (cid: number, keepBranchId?: number | null) => {
      setLoadingBranches(true);
      try {
        const token = getToken();
        const res = await fetch(`${apiUrl}/horus-purchases/branches?company_id=${cid}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Erro ao carregar filiais configuradas.');
        const data = await res.json();
        const list: PurchaseBranch[] = data.branches || [];
        setBranches(list);
        if (list.length > 0) {
          const nextId =
            keepBranchId && list.some((b) => b.id === keepBranchId) ? keepBranchId : list[0].id;
          setSelectedBranchId(nextId);
          const chosen = list.find((b) => b.id === nextId);
          if (chosen) {
            setBranchConfigForm(chosen.config);
            setCompraConsig(chosen.config.compra_consig_default === 'S' ? 'S' : 'N');
          }
        }
      } catch (e: any) {
        toast.error(e?.message || 'Erro ao carregar filiais.');
      } finally {
        setLoadingBranches(false);
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    const u = getUser();
    const cid = Number(u?.company_id || 1);
    setCompanyId(cid);
    fetchBranches(cid);
  }, [fetchBranches]);

  // ── Busca de Fornecedores Salvos (Cronuz) vs Pesquisa sob Demanda no Horus ──
  const loadSavedSuppliersForBranch = useCallback(
    async (bid: number, qStr = '') => {
      setLoadingSuppliers(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({
          branch_id: String(bid),
          company_id: String(companyId),
          only_configured: 'true',
          limit: '60',
        });
        if (qStr.trim()) params.append('q', qStr.trim());
        const res = await fetch(`${apiUrl}/horus-purchases/suppliers/search?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const saved: SupplierSummary[] = data.suppliers || [];
          setSavedSuppliersList(saved);
          // Se a filial ainda não possui nenhum fornecedor configurado salvo, abre direto a aba de pesquisa Horus sem listar tudo antes de clicar em pesquisar
          if (saved.length === 0 && !qStr.trim()) {
            setSupplierPickerMode('HORUS');
          }
        }
      } catch {
        // silent
      } finally {
        setLoadingSuppliers(false);
      }
    },
    [apiUrl, companyId]
  );

  const executeHorusSupplierSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedBranchId === null) return;

    if (supplierPickerMode === 'SAVED') {
      await loadSavedSuppliersForBranch(selectedBranchId, supplierQuery);
      return;
    }

    setLoadingSuppliers(true);
    setHasSearchedHorusSuppliers(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        branch_id: String(selectedBranchId),
        company_id: String(companyId),
        only_configured: 'false',
        limit: '60',
      });
      if (supplierQuery.trim()) params.append('q', supplierQuery.trim());
      const res = await fetch(`${apiUrl}/horus-purchases/suppliers/search?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao pesquisar fornecedores no Horus.');
      setHorusSuppliersList(data.suppliers || []);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao consultar fornecedores no Horus.');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // ── Pedidos e Auditorias de XML ────────────────────────────────────────────
  const fetchOrdersList = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingOrders(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({
          company_id: String(companyId),
          status: orderStatusFilter,
          sync_horus_status: silent ? 'false' : 'true',
          limit: '120',
        });
        if (selectedBranchId !== null) params.append('branch_id', String(selectedBranchId));
        if (orderSearchFilter.trim()) params.append('search', orderSearchFilter.trim());
        const res = await fetch(`${apiUrl}/horus-purchases/orders?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const d = await res.json();
          const list: SavedPurchaseOrder[] = d.orders || [];
          setOrdersList(list);
          setSelectedOrderIndex((prev) => (list.length === 0 ? 0 : Math.min(prev, list.length - 1)));
        }
      } catch {
        if (!silent) toast.error('Erro ao carregar pedidos de compra.');
      } finally {
        if (!silent) setLoadingOrders(false);
      }
    },
    [apiUrl, companyId, orderStatusFilter, orderSearchFilter, selectedBranchId]
  );

  const fetchXmlAuditsList = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingXmlAudits(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({
          company_id: String(companyId),
          decision_status: xmlDecisionFilter,
          divergence_type: xmlDivergenceAxisFilter,
          limit: '120',
        });
        if (selectedBranchId !== null) params.append('branch_id', String(selectedBranchId));
        if (xmlSearchFilter.trim()) params.append('search', xmlSearchFilter.trim());
        const res = await fetch(`${apiUrl}/horus-purchases/xml-audits?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const d = await res.json();
          const list: XmlAuditSummary[] = d.audits || [];
          setXmlAuditsList(list);
          if (d.kpis) setXmlKpis(d.kpis);
          setSelectedXmlIndex((prev) => (list.length === 0 ? 0 : Math.min(prev, list.length - 1)));
        }
      } catch {
        if (!silent) toast.error('Erro ao carregar auditorias de XML.');
      } finally {
        if (!silent) setLoadingXmlAudits(false);
      }
    },
    [apiUrl, companyId, selectedBranchId, xmlDecisionFilter, xmlDivergenceAxisFilter, xmlSearchFilter]
  );

  useEffect(() => {
    if (selectedBranchId !== null) {
      setHorusSuppliersList([]);
      setHasSearchedHorusSuppliers(false);
      loadSavedSuppliersForBranch(selectedBranchId, '');
      fetchOrdersList(true);
      fetchXmlAuditsList(true);
      const b = branches.find((x) => x.id === selectedBranchId);
      if (b) {
        setBranchConfigForm(b.config);
        setCompraConsig(b.config.compra_consig_default === 'S' ? 'S' : 'N');
      }
    }
  }, [selectedBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeMainTab === 'ORDERS') {
      fetchOrdersList(false);
    } else if (activeMainTab === 'XML_AUDIT') {
      fetchXmlAuditsList(false);
      fetchOrdersList(true);
    } else if (activeMainTab === 'BRANCH_CONFIG' && selectedBranchId !== null) {
      const token = getToken();
      fetch(`${apiUrl}/horus-purchases/branches/${selectedBranchId}/config?company_id=${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setBranchDepartments(d.horus_departments || []);
            if (d.config) setBranchConfigForm(d.config);
          }
        })
        .catch(() => {});
    }
  }, [activeMainTab, selectedBranchId, apiUrl, companyId, fetchOrdersList, fetchXmlAuditsList]);

  // ── Selecionar Fornecedor e Carregar Dossiê 360° ───────────────────────────
  const loadSupplierOverview = async (
    bid: number,
    codGrp: number,
    codForn: number,
    preserveCart = false
  ) => {
    setIsSupplierPickerOpen(false);
    setLoadingOverview(true);
    if (!preserveCart) {
      setCartItems([]);
      setCheckedCartCods({});
      setItemLookupResults([]);
      setLastNotFoundIsbns([]);
      setSelectedCartIndex(0);
    }
    try {
      const token = getToken();
      const params = new URLSearchParams({
        branch_id: String(bid),
        cod_grp_fornecedor: String(codGrp),
        cod_fornecedor: String(codForn),
        company_id: String(companyId),
        days: '365',
      });
      const res = await fetch(`${apiUrl}/horus-purchases/suppliers/overview?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data: SupplierOverviewData = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error((data as any).detail || 'Erro ao carregar dossiê do fornecedor.');
      setSupplierOverview(data);
      if (!preserveCart) {
        setDeskHeroTab(data.is_ready_for_purchase ? 'PEDIDO' : 'SELOS_DESCONTOS');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar dados do fornecedor.');
    } finally {
      setLoadingOverview(false);
    }
  };

  const refreshCurrentCart = async (
    bid: number,
    codGrp: number,
    codForn: number,
    itemsToRefresh: CartPurchaseItem[]
  ) => {
    if (!itemsToRefresh.length) return;
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/items/refresh-cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: bid,
          cod_grp_fornecedor: codGrp,
          cod_fornecedor: codForn,
          items: itemsToRefresh.map((x) => ({ cod_item: x.cod_item, quantity: x.quantity })),
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setCartItems(d.items || []);
      }
    } catch {}
  };

  // ── Gestão de Selos/Editoras e Descontos (%) do Fornecedor ─────────────────
  const searchHorusPublishersForModal = async (q: string, forReconcile = false) => {
    if (!forReconcile) setLoadingPubSearch(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({ company_id: String(companyId), limit: '50' });
      if (q.trim()) params.append('q', q.trim());
      const res = await fetch(`${apiUrl}/horus-purchases/publishers/search?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        if (forReconcile) setReconcilePubOptions(d.publishers || []);
        else setPubSearchResults(d.publishers || []);
      }
    } catch {
      toast.error('Erro ao pesquisar editoras no Horus.');
    } finally {
      if (!forReconcile) setLoadingPubSearch(false);
    }
  };

  const handleSaveBatchSupplierDiscounts = async () => {
    if (!supplierOverview || selectedBranchId === null) return;
    const pubList = Object.values(selectedPubsForSupplier);
    if (!pubList.length) {
      toast.error('Selecione ao menos uma editora/selo para vincular.');
      return;
    }
    setSavingSupplierDiscounts(true);
    try {
      const token = getToken();
      const sup = supplierOverview.supplier;
      const res = await fetch(`${apiUrl}/horus-purchases/suppliers/discounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: selectedBranchId,
          cod_grp_fornecedor: sup.cod_grp_fornecedor,
          cod_fornecedor: sup.cod_fornecedor,
          cnpj_fornecedor: sup.cnpj,
          nome_fornecedor: sup.nom_fornecedor,
          email_fornecedor: sup.email,
          entries: pubList.map((p) => ({
            cod_editora: p.cod_editora,
            desconto_percentual: batchDiscountPct,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar descontos.');
      toast.success(data.message || 'Descontos vinculados com sucesso!');
      setShowAddPublisherModal(false);
      setSelectedPubsForSupplier({});
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, true);
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
      fetchBranches(companyId, selectedBranchId);
      loadSavedSuppliersForBranch(selectedBranchId, '');
      setDeskHeroTab('PEDIDO');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao vincular descontos.');
    } finally {
      setSavingSupplierDiscounts(false);
    }
  };

  const handleUpdateSingleDiscount = async (discItem: ConfiguredDiscountItem, newPct: number) => {
    if (!supplierOverview || selectedBranchId === null) return;
    const sup = supplierOverview.supplier;
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/suppliers/discounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: selectedBranchId,
          cod_grp_fornecedor: sup.cod_grp_fornecedor,
          cod_fornecedor: sup.cod_fornecedor,
          cnpj_fornecedor: sup.cnpj,
          nome_fornecedor: sup.nom_fornecedor,
          email_fornecedor: sup.email,
          entries: [{ cod_editora: discItem.cod_editora, desconto_percentual: newPct }],
        }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar percentual.');
      toast.success(`Desconto da editora '${discItem.nome_editora}' atualizado!`);
      setEditingDiscountId(null);
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, true);
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar desconto.');
    }
  };

  const handleDeleteDiscount = async (discId: number) => {
    if (!supplierOverview || selectedBranchId === null) return;
    const sup = supplierOverview.supplier;
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/horus-purchases/suppliers/discounts/${discId}?company_id=${companyId}`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) throw new Error('Erro ao remover vínculo.');
      toast.success('Vínculo de editora removido.');
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, true);
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
      loadSavedSuppliersForBranch(selectedBranchId, '');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover editora.');
    }
  };

  const handleImportFromHorusEditorasFornec = async () => {
    if (!supplierOverview || selectedBranchId === null) return;
    const sup = supplierOverview.supplier;
    setSavingSupplierDiscounts(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/suppliers/discounts/import-from-horus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: selectedBranchId,
          cod_grp_fornecedor: sup.cod_grp_fornecedor,
          cod_fornecedor: sup.cod_fornecedor,
          cnpj_fornecedor: sup.cnpj,
          nome_fornecedor: sup.nom_fornecedor,
          default_discount_if_zero: 45,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Nenhum vínculo em EDITORAS_FORNEC.');
      toast.success(data.message || 'Editoras importadas do Horus!');
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, true);
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
      loadSavedSuppliersForBranch(selectedBranchId, '');
      setDeskHeroTab('PEDIDO');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao importar vínculos do Horus.');
    } finally {
      setSavingSupplierDiscounts(false);
    }
  };

  // ── Pesquisa de Itens & Importação de Planilha (Máx 10 MB) ─────────────────
  const handleLookupItems = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierOverview || selectedBranchId === null) {
      toast.error('Selecione o fornecedor no topo antes de adicionar itens.');
      return;
    }
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Vincule os selos e descontos do fornecedor antes de adicionar itens.');
      setDeskHeroTab('SELOS_DESCONTOS');
      return;
    }
    if (!itemSearchTerm.trim()) return;
    setSearchingItems(true);
    try {
      const token = getToken();
      const sup = supplierOverview.supplier;
      const res = await fetch(`${apiUrl}/horus-purchases/items/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: selectedBranchId,
          cod_grp_fornecedor: sup.cod_grp_fornecedor,
          cod_fornecedor: sup.cod_fornecedor,
          query: itemSearchTerm.trim(),
          default_qty: Math.max(1, itemSearchDefaultQty),
          limit: 25,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao pesquisar item.');
      const list: CartPurchaseItem[] = data.items || [];
      if (list.length === 1) {
        addOrMergeItemToCart(list[0], Math.max(1, itemSearchDefaultQty));
        setItemSearchTerm('');
        setItemLookupResults([]);
        toast.success(`'${list[0].nome_item}' adicionado ao pedido.`);
      } else {
        setItemLookupResults(list);
        if (list.length === 0) toast.error('Nenhum item encontrado no acervo do Horus.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro na busca de itens.');
    } finally {
      setSearchingItems(false);
    }
  };

  const addOrMergeItemToCart = (newItem: CartPurchaseItem, addQty: number) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((x) => x.cod_item === newItem.cod_item);
      if (idx >= 0) {
        const updated = [...prev];
        const cur = updated[idx];
        const nextQ = cur.quantity + addQty;
        updated[idx] = {
          ...cur,
          quantity: nextQ,
          subtotal_gross: Number((cur.vlr_capa * nextQ).toFixed(2)),
          subtotal_net: Number((cur.unit_net_price * nextQ).toFixed(2)),
        };
        setSelectedCartIndex(idx);
        return updated;
      }
      const q = Math.max(1, addQty);
      const nextArr = [
        ...prev,
        {
          ...newItem,
          quantity: q,
          subtotal_gross: Number((newItem.vlr_capa * q).toFixed(2)),
          subtotal_net: Number((newItem.unit_net_price * q).toFixed(2)),
        },
      ];
      setSelectedCartIndex(nextArr.length - 1);
      return nextArr;
    });
  };

  const updateCartItemQty = (codItem: number, newQty: number) => {
    const q = Math.max(1, Math.floor(Number(newQty) || 1));
    setCartItems((prev) =>
      prev.map((it) =>
        it.cod_item === codItem
          ? {
              ...it,
              quantity: q,
              subtotal_gross: Number((it.vlr_capa * q).toFixed(2)),
              subtotal_net: Number((it.unit_net_price * q).toFixed(2)),
            }
          : it
      )
    );
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, totalRows: number) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextIdx = (rowIndex + 1) % totalRows;
      const el = document.getElementById(`compras-qty-${nextIdx}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (rowIndex - 1 + totalRows) % totalRows;
      const el = document.getElementById(`compras-qty-${prevIdx}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }
  };

  const handleImportSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierOverview || selectedBranchId === null) {
      toast.error('Selecione o fornecedor no topo antes de importar itens.');
      return;
    }
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Configure os selos e descontos do fornecedor antes de importar.');
      setDeskHeroTab('SELOS_DESCONTOS');
      return;
    }
    if (intakeMode === 'EXCEL' && !sheetFile) {
      toast.error('Selecione uma planilha (.xlsx / .csv) para importar.');
      return;
    }
    if (intakeMode === 'TEXT' && !sheetPastedText.trim()) {
      toast.error('Cole os ISBNs e quantidades no campo de texto.');
      return;
    }
    if (sheetFile && sheetFile.size > MAX_SHEET_BYTES) {
      toast.error('O arquivo excede o limite máximo permitido de 10 MB para este tipo de envio.');
      return;
    }
    setImportingSheet(true);
    try {
      const token = getToken();
      const sup = supplierOverview.supplier;
      const fd = new FormData();
      fd.append('branch_id', String(selectedBranchId));
      fd.append('cod_grp_fornecedor', String(sup.cod_grp_fornecedor));
      fd.append('cod_fornecedor', String(sup.cod_fornecedor));
      fd.append('company_id', String(companyId));
      if (intakeMode === 'EXCEL' && sheetFile) fd.append('file', sheetFile);
      if (intakeMode === 'TEXT' && sheetPastedText.trim()) fd.append('pasted_text', sheetPastedText.trim());

      const res = await fetch(`${apiUrl}/horus-purchases/items/import-sheet`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao processar planilha.');

      const imported: CartPurchaseItem[] = data.items || [];
      setCartItems((prev) => {
        const map = new Map<number, CartPurchaseItem>();
        prev.forEach((p) => map.set(p.cod_item, p));
        imported.forEach((imp) => {
          const ex = map.get(imp.cod_item);
          if (ex) {
            const nq = ex.quantity + imp.quantity;
            map.set(imp.cod_item, {
              ...imp,
              quantity: nq,
              subtotal_gross: Number((imp.vlr_capa * nq).toFixed(2)),
              subtotal_net: Number((imp.unit_net_price * nq).toFixed(2)),
            });
          } else {
            map.set(imp.cod_item, imp);
          }
        });
        return Array.from(map.values());
      });

      setLastNotFoundIsbns(data.not_found_isbns || []);
      setIsIntakeDrawerOpen(false);
      setSheetFile(null);
      setSheetPastedText('');
      setDeskHeroTab('PEDIDO');

      if (data.unconfigured_publishers_count > 0) {
        toast.warning(
          `${imported.length} item(ns) carregado(s), porém ${data.unconfigured_publishers_count} possuem editora não vinculada ao fornecedor.`
        );
      } else {
        toast.success(data.message || `${imported.length} item(ns) carregado(s) na grade!`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao importar planilha.');
    } finally {
      setImportingSheet(false);
    }
  };

  // ── Conciliação de Editora/Selo em 1 ou Múltiplos Itens do Pedido ──────────
  const openCartReconcileModal = (items: CartPurchaseItem[]) => {
    if (!items.length) return;
    setReconcileItems(items);
    setSelectedReconcilePub(null);
    setReconcileSearch('');
    setShowReconcileModal(true);
    searchHorusPublishersForModal('', true);
  };

  const handleConfirmCartReconcile = async () => {
    if (!selectedReconcilePub || !reconcileItems.length || !supplierOverview || selectedBranchId === null) return;
    setSavingReconcile(true);
    try {
      const token = getToken();
      const sup = supplierOverview.supplier;
      const res = await fetch(`${apiUrl}/horus-purchases/items/reconcile-publisher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          cod_items: reconcileItems.map((x) => x.cod_item),
          new_cod_editora: selectedReconcilePub.cod_editora,
          origin_module: 'COMPRAS',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao conciliar editora.');
      toast.success(data.message);
      setShowReconcileModal(false);
      setCheckedCartCods({});
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar editora.');
    } finally {
      setSavingReconcile(false);
    }
  };

  // ── Filtros e Totais da Grade ──────────────────────────────────────────────
  const visibleCartItems = useMemo(() => {
    if (!gridFilterTerm.trim()) return cartItems;
    const q = gridFilterTerm.trim().toLowerCase();
    return cartItems.filter(
      (it) =>
        it.nome_item.toLowerCase().includes(q) ||
        it.isbn.toLowerCase().includes(q) ||
        it.nome_editora.toLowerCase().includes(q) ||
        String(it.cod_item).includes(q)
    );
  }, [cartItems, gridFilterTerm]);

  const cartSummary = useMemo(() => {
    const skus = cartItems.length;
    let totalQty = 0;
    let gross = 0;
    let net = 0;
    let invalidCount = 0;
    for (const it of cartItems) {
      totalQty += it.quantity;
      gross += it.subtotal_gross;
      net += it.subtotal_net;
      if (!it.publisher_configured || it.vlr_capa <= 0) invalidCount += 1;
    }
    const discVal = Math.max(0, gross - net);
    const avgDisc = gross > 0 ? (discVal / gross) * 100 : 0;
    const minFat = supplierOverview?.supplier.fat_minimo || 0;
    const minReached = net >= minFat;
    return { skus, totalQty, gross, net, discVal, avgDisc, invalidCount, minFat, minReached };
  }, [cartItems, supplierOverview]);

  const ordersTotalNetSum = useMemo(
    () => ordersList.reduce((acc, o) => acc + Number(o.total_net || 0), 0),
    [ordersList]
  );

  // Resumo dos 4 cards do fornecedor (igual ao padrão DBM)
  const supplierTopMetrics = useMemo(() => {
    const h = supplierOverview?.history;
    const lastCompra = h?.entradas_compra?.[0] || null;
    const lastConsig = h?.consignacoes_recebidas?.[0] || null;
    const lastAcerto = h?.acertos_consignacao?.[0] || null;
    const lastDevol = h?.devolucoes?.[0] || null;
    return { lastCompra, lastConsig, lastAcerto, lastDevol };
  }, [supplierOverview]);

  // ── Gerar Pedido de Compra no Horus (Status AP - Aprovado) ─────────────────
  const handleCreatePurchaseOrder = async () => {
    if (!supplierOverview || selectedBranchId === null) {
      toast.error('Selecione o fornecedor no topo antes de gerar o pedido.');
      return;
    }
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Configure os selos/editoras e descontos do fornecedor nesta filial.');
      setDeskHeroTab('SELOS_DESCONTOS');
      return;
    }
    if (!cartItems.length) {
      toast.error('Adicione itens à grade do pedido de compra.');
      return;
    }
    if (cartSummary.invalidCount > 0) {
      toast.error('Resolva os alertas de editora/preço nos itens destacados antes de gerar o pedido.');
      return;
    }
    setCreatingOrder(true);
    try {
      const token = getToken();
      const sup = supplierOverview.supplier;
      const res = await fetch(`${apiUrl}/horus-purchases/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: selectedBranchId,
          cod_grp_fornecedor: sup.cod_grp_fornecedor,
          cod_fornecedor: sup.cod_fornecedor,
          compra_consig: compraConsig,
          observations: orderObservations,
          items: cartItems.map((x) => ({ cod_item: x.cod_item, quantity: x.quantity })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Falha ao gravar pedido de compra no Horus.');

      toast.success(data.message || `Pedido #${data.horus_cod_pedido} gerado como AP (Aprovado)!`);
      setCartItems([]);
      setCheckedCartCods({});
      setOrderObservations('');
      setExportPromptOrder({
        id: data.order_id,
        horus_cod_pedido: data.horus_cod_pedido,
        horus_status: 'AP',
        nome_fornecedor: sup.nom_fornecedor,
      });
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, false);
      fetchOrdersList(true);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar pedido de compra.');
    } finally {
      setCreatingOrder(false);
    }
  };

  // ── Exportação Excel do Pedido (AP -> AE) & Detalhes ───────────────────────
  const handleExportOrderExcel = async (orderId: number, changeToAe: boolean) => {
    setExportingExcel(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        company_id: String(companyId),
        change_to_ae: String(changeToAe),
      });
      const res = await fetch(`${apiUrl}/horus-purchases/orders/${orderId}/export-excel?${params.toString()}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro ao exportar Excel do pedido.');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const fname = match ? match[1] : `Pedido_Compra_${orderId}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success(
        changeToAe
          ? 'Excel gerado e status alterado para AE (Aguardando Entrega) no Horus e no Cronuz!'
          : 'Excel do Pedido de Compra baixado com sucesso!'
      );
      setExportPromptOrder(null);
      fetchOrdersList(false);
      if (detailModalData?.order.id === orderId) openOrderDetailModal(orderId);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao exportar Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleManualStatusTransition = async (orderId: number, newHorusStatus: 'AE' | 'CA') => {
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          new_horus_status: newHorusStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao alterar status.');
      toast.success(data.message);
      fetchOrdersList(false);
      if (detailModalData?.order.id === orderId) openOrderDetailModal(orderId);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao alterar status.');
    }
  };

  const openOrderDetailModal = async (orderId: number) => {
    setLoadingOrderDetail(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/orders/${orderId}?company_id=${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setDetailModalData(await res.json());
      }
    } catch {
      toast.error('Erro ao carregar detalhes do pedido.');
    } finally {
      setLoadingOrderDetail(false);
    }
  };

  // ── Auditoria & Decisão Posterior de XML da NF-e ───────────────────────────
  const openXmlAuditDetailModal = async (auditId: number) => {
    setLoadingXmlAuditDetail(true);
    setXmlModalItemFilter('ALL');
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/xml-audits/${auditId}?company_id=${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Erro ao carregar análise do XML.');
      const data = await res.json();
      setXmlAuditDetailModal(data);
      setDecisionNotesDraft(data.audit?.decision_notes || '');
      const notesMap: Record<number, string> = {};
      for (const it of data.items || []) {
        if (it.item_note) notesMap[it.id] = it.item_note;
      }
      setItemNotesDraft(notesMap);
      setDecisionAdvanceToAe(data.audit?.order_horus_status === 'AP');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao abrir auditoria de XML.');
    } finally {
      setLoadingXmlAuditDetail(false);
    }
  };

  const handleUploadAndAnalyzeXml = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xmlUploadFile) {
      toast.error('Selecione o arquivo .xml da NF-e enviada pelo fornecedor.');
      return;
    }
    if (xmlUploadFile.size > MAX_XML_BYTES) {
      toast.error('O arquivo XML excede o limite máximo permitido de 10 MB.');
      return;
    }

    setAnalyzingXml(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('file', xmlUploadFile);
      fd.append('company_id', String(companyId));
      fd.append('auto_accept_if_ok', String(xmlAutoAcceptIfOk));
      fd.append('advance_horus_to_ae', String(xmlAdvanceHorusToAe));
      if (selectedBranchId !== null) fd.append('branch_id', String(selectedBranchId));
      if (xmlTargetOrderId) fd.append('order_id', xmlTargetOrderId);

      const res = await fetch(`${apiUrl}/horus-purchases/xml-audits/analyze`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Falha ao analisar XML da NF-e.');

      const auditSummary: XmlAuditSummary = data.audit;
      if (auditSummary.decision_status === 'XML_OK') {
        toast.success(data.message || 'XML 100% compatível! Pedido marcado como XML OK.');
      } else {
        toast.warning(data.message || 'XML analisado com divergências pontuadas. Confira os itens!');
      }

      setXmlUploadFile(null);
      if (xmlFileInputRef.current) xmlFileInputRef.current.value = '';
      await fetchXmlAuditsList(false);
      await fetchOrdersList(true);
      await openXmlAuditDetailModal(auditSummary.id);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar XML da NF-e.');
    } finally {
      setAnalyzingXml(false);
    }
  };

  const handleSubmitXmlDecision = async (
    targetStatus: 'XML_OK' | 'ACCEPTED_WITH_DIVERGENCE' | 'REJECTED'
  ) => {
    if (!xmlAuditDetailModal) return;
    const trimmedNotes = decisionNotesDraft.trim();
    if (
      (targetStatus === 'ACCEPTED_WITH_DIVERGENCE' || targetStatus === 'REJECTED') &&
      trimmedNotes.length < 5
    ) {
      toast.error(
        targetStatus === 'ACCEPTED_WITH_DIVERGENCE'
          ? 'Pontue o motivo/autorização no campo de parecer antes de Aceitar com Divergência.'
          : 'Pontue o motivo da recusa no campo de parecer antes de Recusar o XML.'
      );
      return;
    }
    if (
      targetStatus === 'XML_OK' &&
      xmlAuditDetailModal.audit.diagnostic_status === 'HAS_DIVERGENCE' &&
      trimmedNotes.length < 5
    ) {
      toast.error(
        'Esta NF possui divergências apontadas. Use "Aceitar c/ Divergência" ou preencha a justificativa no parecer.'
      );
      return;
    }

    setSavingXmlDecision(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/horus-purchases/xml-audits/${xmlAuditDetailModal.audit.id}/decision`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            company_id: companyId,
            decision_status: targetStatus,
            decision_notes: trimmedNotes || null,
            item_notes: itemNotesDraft,
            advance_horus_to_ae: decisionAdvanceToAe,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao gravar decisão do XML.');

      toast.success(data.message);
      await openXmlAuditDetailModal(xmlAuditDetailModal.audit.id);
      fetchXmlAuditsList(false);
      fetchOrdersList(true);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registrar decisão.');
    } finally {
      setSavingXmlDecision(false);
    }
  };

  const handleDownloadXmlAuditExcel = async (auditId: number, nfeNum: string) => {
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/horus-purchases/xml-audits/${auditId}/export-excel?company_id=${companyId}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) throw new Error('Falha ao baixar planilha de auditoria.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Auditoria_XML_NF_${nfeNum}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Relatório Excel da auditoria baixado!');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao exportar relatório do XML.');
    }
  };

  const handleSaveBranchSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBranchId === null) return;
    setSavingBranchConfig(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/branches/${selectedBranchId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          ...branchConfigForm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar configuração da filial.');
      toast.success(data.message || 'Parametrização da filial salva!');
      fetchBranches(companyId, selectedBranchId);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar configuração.');
    } finally {
      setSavingBranchConfig(false);
    }
  };

  const filteredXmlModalItems = useMemo(() => {
    if (!xmlAuditDetailModal) return [];
    if (xmlModalItemFilter === 'DIVERGENT') {
      return xmlAuditDetailModal.items.filter((x) => x.line_status === 'DIVERGENT');
    }
    if (xmlModalItemFilter === 'OK') {
      return xmlAuditDetailModal.items.filter((x) => x.line_status === 'OK');
    }
    return xmlAuditDetailModal.items;
  }, [xmlAuditDetailModal, xmlModalItemFilter]);

  const activeSuppliersInDropdown =
    supplierPickerMode === 'SAVED' ? savedSuppliersList : horusSuppliersList;

  return (
    <div className="w-full space-y-4 pb-16 font-sans">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA DE ATALHOS FIXOS NO TOPO (IGUAL GESTÃO DE PEDIDOS DBM)           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <HorusComprasPinnedNavBar
        activeTab={activeMainTab}
        onSelectTab={(tab) => setActiveMainTab(tab)}
        ordersCount={ordersList.length}
        pendingXmlCount={xmlKpis.pending_review}
        xmlOkCount={xmlKpis.xml_ok}
      />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 1: MESA DE COMPRAS (LAYOUT FLUIDO E ESPAÇADO ESTILO DBM DESK)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'DESK' && (
        <div className="space-y-4">
          {/* 1. BARRA DE COMANDO SUPERIOR: Filial ➔ Pesquisar Fornecedor ➔ Observação ➔ Ações */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
            <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1 min-w-0">
              {/* Identidade do Módulo */}
              <div className="shrink-0 pr-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block leading-none mb-1">
                  Gestão de Compras Horus
                </span>
                <h1 className="text-base font-black text-slate-900 dark:text-white leading-tight whitespace-nowrap">
                  Mesa de Reposição
                </h1>
              </div>

              <div className="h-7 w-px bg-slate-200 dark:bg-slate-800 hidden md:block shrink-0" />

              {/* 1º Seletor de Filial */}
              <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
                <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <span className="block text-[9px] uppercase font-bold tracking-wider text-slate-400 leading-none mb-0.5">
                    1. Filial Destino
                  </span>
                  <select
                    disabled={loadingBranches}
                    value={selectedBranchId ?? ''}
                    onChange={(e) => {
                      const nextBid = Number(e.target.value);
                      setSelectedBranchId(nextBid);
                      setSupplierOverview(null);
                      setCartItems([]);
                      setCheckedCartCods({});
                    }}
                    className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none pr-3 cursor-pointer"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id} className="text-slate-900">
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2º Seletor Inteligente de Fornecedor no Topo (Salvos ou Pesquisa Horus sob demanda) */}
              <div className="relative flex-1 min-w-[260px] max-w-xl" ref={supplierDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !isSupplierPickerOpen;
                    setIsSupplierPickerOpen(nextOpen);
                    if (nextOpen) {
                      setTimeout(() => supplierSearchInputRef.current?.focus(), 60);
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    isSupplierPickerOpen
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-slate-950'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Search className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-[9px] uppercase font-bold tracking-wider text-slate-400 leading-none mb-0.5">
                        2. Fornecedor na Filial
                      </span>
                      {supplierOverview ? (
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                          #{supplierOverview.supplier.cod_fornecedor} — {supplierOverview.supplier.nom_fornecedor}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate block">
                          Selecionar fornecedor salvo ou pesquisar no Horus...
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {supplierOverview && (
                      <span
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSupplierOverview(null);
                          setCartItems([]);
                          setCheckedCartCods({});
                          setIsSupplierPickerOpen(true);
                        }}
                        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700"
                        title="Trocar fornecedor"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        isSupplierPickerOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Popover Amplo de Pesquisa de Fornecedor (Salvos vs Consultar no Horus) */}
                {isSupplierPickerOpen && (
                  <div className="absolute left-0 right-0 sm:w-[540px] mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="p-3.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
                      {/* Abas de Origem da Busca: Salvos no Cronuz vs Consultar no Banco do Horus */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setSupplierPickerMode('SAVED');
                              if (selectedBranchId !== null) {
                                loadSavedSuppliersForBranch(selectedBranchId, supplierQuery);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              supplierPickerMode === 'SAVED'
                                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            Já Salvos na Filial ({savedSuppliersList.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupplierPickerMode('HORUS')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                              supplierPickerMode === 'HORUS'
                                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            Consultar no Horus (SQL)
                          </button>
                        </div>

                        <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                          {selectedBranch?.nome}
                        </span>
                      </div>

                      {/* Campo de Pesquisa + Botão Pesquisar */}
                      <form onSubmit={executeHorusSupplierSearch} className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            ref={supplierSearchInputRef}
                            type="text"
                            value={supplierQuery}
                            onChange={(e) => setSupplierQuery(e.target.value)}
                            placeholder={
                              supplierPickerMode === 'SAVED'
                                ? 'Filtrar fornecedores já configurados...'
                                : 'Digite nome, fantasia, CNPJ ou código e clique em Pesquisar...'
                            }
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loadingSuppliers}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          {loadingSuppliers ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5" />
                          )}
                          Pesquisar
                        </button>
                      </form>
                    </div>

                    {/* Lista de Resultados do Popover */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 p-1.5">
                      {loadingSuppliers ? (
                        <div className="py-10 text-center text-xs text-slate-500">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                          Consultando fornecedores...
                        </div>
                      ) : supplierPickerMode === 'HORUS' && !hasSearchedHorusSuppliers ? (
                        <div className="py-10 px-6 text-center space-y-1.5">
                          <DatabaseZap className="w-6 h-6 text-indigo-500 mx-auto opacity-80" />
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Pesquisa sob demanda no banco do Horus
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Digite o nome, CNPJ ou código do fornecedor acima e clique em <strong>Pesquisar</strong> para buscar em <code>FORNECEDORES_GERAL</code>.
                          </p>
                        </div>
                      ) : activeSuppliersInDropdown.length === 0 ? (
                        <div className="py-10 px-6 text-center space-y-2">
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {supplierPickerMode === 'SAVED'
                              ? 'Nenhum fornecedor configurado ainda nesta filial.'
                              : 'Nenhum fornecedor encontrado no Horus para este termo.'}
                          </p>
                          {supplierPickerMode === 'SAVED' && (
                            <button
                              type="button"
                              onClick={() => setSupplierPickerMode('HORUS')}
                              className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold cursor-pointer"
                            >
                              Pesquisar no banco do Horus →
                            </button>
                          )}
                        </div>
                      ) : (
                        activeSuppliersInDropdown.map((sup) => {
                          const isSelected =
                            supplierOverview?.supplier.cod_fornecedor === sup.cod_fornecedor &&
                            supplierOverview?.supplier.cod_grp_fornecedor === sup.cod_grp_fornecedor;
                          return (
                            <button
                              key={`${sup.cod_grp_fornecedor}-${sup.cod_fornecedor}`}
                              type="button"
                              onClick={() => {
                                if (selectedBranchId !== null) {
                                  loadSupplierOverview(
                                    selectedBranchId,
                                    sup.cod_grp_fornecedor,
                                    sup.cod_fornecedor
                                  );
                                }
                              }}
                              className={`w-full px-3.5 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {sup.nom_fornecedor}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                  Cód. #{sup.cod_fornecedor} (Grp {sup.cod_grp_fornecedor}) • CNPJ{' '}
                                  {formatCnpj(sup.cnpj)}
                                </div>
                              </div>

                              <div className="shrink-0">
                                {sup.is_configured ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                    <Check className="w-3 h-3" />
                                    {sup.configured_publishers_count} selo(s)
                                  </span>
                                ) : (
                                  <span className="inline-block px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">
                                    Configurar
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Direita da Barra de Comando: Importar Pedido + Gerenciar Selos + Gerar Pedido AP */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsIntakeDrawerOpen(!isIntakeDrawerOpen)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  isIntakeDrawerOpen
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Importar Planilha / Lista</span>
                {isIntakeDrawerOpen ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {supplierOverview && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPubsForSupplier({});
                    setPubSearchTerm('');
                    setShowAddPublisherModal(true);
                    searchHorusPublishersForModal('');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  <Tag className="w-4 h-4 text-indigo-600" />
                  <span>Selos &amp; Descontos ({supplierOverview.configured_discounts.length})</span>
                </button>
              )}

              <button
                type="button"
                disabled={
                  !supplierOverview ||
                  !supplierOverview.is_ready_for_purchase ||
                  cartItems.length === 0 ||
                  cartSummary.invalidCount > 0 ||
                  creatingOrder
                }
                onClick={handleCreatePurchaseOrder}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white disabled:text-slate-500 text-xs font-bold shadow-sm transition cursor-pointer disabled:cursor-not-allowed"
              >
                {creatingOrder ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Gerar Pedido AP</span>
              </button>
            </div>
          </div>

          {/* 2. DADOS DO FORNECEDOR + 4 CARDS ESPAÇADOS DE HISTÓRICO (PADRÃO DBM) */}
          {loadingOverview ? (
            <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 shadow-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
              Carregando histórico de entradas, consignação, acertos, devoluções e descontos do fornecedor...
            </div>
          ) : !supplierOverview ? (
            <div className="bg-white dark:bg-slate-900 px-5 py-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
                    1. Escolha a Filial acima ➔ 2. Clique no campo de Fornecedor para selecionar um salvo ou pesquisar no Horus ➔ 3. Monte o pedido na grade ampla abaixo
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSupplierPickerOpen(true);
                  setTimeout(() => supplierSearchInputRef.current?.focus(), 60);
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                Selecionar Fornecedor
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Faixa Limpa de Identificação do Fornecedor */}
              <div className="bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Fornecedor:</span>
                    <span className="text-sm font-extrabold">{supplierOverview.supplier.nom_fornecedor}</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-slate-600 dark:text-slate-400">
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">CNPJ:</span>
                    <span>{formatCnpj(supplierOverview.supplier.cnpj)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Horus:</span>
                    <span className="font-mono font-semibold">
                      #{supplierOverview.supplier.cod_fornecedor} (Grp {supplierOverview.supplier.cod_grp_fornecedor})
                    </span>
                  </div>

                  {supplierOverview.supplier.prazo_pagamentos && (
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Prazo:</span>
                      <span className="font-semibold">{supplierOverview.supplier.prazo_pagamentos}</span>
                    </div>
                  )}

                  {cartSummary.minFat > 0 && (
                    <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-xl border border-indigo-200 dark:border-indigo-800">
                      <Scale className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="text-[10px] font-bold uppercase text-indigo-900 dark:text-indigo-300">
                        Fat. Mín:
                      </span>
                      <span className="font-mono font-bold text-indigo-950 dark:text-white">
                        {formatMoney(cartSummary.minFat)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                          cartSummary.minReached ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {cartSummary.minReached ? '✓ OK' : 'PENDENTE'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSupplierHistoryCards(!showSupplierHistoryCards)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition cursor-pointer"
                  >
                    {showSupplierHistoryCards ? (
                      <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>{showSupplierHistoryCards ? 'Ocultar Cards' : 'Exibir Cards'}</span>
                  </button>
                </div>
              </div>

              {/* Alerta Amplo caso ainda não tenha Selos/Descontos vinculados nesta filial */}
              {!supplierOverview.is_ready_for_purchase && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 text-xs text-amber-950 dark:text-amber-200">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold">
                        Configure os Selos (Editoras) e Descontos deste fornecedor na filial {selectedBranch?.nome}
                      </p>
                      <p className="text-xs opacity-90">
                        Para segurança comercial, vincule ao menos uma editora e seu desconto antes de liberar a digitação do pedido.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {supplierOverview.horus_suggested_publishers.some((s) => s.source === 'EDITORAS_FORNEC') && (
                      <button
                        type="button"
                        disabled={savingSupplierDiscounts}
                        onClick={handleImportFromHorusEditorasFornec}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Importar de EDITORAS_FORNEC
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPubsForSupplier({});
                        setPubSearchTerm('');
                        setShowAddPublisherModal(true);
                        searchHorusPublishersForModal('');
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                    >
                      + Vincular Selos Agora
                    </button>
                  </div>
                </div>
              )}

              {/* 4 Cards Executivos Espaçados (Compra, Consignação, Acerto, Devolução — clicáveis!) */}
              {showSupplierHistoryCards && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Card 1: Última Compra */}
                  <button
                    type="button"
                    onClick={() => setDeskHeroTab('ENTRADAS')}
                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs text-left hover:border-emerald-400 transition cursor-pointer flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4" />
                        Última Entrada Compra
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-mono text-[11px] font-bold">
                        <Calendar className="w-3 h-3" />
                        {supplierTopMetrics.lastCompra ? formatDateBr(supplierTopMetrics.lastCompra.data_nf) : '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                        {supplierTopMetrics.lastCompra
                          ? formatMoney(supplierTopMetrics.lastCompra.vlr_liquido)
                          : 'R$ 0,00'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {supplierTopMetrics.lastCompra
                          ? `${supplierTopMetrics.lastCompra.qtd_exemplares} un • NF ${supplierTopMetrics.lastCompra.nro_nf}`
                          : `${supplierOverview.history.entradas_compra.length} notas (12m)`}
                      </span>
                    </div>
                  </button>

                  {/* Card 2: Consignação na Filial */}
                  <button
                    type="button"
                    onClick={() => setDeskHeroTab('CONSIG_ACERTOS')}
                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs text-left hover:border-indigo-400 transition cursor-pointer flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                        <Package className="w-4 h-4" />
                        Consignação na Filial
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-mono text-[11px] font-bold">
                        {supplierOverview.history.consigned_balance_summary.total_skus} tít.
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-base font-black font-mono text-indigo-700 dark:text-indigo-300">
                        {supplierOverview.history.consigned_balance_summary.total_units} exemp.
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {supplierTopMetrics.lastConsig
                          ? `Últ. ${formatDateBr(supplierTopMetrics.lastConsig.data_nf)}`
                          : 'Sem remessa rec.'}
                      </span>
                    </div>
                  </button>

                  {/* Card 3: Último Acerto */}
                  <button
                    type="button"
                    onClick={() => setDeskHeroTab('CONSIG_ACERTOS')}
                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs text-left hover:border-sky-400 transition cursor-pointer flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                        <Scale className="w-4 h-4" />
                        Último Acerto
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 font-mono text-[11px] font-bold">
                        <Calendar className="w-3 h-3" />
                        {supplierTopMetrics.lastAcerto ? formatDateBr(supplierTopMetrics.lastAcerto.data_nf) : '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                        {supplierTopMetrics.lastAcerto
                          ? formatMoney(supplierTopMetrics.lastAcerto.vlr_liquido)
                          : 'R$ 0,00'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {supplierTopMetrics.lastAcerto
                          ? `${supplierTopMetrics.lastAcerto.qtd_exemplares} un • NF ${supplierTopMetrics.lastAcerto.nro_nf}`
                          : 'Sem acertos (12m)'}
                      </span>
                    </div>
                  </button>

                  {/* Card 4: Última Devolução */}
                  <button
                    type="button"
                    onClick={() => setDeskHeroTab('DEVOLUCOES_PEDIDOS')}
                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs text-left hover:border-amber-400 transition cursor-pointer flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4" />
                        Última Devolução
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 font-mono text-[11px] font-bold">
                        <Calendar className="w-3 h-3" />
                        {supplierTopMetrics.lastDevol ? formatDateBr(supplierTopMetrics.lastDevol.data_nf) : '—'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                        {supplierTopMetrics.lastDevol
                          ? formatMoney(supplierTopMetrics.lastDevol.vlr_liquido)
                          : 'R$ 0,00'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {supplierTopMetrics.lastDevol
                          ? `${supplierTopMetrics.lastDevol.qtd_exemplares} un • NF ${supplierTopMetrics.lastDevol.nro_nf}`
                          : 'Sem devoluções (12m)'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. GAVETA RETRÁTIL DE IMPORTAÇÃO INTELIGENTE (EXCEL OU TEXTO COLADO) */}
          {isIntakeDrawerOpen && (
            <form
              onSubmit={handleImportSheet}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900 shadow-md space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Importar Itens do Pedido (ISBN + Quantidade — Máx. 10 MB)</span>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`${apiUrl}/horus-purchases/template-sheet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Modelo .xlsx
                  </a>

                  <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setIntakeMode('EXCEL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        intakeMode === 'EXCEL'
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Planilha (.xlsx / .csv)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntakeMode('TEXT')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        intakeMode === 'TEXT'
                          ? 'bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Texto / Colar do Excel
                    </button>
                  </div>
                </div>
              </div>

              {intakeMode === 'EXCEL' ? (
                <div className="border-2 border-dashed border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 text-center bg-emerald-50/30 dark:bg-emerald-950/10">
                  <input
                    type="file"
                    id="compras-sheet-input"
                    accept=".xlsx,.csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (f && f.size > MAX_SHEET_BYTES) {
                        toast.error('O arquivo excede o limite máximo permitido de 10 MB.');
                        e.target.value = '';
                        return;
                      }
                      setSheetFile(f);
                    }}
                  />
                  <label
                    htmlFor="compras-sheet-input"
                    className="cursor-pointer text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-bold inline-flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                    {sheetFile
                      ? `${sheetFile.name} (Clique para trocar)`
                      : 'Clique aqui para selecionar a planilha (.xlsx ou .csv)'}
                  </label>
                </div>
              ) : (
                <textarea
                  rows={4}
                  value={sheetPastedText}
                  onChange={(e) => setSheetPastedText(e.target.value)}
                  placeholder={'Cole aqui linhas com ISBN e quantidade (ex: 9788535914849   10)...'}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  Os itens serão validados com o estoque da filial e com os descontos configurados para o fornecedor.
                </span>
                <button
                  type="submit"
                  disabled={importingSheet}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {importingSheet ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Carregar na Grade
                </button>
              </div>
            </form>
          )}

          {/* 4. CONTAINER PRINCIPAL EM LARGURA TOTAL (HERO GRID ESTILO DBM) */}
          {supplierOverview && (
            <div
              className={`bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col ${
                isGridMaximized ? 'fixed inset-3 z-50 rounded-2xl shadow-2xl border-indigo-500' : 'rounded-2xl'
              }`}
            >
              {/* Barra Superior de Abas do Container Principal */}
              <div className="px-4 pt-3 bg-slate-50/80 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto">
                <div className="flex items-center gap-1.5 shrink-0">
                  {[
                    {
                      id: 'PEDIDO',
                      label: 'Itens do Pedido',
                      count: cartItems.length,
                    },
                    {
                      id: 'SELOS_DESCONTOS',
                      label: 'Selos & Descontos',
                      count: supplierOverview.configured_discounts.length,
                    },
                    {
                      id: 'ENTRADAS',
                      label: 'Últimas Entradas Compra',
                      count: supplierOverview.history.entradas_compra.length,
                    },
                    {
                      id: 'CONSIG_ACERTOS',
                      label: 'Consignação & Acertos',
                      count:
                        supplierOverview.history.consignacoes_recebidas.length +
                        supplierOverview.history.acertos_consignacao.length,
                    },
                    {
                      id: 'DEVOLUCOES_PEDIDOS',
                      label: 'Devoluções & Pedidos Horus',
                      count:
                        supplierOverview.history.devolucoes.length +
                        supplierOverview.history.pedidos_compra_horus.length,
                    },
                  ].map((tb) => {
                    const active = deskHeroTab === tb.id;
                    return (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => setDeskHeroTab(tb.id as DeskHeroSubTab)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-t-2 border-x transition-all cursor-pointer ${
                          active
                            ? 'bg-white dark:bg-slate-900 border-indigo-600 text-slate-900 dark:text-white border-b-white dark:border-b-slate-900 -mb-px'
                            : 'bg-transparent border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/70'
                        }`}
                      >
                        <span>{tb.label}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            active
                              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                              : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {tb.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setIsGridMaximized(!isGridMaximized)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 shrink-0 cursor-pointer"
                >
                  {isGridMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isGridMaximized ? 'Sair Tela Cheia' : 'Tela Cheia'}</span>
                </button>
              </div>

              {/* ABA HERO 1: GRADE AMPLA DE ITENS DO PEDIDO */}
              {deskHeroTab === 'PEDIDO' && (
                <div className="flex-1 flex flex-col">
                  {/* Toolbar de Inserção Rápida de Item + Filtro da Grade + Colunas */}
                  <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    {/* Inserir Item por ISBN / Título */}
                    <form onSubmit={handleLookupItems} className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 max-w-2xl">
                      <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={itemSearchTerm}
                          onChange={(e) => setItemSearchTerm(e.target.value)}
                          placeholder="Adicionar item: digite ou bipe ISBN, código Horus ou título..."
                          className="w-full pl-10 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:bg-white focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={itemSearchDefaultQty}
                        onChange={(e) => setItemSearchDefaultQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        title="Quantidade ao adicionar"
                        className="w-20 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono font-bold text-right"
                      />
                      <button
                        type="submit"
                        disabled={searchingItems}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {searchingItems ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Adicionar
                      </button>
                    </form>

                    {/* Direita: Filtrar itens já lançados + Conciliar Editora em Lote + Colunas */}
                    <div className="flex flex-wrap items-center gap-2">
                      {Object.values(checkedCartCods).some(Boolean) && (
                        <button
                          type="button"
                          onClick={() => {
                            const targets = cartItems.filter((c) => checkedCartCods[c.cod_item]);
                            openCartReconcileModal(targets);
                          }}
                          className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <DatabaseZap className="w-3.5 h-3.5" />
                          Conciliar Editora ({Object.values(checkedCartCods).filter(Boolean).length})
                        </button>
                      )}

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={gridFilterTerm}
                          onChange={(e) => setGridFilterTerm(e.target.value)}
                          placeholder="Filtrar na grade..."
                          className="w-44 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>

                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs">
                        <Columns3 className="w-3.5 h-3.5 text-slate-400" />
                        <button
                          type="button"
                          onClick={() => setShowColIsbn(!showColIsbn)}
                          className={`px-2 py-0.5 rounded-lg font-semibold cursor-pointer ${
                            showColIsbn ? 'bg-slate-900 text-white dark:bg-indigo-600' : 'text-slate-400 line-through'
                          }`}
                        >
                          ISBN
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowColSaldos(!showColSaldos)}
                          className={`px-2 py-0.5 rounded-lg font-semibold cursor-pointer ${
                            showColSaldos ? 'bg-slate-900 text-white dark:bg-indigo-600' : 'text-slate-400 line-through'
                          }`}
                        >
                          Saldos
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowColPrices(!showColPrices)}
                          className={`px-2 py-0.5 rounded-lg font-semibold cursor-pointer ${
                            showColPrices ? 'bg-slate-900 text-white dark:bg-indigo-600' : 'text-slate-400 line-through'
                          }`}
                        >
                          Desconto
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Resultados de Pesquisa Múltipla no Acervo */}
                  {itemLookupResults.length > 0 && (
                    <div className="mx-4 mt-3 border border-indigo-200 dark:border-indigo-900 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
                      <div className="px-4 py-2.5 bg-indigo-100/70 dark:bg-indigo-950/60 flex items-center justify-between text-xs font-bold text-indigo-950 dark:text-indigo-200">
                        <span>Itens encontrados no Horus ({itemLookupResults.length}) — Clique para incluir:</span>
                        <button
                          type="button"
                          onClick={() => setItemLookupResults([])}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          ✕ Fechar
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-indigo-100 dark:divide-indigo-900/40 text-xs">
                        {itemLookupResults.map((resIt) => (
                          <div
                            key={resIt.cod_item}
                            className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white dark:hover:bg-slate-900"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                <span className="font-mono text-slate-500 mr-2">[{resIt.isbn || resIt.cod_item}]</span>
                                {resIt.nome_item}
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                                <span>
                                  Editora:{' '}
                                  <strong className={resIt.publisher_configured ? 'text-emerald-700' : 'text-amber-700'}>
                                    {resIt.nome_editora}
                                  </strong>
                                </span>
                                <span>Saldo Filial: <strong className="font-mono">{resIt.stock_available}</strong></span>
                                <span>Consig. Rec.: <strong className="font-mono">{resIt.consigned_received}</strong></span>
                                <span>Vendas 90d: <strong className="font-mono">{resIt.sales_90}</strong></span>
                                <span>Capa: <strong className="font-mono">{formatMoney(resIt.vlr_capa)}</strong></span>
                                <span>
                                  Desconto:{' '}
                                  <strong className={resIt.publisher_configured ? 'text-emerald-700 font-mono' : 'text-rose-600'}>
                                    {resIt.publisher_configured ? `${resIt.discount_pct.toFixed(2)}%` : 'Não vinculado'}
                                  </strong>
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                addOrMergeItemToCart(resIt, Math.max(1, itemSearchDefaultQty));
                                toast.success(`'${resIt.nome_item}' adicionado.`);
                              }}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shrink-0 cursor-pointer"
                            >
                              + Incluir ({itemSearchDefaultQty})
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lastNotFoundIsbns.length > 0 && (
                    <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-2">
                      <div>
                        <strong>ISBNs não localizados no Horus ({lastNotFoundIsbns.length}):</strong>{' '}
                        <span className="font-mono">{lastNotFoundIsbns.slice(0, 12).join(', ')}</span>
                      </div>
                      <button type="button" onClick={() => setLastNotFoundIsbns([])} className="font-bold cursor-pointer">
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Tabela Principal Espaçada em 100% da Largura */}
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-xs min-w-[1020px]">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-3 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={
                                visibleCartItems.length > 0 &&
                                visibleCartItems.every((c) => Boolean(checkedCartCods[c.cod_item]))
                              }
                              onChange={(e) => {
                                const next: Record<number, boolean> = {};
                                if (e.target.checked) {
                                  visibleCartItems.forEach((c) => {
                                    next[c.cod_item] = true;
                                  });
                                }
                                setCheckedCartCods(next);
                              }}
                              className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                            />
                          </th>
                          {showColIsbn && <th className="py-3 px-3.5 w-36">ISBN / Cód.</th>}
                          <th className="py-3 px-3.5">Título do Livro</th>
                          <th className="py-3 px-3.5 w-60">Editora / Selo (Horus)</th>
                          {showColSaldos && (
                            <>
                              <th className="py-3 px-3.5 w-28 text-right">Saldo / Mín</th>
                              <th className="py-3 px-3.5 w-32 text-right">Consig / Vds 90d</th>
                            </>
                          )}
                          <th className="py-3 px-3.5 w-28 text-right">Quantidade</th>
                          {showColPrices && (
                            <>
                              <th className="py-3 px-3.5 w-28 text-right">Capa</th>
                              <th className="py-3 px-3.5 w-28 text-right">Desc. (%)</th>
                              <th className="py-3 px-3.5 w-28 text-right">Líq. Unit.</th>
                            </>
                          )}
                          <th className="py-3 px-3.5 w-32 text-right">Subtotal Líq.</th>
                          <th className="py-3 px-3 w-12 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {visibleCartItems.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="py-16 text-center text-slate-400 space-y-2">
                              <Package className="w-8 h-8 mx-auto opacity-30" />
                              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                Nenhum item na grade do pedido ainda.
                              </div>
                              <div className="text-xs text-slate-400">
                                Pesquise por ISBN/título na barra acima ou clique em <strong>Importar Planilha / Lista</strong>.
                              </div>
                            </td>
                          </tr>
                        ) : (
                          visibleCartItems.map((it, idx) => {
                            const hasWarning = !it.publisher_configured || it.vlr_capa <= 0;
                            return (
                              <tr
                                key={it.cod_item}
                                onClick={() => setSelectedCartIndex(idx)}
                                className={`transition-colors ${
                                  hasWarning
                                    ? 'bg-amber-50/70 dark:bg-amber-950/25'
                                    : selectedCartIndex === idx
                                    ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-3 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(checkedCartCods[it.cod_item])}
                                    onChange={(e) =>
                                      setCheckedCartCods((prev) => ({
                                        ...prev,
                                        [it.cod_item]: e.target.checked,
                                      }))
                                    }
                                    className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                                  />
                                </td>
                                {showColIsbn && (
                                  <td className="py-3 px-3.5 font-mono">
                                    <div className="font-bold text-slate-900 dark:text-white">{it.isbn || '—'}</div>
                                    <div className="text-[11px] text-slate-400">#{it.cod_item}</div>
                                  </td>
                                )}
                                <td className="py-3 px-3.5">
                                  <div className="font-bold text-slate-900 dark:text-white">{it.nome_item}</div>
                                  {it.last_entry_date && (
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                      Últ. {it.last_entry_type}: {formatDateBr(it.last_entry_date)} ({it.last_entry_qty} un)
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`font-semibold truncate ${
                                        it.publisher_configured
                                          ? 'text-slate-700 dark:text-slate-200'
                                          : 'text-amber-800 dark:text-amber-300 font-bold'
                                      }`}
                                    >
                                      {it.nome_editora}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => openCartReconcileModal([it])}
                                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-[11px] font-semibold shrink-0 cursor-pointer transition"
                                      title="Alterar Editora/Selo no Horus e no Cronuz"
                                    >
                                      Ajustar Selo
                                    </button>
                                  </div>
                                  {!it.publisher_configured && it.cod_editora && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPubsForSupplier({
                                          [it.cod_editora!]: {
                                            cod_editora: it.cod_editora!,
                                            nome_editora: it.nome_editora,
                                          },
                                        });
                                        setShowAddPublisherModal(true);
                                        searchHorusPublishersForModal(it.nome_editora);
                                      }}
                                      className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold cursor-pointer"
                                    >
                                      + Vincular Desconto desta Editora
                                    </button>
                                  )}
                                </td>
                                {showColSaldos && (
                                  <>
                                    <td className="py-3 px-3.5 text-right font-mono">
                                      <span
                                        className={
                                          it.stock_available <= 0
                                            ? 'text-rose-600 font-bold'
                                            : 'text-emerald-700 dark:text-emerald-400 font-bold'
                                        }
                                      >
                                        {it.stock_available}
                                      </span>
                                      <span className="text-slate-400"> / {it.min_stock || '—'}</span>
                                    </td>
                                    <td className="py-3 px-3.5 text-right font-mono">
                                      <span className="text-indigo-700 dark:text-indigo-300 font-semibold">
                                        {it.consigned_received}
                                      </span>
                                      <span className="text-slate-400"> / {it.sales_90}</span>
                                    </td>
                                  </>
                                )}
                                <td className="py-3 px-3.5 text-right">
                                  <input
                                    id={`compras-qty-${idx}`}
                                    type="number"
                                    min={1}
                                    value={it.quantity}
                                    onKeyDown={(ev) => handleQtyKeyDown(ev, idx, visibleCartItems.length)}
                                    onChange={(e) =>
                                      updateCartItemQty(it.cod_item, parseInt(e.target.value, 10) || 1)
                                    }
                                    className="w-20 px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono font-bold focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                                {showColPrices && (
                                  <>
                                    <td className="py-3 px-3.5 text-right font-mono">{formatMoney(it.vlr_capa)}</td>
                                    <td className="py-3 px-3.5 text-right font-mono">
                                      {it.publisher_configured ? (
                                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                                          {it.discount_pct.toFixed(2)}%
                                        </span>
                                      ) : (
                                        <span className="text-rose-600 font-bold">Pendente</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3.5 text-right font-mono">
                                      {formatMoney(it.unit_net_price)}
                                    </td>
                                  </>
                                )}
                                <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                                  {formatMoney(it.subtotal_net)}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCartItems((prev) => prev.filter((x) => x.cod_item !== it.cod_item))
                                    }
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Rodapé Espaçado de Fechamento & Modalidade do Pedido */}
                  <div className="p-4 bg-slate-50/90 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                      <div className="lg:col-span-3">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Modalidade no Horus
                        </label>
                        <select
                          value={compraConsig}
                          onChange={(e) => setCompraConsig(e.target.value === 'S' ? 'S' : 'N')}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                        >
                          <option value="N">Compra Firme (N)</option>
                          <option value="S">Consignação (S)</option>
                        </select>
                      </div>
                      <div className="lg:col-span-9">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Observações do Pedido (enviadas em CAIXA ALTA para OBS_PEDIDO_COMPRA no Horus)
                        </label>
                        <input
                          type="text"
                          maxLength={250}
                          value={orderObservations}
                          onChange={(e) => setOrderObservations(e.target.value)}
                          placeholder="Ex: REPOSIÇÃO LOJA - VALIDAR XML ANTES DA ENTREGA..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium uppercase"
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-2 font-mono text-slate-500">
                        <span>
                          Itens na grade: <strong className="text-slate-900 dark:text-white">{cartSummary.skus}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Exemplares: <strong className="text-slate-900 dark:text-white">{cartSummary.totalQty}</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <span className="text-slate-500 mr-1.5">Total Bruto:</span>
                          <strong className="font-mono text-slate-800 dark:text-slate-200">
                            {formatMoney(cartSummary.gross)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 mr-1.5">Desconto Médio:</span>
                          <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                            {cartSummary.avgDisc.toFixed(2)}%
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 mr-1.5">Total Líquido:</span>
                          <strong className="font-mono text-base font-black text-indigo-700 dark:text-indigo-300">
                            {formatMoney(cartSummary.net)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA HERO 2: SELOS & DESCONTOS DO FORNECEDOR EM LARGURA TOTAL */}
              {deskHeroTab === 'SELOS_DESCONTOS' && (
                <div className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Selos (Editoras) &amp; Descontos Comerciais na Filial {selectedBranch?.nome}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Clique no percentual para editar rapidamente ou vincule novos selos do cadastro oficial do Horus.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPubsForSupplier({});
                        setPubSearchTerm('');
                        setShowAddPublisherModal(true);
                        searchHorusPublishersForModal('');
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      Vincular Selos em Lote
                    </button>
                  </div>

                  {supplierOverview.configured_discounts.length > 0 ? (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="py-3 px-4 w-28">Cód. Horus</th>
                            <th className="py-3 px-4">Editora / Selo</th>
                            <th className="py-3 px-4 w-48">CNPJ Fornecedor</th>
                            <th className="py-3 px-4 w-40 text-right">Desconto (%)</th>
                            <th className="py-3 px-4 w-48">Atualizado por</th>
                            <th className="py-3 px-4 w-20 text-right">Remover</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {supplierOverview.configured_discounts.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="py-3 px-4 font-mono font-bold text-slate-600">#{d.cod_editora}</td>
                              <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{d.nome_editora}</td>
                              <td className="py-3 px-4 font-mono text-slate-500">{formatCnpj(d.cnpj_fornecedor)}</td>
                              <td className="py-3 px-4 text-right">
                                {editingDiscountId === d.id ? (
                                  <div className="inline-flex items-center gap-1.5 justify-end">
                                    <CurrencyInput
                                      value={editingDiscountPct}
                                      onChangeValue={(val) => setEditingDiscountPct(val)}
                                      suffixStr="%"
                                      max={100}
                                      className="w-24 text-right px-2.5 py-1 rounded-xl border border-indigo-500 bg-white dark:bg-slate-800 font-mono text-xs font-bold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateSingleDiscount(d, editingDiscountPct)}
                                      className="p-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingDiscountId(null)}
                                      className="p-1.5 rounded-lg bg-slate-200 text-slate-700 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDiscountId(d.id);
                                      setEditingDiscountPct(d.desconto_percentual);
                                    }}
                                    className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold hover:border-emerald-400 cursor-pointer"
                                  >
                                    {d.desconto_percentual.toFixed(2)}% ✎
                                  </button>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-500">{d.updated_by_name || '—'}</td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDiscount(d.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">
                      Nenhuma editora configurada ainda para este fornecedor nesta filial.
                    </div>
                  )}

                  {supplierOverview.horus_suggested_publishers.some((s) => !s.already_configured) && (
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Sugestões detectadas nas notas e cadastros deste fornecedor no Horus (clique para vincular):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {supplierOverview.horus_suggested_publishers
                          .filter((s) => !s.already_configured)
                          .slice(0, 18)
                          .map((sug) => (
                            <button
                              key={sug.cod_editora}
                              type="button"
                              onClick={() => {
                                setSelectedPubsForSupplier({
                                  [sug.cod_editora]: {
                                    cod_editora: sug.cod_editora,
                                    nome_editora: sug.nome_editora,
                                  },
                                });
                                if (sug.horus_discount > 0) setBatchDiscountPct(sug.horus_discount);
                                setShowAddPublisherModal(true);
                                searchHorusPublishersForModal('');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                              <span>
                                #{sug.cod_editora} {sug.nome_editora}
                              </span>
                              {sug.horus_discount > 0 && (
                                <span className="text-emerald-600 font-mono font-bold">({sug.horus_discount}%)</span>
                              )}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA HERO 3: ÚLTIMAS ENTRADAS DE COMPRA */}
              {deskHeroTab === 'ENTRADAS' && (
                <div className="p-5">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Nº NF Entrada</th>
                          <th className="py-3 px-4">Data Recepção</th>
                          <th className="py-3 px-4">CFOP</th>
                          <th className="py-3 px-4 text-right">Títulos</th>
                          <th className="py-3 px-4 text-right">Exemplares</th>
                          <th className="py-3 px-4 text-right">Valor Bruto</th>
                          <th className="py-3 px-4 text-right">Valor Líquido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {supplierOverview.history.entradas_compra.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center font-sans text-slate-400">
                              Nenhuma nota de compra localizada nos últimos 12 meses nesta filial.
                            </td>
                          </tr>
                        ) : (
                          supplierOverview.history.entradas_compra.map((nf) => (
                            <tr key={`${nf.cod_nf}-${nf.nro_nf}`} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{nf.nro_nf}</td>
                              <td className="py-3 px-4">{formatDateBr(nf.data_nf)}</td>
                              <td className="py-3 px-4">{nf.cfop}</td>
                              <td className="py-3 px-4 text-right">{nf.qtd_skus}</td>
                              <td className="py-3 px-4 text-right font-bold">{nf.qtd_exemplares}</td>
                              <td className="py-3 px-4 text-right text-slate-500">{formatMoney(nf.vlr_bruto)}</td>
                              <td className="py-3 px-4 text-right font-bold text-emerald-700">
                                {formatMoney(nf.vlr_liquido)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ABA HERO 4: CONSIGNAÇÃO RECEBIDA & ACERTOS */}
              {deskHeroTab === 'CONSIG_ACERTOS' && (
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-400">
                      Remessas de Consignação Recebidas ({supplierOverview.history.consignacoes_recebidas.length})
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-slate-500 border-b">
                          <tr>
                            <th className="py-2.5 px-3.5">NF</th>
                            <th className="py-2.5 px-3.5">Data</th>
                            <th className="py-2.5 px-3.5 text-right">Exemp.</th>
                            <th className="py-2.5 px-3.5 text-right">Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {supplierOverview.history.consignacoes_recebidas.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center font-sans text-slate-400">
                                Sem remessas recentes.
                              </td>
                            </tr>
                          ) : (
                            supplierOverview.history.consignacoes_recebidas.map((nf) => (
                              <tr key={`${nf.cod_nf}-${nf.nro_nf}`}>
                                <td className="py-2.5 px-3.5 font-bold">{nf.nro_nf}</td>
                                <td className="py-2.5 px-3.5">{formatDateBr(nf.data_nf)}</td>
                                <td className="py-2.5 px-3.5 text-right">{nf.qtd_exemplares}</td>
                                <td className="py-2.5 px-3.5 text-right font-bold">{formatMoney(nf.vlr_liquido)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-sky-700 dark:text-sky-400">
                      Acertos de Consignação ({supplierOverview.history.acertos_consignacao.length})
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-slate-500 border-b">
                          <tr>
                            <th className="py-2.5 px-3.5">NF</th>
                            <th className="py-2.5 px-3.5">Data</th>
                            <th className="py-2.5 px-3.5 text-right">Exemp.</th>
                            <th className="py-2.5 px-3.5 text-right">Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {supplierOverview.history.acertos_consignacao.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center font-sans text-slate-400">
                                Sem acertos recentes.
                              </td>
                            </tr>
                          ) : (
                            supplierOverview.history.acertos_consignacao.map((nf) => (
                              <tr key={`${nf.cod_nf}-${nf.nro_nf}`}>
                                <td className="py-2.5 px-3.5 font-bold">{nf.nro_nf}</td>
                                <td className="py-2.5 px-3.5">{formatDateBr(nf.data_nf)}</td>
                                <td className="py-2.5 px-3.5 text-right">{nf.qtd_exemplares}</td>
                                <td className="py-2.5 px-3.5 text-right font-bold">{formatMoney(nf.vlr_liquido)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA HERO 5: DEVOLUÇÕES & PEDIDOS ANTERIORES NO HORUS */}
              {deskHeroTab === 'DEVOLUCOES_PEDIDOS' && (
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400">
                      Devoluções Emitidas ao Fornecedor ({supplierOverview.history.devolucoes.length})
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-slate-500 border-b">
                          <tr>
                            <th className="py-2.5 px-3.5">NF</th>
                            <th className="py-2.5 px-3.5">Data</th>
                            <th className="py-2.5 px-3.5">Tipo</th>
                            <th className="py-2.5 px-3.5 text-right">Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {supplierOverview.history.devolucoes.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center font-sans text-slate-400">
                                Sem devoluções nos últimos 12 meses.
                              </td>
                            </tr>
                          ) : (
                            supplierOverview.history.devolucoes.map((nf) => (
                              <tr key={`${nf.cod_nf}-${nf.nro_nf}`}>
                                <td className="py-2.5 px-3.5 font-bold">{nf.nro_nf}</td>
                                <td className="py-2.5 px-3.5">{formatDateBr(nf.data_nf)}</td>
                                <td className="py-2.5 px-3.5 font-sans">{nf.tipo || nf.cfop}</td>
                                <td className="py-2.5 px-3.5 text-right font-bold">{formatMoney(nf.vlr_liquido)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-400">
                      Últimos Pedidos em PEDIDOS_COMPRA no Horus ({supplierOverview.history.pedidos_compra_horus.length})
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-slate-500 border-b">
                          <tr>
                            <th className="py-2.5 px-3.5">Pedido #</th>
                            <th className="py-2.5 px-3.5">Data</th>
                            <th className="py-2.5 px-3.5">Status</th>
                            <th className="py-2.5 px-3.5 text-right">Líquido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {supplierOverview.history.pedidos_compra_horus.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center font-sans text-slate-400">
                                Nenhum pedido anterior neste fornecedor.
                              </td>
                            </tr>
                          ) : (
                            supplierOverview.history.pedidos_compra_horus.map((pc) => (
                              <tr key={pc.cod_pedido}>
                                <td className="py-2.5 px-3.5 font-bold text-indigo-700">#{pc.cod_pedido}</td>
                                <td className="py-2.5 px-3.5">{formatDateBr(pc.dat_pedido)}</td>
                                <td className="py-2.5 px-3.5 font-sans">{pc.status_label}</td>
                                <td className="py-2.5 px-3.5 text-right font-bold">{formatMoney(pc.vlr_liquido)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 2: PEDIDOS DE COMPRA (LAYOUT MODERNO E ESPAÇADO ESTILO DBM)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'ORDERS' && (
        <div className="space-y-4">
          {/* Painel Superior de Filtro + Filial */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h1 className="text-lg font-black text-slate-900 dark:text-white">
                  Pedidos de Compra &amp; Status XML
                </h1>
                <p className="text-xs text-slate-500">
                  Acompanhe os pedidos gerados no Horus (AP / AE / EE), exporte planilhas e confira a validação do XML da NF-e.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <select
                    value={selectedBranchId ?? ''}
                    onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id} className="text-slate-900">
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => fetchOrdersList(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin text-indigo-600' : ''}`} />
                  Sincronizar Horus
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMainTab('DESK')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Novo Pedido
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearchFilter}
                  onChange={(e) => setOrderSearchFilter(e.target.value)}
                  placeholder="Buscar por nº pedido Horus, fornecedor, CNPJ ou nº NF..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-xs focus:bg-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {[
                  { key: 'ALL', label: 'Todos' },
                  { key: 'AP', label: 'Aprovados (AP)' },
                  { key: 'AE', label: 'Aguard. Entrega (AE)' },
                  { key: 'XML_OK', label: 'XML OK' },
                  { key: 'PENDING_REVIEW', label: 'XML em Análise' },
                  { key: 'ACCEPTED_WITH_DIVERGENCE', label: 'Aceitos c/ Div.' },
                  { key: 'REJECTED', label: 'XML Recusados' },
                  { key: 'EE', label: 'Recebidos (EE)' },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setOrderStatusFilter(st.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                      orderStatusFilter === st.key
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela Espaçada de Pedidos */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1060px]">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 w-28">Pedido #</th>
                    <th className="py-3.5 px-4 w-40">Data / Comprador</th>
                    <th className="py-3.5 px-4 w-40">Filial</th>
                    <th className="py-3.5 px-4">Fornecedor</th>
                    <th className="py-3.5 px-4 w-28 text-right">Itens / Peças</th>
                    <th className="py-3.5 px-4 w-32 text-right">Total Líquido</th>
                    <th className="py-3.5 px-4 w-44 text-center">Status Horus</th>
                    <th className="py-3.5 px-4 w-48 text-center">Auditoria XML</th>
                    <th className="py-3.5 px-4 w-64 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {loadingOrders ? (
                    <tr>
                      <td colSpan={9} className="py-14 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                        Sincronizando pedidos com o Horus...
                      </td>
                    </tr>
                  ) : ordersList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-14 text-center text-slate-400">
                        Nenhum pedido de compra encontrado para este filtro.
                      </td>
                    </tr>
                  ) : (
                    ordersList.map((ord, idx) => (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedOrderIndex(idx)}
                        onDoubleClick={() => openOrderDetailModal(ord.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedOrderIndex === idx
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/35'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                          #{ord.horus_cod_pedido || ord.id}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {formatDateTimeBr(ord.created_at)}
                          </div>
                          <div className="text-[11px] text-slate-400">por {ord.created_by_name || '—'}</div>
                        </td>
                        <td className="py-3.5 px-4 font-medium">{ord.branch_name}</td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">{ord.nome_fornecedor}</div>
                          <div className="text-[11px] font-mono text-slate-400">{formatCnpj(ord.cnpj_fornecedor)}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono">
                          {ord.total_skus} / <strong>{ord.total_quantity}</strong>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatMoney(ord.total_net)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${
                              ord.horus_status === 'AP'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : ord.horus_status === 'AE'
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : ord.horus_status === 'EE'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {ord.status_label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${getXmlDecisionBadgeClass(
                              ord.xml_status
                            )}`}
                          >
                            {ord.xml_status_label || 'Sem XML'}
                          </span>
                          {ord.last_nfe_number && (
                            <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                              NF {ord.last_nfe_number}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {ord.last_xml_audit_id ? (
                              <button
                                type="button"
                                onClick={() => openXmlAuditDetailModal(ord.last_xml_audit_id!)}
                                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold cursor-pointer"
                              >
                                Ver XML
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setXmlTargetOrderId(String(ord.id));
                                  setActiveMainTab('XML_AUDIT');
                                  setTimeout(() => xmlFileInputRef.current?.focus(), 120);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-bold cursor-pointer transition"
                              >
                                Validar XML
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setExportPromptOrder({
                                  id: ord.id,
                                  horus_cod_pedido: ord.horus_cod_pedido,
                                  horus_status: ord.horus_status,
                                  nome_fornecedor: ord.nome_fornecedor,
                                })
                              }
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              Excel
                            </button>

                            {ord.horus_status === 'AP' && (
                              <button
                                type="button"
                                onClick={() => handleManualStatusTransition(ord.id, 'AE')}
                                className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                                title="Mudar para AE (Aguardando Entrega)"
                              >
                                AE
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openOrderDetailModal(ord.id)}
                              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-500 cursor-pointer"
                              title="Histórico e itens do pedido"
                            >
                              <History className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 font-mono">
                <button
                  type="button"
                  disabled={ordersList.length === 0}
                  onClick={() => setSelectedOrderIndex(0)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={ordersList.length === 0}
                  onClick={() => setSelectedOrderIndex((p) => Math.max(0, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 rounded-lg font-bold">
                  Registro {ordersList.length === 0 ? 0 : selectedOrderIndex + 1} de {ordersList.length}
                </span>
                <button
                  type="button"
                  disabled={ordersList.length === 0}
                  onClick={() => setSelectedOrderIndex((p) => Math.min(ordersList.length - 1, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={ordersList.length === 0}
                  onClick={() => setSelectedOrderIndex(Math.max(0, ordersList.length - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <span className="text-slate-500 mr-2">Soma Líquida Filtrada:</span>
                <strong className="font-mono text-sm text-indigo-700 dark:text-indigo-300">
                  {formatMoney(ordersTotalNetSum)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 3: CENTRAL DE AUDITORIA & ANÁLISE POSTERIOR DE XML (ESPAÇADA)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'XML_AUDIT' && (
        <div className="space-y-4">
          {/* Card Amplo de Upload e Validação Preventiva de XML */}
          <form
            onSubmit={handleUploadAndAnalyzeXml}
            className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h1 className="text-lg font-black text-slate-900 dark:text-white">
                  Conferência Preventiva de XML da NF-e vs. Pedido
                </h1>
                <p className="text-xs text-slate-500">
                  Valide Preço de Capa, Desconto (%) e Quantidade antes da mercadoria chegar. Se bater 100%, o pedido muda para <strong>XML OK</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <select
                  value={selectedBranchId ?? ''}
                  onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="text-slate-900">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Pedido de Compra Correspondente
                </label>
                <select
                  value={xmlTargetOrderId}
                  onChange={(e) => setXmlTargetOrderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="">✨ Auto-identificar Pedido (via xPed / CNPJ + ISBNs)</option>
                  {ordersList.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      Pedido #{o.horus_cod_pedido || o.id} — {o.nome_fornecedor} ({o.horus_status} •{' '}
                      {formatMoney(o.total_net)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-4">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Arquivo XML da Nota Fiscal (.xml até 10 MB)
                </label>
                <input
                  ref={xmlFileInputRef}
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > MAX_XML_BYTES) {
                      toast.error('O arquivo XML excede o limite máximo permitido de 10 MB.');
                      e.target.value = '';
                      return;
                    }
                    setXmlUploadFile(f);
                  }}
                  className="w-full text-xs file:mr-3 file:px-3.5 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:font-bold border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="lg:col-span-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="space-y-1.5 text-xs">
                  <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={xmlAutoAcceptIfOk}
                      onChange={(e) => setXmlAutoAcceptIfOk(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    Aceitar automático p/ <strong>XML OK</strong> se 100% batendo
                  </label>
                  <label className="flex items-center gap-2 text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={xmlAdvanceHorusToAe}
                      onChange={(e) => setXmlAdvanceHorusToAe(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    Avançar AP → AE no Horus ao aprovar
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={analyzingXml || !xmlUploadFile}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {analyzingXml ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileCheck2 className="w-4 h-4" />
                  )}
                  Analisar XML
                </button>
              </div>
            </div>
          </form>

          {/* 4 Cards Espaçados de Situação das Notas Analisadas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <button
              type="button"
              onClick={() => setXmlDecisionFilter('PENDING_REVIEW')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'PENDING_REVIEW'
                  ? 'bg-amber-50 border-amber-400 shadow-xs dark:bg-amber-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Em Análise (Divergência)</span>
                <FileWarning className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black font-mono text-amber-800 dark:text-amber-200 mt-1">
                {xmlKpis.pending_review}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Aguardando decisão posterior</div>
            </button>

            <button
              type="button"
              onClick={() => setXmlDecisionFilter('XML_OK')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'XML_OK'
                  ? 'bg-emerald-50 border-emerald-400 shadow-xs dark:bg-emerald-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">XML OK (Liberadas)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black font-mono text-emerald-800 dark:text-emerald-200 mt-1">
                {xmlKpis.xml_ok}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Prontas para recepção física</div>
            </button>

            <button
              type="button"
              onClick={() => setXmlDecisionFilter('ACCEPTED_WITH_DIVERGENCE')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'ACCEPTED_WITH_DIVERGENCE'
                  ? 'bg-indigo-50 border-indigo-400 shadow-xs dark:bg-indigo-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Aceitas c/ Divergência</span>
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-black font-mono text-indigo-800 dark:text-indigo-200 mt-1">
                {xmlKpis.accepted_with_divergence}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Autorizadas e pontuadas</div>
            </button>

            <button
              type="button"
              onClick={() => setXmlDecisionFilter('REJECTED')}
              className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'REJECTED'
                  ? 'bg-rose-50 border-rose-400 shadow-xs dark:bg-rose-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300">XML Recusadas</span>
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-black font-mono text-rose-800 dark:text-rose-200 mt-1">
                {xmlKpis.rejected}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Bloqueadas para ajuste</div>
            </button>
          </div>

          {/* Tabela Espaçada de Notas Fiscais Auditadas */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'ALL', label: `Todas (${xmlKpis.total})` },
                  { key: 'PENDING_REVIEW', label: `Em Análise (${xmlKpis.pending_review})` },
                  { key: 'XML_OK', label: `XML OK (${xmlKpis.xml_ok})` },
                  { key: 'ACCEPTED_WITH_DIVERGENCE', label: `Aceitas c/ Div. (${xmlKpis.accepted_with_divergence})` },
                  { key: 'REJECTED', label: `Recusadas (${xmlKpis.rejected})` },
                ].map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setXmlDecisionFilter(st.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      xmlDecisionFilter === st.key
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}

                <select
                  value={xmlDivergenceAxisFilter}
                  onChange={(e) => setXmlDivergenceAxisFilter(e.target.value)}
                  className="ml-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="ALL">Divergência: Todos os Eixos</option>
                  <option value="DISCOUNT">Desconto (%)</option>
                  <option value="COVER">Preço de Capa</option>
                  <option value="QTY">Quantidade</option>
                  <option value="EXTRA">Item Extra na NF</option>
                  <option value="MISSING">Item Faltante no XML</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={xmlSearchFilter}
                    onChange={(e) => setXmlSearchFilter(e.target.value)}
                    placeholder="Nº NF, Chave, Pedido ou Fornecedor..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fetchXmlAuditsList(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingXmlAudits ? 'animate-spin text-indigo-600' : ''}`} />
                  Atualizar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1100px]">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4 w-32">NF-e / Série</th>
                    <th className="py-3.5 px-4 w-28">Pedido #</th>
                    <th className="py-3.5 px-4">Fornecedor / Emitente</th>
                    <th className="py-3.5 px-4 w-32 text-right">Qtd (Ped → XML)</th>
                    <th className="py-3.5 px-4 w-44 text-right">Líq. (Ped → XML)</th>
                    <th className="py-3.5 px-4">Diagnóstico por Eixo</th>
                    <th className="py-3.5 px-4 w-44 text-center">Decisão</th>
                    <th className="py-3.5 px-4 w-48">Pontuação / Parecer</th>
                    <th className="py-3.5 px-4 w-44 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {loadingXmlAudits ? (
                    <tr>
                      <td colSpan={9} className="py-14 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                        Carregando notas analisadas...
                      </td>
                    </tr>
                  ) : xmlAuditsList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-14 text-center text-slate-400">
                        Nenhum XML analisado para este filtro. Envie um arquivo .xml acima para validar.
                      </td>
                    </tr>
                  ) : (
                    xmlAuditsList.map((aud, idx) => (
                      <tr
                        key={aud.id}
                        onClick={() => setSelectedXmlIndex(idx)}
                        onDoubleClick={() => openXmlAuditDetailModal(aud.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedXmlIndex === idx
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/35'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-mono">
                          <div className="font-bold text-slate-900 dark:text-white">NF {aud.numero_nf}</div>
                          <div className="text-[11px] text-slate-400">
                            Sér. {aud.serie_nf || '1'} • {formatDateBr(aud.data_emissao)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                          #{aud.horus_cod_pedido || aud.order_id}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {aud.emit_nome || aud.nome_fornecedor}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {formatCnpj(aud.emit_cnpj)} • {aud.branch_name}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono">
                          <span>{aud.order_total_qty}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <strong
                            className={
                              aud.xml_total_qty !== aud.order_total_qty ? 'text-amber-700' : 'text-emerald-700'
                            }
                          >
                            {aud.xml_total_qty}
                          </strong>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono">
                          <div className="text-slate-500">{formatMoney(aud.order_total_net)}</div>
                          <div
                            className={`font-bold ${
                              Math.abs(aud.xml_total_products_net - aud.order_total_net) > 0.05
                                ? 'text-rose-600'
                                : 'text-emerald-700'
                            }`}
                          >
                            → {formatMoney(aud.xml_total_products_net)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {aud.diagnostic_status === 'MATCH_100' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                              <Check className="w-3 h-3" />
                              100% Compatível ({aud.matched_ok_count} itens)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {aud.diff_discount_count > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 text-[11px] font-bold font-mono">
                                  Desc: {aud.diff_discount_count}
                                </span>
                              )}
                              {aud.diff_cover_count > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-[11px] font-bold font-mono">
                                  Capa: {aud.diff_cover_count}
                                </span>
                              )}
                              {aud.diff_qty_count > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-900 text-[11px] font-bold font-mono">
                                  Qtd: {aud.diff_qty_count}
                                </span>
                              )}
                              {aud.extra_in_xml_count > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-bold font-mono">
                                  Extra: {aud.extra_in_xml_count}
                                </span>
                              )}
                              {aud.missing_in_xml_count > 0 && (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-800 text-[11px] font-bold font-mono">
                                  Falta: {aud.missing_in_xml_count}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${getXmlDecisionBadgeClass(
                              aud.decision_status
                            )}`}
                          >
                            {aud.decision_label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-[220px]">
                          {aud.decision_notes ? (
                            <div className="truncate font-medium text-slate-700 dark:text-slate-200" title={aud.decision_notes}>
                              “{aud.decision_notes}”
                            </div>
                          ) : (
                            <div className="text-slate-400">Aguardando parecer</div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {aud.decided_by_name
                              ? `${aud.decided_by_name} • ${formatDateTimeBr(aud.decided_at)}`
                              : `Por ${aud.uploaded_by_name || '—'}`}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => openXmlAuditDetailModal(aud.id)}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                            >
                              Analisar / Pontuar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadXmlAuditExcel(aud.id, aud.numero_nf)}
                              className="p-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                              title="Exportar Relatório Excel"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 4: PARAMETRIZAÇÃO OPERACIONAL & E-MAIL DA FILIAL                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'BRANCH_CONFIG' && selectedBranch && (
        <form
          onSubmit={handleSaveBranchSettings}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 space-y-5 shadow-xs max-w-4xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                Parâmetros Operacionais &amp; E-mail — {selectedBranch.label}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Padrões exclusivos desta filial para gravação em PEDIDOS_COMPRA e modelo de e-mail para fornecedores.
              </p>
            </div>

            <select
              value={selectedBranchId ?? ''}
              onChange={(e) => setSelectedBranchId(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Cód. Local Estoque Padrão
              </label>
              <input
                type="number"
                value={branchConfigForm.cod_local_default ?? ''}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({
                    ...p,
                    cod_local_default: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Departamento (Horus)
              </label>
              <select
                value={branchConfigForm.cod_departamento_default ?? ''}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({
                    ...p,
                    cod_departamento_default: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="">Automático (Grupo Fornecedor)</option>
                {branchDepartments.map((d) => (
                  <option key={d.cod_departamento} value={d.cod_departamento}>
                    #{d.cod_departamento} - {d.nom_departamento}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Centro de Custo Padrão
              </label>
              <input
                type="number"
                value={branchConfigForm.cod_centro_custo_default ?? ''}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({
                    ...p,
                    cod_centro_custo_default: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="Automático"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Modalidade Inicial
              </label>
              <select
                value={branchConfigForm.compra_consig_default}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({
                    ...p,
                    compra_consig_default: e.target.value === 'S' ? 'S' : 'N',
                  }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="N">Compra Firme (N)</option>
                <option value="S">Consignação (S)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                Identidade &amp; Texto de E-mail desta Filial
              </h3>
              <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={branchConfigForm.email_enabled}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_enabled: e.target.checked }))}
                  className="rounded text-indigo-600"
                />
                Habilitar disparo nesta filial
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome de Exibição (Filial)
                </label>
                <input
                  type="text"
                  value={branchConfigForm.sender_name || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, sender_name: e.target.value }))}
                  placeholder="Ex: Compras Paisagem Pompeia"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  E-mail Reply-To da Filial
                </label>
                <input
                  type="email"
                  value={branchConfigForm.reply_to_email || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, reply_to_email: e.target.value }))}
                  placeholder="compras.pompeia@livrariapaisagem.com.br"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Cópias / CC da Filial
                </label>
                <input
                  type="text"
                  value={branchConfigForm.cc_emails || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, cc_emails: e.target.value }))}
                  placeholder="recebimento@..., fiscal@..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Assunto do E-mail
              </label>
              <input
                type="text"
                value={branchConfigForm.email_subject_template || ''}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_subject_template: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Texto Padrão ({'{fornecedor_nome}'}, {'{cod_pedido}'}, {'{filial_nome}'}, {'{filial_cnpj}'}, {'{qtd_exemplares}'}, {'{valor_liquido}'})
              </label>
              <textarea
                rows={4}
                value={branchConfigForm.email_body_template || ''}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_body_template: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBranchConfig}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              {savingBranchConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar Parâmetros da Filial
            </button>
          </div>
        </form>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: VINCULAR SELOS/EDITORAS EM LOTE + DESCONTO (%) AO FORNECEDOR  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showAddPublisherModal && supplierOverview && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Vincular Editoras / Selos e Desconto (%) na Filial
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    {supplierOverview.supplier.nom_fornecedor} • {selectedBranch?.nome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddPublisherModal(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                  <div className="sm:col-span-8">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Pesquisar Editora na tabela EDITORA do Horus:
                    </label>
                    <input
                      type="text"
                      value={pubSearchTerm}
                      onChange={(e) => {
                        setPubSearchTerm(e.target.value);
                        searchHorusPublishersForModal(e.target.value);
                      }}
                      placeholder="Nome ou código da editora..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Desconto (%)
                    </label>
                    <CurrencyInput
                      value={batchDiscountPct}
                      onChangeValue={(val) => setBatchDiscountPct(val)}
                      suffixStr="%"
                      max={100}
                      className="w-full px-3.5 py-2 rounded-xl border border-indigo-400 bg-white dark:bg-slate-800 text-right font-mono text-xs font-bold"
                    />
                  </div>
                </div>

                {Object.keys(selectedPubsForSupplier).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200">
                    {Object.values(selectedPubsForSupplier).map((sp) => (
                      <span
                        key={sp.cod_editora}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                      >
                        #{sp.cod_editora} {sp.nome_editora}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPubsForSupplier((prev) => {
                              const next = { ...prev };
                              delete next[sp.cod_editora];
                              return next;
                            })
                          }
                          className="hover:text-rose-200 cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingPubSearch ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-600" />
                      Consultando editoras no Horus...
                    </div>
                  ) : (
                    pubSearchResults.map((p) => {
                      const checked = Boolean(selectedPubsForSupplier[p.cod_editora]);
                      return (
                        <label
                          key={p.cod_editora}
                          className={`px-4 py-2.5 flex items-center justify-between gap-2 text-xs cursor-pointer ${
                            checked ? 'bg-indigo-50/80 font-bold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedPubsForSupplier((prev) => {
                                  const next = { ...prev };
                                  if (e.target.checked) {
                                    next[p.cod_editora] = { cod_editora: p.cod_editora, nome_editora: p.nome_editora };
                                  } else {
                                    delete next[p.cod_editora];
                                  }
                                  return next;
                                })
                              }
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <span className="font-mono text-slate-400">#{p.cod_editora}</span>
                            <span className="truncate">{p.nome_editora}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">{p.qtd_itens} itens</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  {Object.keys(selectedPubsForSupplier).length} selo(s) • Desconto:{' '}
                  <strong>{batchDiscountPct.toFixed(2)}%</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPublisherModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingSupplierDiscounts || Object.keys(selectedPubsForSupplier).length === 0}
                    onClick={handleSaveBatchSupplierDiscounts}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {savingSupplierDiscounts ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Salvar Vínculos
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: CONCILIAÇÃO DE EDITORA/SELO NOS DOIS BANCOS (HORUS + CRONUZ)  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showReconcileModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <DatabaseZap className="w-4 h-4 text-amber-500" />
                    Conciliar Editora / Selo (Horus + Cronuz)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Atualiza <code>ITENS_ESTOQUE_GERAL.COD_EDITORA</code> no Horus e o produto no Cronuz ({reconcileItems.length} item(ns)).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReconcileModal(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3.5 overflow-y-auto flex-1">
                <input
                  type="text"
                  value={reconcileSearch}
                  onChange={(e) => {
                    setReconcileSearch(e.target.value);
                    searchHorusPublishersForModal(e.target.value, true);
                  }}
                  placeholder="Pesquisar editora oficial cadastrada no Horus..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {reconcilePubOptions.map((pub) => {
                    const isSel = selectedReconcilePub?.cod_editora === pub.cod_editora;
                    return (
                      <button
                        key={pub.cod_editora}
                        type="button"
                        onClick={() =>
                          setSelectedReconcilePub({ cod_editora: pub.cod_editora, nome_editora: pub.nome_editora })
                        }
                        className={`w-full px-4 py-2.5 text-left flex items-center justify-between text-xs cursor-pointer ${
                          isSel ? 'bg-indigo-50 font-bold text-indigo-800' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span>
                          <span className="font-mono text-slate-400 mr-2">#{pub.cod_editora}</span>
                          {pub.nome_editora}
                        </span>
                        <span className="text-[11px] text-slate-400">{pub.qtd_itens} itens</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold truncate">
                  {selectedReconcilePub
                    ? `Nova Editora: #${selectedReconcilePub.cod_editora} - ${selectedReconcilePub.nome_editora}`
                    : 'Selecione uma editora acima'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReconcileModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!selectedReconcilePub || savingReconcile}
                    onClick={handleConfirmCartReconcile}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    {savingReconcile ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Atualizar Horus + Cronuz
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: EXPORTAÇÃO EXCEL + OPÇÃO DE MUDAR STATUS AP -> AE NO HORUS    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {exportPromptOrder && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 bg-emerald-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  <h3 className="text-sm font-bold">
                    Exportar Excel — Pedido #{exportPromptOrder.horus_cod_pedido || exportPromptOrder.id}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setExportPromptOrder(null)}
                  className="p-1 rounded-lg hover:bg-white/15 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  Gerar planilha com <strong>ISBN, Título, Editora, Quantidade, Preço Capa, Desconto (%) e Preço Líquido</strong> para{' '}
                  <strong>{exportPromptOrder.nome_fornecedor}</strong>.
                </p>

                {exportPromptOrder.horus_status === 'AP' && (
                  <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 space-y-1">
                    <p className="font-bold">Avançar também o status para AE (Aguardando Entrega)?</p>
                    <p className="text-[11px]">
                      Muda o pedido para <code>AE</code> no Horus e <strong>Aguardando Entrega</strong> no Cronuz, mantendo o histórico do seu usuário.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2.5">
                  {exportPromptOrder.horus_status === 'AP' && (
                    <button
                      type="button"
                      disabled={exportingExcel}
                      onClick={() => handleExportOrderExcel(exportPromptOrder.id, true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {exportingExcel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      Baixar Excel + Mudar para AE (Aguardando Entrega)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={exportingExcel}
                    onClick={() => handleExportOrderExcel(exportPromptOrder.id, false)}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    Apenas Baixar Excel (Manter {exportPromptOrder.horus_status})
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 4: DETALHES DO PEDIDO & HISTÓRICO DE AUDITORIA                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(detailModalData || loadingOrderDetail) && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Detalhes &amp; Histórico do Pedido #{detailModalData?.order.horus_cod_pedido || detailModalData?.order.id || ''}
                  </h3>
                  {detailModalData && (
                    <p className="text-xs text-slate-500">
                      {detailModalData.order.branch_name} • {detailModalData.order.nome_fornecedor} •{' '}
                      <strong>{detailModalData.order.status_label}</strong> • XML:{' '}
                      <strong>{detailModalData.order.xml_status_label}</strong>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailModalData(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingOrderDetail || !detailModalData ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                  Carregando detalhes...
                </div>
              ) : (
                <div className="p-5 space-y-5 overflow-y-auto flex-1">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-indigo-600" />
                      Histórico de Alterações, Exportações e Decisões XML
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 bg-slate-50/70 dark:bg-slate-800/40 text-xs">
                      {detailModalData.logs.map((lg) => (
                        <div
                          key={lg.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1.5 border-b last:border-0 border-slate-200/70"
                        >
                          <div>
                            <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-mono text-[10px] font-bold mr-2">
                              {lg.action}
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{lg.details}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 shrink-0 font-mono">
                            {lg.user_name || 'Sistema'} • {formatDateTimeBr(lg.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase text-slate-500 mb-2">
                      Itens do Pedido ({detailModalData.items.length})
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 max-h-72">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-slate-500 sticky top-0 border-b">
                          <tr>
                            <th className="py-2.5 px-4">ISBN</th>
                            <th className="py-2.5 px-4">Título</th>
                            <th className="py-2.5 px-4">Editora</th>
                            <th className="py-2.5 px-4 text-right">Qtd</th>
                            <th className="py-2.5 px-4 text-right">Capa</th>
                            <th className="py-2.5 px-4 text-right">Desc.</th>
                            <th className="py-2.5 px-4 text-right">Subtotal Líq.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detailModalData.items.map((it) => (
                            <tr key={it.id}>
                              <td className="py-2.5 px-4 font-mono">{it.isbn || `#${it.cod_item}`}</td>
                              <td className="py-2.5 px-4 font-bold">{it.nome_item}</td>
                              <td className="py-2.5 px-4">{it.nome_editora}</td>
                              <td className="py-2.5 px-4 text-right font-mono">{it.quantity}</td>
                              <td className="py-2.5 px-4 text-right font-mono">{formatMoney(it.unit_cover_price)}</td>
                              <td className="py-2.5 px-4 text-right font-mono text-emerald-700 font-bold">
                                {Number(it.discount_pct || 0).toFixed(2)}%
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold">
                                {formatMoney(it.subtotal_net)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 5: FICHA AMPLA DE ANÁLISE POSTERIOR & DECISÃO DO XML (NF-e)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(xmlAuditDetailModal || loadingXmlAuditDetail) && (
          <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-slate-900 dark:text-white">
                        Análise de XML — NF-e nº {xmlAuditDetailModal?.audit.numero_nf || '...'} vs Pedido #
                        {xmlAuditDetailModal?.audit.horus_cod_pedido || xmlAuditDetailModal?.audit.order_id || ''}
                      </h3>
                      {xmlAuditDetailModal && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getXmlDecisionBadgeClass(
                            xmlAuditDetailModal.audit.decision_status
                          )}`}
                        >
                          {xmlAuditDetailModal.audit.decision_label}
                        </span>
                      )}
                    </div>
                    {xmlAuditDetailModal && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {xmlAuditDetailModal.audit.emit_nome} ({formatCnpj(xmlAuditDetailModal.audit.emit_cnpj)}) • Chave:{' '}
                        {xmlAuditDetailModal.audit.chave_acesso || '—'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {xmlAuditDetailModal && (
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadXmlAuditExcel(
                          xmlAuditDetailModal.audit.id,
                          xmlAuditDetailModal.audit.numero_nf
                        )
                      }
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Exportar Excel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setXmlAuditDetailModal(null)}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {loadingXmlAuditDetail || !xmlAuditDetailModal ? (
                <div className="p-14 text-center text-xs text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                  Carregando comparativo do XML...
                </div>
              ) : (
                <>
                  <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {xmlAuditDetailModal.audit.header_warnings.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
                        {xmlAuditDetailModal.audit.header_warnings.map((w, i) => (
                          <div key={i} className="flex items-center gap-2 font-semibold">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Cards Resumo do Comparativo */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Filial Destino</span>
                        <span className="font-bold text-slate-900 dark:text-white mt-0.5 block truncate">
                          {xmlAuditDetailModal.audit.branch_name}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Peças (Ped → XML)</span>
                        <span className="font-mono font-bold text-sm mt-0.5 block">
                          {xmlAuditDetailModal.audit.order_total_qty} →{' '}
                          <span
                            className={
                              xmlAuditDetailModal.audit.xml_total_qty !== xmlAuditDetailModal.audit.order_total_qty
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {xmlAuditDetailModal.audit.xml_total_qty}
                          </span>
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Líquido Pedido</span>
                        <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5 block">
                          {formatMoney(xmlAuditDetailModal.audit.order_total_net)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Líquido Prod. XML</span>
                        <span
                          className={`font-mono font-bold text-sm mt-0.5 block ${
                            Math.abs(
                              xmlAuditDetailModal.audit.xml_total_products_net -
                                xmlAuditDetailModal.audit.order_total_net
                            ) > 0.05
                              ? 'text-rose-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {formatMoney(xmlAuditDetailModal.audit.xml_total_products_net)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 col-span-2 sm:col-span-1">
                        <span className="block text-[10px] font-bold uppercase text-slate-400">Frete / Impostos</span>
                        <span className="font-mono font-bold text-sm text-slate-600 mt-0.5 block">
                          {formatMoney(
                            xmlAuditDetailModal.audit.xml_frete + xmlAuditDetailModal.audit.xml_ipi_st_outros
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Filtros Internos de Itens */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setXmlModalItemFilter('ALL')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            xmlModalItemFilter === 'ALL'
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Todos ({xmlAuditDetailModal.items.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setXmlModalItemFilter('DIVERGENT')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            xmlModalItemFilter === 'DIVERGENT'
                              ? 'bg-amber-600 text-white'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          Com Divergência ({xmlAuditDetailModal.audit.divergent_items_count})
                        </button>
                        <button
                          type="button"
                          onClick={() => setXmlModalItemFilter('OK')}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                            xmlModalItemFilter === 'OK'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          100% OK ({xmlAuditDetailModal.audit.matched_ok_count})
                        </button>
                      </div>
                    </div>

                    {/* Tabela Comparativa Espaçada Item a Item */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[38vh]">
                      <table className="w-full text-left text-xs min-w-[1080px]">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] font-bold uppercase text-slate-500 sticky top-0 z-10 border-b">
                          <tr>
                            <th className="py-3 px-3.5 w-36">ISBN / Cód.</th>
                            <th className="py-3 px-3.5">Título / Editora</th>
                            <th className="py-3 px-3.5 w-28 text-right">Qtd (Ped → XML)</th>
                            <th className="py-3 px-3.5 w-36 text-right">Capa (Ped → XML)</th>
                            <th className="py-3 px-3.5 w-36 text-right">Desc % (Ped → XML)</th>
                            <th className="py-3 px-3.5 w-36 text-right">Líq. Unit (Ped → XML)</th>
                            <th className="py-3 px-3.5 w-60">Divergências Identificadas</th>
                            <th className="py-3 px-3.5 w-56">Pontuação no Item</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredXmlModalItems.map((it) => {
                            const isDiv = it.line_status === 'DIVERGENT';
                            return (
                              <tr
                                key={it.id}
                                className={isDiv ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'bg-white dark:bg-slate-900'}
                              >
                                <td className="py-3 px-3.5 font-mono">
                                  <div className="font-bold text-slate-900 dark:text-white">
                                    {it.isbn || it.xml_ean || 'SEM GTIN'}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {it.cod_item ? `#${it.cod_item}` : `cProd ${it.xml_cprod || '—'}`}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 max-w-[240px]">
                                  <div className="font-bold text-slate-900 dark:text-white truncate" title={it.title}>
                                    {it.title}
                                  </div>
                                  <div className="text-[11px] text-slate-500">{it.nome_editora || '—'}</div>
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono">
                                  <span>{it.order_qty}</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  <strong className={it.has_qty_diff ? 'text-purple-700' : 'text-emerald-700'}>
                                    {it.xml_qty}
                                  </strong>
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono">
                                  <div className="text-slate-500">{formatMoney(it.order_cover_price)}</div>
                                  <div className={`font-bold ${it.has_cover_diff ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    → {formatMoney(it.xml_cover_price)}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono">
                                  <div className="text-slate-500">{it.order_discount_pct.toFixed(2)}%</div>
                                  <div className={`font-bold ${it.has_discount_diff ? 'text-rose-600' : 'text-emerald-700'}`}>
                                    → {it.xml_discount_pct.toFixed(2)}%
                                  </div>
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono">
                                  <div className="text-slate-500">{formatMoney(it.order_unit_net)}</div>
                                  <div className="font-bold text-slate-900 dark:text-white">
                                    → {formatMoney(it.xml_unit_net)}
                                  </div>
                                </td>
                                <td className="py-3 px-3.5">
                                  <div className="flex flex-wrap gap-1 mb-1">
                                    {(it.divergence_tags || []).map((tg) => {
                                      const meta = formatTagLabel(tg);
                                      return (
                                        <span
                                          key={tg}
                                          className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.cls}`}
                                        >
                                          {meta.text}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {isDiv && it.divergence_summary && (
                                    <div className="text-[11px] text-slate-600 leading-snug">{it.divergence_summary}</div>
                                  )}
                                </td>
                                <td className="py-3 px-3.5">
                                  <input
                                    type="text"
                                    value={itemNotesDraft[it.id] || ''}
                                    onChange={(e) =>
                                      setItemNotesDraft((prev) => ({
                                        ...prev,
                                        [it.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Pontuar item..."
                                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Painel Inferior Espaçado de Decisão Posterior */}
                  <div className="p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                        Parecer / Pontuação da Análise Posterior (Obrigatório ao Aceitar c/ Divergência ou Recusar)
                      </label>
                      <textarea
                        rows={2}
                        value={decisionNotesDraft}
                        onChange={(e) => setDecisionNotesDraft(e.target.value)}
                        placeholder="Descreva a autorização comercial, ressalvas negociadas com a editora ou o motivo da recusa do XML..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={decisionAdvanceToAe}
                          onChange={(e) => setDecisionAdvanceToAe(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        Se aprovar XML e o pedido estiver AP no Horus, mudar automaticamente para AE (Aguardando Entrega)
                      </label>

                      <div className="flex flex-wrap items-center gap-2.5 justify-end">
                        <button
                          type="button"
                          disabled={savingXmlDecision}
                          onClick={() => handleSubmitXmlDecision('REJECTED')}
                          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Ban className="w-4 h-4" />
                          Recusar XML (Pontuado)
                        </button>

                        <button
                          type="button"
                          disabled={savingXmlDecision}
                          onClick={() => handleSubmitXmlDecision('ACCEPTED_WITH_DIVERGENCE')}
                          className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          Aceitar c/ Divergência (Pontuado)
                        </button>

                        <button
                          type="button"
                          disabled={savingXmlDecision}
                          onClick={() => handleSubmitXmlDecision('XML_OK')}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          Aceitar XML OK
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

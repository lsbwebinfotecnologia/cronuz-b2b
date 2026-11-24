'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Clock,
  DatabaseZap,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileWarning,
  History,
  Mail,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
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
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    case 'PENDING_REVIEW':
      return 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    case 'ACCEPTED_WITH_DIVERGENCE':
      return 'bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
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

  // 2. Busca e Dossiê do Fornecedor
  const [supplierQuery, setSupplierQuery] = useState<string>('');
  const [onlyConfiguredSuppliers, setOnlyConfiguredSuppliers] = useState<boolean>(false);
  const [supplierResults, setSupplierResults] = useState<SupplierSummary[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState<boolean>(false);
  const [supplierOverview, setSupplierOverview] = useState<SupplierOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  const [supplierSubTab, setSupplierSubTab] = useState<
    'DISCOUNTS' | 'ENTRADAS' | 'CONSIG' | 'ACERTOS' | 'DEVOLUCOES' | 'PEDIDOS_HORUS'
  >('DISCOUNTS');

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

  // Edição inline de desconto de uma editora já vinculada
  const [editingDiscountId, setEditingDiscountId] = useState<number | null>(null);
  const [editingDiscountPct, setEditingDiscountPct] = useState<number>(0);

  // 4. Pesquisa de Itens, Planilha e Carrinho do Pedido de Compra
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

  // Modal Importar Planilha ISBN + Quantidade
  const [showSheetModal, setShowSheetModal] = useState<boolean>(false);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetPastedText, setSheetPastedText] = useState<string>('');
  const [importingSheet, setImportingSheet] = useState<boolean>(false);
  const [lastNotFoundIsbns, setLastNotFoundIsbns] = useState<string[]>([]);

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

  // 6. Folha de Dados de Pedidos Gerados (AP / AE / XML OK)
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
  const [xmlTargetOrderId, setXmlTargetOrderId] = useState<string>(''); // '' = Auto-detectar
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

  // Modal Ficha Mestre-Detalhe de Análise Posterior & Pontuação do XML
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

  // ── Carrega Fornecedores ao trocar Filial ou Filtro ────────────────────────
  const searchSuppliers = useCallback(
    async (bid: number, qStr: string, onlyCfg: boolean) => {
      setLoadingSuppliers(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({
          branch_id: String(bid),
          company_id: String(companyId),
          only_configured: String(onlyCfg),
          limit: '60',
        });
        if (qStr.trim()) params.append('q', qStr.trim());
        const res = await fetch(`${apiUrl}/horus-purchases/suppliers/search?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Erro ao buscar fornecedores no Horus.');
        setSupplierResults(data.suppliers || []);
      } catch (e: any) {
        toast.error(e?.message || 'Erro ao consultar fornecedores.');
      } finally {
        setLoadingSuppliers(false);
      }
    },
    [apiUrl, companyId]
  );

  // Carrega resumo rápido de Pedidos e Auditorias de XML da filial para alimentar contadores da Barra Fixa
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
      searchSuppliers(selectedBranchId, supplierQuery, onlyConfiguredSuppliers);
      fetchOrdersList(true);
      fetchXmlAuditsList(true);
      const b = branches.find((x) => x.id === selectedBranchId);
      if (b) {
        setBranchConfigForm(b.config);
        setCompraConsig(b.config.compra_consig_default === 'S' ? 'S' : 'N');
      }
    }
  }, [selectedBranchId, onlyConfiguredSuppliers]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Atalhos de Teclado Estilo Access Moderno nas Folhas de Dados (↑ ↓ Home End Enter Esc) ─
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (xmlAuditDetailModal) setXmlAuditDetailModal(null);
        else if (detailModalData) setDetailModalData(null);
        else if (exportPromptOrder) setExportPromptOrder(null);
        else if (showAddPublisherModal) setShowAddPublisherModal(false);
        else if (showSheetModal) setShowSheetModal(false);
        else if (showReconcileModal) setShowReconcileModal(false);
        return;
      }

      if (xmlAuditDetailModal || detailModalData || exportPromptOrder || showAddPublisherModal || showSheetModal || showReconcileModal) {
        return;
      }

      if (activeMainTab === 'ORDERS' && ordersList.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedOrderIndex((p) => Math.min(ordersList.length - 1, p + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedOrderIndex((p) => Math.max(0, p - 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setSelectedOrderIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setSelectedOrderIndex(ordersList.length - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const sel = ordersList[selectedOrderIndex];
          if (sel) openOrderDetailModal(sel.id);
        }
      } else if (activeMainTab === 'XML_AUDIT' && xmlAuditsList.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedXmlIndex((p) => Math.min(xmlAuditsList.length - 1, p + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedXmlIndex((p) => Math.max(0, p - 1));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setSelectedXmlIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setSelectedXmlIndex(xmlAuditsList.length - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const sel = xmlAuditsList[selectedXmlIndex];
          if (sel) openXmlAuditDetailModal(sel.id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selecionar Fornecedor e Carregar Dossiê 360° ───────────────────────────
  const loadSupplierOverview = async (
    bid: number,
    codGrp: number,
    codForn: number,
    preserveCart = false
  ) => {
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao carregar dossiê do fornecedor.');
      setSupplierOverview(data);
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
      searchSuppliers(selectedBranchId, supplierQuery, onlyConfiguredSuppliers);
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
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao importar vínculos do Horus.');
    } finally {
      setSavingSupplierDiscounts(false);
    }
  };

  // ── Pesquisa de Itens & Importação de Planilha (Máx 10 MB) ─────────────────
  const handleLookupItems = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierOverview || selectedBranchId === null) return;
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
        toast.success(`Item '${list[0].nome_item}' adicionado à folha do pedido.`);
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

  const handleImportSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierOverview || selectedBranchId === null) return;
    if (!sheetFile && !sheetPastedText.trim()) {
      toast.error('Selecione uma planilha (.xlsx / .csv) ou cole os ISBNs e quantidades.');
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
      if (sheetFile) fd.append('file', sheetFile);
      if (sheetPastedText.trim()) fd.append('pasted_text', sheetPastedText.trim());

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
      setShowSheetModal(false);
      setSheetFile(null);
      setSheetPastedText('');

      if (data.unconfigured_publishers_count > 0) {
        toast.warning(
          `${imported.length} item(ns) importado(s), porém ${data.unconfigured_publishers_count} possuem editora não vinculada ao fornecedor.`
        );
      } else {
        toast.success(data.message || `${imported.length} item(ns) importado(s) com sucesso!`);
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

  // ── Totais e Validações do Carrinho ────────────────────────────────────────
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
    return { skus, totalQty, gross, net, discVal, avgDisc, invalidCount };
  }, [cartItems]);

  const ordersTotalNetSum = useMemo(
    () => ordersList.reduce((acc, o) => acc + Number(o.total_net || 0), 0),
    [ordersList]
  );

  // ── Gerar Pedido de Compra no Horus (Status AP - Aprovado) ─────────────────
  const handleCreatePurchaseOrder = async () => {
    if (!supplierOverview || selectedBranchId === null) return;
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Configure os selos/editoras e descontos do fornecedor nesta filial antes de continuar.');
      return;
    }
    if (!cartItems.length) {
      toast.error('Adicione itens ao pedido de compra.');
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

  // Cabeçalho contextual do Objeto ativo (Estilo Access Moderno)
  const activeObjectMeta = useMemo(() => {
    switch (activeMainTab) {
      case 'ORDERS':
        return {
          badge: 'FOLHA DE DADOS',
          title: 'Pedidos de Compra (AP / AE / XML OK)',
          subtitle: 'Controle de pedidos gerados no Horus, exportação Excel e status de conferência de XML.',
        };
      case 'XML_AUDIT':
        return {
          badge: 'FOLHA DE DADOS & AUDITORIA',
          title: 'Conferência Preventiva de XML (NF-e vs Pedido)',
          subtitle: 'Valide Preço de Capa, Desconto (%) e Quantidade antes da mercadoria chegar na doca.',
        };
      case 'BRANCH_CONFIG':
        return {
          badge: 'FORMULÁRIO DE PARÂMETROS',
          title: 'Padrões Operacionais & E-mail da Filial',
          subtitle: 'Configuração individualizada de local, departamento e texto de envio ao fornecedor.',
        };
      default:
        return {
          badge: 'FORMULÁRIO MESTRE-DETALHE',
          title: 'Mesa de Compras & Reposição Multi-Filial',
          subtitle: 'Selecione fornecedor, governe descontos por selo, concilie editoras no Horus e gere pedidos AP.',
        };
    }
  }, [activeMainTab]);

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

  return (
    <div className="w-full space-y-2.5 pb-12">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 1. BARRA DE MENUS FIXOS NO TOPO (ESTILO ACCESS MODERNO)                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <HorusComprasPinnedNavBar
        activeTab={activeMainTab}
        onSelectTab={(tab) => setActiveMainTab(tab)}
        ordersCount={ordersList.length}
        pendingXmlCount={xmlKpis.pending_review}
        xmlOkCount={xmlKpis.xml_ok}
      />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 2. FAIXA DE OBJETO & SELETOR DE FILIAL ATIVA (CABEÇALHO ACCESS)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 bg-gradient-to-r from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              {activeMainTab === 'XML_AUDIT' ? (
                <FileCheck2 className="w-4 h-4" />
              ) : activeMainTab === 'ORDERS' ? (
                <ClipboardList className="w-4 h-4" />
              ) : activeMainTab === 'BRANCH_CONFIG' ? (
                <Settings2 className="w-4 h-4" />
              ) : (
                <Package className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                  {activeObjectMeta.badge}
                </span>
                <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                  {activeObjectMeta.title}
                </h1>
              </div>
              <p className="text-[11px] text-slate-500 truncate">{activeObjectMeta.subtitle}</p>
            </div>
          </div>

          {/* Caixa Estruturada de Filial Ativa + Indicadores Rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 shadow-2xs">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="block text-[9px] uppercase font-black tracking-wider text-slate-400 leading-none">
                  Filial Ativa (Horus)
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
                  className="bg-transparent text-xs font-extrabold text-slate-900 dark:text-white focus:outline-none pr-3 cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="text-slate-900">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(activeMainTab === 'ORDERS' || activeMainTab === 'XML_AUDIT') && (
              <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-100/80 dark:bg-slate-800/70 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <kbd className="px-1 py-0.2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-[10px]">
                  ↑↓
                </kbd>
                <span>Navegar</span>
                <span>•</span>
                <kbd className="px-1 py-0.2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-[10px]">
                  Enter
                </kbd>
                <span>Abrir Ficha</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* OBJETO 1: MESA DE COMPRAS (FORMULÁRIO MESTRE-DETALHE ACCESS MODERNO)   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'DESK' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5">
          {/* PAINEL ESQUERDO (XL 4): FOLHA DE FORNECEDORES DA FILIAL */}
          <div className="xl:col-span-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 flex flex-col max-h-[720px] overflow-hidden shadow-2xs">
            <div className="px-3 py-2 bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-300/80 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Seletor de Registro • Fornecedor
                </span>
                <h2 className="text-xs font-extrabold text-slate-900 dark:text-white">
                  Fornecedores ({selectedBranch?.nome || ''})
                </h2>
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyConfiguredSuppliers}
                  onChange={(e) => setOnlyConfiguredSuppliers(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Com Selos
              </label>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedBranchId !== null) {
                  searchSuppliers(selectedBranchId, supplierQuery, onlyConfiguredSuppliers);
                }
              }}
              className="p-2 bg-slate-50/70 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex gap-1.5"
            >
              <input
                type="text"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                placeholder="Razão, Fantasia, CNPJ ou #Cód..."
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="submit"
                disabled={loadingSuppliers}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1"
              >
                {loadingSuppliers ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Filtrar
              </button>
            </form>

            <div className="flex-1 overflow-y-auto">
              {loadingSuppliers ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-indigo-600" />
                  Consultando FORNECEDORES_GERAL...
                </div>
              ) : supplierResults.length === 0 ? (
                <div className="py-10 px-4 text-center text-xs text-slate-500">
                  Nenhum fornecedor localizado nesta filial.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700">
                    <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                      <th className="w-6 py-1.5 text-center">▶</th>
                      <th className="py-1.5 px-2 w-16">Cód.</th>
                      <th className="py-1.5 px-2">Fornecedor / CNPJ</th>
                      <th className="py-1.5 px-2 w-20 text-center">Selos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {supplierResults.map((sup, sIdx) => {
                      const isActive =
                        supplierOverview?.supplier.cod_fornecedor === sup.cod_fornecedor &&
                        supplierOverview?.supplier.cod_grp_fornecedor === sup.cod_grp_fornecedor;
                      return (
                        <tr
                          key={`${sup.cod_grp_fornecedor}-${sup.cod_fornecedor}`}
                          onClick={() => {
                            if (selectedBranchId !== null) {
                              loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor);
                            }
                          }}
                          className={`cursor-pointer transition-colors divide-x divide-slate-200/60 dark:divide-slate-800 ${
                            isActive
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-100'
                              : sIdx % 2 === 0
                              ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              : 'bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-1.5 text-center font-mono text-[10px] text-indigo-600 font-black">
                            {isActive ? '▶' : ''}
                          </td>
                          <td className="py-1.5 px-2 font-mono font-bold text-[11px] text-slate-600 dark:text-slate-300">
                            #{sup.cod_fornecedor}
                          </td>
                          <td className="py-1.5 px-2 max-w-[180px]">
                            <div className="font-extrabold text-slate-900 dark:text-white truncate">
                              {sup.nom_fornecedor}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500">{formatCnpj(sup.cnpj)}</div>
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {sup.is_configured ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] font-extrabold font-mono">
                                {sup.configured_publishers_count} OK
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold">
                                Pendente
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-300/80 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 flex items-center justify-between">
              <span>Registros: {supplierResults.length}</span>
              <span>Filial #{selectedBranch?.cod_filial || '—'}</span>
            </div>
          </div>

          {/* PAINEL DIREITO (XL 8): CABEÇALHO DO FORNECEDOR + SUBFOLHAS + SUBFORMULÁRIO DE PEDIDO */}
          <div className="xl:col-span-8 space-y-2.5">
            {loadingOverview ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-800 p-12 text-center text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                Carregando ficha do fornecedor, entradas, consignações, acertos, devoluções e descontos...
              </div>
            ) : !supplierOverview ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 p-10 text-center space-y-2">
                <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                  Selecione um Fornecedor na Folha Lateral
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Ao selecionar o registro do fornecedor, o formulário carregará últimas entradas, consignação, acertos, devoluções e a tabela obrigatória de descontos por editora/selo na filial.
                </p>
              </div>
            ) : (
              <>
                {/* FICHA MESTRE DO FORNECEDOR (CAMPOS ESTILO FORMULÁRIO ACCESS MODERNO) */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 overflow-hidden shadow-2xs">
                  <div className="px-3.5 py-2 bg-slate-100/95 dark:bg-slate-800/80 border-b border-slate-300/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-black">
                        FORN #{supplierOverview.supplier.cod_fornecedor}
                      </span>
                      <h2 className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {supplierOverview.supplier.nom_fornecedor}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPubsForSupplier({});
                        setPubSearchTerm('');
                        setShowAddPublisherModal(true);
                        searchHorusPublishersForModal('');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Vincular Selos / Descontos
                    </button>
                  </div>

                  {/* Campos de Cabeçalho Estilo Access */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs">
                    <div className="p-2">
                      <span className="block text-[9px] font-black uppercase text-slate-400">CNPJ Fornecedor</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatCnpj(supplierOverview.supplier.cnpj)}
                      </span>
                    </div>
                    <div className="p-2">
                      <span className="block text-[9px] font-black uppercase text-slate-400">Grupo / Depto</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                        Grp {supplierOverview.supplier.cod_grp_fornecedor} • {supplierOverview.supplier.nom_grupo || 'Geral'}
                      </span>
                    </div>
                    <div className="p-2">
                      <span className="block text-[9px] font-black uppercase text-slate-400">Prazo Pagto</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {supplierOverview.supplier.prazo_pagamentos || 'Padrão'}
                      </span>
                    </div>
                    <div className="p-2">
                      <span className="block text-[9px] font-black uppercase text-slate-400">Fat. Mínimo</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {supplierOverview.supplier.fat_minimo > 0
                          ? formatMoney(supplierOverview.supplier.fat_minimo)
                          : '—'}
                      </span>
                    </div>
                    <div className="p-2 col-span-2 sm:col-span-1">
                      <span className="block text-[9px] font-black uppercase text-slate-400">Consig. na Filial</span>
                      <span className="font-mono font-extrabold text-purple-700 dark:text-purple-300">
                        {supplierOverview.history.consigned_balance_summary.total_units} un ({supplierOverview.history.consigned_balance_summary.total_skus} tít.)
                      </span>
                    </div>
                  </div>

                  {/* Alerta bloqueante caso o fornecedor ainda não tenha selos/descontos na filial */}
                  {!supplierOverview.is_ready_for_purchase && (
                    <div className="m-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-2 text-xs text-amber-950 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-extrabold">
                            Trava Comercial: configure os Selos (Editoras) e Descontos deste fornecedor nesta filial para liberar pedidos.
                          </p>
                        </div>
                      </div>
                      {supplierOverview.horus_suggested_publishers.some((s) => s.source === 'EDITORAS_FORNEC') && (
                        <button
                          type="button"
                          disabled={savingSupplierDiscounts}
                          onClick={handleImportFromHorusEditorasFornec}
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-extrabold whitespace-nowrap cursor-pointer"
                        >
                          Importar de EDITORAS_FORNEC
                        </button>
                      )}
                    </div>
                  )}

                  {/* Guias de Subfolhas de Dados do Fornecedor */}
                  <div className="px-3 pt-2 bg-slate-100/70 dark:bg-slate-800/50 flex items-center gap-1 overflow-x-auto border-b border-slate-300/80 dark:border-slate-800 text-[11px]">
                    {[
                      { id: 'DISCOUNTS', label: `Selos & Descontos (${supplierOverview.configured_discounts.length})` },
                      { id: 'ENTRADAS', label: `Últ. Entradas (${supplierOverview.history.entradas_compra.length})` },
                      { id: 'CONSIG', label: `Consignação (${supplierOverview.history.consignacoes_recebidas.length})` },
                      { id: 'ACERTOS', label: `Acertos (${supplierOverview.history.acertos_consignacao.length})` },
                      { id: 'DEVOLUCOES', label: `Devoluções (${supplierOverview.history.devolucoes.length})` },
                      { id: 'PEDIDOS_HORUS', label: `Pedidos Horus (${supplierOverview.history.pedidos_compra_horus.length})` },
                    ].map((tb) => (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => setSupplierSubTab(tb.id as any)}
                        className={`px-3 py-1.5 rounded-t-lg font-extrabold border-t border-x whitespace-nowrap transition cursor-pointer ${
                          supplierSubTab === tb.id
                            ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 -mb-px'
                            : 'bg-transparent border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>

                  {/* Conteúdo da Subfolha Ativa */}
                  <div className="p-3">
                    {supplierSubTab === 'DISCOUNTS' && (
                      <div className="space-y-2.5">
                        {supplierOverview.configured_discounts.length > 0 ? (
                          <div className="overflow-x-auto rounded-lg border border-slate-300/90 dark:border-slate-800">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700">
                                <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                                  <th className="py-1.5 px-2.5 w-24">Cód. Editora</th>
                                  <th className="py-1.5 px-2.5">Editora / Selo</th>
                                  <th className="py-1.5 px-2.5 w-40">CNPJ Fornecedor</th>
                                  <th className="py-1.5 px-2.5 w-32 text-right">Desconto (%)</th>
                                  <th className="py-1.5 px-2.5 w-36">Atualizado por</th>
                                  <th className="py-1.5 px-2.5 w-16 text-center">Ação</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-semibold">
                                {supplierOverview.configured_discounts.map((d, idx) => (
                                  <tr
                                    key={d.id}
                                    className={`divide-x divide-slate-200/60 dark:divide-slate-800 ${
                                      idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/20'
                                    }`}
                                  >
                                    <td className="py-1.5 px-2.5 font-mono font-bold">#{d.cod_editora}</td>
                                    <td className="py-1.5 px-2.5 font-extrabold text-slate-900 dark:text-white">
                                      {d.nome_editora}
                                    </td>
                                    <td className="py-1.5 px-2.5 font-mono text-[11px] text-slate-500">
                                      {formatCnpj(d.cnpj_fornecedor)}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-right">
                                      {editingDiscountId === d.id ? (
                                        <div className="inline-flex items-center gap-1 justify-end">
                                          <CurrencyInput
                                            value={editingDiscountPct}
                                            onChangeValue={(val) => setEditingDiscountPct(val)}
                                            suffixStr="%"
                                            max={100}
                                            className="w-22 text-right px-2 py-0.5 rounded border border-indigo-500 bg-white dark:bg-slate-800 font-mono text-xs font-extrabold"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateSingleDiscount(d, editingDiscountPct)}
                                            className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                                          >
                                            <Check className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingDiscountId(null)}
                                            className="p-1 rounded bg-slate-200 text-slate-700 cursor-pointer"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingDiscountId(d.id);
                                            setEditingDiscountPct(d.desconto_percentual);
                                          }}
                                          className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-extrabold hover:border-emerald-400 cursor-pointer"
                                          title="Clique para editar desconto (%)"
                                        >
                                          {d.desconto_percentual.toFixed(2)}% ✎
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-[11px] text-slate-500 truncate">
                                      {d.updated_by_name || '—'}
                                    </td>
                                    <td className="py-1.5 px-2.5 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDiscount(d.id)}
                                        className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                        title="Remover vínculo"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 py-1">
                            Nenhum selo/editora vinculado ainda para este fornecedor nesta filial.
                          </p>
                        )}

                        {supplierOverview.horus_suggested_publishers.some((s) => !s.already_configured) && (
                          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <p className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1.5">
                              Editoras detectadas no histórico deste fornecedor no Horus (clique para vincular rápido):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {supplierOverview.horus_suggested_publishers
                                .filter((s) => !s.already_configured)
                                .slice(0, 14)
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
                                    className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3 text-indigo-600" />
                                    #{sug.cod_editora} {sug.nome_editora}
                                    {sug.horus_discount > 0 && (
                                      <span className="text-emerald-600 font-mono">({sug.horus_discount}%)</span>
                                    )}
                                  </button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(supplierSubTab === 'ENTRADAS' ||
                      supplierSubTab === 'CONSIG' ||
                      supplierSubTab === 'ACERTOS' ||
                      supplierSubTab === 'DEVOLUCOES') && (
                      <div className="overflow-x-auto rounded-lg border border-slate-300/90 dark:border-slate-800 max-h-56">
                        {(() => {
                          const rows =
                            supplierSubTab === 'ENTRADAS'
                              ? supplierOverview.history.entradas_compra
                              : supplierSubTab === 'CONSIG'
                              ? supplierOverview.history.consignacoes_recebidas
                              : supplierSubTab === 'ACERTOS'
                              ? supplierOverview.history.acertos_consignacao
                              : supplierOverview.history.devolucoes;
                          if (!rows.length) {
                            return (
                              <div className="p-5 text-center text-xs text-slate-500">
                                Nenhum registro nos últimos 12 meses nesta filial.
                              </div>
                            );
                          }
                          return (
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 sticky top-0 border-b border-slate-300">
                                <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                                  <th className="py-1.5 px-2.5">Nº NF</th>
                                  <th className="py-1.5 px-2.5">Emissão / Recepção</th>
                                  <th className="py-1.5 px-2.5">CFOP</th>
                                  <th className="py-1.5 px-2.5 text-right">Títulos</th>
                                  <th className="py-1.5 px-2.5 text-right">Exemplares</th>
                                  <th className="py-1.5 px-2.5 text-right">Valor Líquido</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-mono font-bold">
                                {rows.map((nf) => (
                                  <tr key={`${nf.cod_nf}-${nf.nro_nf}`} className="divide-x divide-slate-200/60 dark:divide-slate-800 hover:bg-slate-50">
                                    <td className="py-1 px-2.5">{nf.nro_nf}</td>
                                    <td className="py-1 px-2.5">{formatDateBr(nf.data_nf)}</td>
                                    <td className="py-1 px-2.5">
                                      {nf.cfop} {nf.tipo ? `• ${nf.tipo}` : ''}
                                    </td>
                                    <td className="py-1 px-2.5 text-right">{nf.qtd_skus}</td>
                                    <td className="py-1 px-2.5 text-right">{nf.qtd_exemplares}</td>
                                    <td className="py-1 px-2.5 text-right text-slate-900 dark:text-white">
                                      {formatMoney(nf.vlr_liquido)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    )}

                    {supplierSubTab === 'PEDIDOS_HORUS' && (
                      <div className="overflow-x-auto rounded-lg border border-slate-300/90 dark:border-slate-800 max-h-56">
                        {supplierOverview.history.pedidos_compra_horus.length === 0 ? (
                          <div className="p-5 text-center text-xs text-slate-500">
                            Nenhum pedido anterior em PEDIDOS_COMPRA para este fornecedor nesta filial.
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 sticky top-0 border-b border-slate-300">
                              <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                                <th className="py-1.5 px-2.5">Pedido #</th>
                                <th className="py-1.5 px-2.5">Data</th>
                                <th className="py-1.5 px-2.5">Status Horus</th>
                                <th className="py-1.5 px-2.5 text-right">Exemplares</th>
                                <th className="py-1.5 px-2.5 text-right">Desc. Médio</th>
                                <th className="py-1.5 px-2.5 text-right">Líquido</th>
                                <th className="py-1.5 px-2.5">Comprador</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-mono font-bold">
                              {supplierOverview.history.pedidos_compra_horus.map((pc) => (
                                <tr key={pc.cod_pedido} className="divide-x divide-slate-200/60 dark:divide-slate-800">
                                  <td className="py-1 px-2.5 text-indigo-700 dark:text-indigo-300">#{pc.cod_pedido}</td>
                                  <td className="py-1 px-2.5">{formatDateBr(pc.dat_pedido)}</td>
                                  <td className="py-1 px-2.5 font-sans">{pc.status_label}</td>
                                  <td className="py-1 px-2.5 text-right">{pc.qtd_itens}</td>
                                  <td className="py-1 px-2.5 text-right">{pc.per_desconto.toFixed(1)}%</td>
                                  <td className="py-1 px-2.5 text-right">{formatMoney(pc.vlr_liquido)}</td>
                                  <td className="py-1 px-2.5 font-sans text-slate-500">{pc.nom_usuario}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* SUBFORMULÁRIO DE DIGITAÇÃO & FOLHA DE DADOS DO PEDIDO DE COMPRA */}
                {supplierOverview.is_ready_for_purchase && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 overflow-hidden shadow-2xs">
                    <div className="px-3.5 py-2 bg-slate-100/95 dark:bg-slate-800/80 border-b border-slate-300/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-black">
                          SUBFORMULÁRIO
                        </span>
                        <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                          Itens do Pedido de Compra ({selectedBranch?.nome})
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {Object.values(checkedCartCods).some(Boolean) && (
                          <button
                            type="button"
                            onClick={() => {
                              const targets = cartItems.filter((c) => checkedCartCods[c.cod_item]);
                              openCartReconcileModal(targets);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                          >
                            <DatabaseZap className="w-3.5 h-3.5" />
                            Conciliar Editora ({Object.values(checkedCartCods).filter(Boolean).length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowSheetModal(true)}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Importar Planilha (ISBN + Qtd)
                        </button>
                      </div>
                    </div>

                    {/* Linha Rápida de Inserção por ISBN / Título */}
                    <form
                      onSubmit={handleLookupItems}
                      className="p-2.5 bg-slate-50/80 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2"
                    >
                      <div className="sm:col-span-8">
                        <input
                          type="text"
                          value={itemSearchTerm}
                          onChange={(e) => setItemSearchTerm(e.target.value)}
                          placeholder="Bipe o ISBN, digite o Cód. Horus ou Título do Livro e pressione Enter..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={itemSearchDefaultQty}
                          onChange={(e) => setItemSearchDefaultQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          title="Quantidade padrão ao inserir"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-extrabold text-right"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          disabled={searchingItems}
                          className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {searchingItems ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                          Inserir
                        </button>
                      </div>
                    </form>

                    {/* Seletor de Múltiplos Resultados da Busca */}
                    {itemLookupResults.length > 0 && (
                      <div className="m-2.5 border border-indigo-300 dark:border-indigo-900 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
                        <div className="px-3 py-1.5 bg-indigo-100/80 dark:bg-indigo-950/60 flex items-center justify-between text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
                          <span>Resultados no Acervo Horus ({itemLookupResults.length}) — Clique para lançar na folha:</span>
                          <button
                            type="button"
                            onClick={() => setItemLookupResults([])}
                            className="text-slate-600 hover:text-slate-900 cursor-pointer"
                          >
                            ✕ Fechar
                          </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto divide-y divide-indigo-100 dark:divide-indigo-900/50 text-xs">
                          {itemLookupResults.map((resIt) => (
                            <div
                              key={resIt.cod_item}
                              className="px-3 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white dark:hover:bg-slate-900"
                            >
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 dark:text-white truncate">
                                  <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                                    [{resIt.isbn || resIt.cod_item}]
                                  </span>
                                  {resIt.nome_item}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                                  <span>
                                    Selo:{' '}
                                    <strong className={resIt.publisher_configured ? 'text-emerald-700' : 'text-amber-700'}>
                                      {resIt.nome_editora}
                                    </strong>
                                  </span>
                                  <span>Saldo Filial: <strong className="font-mono">{resIt.stock_available}</strong></span>
                                  <span>Consig.: <strong className="font-mono">{resIt.consigned_received}</strong></span>
                                  <span>VDS 90d: <strong className="font-mono">{resIt.sales_90}</strong></span>
                                  <span>Capa: <strong className="font-mono">{formatMoney(resIt.vlr_capa)}</strong></span>
                                  <span>
                                    Desc.:{' '}
                                    <strong className={resIt.publisher_configured ? 'text-emerald-700 font-mono' : 'text-rose-600'}>
                                      {resIt.publisher_configured ? `${resIt.discount_pct.toFixed(2)}%` : 'Sem vínculo'}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  addOrMergeItemToCart(resIt, Math.max(1, itemSearchDefaultQty));
                                  toast.success(`'${resIt.nome_item}' lançado na folha.`);
                                }}
                                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shrink-0 cursor-pointer"
                              >
                                + Lançar ({itemSearchDefaultQty})
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {lastNotFoundIsbns.length > 0 && (
                      <div className="mx-2.5 my-2 p-2 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-900 flex items-start justify-between gap-2">
                        <div>
                          <strong>ISBNs ausentes em ITENS_ESTOQUE_GERAL no Horus ({lastNotFoundIsbns.length}):</strong>{' '}
                          <span className="font-mono">{lastNotFoundIsbns.slice(0, 12).join(', ')}</span>
                          {lastNotFoundIsbns.length > 12 && '...'}
                        </div>
                        <button type="button" onClick={() => setLastNotFoundIsbns([])} className="font-bold cursor-pointer">
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Folha de Dados dos Itens do Pedido */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs min-w-[980px] border-collapse">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 border-y border-slate-300 dark:border-slate-700">
                          <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                            <th className="w-6 py-2 text-center">▶</th>
                            <th className="py-2 px-2 w-8 text-center">
                              <input
                                type="checkbox"
                                checked={
                                  cartItems.length > 0 &&
                                  cartItems.every((c) => Boolean(checkedCartCods[c.cod_item]))
                                }
                                onChange={(e) => {
                                  const next: Record<number, boolean> = {};
                                  if (e.target.checked) {
                                    cartItems.forEach((c) => {
                                      next[c.cod_item] = true;
                                    });
                                  }
                                  setCheckedCartCods(next);
                                }}
                                className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                              />
                            </th>
                            <th className="py-2 px-2">ISBN / Cód.</th>
                            <th className="py-2 px-2">Título do Item</th>
                            <th className="py-2 px-2">Editora / Selo (Horus)</th>
                            <th className="py-2 px-2 text-right">Saldo / Mín</th>
                            <th className="py-2 px-2 text-right">Consig / V90d</th>
                            <th className="py-2 px-2 text-right w-22">Qtd.</th>
                            <th className="py-2 px-2 text-right">Capa</th>
                            <th className="py-2 px-2 text-right">Desc.</th>
                            <th className="py-2 px-2 text-right">Líq. Unit.</th>
                            <th className="py-2 px-2 text-right">Subtotal Líq.</th>
                            <th className="py-2 px-2 text-center w-10">Exc.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-semibold">
                          {cartItems.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="py-10 text-center text-slate-400">
                                Folha vazia — bipe um ISBN acima ou importe uma planilha ISBN + Quantidade.
                              </td>
                            </tr>
                          ) : (
                            cartItems.map((it, idx) => {
                              const hasWarning = !it.publisher_configured || it.vlr_capa <= 0;
                              const isSel = selectedCartIndex === idx;
                              return (
                                <tr
                                  key={it.cod_item}
                                  onClick={() => setSelectedCartIndex(idx)}
                                  className={`divide-x divide-slate-200/60 dark:divide-slate-800 ${
                                    hasWarning
                                      ? 'bg-amber-50/90 dark:bg-amber-950/30'
                                      : isSel
                                      ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                                      : idx % 2 === 0
                                      ? 'bg-white dark:bg-slate-900'
                                      : 'bg-slate-50/50 dark:bg-slate-800/20'
                                  }`}
                                >
                                  <td className="py-1.5 text-center font-mono text-[10px] text-indigo-600 font-black">
                                    {isSel ? '▶' : ''}
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
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
                                  <td className="py-1.5 px-2 font-mono text-[11px]">
                                    <div className="font-bold text-slate-900 dark:text-white">{it.isbn || '—'}</div>
                                    <div className="text-[10px] text-slate-400">#{it.cod_item}</div>
                                  </td>
                                  <td className="py-1.5 px-2 max-w-[230px]">
                                    <div className="font-extrabold text-slate-900 dark:text-white truncate" title={it.nome_item}>
                                      {it.nome_item}
                                    </div>
                                    {it.last_entry_date && (
                                      <div className="text-[10px] text-slate-500">
                                        Últ. {it.last_entry_type}: {formatDateBr(it.last_entry_date)} ({it.last_entry_qty} un)
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        className={`font-bold truncate ${
                                          it.publisher_configured
                                            ? 'text-slate-800 dark:text-slate-200'
                                            : 'text-amber-800 dark:text-amber-300'
                                        }`}
                                      >
                                        {it.nome_editora}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => openCartReconcileModal([it])}
                                        className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white text-[10px] font-extrabold shrink-0 cursor-pointer"
                                        title="Alterar Editora/Selo deste item no Horus + Cronuz"
                                      >
                                        Selo
                                      </button>
                                    </div>
                                    {!it.publisher_configured && it.cod_editora && (
                                      <div className="mt-0.5 flex items-center gap-1">
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
                                          className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold cursor-pointer"
                                        >
                                          + Vincular Desconto
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">
                                    <span className={it.stock_available <= 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                                      {it.stock_available}
                                    </span>
                                    <span className="text-slate-400">/{it.min_stock || '—'}</span>
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                                    <span className="text-purple-700 dark:text-purple-300">{it.consigned_received}</span>
                                    <span className="text-slate-400">/{it.sales_90}</span>
                                  </td>
                                  <td className="py-1.5 px-2 text-right">
                                    <input
                                      type="number"
                                      min={1}
                                      value={it.quantity}
                                      onChange={(e) => updateCartItemQty(it.cod_item, parseInt(e.target.value, 10) || 1)}
                                      className="w-16 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono font-extrabold"
                                    />
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">{formatMoney(it.vlr_capa)}</td>
                                  <td className="py-1.5 px-2 text-right font-mono">
                                    {it.publisher_configured ? (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                                        {it.discount_pct.toFixed(2)}%
                                      </span>
                                    ) : (
                                      <span className="text-rose-600 font-extrabold">Pend.</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">{formatMoney(it.unit_net_price)}</td>
                                  <td className="py-1.5 px-2 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                                    {formatMoney(it.subtotal_net)}
                                  </td>
                                  <td className="py-1.5 px-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setCartItems((prev) => prev.filter((x) => x.cod_item !== it.cod_item))
                                      }
                                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Barra Inferior de Navegação de Registros + Fechamento AP no Horus */}
                    <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={cartItems.length === 0}
                          onClick={() => setSelectedCartIndex(0)}
                          className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronsLeft className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={cartItems.length === 0}
                          onClick={() => setSelectedCartIndex((p) => Math.max(0, p - 1))}
                          className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        <span className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 rounded font-bold text-slate-700 dark:text-slate-200">
                          Registro {cartItems.length === 0 ? 0 : selectedCartIndex + 1} de {cartItems.length}
                        </span>
                        <button
                          type="button"
                          disabled={cartItems.length === 0}
                          onClick={() => setSelectedCartIndex((p) => Math.min(cartItems.length - 1, p + 1))}
                          className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={cartItems.length === 0}
                          onClick={() => setSelectedCartIndex(Math.max(0, cartItems.length - 1))}
                          className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                        >
                          <ChevronsRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 font-sans text-xs">
                        <span>
                          Tít./Ex.: <strong className="font-mono">{cartSummary.skus}/{cartSummary.totalQty}</strong>
                        </span>
                        <span>
                          Bruto: <strong className="font-mono">{formatMoney(cartSummary.gross)}</strong>
                        </span>
                        <span>
                          Desc. Médio: <strong className="font-mono text-emerald-700">{cartSummary.avgDisc.toFixed(2)}%</strong>
                        </span>
                        <span>
                          Líquido: <strong className="font-mono text-sm text-indigo-700 dark:text-indigo-300">{formatMoney(cartSummary.net)}</strong>
                        </span>
                      </div>
                    </div>

                    {cartItems.length > 0 && (
                      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-end justify-between gap-3">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 flex-1">
                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-black uppercase text-slate-500 mb-0.5">
                              Modalidade Horus
                            </label>
                            <select
                              value={compraConsig}
                              onChange={(e) => setCompraConsig(e.target.value === 'S' ? 'S' : 'N')}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                            >
                              <option value="N">Compra Firme (N)</option>
                              <option value="S">Consignação (S)</option>
                            </select>
                          </div>
                          <div className="sm:col-span-9">
                            <label className="block text-[10px] font-black uppercase text-slate-500 mb-0.5">
                              Observações (OBS_PEDIDO_COMPRA em CAIXA ALTA)
                            </label>
                            <input
                              type="text"
                              maxLength={250}
                              value={orderObservations}
                              onChange={(e) => setOrderObservations(e.target.value)}
                              placeholder="Ex: REPOSIÇÃO PROGRAMADA - CONFERIR XML ANTES DA ENTREGA"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold uppercase"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={creatingOrder || cartSummary.invalidCount > 0}
                          onClick={handleCreatePurchaseOrder}
                          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0 disabled:cursor-not-allowed"
                        >
                          {creatingOrder ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {cartSummary.invalidCount > 0
                            ? `Corrija ${cartSummary.invalidCount} item(ns)`
                            : 'Gerar Pedido no Horus (Status AP)'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* OBJETO 2: FOLHA DE DADOS DE PEDIDOS (AP / AE / XML OK / DIVERGÊNCIAS)  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'ORDERS' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 overflow-hidden shadow-2xs">
          {/* Barra de Filtro da Folha de Dados */}
          <div className="p-3 bg-slate-50/90 dark:bg-slate-900 border-b border-slate-300/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {[
                { key: 'ALL', label: 'Todos' },
                { key: 'AP', label: 'Aprovados (AP)' },
                { key: 'AE', label: 'Aguard. Entrega (AE)' },
                { key: 'XML_OK', label: 'XML OK' },
                { key: 'PENDING_REVIEW', label: 'XML em Análise' },
                { key: 'ACCEPTED_WITH_DIVERGENCE', label: 'XML Aceito c/ Div.' },
                { key: 'REJECTED', label: 'XML Recusado' },
                { key: 'EE', label: 'Recebidos (EE)' },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setOrderStatusFilter(st.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold whitespace-nowrap transition cursor-pointer border ${
                    orderStatusFilter === st.key
                      ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-500'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearchFilter}
                  onChange={(e) => setOrderSearchFilter(e.target.value)}
                  placeholder="Nº Pedido, NF-e ou Fornecedor..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
              <button
                type="button"
                onClick={() => fetchOrdersList(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin text-indigo-600' : ''}`} />
                Sincronizar
              </button>
            </div>
          </div>

          {/* Grade Estilo Folha de Dados Access Moderno */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[1060px] border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700">
                <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                  <th className="w-6 py-2 text-center">▶</th>
                  <th className="py-2 px-2.5 w-24">Pedido #</th>
                  <th className="py-2 px-2.5 w-36">Data / Comprador</th>
                  <th className="py-2 px-2.5 w-36">Filial</th>
                  <th className="py-2 px-2.5">Fornecedor / CNPJ</th>
                  <th className="py-2 px-2.5 w-24 text-right">Tít / Exemp</th>
                  <th className="py-2 px-2.5 w-28 text-right">Total Líquido</th>
                  <th className="py-2 px-2.5 w-40 text-center">Status Horus</th>
                  <th className="py-2 px-2.5 w-48 text-center">Conferência XML (NF-e)</th>
                  <th className="py-2 px-2.5 w-60 text-right">Operações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-semibold">
                {loadingOrders ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-indigo-600" />
                      Sincronizando folha de pedidos com PEDIDOS_COMPRA no Horus...
                    </td>
                  </tr>
                ) : ordersList.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500">
                      Nenhum pedido de compra encontrado para este filtro.
                    </td>
                  </tr>
                ) : (
                  ordersList.map((ord, idx) => {
                    const isSel = selectedOrderIndex === idx;
                    return (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedOrderIndex(idx)}
                        onDoubleClick={() => openOrderDetailModal(ord.id)}
                        className={`cursor-pointer transition-colors divide-x divide-slate-200/60 dark:divide-slate-800 ${
                          isSel
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                            : idx % 2 === 0
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-50'
                            : 'bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100/60'
                        }`}
                      >
                        <td className="py-2 text-center font-mono text-[10px] text-indigo-600 font-black">
                          {isSel ? '▶' : ''}
                        </td>
                        <td className="py-2 px-2.5 font-mono font-black text-indigo-700 dark:text-indigo-300">
                          #{ord.horus_cod_pedido || ord.id}
                        </td>
                        <td className="py-2 px-2.5 text-[11px]">
                          <div className="font-mono">{formatDateTimeBr(ord.created_at)}</div>
                          <div className="text-slate-400 truncate">por {ord.created_by_name || '—'}</div>
                        </td>
                        <td className="py-2 px-2.5 truncate">{ord.branch_name}</td>
                        <td className="py-2 px-2.5">
                          <div className="font-extrabold text-slate-900 dark:text-white truncate">
                            {ord.nome_fornecedor}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">{formatCnpj(ord.cnpj_fornecedor)}</div>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono">
                          {ord.total_skus} / <strong>{ord.total_quantity}</strong>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                          {formatMoney(ord.total_net)}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-extrabold border ${
                              ord.horus_status === 'AP'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : ord.horus_status === 'AE'
                                ? 'bg-sky-50 text-sky-800 border-sky-300'
                                : ord.horus_status === 'EE'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {ord.status_label}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold border ${getXmlDecisionBadgeClass(
                                ord.xml_status
                              )}`}
                            >
                              {ord.xml_status_label || 'Sem XML'}
                            </span>
                            {ord.last_nfe_number && (
                              <span className="font-mono text-[10px] text-slate-500">
                                NF {ord.last_nfe_number}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1 justify-end">
                            {ord.last_xml_audit_id ? (
                              <button
                                type="button"
                                onClick={() => openXmlAuditDetailModal(ord.last_xml_audit_id!)}
                                className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                                title="Abrir análise e pontuação do XML desta NF-e"
                              >
                                <FileCheck2 className="w-3 h-3" />
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
                                className="px-2 py-1 rounded bg-slate-900 dark:bg-slate-700 hover:bg-indigo-600 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                                title="Subir e validar XML da NF-e contra este pedido"
                              >
                                <Upload className="w-3 h-3" />
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
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                              title="Exportar planilha Excel do pedido (com opção AP -> AE)"
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              Excel
                            </button>

                            {ord.horus_status === 'AP' && (
                              <button
                                type="button"
                                onClick={() => handleManualStatusTransition(ord.id, 'AE')}
                                className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-extrabold cursor-pointer"
                                title="Mudar para AE (Aguardando Entrega) no Horus"
                              >
                                AE
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openOrderDetailModal(ord.id)}
                              className="p-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 cursor-pointer"
                              title="Ficha e trilha de auditoria do pedido"
                            >
                              <History className="w-3.5 h-3.5" />
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

          {/* Barra Inferior de Navegação de Registros Estilo Access Moderno */}
          <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={ordersList.length === 0}
                onClick={() => setSelectedOrderIndex(0)}
                className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <ChevronsLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={ordersList.length === 0}
                onClick={() => setSelectedOrderIndex((p) => Math.max(0, p - 1))}
                className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="px-2.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 rounded font-bold text-slate-800 dark:text-slate-200">
                Registro {ordersList.length === 0 ? 0 : selectedOrderIndex + 1} de {ordersList.length}
              </span>
              <button
                type="button"
                disabled={ordersList.length === 0}
                onClick={() => setSelectedOrderIndex((p) => Math.min(ordersList.length - 1, p + 1))}
                className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={ordersList.length === 0}
                onClick={() => setSelectedOrderIndex(Math.max(0, ordersList.length - 1))}
                className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <ChevronsRight className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-4 font-sans text-xs">
              <span className="text-slate-500">Duplo clique ou Enter abre o histórico completo</span>
              <span>
                Soma Líquida Filtrada:{' '}
                <strong className="font-mono text-indigo-700 dark:text-indigo-300">
                  {formatMoney(ordersTotalNetSum)}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* OBJETO 3: CENTRAL DE AUDITORIA & ANÁLISE POSTERIOR DE XML (NF-e)       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'XML_AUDIT' && (
        <div className="space-y-2.5">
          {/* 3.1 Formulário Superior de Recepção e Cruzamento Preventivo do XML */}
          <form
            onSubmit={handleUploadAndAnalyzeXml}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 overflow-hidden shadow-2xs"
          >
            <div className="px-3.5 py-2 bg-slate-100/95 dark:bg-slate-800/80 border-b border-slate-300/80 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-black">
                  CONFERÊNCIA PREVENTIVA
                </span>
                <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  Cruzar XML da NF-e do Fornecedor com Pedido de Compra (Capa • Desconto % • Quantidade)
                </h2>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Limite máx.: 10 MB (.xml NF-e mod. 55)</span>
            </div>

            <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-4">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                  Pedido de Compra Alvo ({selectedBranch?.nome || 'Filial'})
                </label>
                <select
                  value={xmlTargetOrderId}
                  onChange={(e) => setXmlTargetOrderId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
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
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
                  Arquivo XML da NF-e (.xml)
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
                  className="w-full text-xs file:mr-2.5 file:px-2.5 file:py-1 file:rounded file:border-0 file:bg-indigo-600 file:text-white file:font-extrabold border border-slate-300 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="space-y-1 text-[11px]">
                  <label className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={xmlAutoAcceptIfOk}
                      onChange={(e) => setXmlAutoAcceptIfOk(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    Mudar p/ <strong>XML OK</strong> automaticamente se 100% batendo
                  </label>
                  <label className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={xmlAdvanceHorusToAe}
                      onChange={(e) => setXmlAdvanceHorusToAe(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    Se aprovar e estiver AP, avançar p/ AE no Horus
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={analyzingXml || !xmlUploadFile}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 disabled:cursor-not-allowed"
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

          {/* 3.2 Indicadores Rápidos de Situação (OK vs Divergências / Análise Posterior) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setXmlDecisionFilter('PENDING_REVIEW')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'PENDING_REVIEW'
                  ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/30 dark:bg-amber-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-300/80 dark:border-slate-800 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">
                  Em Análise (Divergência)
                </span>
                <FileWarning className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-black font-mono text-amber-800 dark:text-amber-200 mt-0.5">
                {xmlKpis.pending_review}
              </div>
              <div className="text-[10px] text-slate-500">Aguardando decisão posterior</div>
            </button>

            <button
              type="button"
              onClick={() => setXmlDecisionFilter('XML_OK')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'XML_OK'
                  ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/30 dark:bg-emerald-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-300/80 dark:border-slate-800 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                  XML OK (Liberadas)
                </span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black font-mono text-emerald-800 dark:text-emerald-200 mt-0.5">
                {xmlKpis.xml_ok}
              </div>
              <div className="text-[10px] text-slate-500">Prontas p/ chegada física da NF</div>
            </button>

            <button
              type="button"
              onClick={() => setXmlDecisionFilter('ACCEPTED_WITH_DIVERGENCE')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'ACCEPTED_WITH_DIVERGENCE'
                  ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30 dark:bg-indigo-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-300/80 dark:border-slate-800 hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300">
                  Aceitas c/ Divergência
                </span>
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-xl font-black font-mono text-indigo-800 dark:text-indigo-200 mt-0.5">
                {xmlKpis.accepted_with_divergence}
              </div>
              <div className="text-[10px] text-slate-500">Autorizadas e pontuadas</div>
            </button>

            <button
              type="button"
              onClick={() => setXmlDecisionFilter('REJECTED')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                xmlDecisionFilter === 'REJECTED'
                  ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/30 dark:bg-rose-950/40'
                  : 'bg-white dark:bg-slate-900 border-slate-300/80 dark:border-slate-800 hover:border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-rose-700 dark:text-rose-300">
                  XML Recusadas
                </span>
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-xl font-black font-mono text-rose-800 dark:text-rose-200 mt-0.5">
                {xmlKpis.rejected}
              </div>
              <div className="text-[10px] text-slate-500">Bloqueadas p/ correção do fornecedor</div>
            </button>
          </div>

          {/* 3.3 Folha de Dados das Notas Analisadas (Divergências Identificadas & Situações OK) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-50/90 dark:bg-slate-900 border-b border-slate-300/80 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition cursor-pointer border ${
                      xmlDecisionFilter === st.key
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}

                <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block" />

                {/* Filtro por Eixo Específico de Divergência */}
                <select
                  value={xmlDivergenceAxisFilter}
                  onChange={(e) => setXmlDivergenceAxisFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                  title="Filtrar notas pelo tipo exato de divergência identificada"
                >
                  <option value="ALL">Filtro de Divergência: Todos os Tipos</option>
                  <option value="DISCOUNT">Com Divergência de Desconto (%)</option>
                  <option value="COVER">Com Divergência de Preço de Capa</option>
                  <option value="QTY">Com Divergência de Quantidade</option>
                  <option value="EXTRA">Com Item Extra (Não Pedido)</option>
                  <option value="MISSING">Com Item Faltante no XML</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={xmlSearchFilter}
                    onChange={(e) => setXmlSearchFilter(e.target.value)}
                    placeholder="Nº NF-e, Chave, Pedido ou Fornecedor..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fetchXmlAuditsList(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingXmlAudits ? 'animate-spin text-indigo-600' : ''}`} />
                  Atualizar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1120px] border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 border-b border-slate-300 dark:border-slate-700">
                  <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                    <th className="w-6 py-2 text-center">▶</th>
                    <th className="py-2 px-2.5 w-28">NF-e / Série</th>
                    <th className="py-2 px-2.5 w-24">Pedido #</th>
                    <th className="py-2 px-2.5">Fornecedor / Emitente</th>
                    <th className="py-2 px-2.5 w-28 text-right">Qtd (Ped → XML)</th>
                    <th className="py-2 px-2.5 w-44 text-right">Líq. Prod. (Ped → XML)</th>
                    <th className="py-2 px-2.5">Divergências Identificadas por Eixo</th>
                    <th className="py-2 px-2.5 w-44 text-center">Situação / Decisão</th>
                    <th className="py-2 px-2.5 w-44">Análise / Pontuação</th>
                    <th className="py-2 px-2.5 w-40 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 font-semibold">
                  {loadingXmlAudits ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-indigo-600" />
                        Carregando notas analisadas...
                      </td>
                    </tr>
                  ) : xmlAuditsList.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        Nenhum XML auditado encontrado para este filtro. Suba um arquivo .xml acima para iniciar a validação preventiva.
                      </td>
                    </tr>
                  ) : (
                    xmlAuditsList.map((aud, idx) => {
                      const isSel = selectedXmlIndex === idx;
                      return (
                        <tr
                          key={aud.id}
                          onClick={() => setSelectedXmlIndex(idx)}
                          onDoubleClick={() => openXmlAuditDetailModal(aud.id)}
                          className={`cursor-pointer transition-colors divide-x divide-slate-200/60 dark:divide-slate-800 ${
                            isSel
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                              : idx % 2 === 0
                              ? 'bg-white dark:bg-slate-900 hover:bg-slate-50'
                              : 'bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-100/60'
                          }`}
                        >
                          <td className="py-2 text-center font-mono text-[10px] text-indigo-600 font-black">
                            {isSel ? '▶' : ''}
                          </td>
                          <td className="py-2 px-2.5 font-mono">
                            <div className="font-black text-slate-900 dark:text-white">
                              NF {aud.numero_nf}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Sér. {aud.serie_nf || '1'} • {formatDateBr(aud.data_emissao)}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 font-mono font-black text-indigo-700 dark:text-indigo-300">
                            #{aud.horus_cod_pedido || aud.order_id}
                          </td>
                          <td className="py-2 px-2.5 max-w-[220px]">
                            <div className="font-extrabold text-slate-900 dark:text-white truncate">
                              {aud.emit_nome || aud.nome_fornecedor}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {formatCnpj(aud.emit_cnpj)} • {aud.branch_name}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono">
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
                          <td className="py-2 px-2.5 text-right font-mono text-[11px]">
                            <div>{formatMoney(aud.order_total_net)}</div>
                            <div
                              className={`font-extrabold ${
                                Math.abs(aud.xml_total_products_net - aud.order_total_net) > 0.05
                                  ? 'text-rose-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              → {formatMoney(aud.xml_total_products_net)}
                            </div>
                          </td>
                          <td className="py-2 px-2.5">
                            {aud.diagnostic_status === 'MATCH_100' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold">
                                <Check className="w-3 h-3" />
                                100% Compatível ({aud.matched_ok_count} itens OK)
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {aud.diff_discount_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-extrabold font-mono">
                                    Desc: {aud.diff_discount_count}
                                  </span>
                                )}
                                {aud.diff_cover_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold font-mono">
                                    Capa: {aud.diff_cover_count}
                                  </span>
                                )}
                                {aud.diff_qty_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-[10px] font-extrabold font-mono">
                                    Qtd: {aud.diff_qty_count}
                                  </span>
                                )}
                                {aud.extra_in_xml_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 text-[10px] font-extrabold font-mono">
                                    Extra: {aud.extra_in_xml_count}
                                  </span>
                                )}
                                {aud.missing_in_xml_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 border border-slate-400 text-[10px] font-extrabold font-mono">
                                    Falta: {aud.missing_in_xml_count}
                                  </span>
                                )}
                                {aud.header_warnings.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-400 text-[10px] font-extrabold">
                                    CNPJ Alerta
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-extrabold border ${getXmlDecisionBadgeClass(
                                aud.decision_status
                              )}`}
                            >
                              {aud.decision_label}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 max-w-[200px] text-[11px]">
                            {aud.decision_notes ? (
                              <div className="truncate text-slate-700 dark:text-slate-200" title={aud.decision_notes}>
                                “{aud.decision_notes}”
                              </div>
                            ) : (
                              <div className="text-slate-400">Sem pontuação registrada</div>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {aud.decided_by_name
                                ? `${aud.decided_by_name} • ${formatDateTimeBr(aud.decided_at)}`
                                : `Enviado por ${aud.uploaded_by_name || '—'}`}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => openXmlAuditDetailModal(aud.id)}
                                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold cursor-pointer"
                              >
                                Analisar / Pontuar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadXmlAuditExcel(aud.id, aud.numero_nf)}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                title="Baixar Relatório Excel de Divergências"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
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

            {/* Barra Inferior de Navegação de Registros Estilo Access Moderno */}
            <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={xmlAuditsList.length === 0}
                  onClick={() => setSelectedXmlIndex(0)}
                  className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronsLeft className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={xmlAuditsList.length === 0}
                  onClick={() => setSelectedXmlIndex((p) => Math.max(0, p - 1))}
                  className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="px-2.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 rounded font-bold text-slate-800 dark:text-slate-200">
                  Registro {xmlAuditsList.length === 0 ? 0 : selectedXmlIndex + 1} de {xmlAuditsList.length}
                </span>
                <button
                  type="button"
                  disabled={xmlAuditsList.length === 0}
                  onClick={() => setSelectedXmlIndex((p) => Math.min(xmlAuditsList.length - 1, p + 1))}
                  className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={xmlAuditsList.length === 0}
                  onClick={() => setSelectedXmlIndex(Math.max(0, xmlAuditsList.length - 1))}
                  className="p-1 rounded border border-slate-300 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronsRight className="w-3 h-3" />
                </button>
              </div>

              <span className="font-sans text-xs text-slate-500">
                Clique em <strong>Analisar / Pontuar</strong> (ou Enter) para Aceitar OK, Aceitar c/ Divergência ou Recusar XML
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* OBJETO 4: PARAMETRIZAÇÃO OPERACIONAL & E-MAIL DA FILIAL               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'BRANCH_CONFIG' && selectedBranch && (
        <form
          onSubmit={handleSaveBranchSettings}
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300/90 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xs max-w-4xl"
        >
          <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" />
              Parâmetros Operacionais &amp; E-mail — {selectedBranch.label}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configuração individual por filial para gravação em PEDIDOS_COMPRA e modelo de e-mail para fornecedores.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
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
              <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="N">Compra Firme (N)</option>
                <option value="S">Consignação (S)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                Identidade &amp; Texto de E-mail desta Filial (Envio ao Fornecedor)
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome de Exibição (Filial)
                </label>
                <input
                  type="text"
                  value={branchConfigForm.sender_name || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, sender_name: e.target.value }))}
                  placeholder="Ex: Compras Paisagem Pompeia"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail Reply-To da Filial
                </label>
                <input
                  type="email"
                  value={branchConfigForm.reply_to_email || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, reply_to_email: e.target.value }))}
                  placeholder="compras.pompeia@livrariapaisagem.com.br"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cópias / CC da Filial
                </label>
                <input
                  type="text"
                  value={branchConfigForm.cc_emails || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, cc_emails: e.target.value }))}
                  placeholder="recebimento@..., fiscal@..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Assunto do E-mail
              </label>
              <input
                type="text"
                value={branchConfigForm.email_subject_template || ''}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_subject_template: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Texto Padrão ({'{fornecedor_nome}'}, {'{cod_pedido}'}, {'{filial_nome}'}, {'{filial_cnpj}'}, {'{qtd_exemplares}'}, {'{valor_liquido}'})
              </label>
              <textarea
                rows={4}
                value={branchConfigForm.email_body_template || ''}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_body_template: e.target.value }))}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBranchConfig}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
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
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">
                    Vincular Editoras / Selos e Desconto (%) na Filial
                  </h3>
                  <p className="text-[11px] text-slate-300 truncate">
                    {supplierOverview.supplier.nom_fornecedor} • Filial: {selectedBranch?.nome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddPublisherModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pesquisar Editora na tabela EDITORA do Horus (marque 1 ou mais):
                    </label>
                    <input
                      type="text"
                      value={pubSearchTerm}
                      onChange={(e) => {
                        setPubSearchTerm(e.target.value);
                        searchHorusPublishersForModal(e.target.value);
                      }}
                      placeholder="Nome ou código da editora no Horus..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Desconto Comercial (%)
                    </label>
                    <CurrencyInput
                      value={batchDiscountPct}
                      onChangeValue={(val) => setBatchDiscountPct(val)}
                      suffixStr="%"
                      max={100}
                      className="w-full px-3 py-1.5 rounded-lg border border-indigo-400 bg-white dark:bg-slate-800 text-right font-mono text-xs font-extrabold"
                    />
                  </div>
                </div>

                {Object.keys(selectedPubsForSupplier).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                    {Object.values(selectedPubsForSupplier).map((sp) => (
                      <span
                        key={sp.cod_editora}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 text-white text-[11px] font-bold"
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
                          className="ml-0.5 hover:text-rose-200 cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
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
                          className={`px-3 py-1.5 flex items-center justify-between gap-2 text-xs cursor-pointer ${
                            checked ? 'bg-indigo-50 dark:bg-indigo-950/50 font-extrabold' : 'hover:bg-slate-50 font-semibold'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
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
                            <span className="font-mono text-[11px] text-slate-500">#{p.cod_editora}</span>
                            <span className="truncate">{p.nome_editora}</span>
                          </div>
                          <span className="text-[11px] text-slate-400 shrink-0">{p.qtd_itens} itens</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {Object.keys(selectedPubsForSupplier).length} selo(s) • Desconto:{' '}
                  <strong>{batchDiscountPct.toFixed(2)}%</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPublisherModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={savingSupplierDiscounts || Object.keys(selectedPubsForSupplier).length === 0}
                    onClick={handleSaveBatchSupplierDiscounts}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
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
      {/* MODAL 2: IMPORTAÇÃO DE PLANILHA ISBN + QUANTIDADE (ATÉ 10 MB)          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showSheetModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <motion.form
              onSubmit={handleImportSheet}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">Importar Planilha de Pedido (ISBN + Quantidade)</h3>
                  <p className="text-[11px] text-slate-300">
                    Reconhece colunas ISBN/EAN e Quantidade (.xlsx ou .csv até 10 MB).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSheetModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Planilha Excel (.xlsx) ou CSV (máx. 10 MB):
                  </label>
                  <a
                    href={`${apiUrl}/horus-purchases/template-sheet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-extrabold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Modelo .xlsx
                  </a>
                </div>

                <input
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > MAX_SHEET_BYTES) {
                      toast.error('O arquivo excede o limite máximo permitido de 10 MB.');
                      e.target.value = '';
                      return;
                    }
                    setSheetFile(f);
                  }}
                  className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-bold border border-slate-300 rounded-lg p-1.5"
                />

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ou cole diretamente do Excel (ISBN + Quantidade por linha):
                  </label>
                  <textarea
                    rows={5}
                    value={sheetPastedText}
                    onChange={(e) => setSheetPastedText(e.target.value)}
                    placeholder={'9788535914849\t5\n9786559210886\t10'}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSheetModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importingSheet}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  {importingSheet ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Processar na Folha
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: CONCILIAÇÃO DE EDITORA/SELO NOS DOIS BANCOS (HORUS + CRONUZ)  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showReconcileModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <DatabaseZap className="w-4 h-4 text-amber-400" />
                    Conciliar Editora / Selo (Horus + Cronuz)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Atualiza <code>ITENS_ESTOQUE_GERAL.COD_EDITORA</code> no Horus e <code>prd_product</code> no Cronuz ({reconcileItems.length} item(ns)).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReconcileModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <input
                  type="text"
                  value={reconcileSearch}
                  onChange={(e) => {
                    setReconcileSearch(e.target.value);
                    searchHorusPublishersForModal(e.target.value, true);
                  }}
                  placeholder="Pesquisar editora oficial cadastrada no Horus..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {reconcilePubOptions.map((pub) => {
                    const isSel = selectedReconcilePub?.cod_editora === pub.cod_editora;
                    return (
                      <button
                        key={pub.cod_editora}
                        type="button"
                        onClick={() =>
                          setSelectedReconcilePub({ cod_editora: pub.cod_editora, nome_editora: pub.nome_editora })
                        }
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between text-xs cursor-pointer ${
                          isSel ? 'bg-indigo-50 font-extrabold text-indigo-800' : 'hover:bg-slate-50 font-semibold'
                        }`}
                      >
                        <span>
                          <span className="font-mono text-[11px] text-slate-500 mr-2">#{pub.cod_editora}</span>
                          {pub.nome_editora}
                        </span>
                        <span className="text-[11px] text-slate-400">{pub.qtd_itens} itens</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold truncate">
                  {selectedReconcilePub
                    ? `Selecionada: #${selectedReconcilePub.cod_editora} - ${selectedReconcilePub.nome_editora}`
                    : 'Escolha a editora correta acima'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReconcileModal(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!selectedReconcilePub || savingReconcile}
                    onClick={handleConfirmCartReconcile}
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
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
      {/* MODAL 4: EXPORTAÇÃO EXCEL + OPÇÃO DE MUDAR STATUS AP -> AE NO HORUS    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {exportPromptOrder && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-3 bg-emerald-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
                  <h3 className="text-sm font-extrabold">
                    Gerar Excel — Pedido #{exportPromptOrder.horus_cod_pedido || exportPromptOrder.id}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setExportPromptOrder(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-emerald-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  Exportar planilha com <strong>ISBN, Título, Editora, Quantidade, Preço Capa, Desconto (%) e Preço Líquido</strong> para{' '}
                  <strong>{exportPromptOrder.nome_fornecedor}</strong>.
                </p>

                {exportPromptOrder.horus_status === 'AP' ? (
                  <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 text-sky-900 dark:text-sky-200 space-y-1">
                    <p className="font-extrabold">Avançar também o status para AE (Aguardando Entrega)?</p>
                    <p className="text-[11px]">
                      Atualiza <code>PEDIDOS_COMPRA</code> no Horus para <code>AE</code> e grava seu usuário/horário na auditoria.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Status Horus atual: <strong>{exportPromptOrder.horus_status}</strong>.
                  </p>
                )}

                <div className="pt-1 flex flex-col gap-2">
                  {exportPromptOrder.horus_status === 'AP' && (
                    <button
                      type="button"
                      disabled={exportingExcel}
                      onClick={() => handleExportOrderExcel(exportPromptOrder.id, true)}
                      className="w-full py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {exportingExcel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      Baixar Excel + Mudar para AE (Aguardando Entrega)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={exportingExcel}
                    onClick={() => handleExportOrderExcel(exportPromptOrder.id, false)}
                    className="w-full py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
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
      {/* MODAL 5: FICHA DO PEDIDO & TRILHA DE AUDITORIA                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(detailModalData || loadingOrderDetail) && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">
                    Ficha do Pedido #{detailModalData?.order.horus_cod_pedido || detailModalData?.order.id || ''}
                  </h3>
                  {detailModalData && (
                    <p className="text-[11px] text-slate-300">
                      {detailModalData.order.branch_name} • {detailModalData.order.nome_fornecedor} •{' '}
                      <strong>{detailModalData.order.status_label}</strong> • XML:{' '}
                      <strong>{detailModalData.order.xml_status_label}</strong>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailModalData(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingOrderDetail || !detailModalData ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                  Carregando itens e auditoria...
                </div>
              ) : (
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      Histórico Completo de Status, Exportações e Decisões XML
                    </h4>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/40 text-xs">
                      {detailModalData.logs.map((lg) => (
                        <div
                          key={lg.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b last:border-0 border-slate-200/70"
                        >
                          <div>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[10px] font-extrabold mr-2">
                              {lg.action}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{lg.details}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 shrink-0 font-mono">
                            {lg.user_name || 'Sistema'} • {formatDateTimeBr(lg.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-extrabold uppercase text-slate-500 mb-1.5">
                      Itens Gravados no Pedido ({detailModalData.items.length})
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-slate-300/90 max-h-72">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 sticky top-0 border-b border-slate-300">
                          <tr className="divide-x divide-slate-200">
                            <th className="py-1.5 px-2.5">ISBN</th>
                            <th className="py-1.5 px-2.5">Título</th>
                            <th className="py-1.5 px-2.5">Editora</th>
                            <th className="py-1.5 px-2.5 text-right">Qtd</th>
                            <th className="py-1.5 px-2.5 text-right">Capa</th>
                            <th className="py-1.5 px-2.5 text-right">Desc.</th>
                            <th className="py-1.5 px-2.5 text-right">Subtotal Líq.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 font-semibold">
                          {detailModalData.items.map((it) => (
                            <tr key={it.id} className="divide-x divide-slate-200/60">
                              <td className="py-1 px-2.5 font-mono">{it.isbn || `#${it.cod_item}`}</td>
                              <td className="py-1 px-2.5 font-bold">{it.nome_item}</td>
                              <td className="py-1 px-2.5">{it.nome_editora}</td>
                              <td className="py-1 px-2.5 text-right font-mono">{it.quantity}</td>
                              <td className="py-1 px-2.5 text-right font-mono">{formatMoney(it.unit_cover_price)}</td>
                              <td className="py-1 px-2.5 text-right font-mono text-emerald-700">
                                {Number(it.discount_pct || 0).toFixed(2)}%
                              </td>
                              <td className="py-1 px-2.5 text-right font-mono font-extrabold">
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
      {/* MODAL 6: FICHA DE ANÁLISE POSTERIOR & DECISÃO PONTUADA DO XML (NF-e)   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(xmlAuditDetailModal || loadingXmlAuditDetail) && (
          <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]"
            >
              <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black">
                        Auditoria de XML — NF-e nº {xmlAuditDetailModal?.audit.numero_nf || '...'}{' '}
                        vs Pedido Horus #{xmlAuditDetailModal?.audit.horus_cod_pedido || xmlAuditDetailModal?.audit.order_id || ''}
                      </h3>
                      {xmlAuditDetailModal && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black border ${getXmlDecisionBadgeClass(
                            xmlAuditDetailModal.audit.decision_status
                          )}`}
                        >
                          {xmlAuditDetailModal.audit.decision_label}
                        </span>
                      )}
                    </div>
                    {xmlAuditDetailModal && (
                      <p className="text-[11px] text-slate-300 font-mono">
                        Chave: {xmlAuditDetailModal.audit.chave_acesso || 'Não informada'} • Emitente:{' '}
                        {xmlAuditDetailModal.audit.emit_nome} ({formatCnpj(xmlAuditDetailModal.audit.emit_cnpj)})
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
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Relatório Excel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setXmlAuditDetailModal(null)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {loadingXmlAuditDetail || !xmlAuditDetailModal ? (
                <div className="p-14 text-center text-xs text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                  Carregando comparativo item a item do XML contra o Pedido...
                </div>
              ) : (
                <>
                  <div className="p-3.5 space-y-3 overflow-y-auto flex-1">
                    {/* Alertas Fiscais de Cabeçalho (CNPJ Filial / CNPJ Fornecedor) */}
                    {xmlAuditDetailModal.audit.header_warnings.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1">
                        {xmlAuditDetailModal.audit.header_warnings.map((w, i) => (
                          <div key={i} className="flex items-center gap-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quadro Comparativo de Totais (Pedido vs XML) */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-200 dark:divide-slate-800 border border-slate-300 dark:border-slate-800 rounded-lg bg-slate-50/70 dark:bg-slate-950/40 text-xs">
                      <div className="p-2">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Filial Destino</span>
                        <span className="font-bold text-slate-900 dark:text-white truncate block">
                          {xmlAuditDetailModal.audit.branch_name}
                        </span>
                      </div>
                      <div className="p-2">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Exemplares (Ped → XML)</span>
                        <span className="font-mono font-extrabold">
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
                      <div className="p-2">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Bruto Pedido / XML</span>
                        <span className="font-mono font-bold">
                          {formatMoney(xmlAuditDetailModal.audit.order_total_gross)} /{' '}
                          {formatMoney(xmlAuditDetailModal.audit.xml_total_gross)}
                        </span>
                      </div>
                      <div className="p-2">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Líquido Pedido</span>
                        <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                          {formatMoney(xmlAuditDetailModal.audit.order_total_net)}
                        </span>
                      </div>
                      <div className="p-2">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Líquido Prod. XML</span>
                        <span
                          className={`font-mono font-extrabold ${
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
                      <div className="p-2">
                        <span className="block text-[9px] font-black uppercase text-slate-400">Frete / Impostos NF</span>
                        <span className="font-mono font-bold text-slate-600">
                          {formatMoney(
                            xmlAuditDetailModal.audit.xml_frete + xmlAuditDetailModal.audit.xml_ipi_st_outros
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Abas Internas de Filtro de Itens da Auditoria */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setXmlModalItemFilter('ALL')}
                          className={`px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer border ${
                            xmlModalItemFilter === 'ALL'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          Todos os Itens ({xmlAuditDetailModal.items.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setXmlModalItemFilter('DIVERGENT')}
                          className={`px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer border ${
                            xmlModalItemFilter === 'DIVERGENT'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          Somente Divergências ({xmlAuditDetailModal.audit.divergent_items_count})
                        </button>
                        <button
                          type="button"
                          onClick={() => setXmlModalItemFilter('OK')}
                          className={`px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer border ${
                            xmlModalItemFilter === 'OK'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          Itens 100% OK ({xmlAuditDetailModal.audit.matched_ok_count})
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-bold">
                        <span className="text-rose-700">Desc. Div: {xmlAuditDetailModal.audit.diff_discount_count}</span>
                        <span>•</span>
                        <span className="text-amber-700">Capa Div: {xmlAuditDetailModal.audit.diff_cover_count}</span>
                        <span>•</span>
                        <span className="text-purple-700">Qtd Div: {xmlAuditDetailModal.audit.diff_qty_count}</span>
                        <span>•</span>
                        <span className="text-slate-600">
                          Extras/Faltas: {xmlAuditDetailModal.audit.extra_in_xml_count}/
                          {xmlAuditDetailModal.audit.missing_in_xml_count}
                        </span>
                      </div>
                    </div>

                    {/* Grade Comparativa Item a Item (Capa, Desconto %, Quantidade e Pontuação por Item) */}
                    <div className="overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-800 max-h-[38vh]">
                      <table className="w-full text-left text-xs min-w-[1080px] border-collapse">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-300">
                          <tr className="divide-x divide-slate-200 dark:divide-slate-700">
                            <th className="py-2 px-2 w-32">ISBN / Cód.</th>
                            <th className="py-2 px-2">Título / Editora</th>
                            <th className="py-2 px-2 w-26 text-right">Qtd (Ped → XML)</th>
                            <th className="py-2 px-2 w-36 text-right">Capa (Ped → XML)</th>
                            <th className="py-2 px-2 w-36 text-right">Desc % (Ped → XML)</th>
                            <th className="py-2 px-2 w-36 text-right">Líq. Unit (Ped → XML)</th>
                            <th className="py-2 px-2 w-56">Identificação da Divergência</th>
                            <th className="py-2 px-2 w-56">Pontuação no Item (Opcional)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 font-semibold">
                          {filteredXmlModalItems.map((it) => {
                            const isDiv = it.line_status === 'DIVERGENT';
                            return (
                              <tr
                                key={it.id}
                                className={`divide-x divide-slate-200/60 dark:divide-slate-800 ${
                                  isDiv ? 'bg-amber-50/60 dark:bg-amber-950/20' : 'bg-white dark:bg-slate-900'
                                }`}
                              >
                                <td className="py-1.5 px-2 font-mono text-[11px]">
                                  <div className="font-bold text-slate-900 dark:text-white">
                                    {it.isbn || it.xml_ean || 'SEM GTIN'}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {it.cod_item ? `Horus #${it.cod_item}` : `cProd ${it.xml_cprod || '—'}`}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 max-w-[230px]">
                                  <div className="font-extrabold text-slate-900 dark:text-white truncate" title={it.title}>
                                    {it.title}
                                  </div>
                                  <div className="text-[10px] text-slate-500">{it.nome_editora || 'Não vinculado'}</div>
                                </td>
                                <td
                                  className={`py-1.5 px-2 text-right font-mono ${
                                    it.has_qty_diff ? 'bg-purple-100/70 dark:bg-purple-950/40 font-black' : ''
                                  }`}
                                >
                                  <span>{it.order_qty}</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  <span className={it.has_qty_diff ? 'text-purple-800 dark:text-purple-300' : 'text-emerald-700'}>
                                    {it.xml_qty}
                                  </span>
                                </td>
                                <td
                                  className={`py-1.5 px-2 text-right font-mono text-[11px] ${
                                    it.has_cover_diff ? 'bg-amber-100/80 dark:bg-amber-950/40 font-black' : ''
                                  }`}
                                >
                                  <div>{formatMoney(it.order_cover_price)}</div>
                                  <div className={it.has_cover_diff ? 'text-amber-800' : 'text-emerald-700'}>
                                    → {formatMoney(it.xml_cover_price)}
                                  </div>
                                </td>
                                <td
                                  className={`py-1.5 px-2 text-right font-mono text-[11px] ${
                                    it.has_discount_diff ? 'bg-rose-100/80 dark:bg-rose-950/40 font-black' : ''
                                  }`}
                                >
                                  <div>{it.order_discount_pct.toFixed(2)}%</div>
                                  <div className={it.has_discount_diff ? 'text-rose-700' : 'text-emerald-700'}>
                                    → {it.xml_discount_pct.toFixed(2)}%
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                                  <div>{formatMoney(it.order_unit_net)}</div>
                                  <div className="font-extrabold text-slate-900 dark:text-white">
                                    → {formatMoney(it.xml_unit_net)}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2">
                                  <div className="flex flex-wrap gap-1 mb-0.5">
                                    {(it.divergence_tags || []).map((tg) => {
                                      const meta = formatTagLabel(tg);
                                      return (
                                        <span
                                          key={tg}
                                          className={`px-1.5 py-0.2 rounded border text-[10px] font-extrabold ${meta.cls}`}
                                        >
                                          {meta.text}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {isDiv && it.divergence_summary && (
                                    <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">
                                      {it.divergence_summary}
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2">
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
                                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Painel Inferior de Decisão Posterior & Pontuação Obrigatória */}
                  <div className="p-3.5 bg-slate-100 dark:bg-slate-800/90 border-t border-slate-300 dark:border-slate-700 space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                        Parecer / Pontuação da Análise Posterior (Obrigatório ao Aceitar c/ Divergência ou Recusar XML)
                      </label>
                      <textarea
                        rows={2}
                        value={decisionNotesDraft}
                        onChange={(e) => setDecisionNotesDraft(e.target.value)}
                        placeholder="Ex: Autorizado recebimento parcial sem o ISBN X e diferença de R$ 2,00 na capa reajustada pela editora / Ou: XML recusado por desconto de 40% em vez de 50% acordado..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                      />
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={decisionAdvanceToAe}
                          onChange={(e) => setDecisionAdvanceToAe(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        Se aprovar XML e o pedido ainda estiver AP no Horus, mudar automaticamente p/ AE (Aguardando Entrega)
                      </label>

                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        <button
                          type="button"
                          disabled={savingXmlDecision}
                          onClick={() => handleSubmitXmlDecision('REJECTED')}
                          className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Recusar XML (Deixar Pontuado)
                        </button>

                        <button
                          type="button"
                          disabled={savingXmlDecision}
                          onClick={() => handleSubmitXmlDecision('ACCEPTED_WITH_DIVERGENCE')}
                          className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Aceitar c/ Divergência (Pontuado)
                        </button>

                        <button
                          type="button"
                          disabled={savingXmlDecision}
                          onClick={() => handleSubmitXmlDecision('XML_OK')}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
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

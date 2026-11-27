'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Download,
  FileCheck2,
  FileSpreadsheet,
  History,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
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
  gerar_pendencia_default: string;
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

interface OrderSafetyInfo {
  exists_in_horus: boolean;
  live_horus_status: string;
  gerar_pendencia: string;
  is_finalized: boolean;
  has_conferred_items: boolean;
  conferred_qty: number;
  divergences_count: number;
  linked_nf_count: number;
  has_linked_nf: boolean;
  has_blocking_movement: boolean;
  can_modify: boolean;
  can_cancel: boolean;
  can_reopen: boolean;
  can_append_items: boolean;
  block_reason: string | null;
}

interface OpenOrderCandidate {
  id: number;
  horus_cod_pedido: number | null;
  horus_status: string;
  status_label: string;
  compra_consig: string;
  gerar_pendencia: string;
  total_skus: number;
  total_quantity: number;
  total_net: number;
  created_at: string | null;
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
  gerar_pendencia?: string;
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
  safety?: OrderSafetyInfo;
}

interface OrderWorkspaceItem {
  cod_item: number;
  isbn: string;
  nome_item: string;
  cod_editora: number | null;
  nome_editora: string;
  quantity: number;
  unit_cover_price: number;
  discount_pct: number;
  unit_net_price: number;
  subtotal_gross: number;
  subtotal_net: number;
  stock_at_order: number;
  consigned_at_order: number;
  publisher_configured?: boolean;
  validation_warning?: string | null;
}

interface OrderLogRow {
  id: number;
  action: string;
  old_status: string | null;
  new_status: string | null;
  old_horus_status: string | null;
  new_horus_status: string | null;
  details: string | null;
  user_name: string | null;
  created_at: string | null;
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
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
  return clean;
}

function formatCnpj(raw?: string | null): string {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return raw || '—';
}

function getHorusStatusBadgeClass(horusStatus?: string | null): string {
  switch (horusStatus) {
    case 'AB':
      return 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800';
    case 'AP':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800';
    case 'AE':
      return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    case 'EE':
    case 'FE':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    case 'CA':
      return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
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
      return 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  }
}

function formatTagLabel(tag: string): { text: string; cls: string } {
  switch (tag) {
    case 'CAPA_MAIOR':
      return { text: 'Capa >', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'CAPA_MENOR':
      return { text: 'Capa <', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'FATURADO_LIQUIDO_SEM_VDESC':
      return { text: 'NF s/ vDesc', cls: 'bg-sky-100 text-sky-900 border-sky-300' };
    case 'DESCONTO_MENOR':
      return { text: 'Desc <', cls: 'bg-rose-100 text-rose-900 border-rose-300' };
    case 'DESCONTO_MAIOR':
      return { text: 'Desc >', cls: 'bg-indigo-100 text-indigo-900 border-indigo-300' };
    case 'QTD_MAIOR':
      return { text: 'Qtd >', cls: 'bg-purple-100 text-purple-900 border-purple-300' };
    case 'QTD_MENOR':
      return { text: 'Qtd <', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
    case 'ITEM_NAO_PEDIDO':
      return { text: 'Extra XML', cls: 'bg-rose-100 text-rose-900 border-rose-300' };
    case 'ITEM_FALTANTE_XML':
      return { text: 'Faltante', cls: 'bg-slate-200 text-slate-800 border-slate-400' };
    default:
      return { text: 'OK', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
  }
}

export default function HorusDirectComprasPage() {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  const [companyId, setCompanyId] = useState<number>(1);
  // 1ª Tela: PEDIDOS (conforme diretriz de operação)
  const [activeMainTab, setActiveMainTab] = useState<ComprasInternalTab>('ORDERS');

  // Filiais
  const [branches, setBranches] = useState<PurchaseBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(true);

  // ── ABA 1: PEDIDOS + FICHA INLINE DO PEDIDO (SEM MODAL) ────────────────────
  const [ordersList, setOrdersList] = useState<SavedPurchaseOrder[]>([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState<number>(0);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  // Por padrão oculta Finalizados (EE) — exibe apenas pedidos em andamento (ACTIVE)
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ACTIVE');
  const [orderSearchFilter, setOrderSearchFilter] = useState<string>('');

  const [openOrderWorkspace, setOpenOrderWorkspace] = useState<{
    order: SavedPurchaseOrder;
    items: OrderWorkspaceItem[];
    logs: OrderLogRow[];
  } | null>(null);
  const [orderWorkspaceSubTab, setOrderWorkspaceSubTab] = useState<'ITEMS' | 'XML' | 'LOGS'>('ITEMS');
  const [loadingOrderDetail, setLoadingOrderDetail] = useState<boolean>(false);
  const [orderEditDirty, setOrderEditDirty] = useState<boolean>(false);
  const [orderEditConsig, setOrderEditConsig] = useState<'N' | 'S'>('N');
  const [orderEditGerarPend, setOrderEditGerarPend] = useState<'S' | 'N'>('S');
  const [orderEditObs, setOrderEditObs] = useState<string>('');
  const [orderEditSupplier, setOrderEditSupplier] = useState<{
    cod_grp_fornecedor: number;
    cod_fornecedor: number;
    nome_fornecedor: string;
    cnpj_fornecedor?: string | null;
  } | null>(null);
  const [showOrderSupplierSwap, setShowOrderSupplierSwap] = useState<boolean>(false);
  const [orderSwapSupplierMode, setOrderSwapSupplierMode] = useState<'SAVED' | 'HORUS'>('SAVED');
  const [orderSwapSupplierQuery, setOrderSwapSupplierQuery] = useState<string>('');
  const [orderSwapSuppliersList, setOrderSwapSuppliersList] = useState<SupplierSummary[]>([]);
  const [loadingOrderSwapSuppliers, setLoadingOrderSwapSuppliers] = useState<boolean>(false);
  const [showCancelOrderBar, setShowCancelOrderBar] = useState<boolean>(false);
  const [cancelOrderReason, setCancelOrderReason] = useState<string>('');
  const [changingOrderStatus, setChangingOrderStatus] = useState<boolean>(false);
  const [savingOrderEdit, setSavingOrderEdit] = useState<boolean>(false);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);

  // Adicionar item / planilha dentro da ficha inline de um pedido AP
  const [orderAddItemQuery, setOrderAddItemQuery] = useState<string>('');
  const [orderAddItemQty, setOrderAddItemQty] = useState<number>(1);
  const [orderAddLookupResults, setOrderAddLookupResults] = useState<CartPurchaseItem[]>([]);
  const [searchingOrderAddItem, setSearchingOrderAddItem] = useState<boolean>(false);
  const [showOrderSheetBar, setShowOrderSheetBar] = useState<boolean>(false);
  const [orderSheetFile, setOrderSheetFile] = useState<File | null>(null);
  const [importingOrderSheet, setImportingOrderSheet] = useState<boolean>(false);

  // XML dentro da Ficha Inline do Pedido OU na Aba Conferência XML (SEM MODAL)
  const orderXmlInputRef = useRef<HTMLInputElement | null>(null);
  const standaloneXmlInputRef = useRef<HTMLInputElement | null>(null);
  const [activeXmlDetail, setActiveXmlDetail] = useState<{
    audit: XmlAuditSummary;
    items: XmlAuditItemRow[];
    order_logs: OrderLogRow[];
  } | null>(null);
  const [loadingXmlDetail, setLoadingXmlDetail] = useState<boolean>(false);
  const [xmlItemFilter, setXmlItemFilter] = useState<'ALL' | 'DIVERGENT' | 'OK'>('ALL');
  const [decisionNotesDraft, setDecisionNotesDraft] = useState<string>('');
  const [itemNotesDraft, setItemNotesDraft] = useState<Record<number, string>>({});
  const [decisionAdvanceToAe, setDecisionAdvanceToAe] = useState<boolean>(true);
  const [savingXmlDecision, setSavingXmlDecision] = useState<boolean>(false);

  const [xmlUploadFile, setXmlUploadFile] = useState<File | null>(null);
  const [xmlTargetOrderId, setXmlTargetOrderId] = useState<string>('');
  const [xmlAutoAcceptIfOk, setXmlAutoAcceptIfOk] = useState<boolean>(true);
  const [xmlAdvanceHorusToAe, setXmlAdvanceHorusToAe] = useState<boolean>(true);
  const [analyzingXml, setAnalyzingXml] = useState<boolean>(false);

  // ── ABA 2: NOVO PEDIDO (MESA DE COMPRAS SINTETIZADA) ───────────────────────
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
  // Painel compacto sob demanda no Novo Pedido: null (fechado), 'DISCOUNTS' ou 'HISTORY'
  const [deskExpandedPanel, setDeskExpandedPanel] = useState<'NONE' | 'DISCOUNTS' | 'HISTORY'>('NONE');
  const [historyTab, setHistoryTab] = useState<'COMPRAS' | 'CONSIG' | 'ACERTOS' | 'DEVOL'>('COMPRAS');

  // Importação compacta inline (.xlsx / .csv / .txt) no Novo Pedido
  const [showDeskImportBar, setShowDeskImportBar] = useState<boolean>(false);
  const [intakeMode, setIntakeMode] = useState<'EXCEL' | 'TEXT'>('EXCEL');
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetPastedText, setSheetPastedText] = useState<string>('');
  const [importingSheet, setImportingSheet] = useState<boolean>(false);
  const [lastNotFoundIsbns, setLastNotFoundIsbns] = useState<string[]>([]);

  // Gestão inline de Selos/Editoras + % do Fornecedor
  const [showAddPublisherBox, setShowAddPublisherBox] = useState<boolean>(false);
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

  // Digitação manual e Grade Principal do Novo Pedido
  const [itemSearchTerm, setItemSearchTerm] = useState<string>('');
  const [itemSearchDefaultQty, setItemSearchDefaultQty] = useState<number>(1);
  const [itemLookupResults, setItemLookupResults] = useState<CartPurchaseItem[]>([]);
  const [searchingItems, setSearchingItems] = useState<boolean>(false);
  const [cartItems, setCartItems] = useState<CartPurchaseItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState<number>(0);
  const [checkedCartCods, setCheckedCartCods] = useState<Record<number, boolean>>({});
  const [gridFilterTerm, setGridFilterTerm] = useState<string>('');
  const [compraConsig, setCompraConsig] = useState<'N' | 'S'>('N');
  const [gerarPendencia, setGerarPendencia] = useState<'S' | 'N'>('S');
  const [initialHorusStatus, setInitialHorusStatus] = useState<'AP' | 'AB'>('AP');
  const [savingQuickPendDefault, setSavingQuickPendDefault] = useState<boolean>(false);
  const [orderObservations, setOrderObservations] = useState<string>('');
  const [creatingOrder, setCreatingOrder] = useState<boolean>(false);
  const [openMergePrompt, setOpenMergePrompt] = useState<{
    candidates: OpenOrderCandidate[];
    selectedOrderId: number;
  } | null>(null);
  const [appendingToExisting, setAppendingToExisting] = useState<boolean>(false);

  // Conciliação rápida inline de Editora no Horus (ITENS_ESTOQUE_GERAL)
  const [reconcileTargetCods, setReconcileTargetCods] = useState<number[]>([]);
  const [reconcileSearch, setReconcileSearch] = useState<string>('');
  const [reconcilePubOptions, setReconcilePubOptions] = useState<
    Array<{ cod_editora: number; nome_editora: string; qtd_itens: number }>
  >([]);
  const [selectedReconcilePub, setSelectedReconcilePub] = useState<{
    cod_editora: number;
    nome_editora: string;
  } | null>(null);
  const [savingReconcile, setSavingReconcile] = useState<boolean>(false);

  // ── ABA 3: CONFERÊNCIA XML (LISTA + WORKSPACE INLINE) ──────────────────────
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
  const [openStandaloneXmlWorkspace, setOpenStandaloneXmlWorkspace] = useState<boolean>(false);

  // ── ABA 4: PARÂMETROS DA FILIAL ────────────────────────────────────────────
  const [branchConfigForm, setBranchConfigForm] = useState<BranchConfigData>({
    cod_local_default: null,
    cod_departamento_default: null,
    cod_centro_custo_default: null,
    compra_consig_default: 'N',
    gerar_pendencia_default: 'S',
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

  // Fecha dropdown de fornecedor ao clicar fora
  useEffect(() => {
    const onOutside = (ev: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(ev.target as Node)) {
        setIsSupplierPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // Atalho Esc para retornar da ficha inline à listagem
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (activeMainTab === 'ORDERS' && openOrderWorkspace) {
          setOpenOrderWorkspace(null);
          setActiveXmlDetail(null);
        } else if (activeMainTab === 'XML_AUDIT' && openStandaloneXmlWorkspace) {
          setOpenStandaloneXmlWorkspace(false);
          setActiveXmlDetail(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMainTab, openOrderWorkspace, openStandaloneXmlWorkspace]);

  // ── Carregar Filiais ───────────────────────────────────────────────────────
  const fetchBranches = useCallback(
    async (cid: number, keepBranchId?: number | null) => {
      setLoadingBranches(true);
      try {
        const token = getToken();
        const res = await fetch(`${apiUrl}/horus-purchases/branches?company_id=${cid}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Erro ao carregar filiais.');
        const data = await res.json();
        const list: PurchaseBranch[] = data.branches || [];
        setBranches(list);
        if (list.length > 0) {
          const nextId =
            keepBranchId && list.some((b) => b.id === keepBranchId) ? keepBranchId : list[0].id;
          setSelectedBranchId(nextId);
          const chosen = list.find((b) => b.id === nextId);
          if (chosen) {
            const cfgWithPend: BranchConfigData = {
              ...chosen.config,
              gerar_pendencia_default: chosen.config.gerar_pendencia_default === 'N' ? 'N' : 'S',
            };
            setBranchConfigForm(cfgWithPend);
            setCompraConsig(cfgWithPend.compra_consig_default === 'S' ? 'S' : 'N');
            setGerarPendencia(cfgWithPend.gerar_pendencia_default === 'N' ? 'N' : 'S');
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

  // ── Listagem de Pedidos e Auditorias XML ───────────────────────────────────
  const fetchOrdersList = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingOrders(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({
          company_id: String(companyId),
          status: orderStatusFilter,
          sync_horus_status: silent ? 'false' : 'true',
          limit: '150',
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
        if (!silent) toast.error('Erro ao carregar pedidos.');
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
          limit: '150',
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
        if (!silent) toast.error('Erro ao carregar conferências de XML.');
      } finally {
        if (!silent) setLoadingXmlAudits(false);
      }
    },
    [apiUrl, companyId, selectedBranchId, xmlDecisionFilter, xmlDivergenceAxisFilter, xmlSearchFilter]
  );

  // ── Busca Instantânea de Fornecedores Salvos (PostgreSQL) vs Horus SQL ─────
  const loadSavedSuppliersForBranch = useCallback(
    async (bid: number, qStr = '') => {
      setLoadingSuppliers(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({
          branch_id: String(bid),
          company_id: String(companyId),
          only_configured: 'true',
          limit: '80',
        });
        if (qStr.trim()) params.append('q', qStr.trim());
        const res = await fetch(`${apiUrl}/horus-purchases/suppliers/search?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const saved: SupplierSummary[] = data.suppliers || [];
          setSavedSuppliersList(saved);
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

  useEffect(() => {
    if (selectedBranchId !== null) {
      setHorusSuppliersList([]);
      setHasSearchedHorusSuppliers(false);
      loadSavedSuppliersForBranch(selectedBranchId, '');
      fetchOrdersList(false);
      fetchXmlAuditsList(true);
      const b = branches.find((x) => x.id === selectedBranchId);
      if (b) {
        const cfgWithPend: BranchConfigData = {
          ...b.config,
          gerar_pendencia_default: b.config.gerar_pendencia_default === 'N' ? 'N' : 'S',
        };
        setBranchConfigForm(cfgWithPend);
        setCompraConsig(cfgWithPend.compra_consig_default === 'S' ? 'S' : 'N');
        setGerarPendencia(cfgWithPend.gerar_pendencia_default === 'N' ? 'N' : 'S');
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
            if (d.config) {
              setBranchConfigForm({
                ...d.config,
                gerar_pendencia_default: d.config.gerar_pendencia_default === 'N' ? 'N' : 'S',
              });
            }
          }
        })
        .catch(() => {});
    }
  }, [activeMainTab, selectedBranchId, apiUrl, companyId, fetchOrdersList, fetchXmlAuditsList]);

  // ── Carregar Auditoria de XML (Inline) ─────────────────────────────────────
  const loadXmlAuditDetailInline = async (auditId: number, openStandalone = false) => {
    setLoadingXmlDetail(true);
    setXmlItemFilter('ALL');
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/xml-audits/${auditId}?company_id=${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Erro ao carregar análise do XML.');
      const data = await res.json();
      setActiveXmlDetail(data);
      setDecisionNotesDraft(data.audit?.decision_notes || '');
      const notesMap: Record<number, string> = {};
      for (const it of data.items || []) {
        if (it.item_note) notesMap[it.id] = it.item_note;
      }
      setItemNotesDraft(notesMap);
      setDecisionAdvanceToAe(data.audit?.order_horus_status === 'AP');
      if (openStandalone) {
        setOpenStandaloneXmlWorkspace(true);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao abrir conferência de XML.');
    } finally {
      setLoadingXmlDetail(false);
    }
  };

  // ── Abrir Pedido Inline (Sem Modal) ────────────────────────────────────────
  const openOrderInline = async (orderId: number, initialSubTab: 'ITEMS' | 'XML' | 'LOGS' = 'ITEMS') => {
    setLoadingOrderDetail(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/orders/${orderId}?company_id=${companyId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Pedido não encontrado.');
      const data = await res.json();
      const ord: SavedPurchaseOrder = data.order;
      setOpenOrderWorkspace({
        order: ord,
        items: (data.items || []).map((it: any) => ({
          ...it,
          isbn: it.isbn || '',
          nome_editora: it.nome_editora || '—',
          publisher_configured: true,
          validation_warning: null,
        })),
        logs: data.logs || [],
      });
      setOrderEditConsig(ord.compra_consig === 'S' ? 'S' : 'N');
      setOrderEditGerarPend(ord.gerar_pendencia === 'N' ? 'N' : 'S');
      setOrderEditObs(ord.observations || '');
      setOrderEditSupplier({
        cod_grp_fornecedor: ord.cod_grp_fornecedor,
        cod_fornecedor: ord.cod_fornecedor,
        nome_fornecedor: ord.nome_fornecedor,
        cnpj_fornecedor: ord.cnpj_fornecedor,
      });
      setShowOrderSupplierSwap(false);
      setOrderSwapSupplierQuery('');
      setOrderSwapSuppliersList([]);
      setShowCancelOrderBar(false);
      setCancelOrderReason('');
      setOrderEditDirty(false);
      setOrderAddLookupResults([]);
      setShowOrderSheetBar(false);
      setOrderWorkspaceSubTab(initialSubTab);

      if (ord.last_xml_audit_id) {
        await loadXmlAuditDetailInline(ord.last_xml_audit_id, false);
      } else {
        setActiveXmlDetail(null);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao abrir pedido.');
    } finally {
      setLoadingOrderDetail(false);
    }
  };

  // ── Edição Inline de Pedido em AB / AP / AE (Salva em Horus + Cronuz c/ Travas) ──
  const updateOrderWorkspaceQty = (codItem: number, rawQty: number) => {
    const q = Math.max(1, Math.floor(Number(rawQty) || 1));
    setOpenOrderWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.cod_item === codItem
            ? {
                ...it,
                quantity: q,
                subtotal_gross: Number((it.unit_cover_price * q).toFixed(2)),
                subtotal_net: Number((it.unit_net_price * q).toFixed(2)),
              }
            : it
        ),
      };
    });
    setOrderEditDirty(true);
  };

  const updateOrderWorkspaceDiscount = (codItem: number, rawPct: number) => {
    const pct = Math.min(100, Math.max(0, Number(rawPct) || 0));
    setOpenOrderWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) => {
          if (it.cod_item !== codItem) return it;
          const unitNet = Number((it.unit_cover_price * (1 - pct / 100)).toFixed(4));
          return {
            ...it,
            discount_pct: pct,
            unit_net_price: unitNet,
            subtotal_gross: Number((it.unit_cover_price * it.quantity).toFixed(2)),
            subtotal_net: Number((unitNet * it.quantity).toFixed(2)),
          };
        }),
      };
    });
    setOrderEditDirty(true);
  };

  const searchSuppliersForOrderSwap = async (
    qStr = orderSwapSupplierQuery,
    modeOverride?: 'SAVED' | 'HORUS'
  ) => {
    if (!openOrderWorkspace) return;
    const effMode = modeOverride || orderSwapSupplierMode;
    setLoadingOrderSwapSuppliers(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        branch_id: String(openOrderWorkspace.order.branch_id),
        company_id: String(companyId),
        only_configured: effMode === 'SAVED' ? 'true' : 'false',
        limit: '60',
      });
      if (qStr.trim()) params.append('q', qStr.trim());
      const res = await fetch(`${apiUrl}/horus-purchases/suppliers/search?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        setOrderSwapSuppliersList(d.suppliers || []);
      }
    } catch {
      toast.error('Erro ao buscar fornecedores para troca.');
    } finally {
      setLoadingOrderSwapSuppliers(false);
    }
  };

  const handleSelectNewSupplierForOrder = async (sup: SupplierSummary) => {
    if (!openOrderWorkspace) return;
    const ord = openOrderWorkspace.order;
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
          branch_id: ord.branch_id,
          cod_grp_fornecedor: sup.cod_grp_fornecedor,
          cod_fornecedor: sup.cod_fornecedor,
          items: openOrderWorkspace.items.map((x) => ({
            cod_item: x.cod_item,
            quantity: x.quantity,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao revalidar itens para o novo fornecedor.');
      const refreshed: CartPurchaseItem[] = data.items || [];
      const refMap = new Map<number, CartPurchaseItem>();
      refreshed.forEach((r) => refMap.set(r.cod_item, r));

      let uncfgCount = 0;
      setOpenOrderWorkspace((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((it) => {
          const rf = refMap.get(it.cod_item);
          if (!rf) return it;
          if (!rf.publisher_configured) uncfgCount += 1;
          return {
            ...it,
            unit_cover_price: rf.vlr_capa,
            discount_pct: rf.discount_pct,
            unit_net_price: rf.unit_net_price,
            subtotal_gross: rf.subtotal_gross,
            subtotal_net: rf.subtotal_net,
            publisher_configured: rf.publisher_configured,
            validation_warning: rf.validation_warning,
          };
        });
        return { ...prev, items: nextItems };
      });
      setOrderEditSupplier({
        cod_grp_fornecedor: sup.cod_grp_fornecedor,
        cod_fornecedor: sup.cod_fornecedor,
        nome_fornecedor: sup.nom_fornecedor,
        cnpj_fornecedor: sup.cnpj,
      });
      setShowOrderSupplierSwap(false);
      setOrderEditDirty(true);
      if (uncfgCount > 0) {
        toast.warning(
          `Fornecedor alterado para '${sup.nom_fornecedor}', porém ${uncfgCount} item(ns) são de editoras sem desconto configurado neste fornecedor.`
        );
      } else {
        toast.success(
          `Fornecedor alterado para '${sup.nom_fornecedor}'. Clique em Salvar Alterações para gravar no Horus.`
        );
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao trocar fornecedor do pedido.');
    }
  };

  const removeOrderWorkspaceItem = (codItem: number) => {
    setOpenOrderWorkspace((prev) => {
      if (!prev) return prev;
      if (prev.items.length <= 1) {
        toast.error('O pedido deve conter ao menos 1 item.');
        return prev;
      }
      return {
        ...prev,
        items: prev.items.filter((it) => it.cod_item !== codItem),
      };
    });
    setOrderEditDirty(true);
  };

  const mergeItemsIntoOrderWorkspace = (incoming: CartPurchaseItem[]) => {
    const uncfg = incoming.filter((x) => !x.publisher_configured);
    if (uncfg.length > 0) {
      toast.error(
        `A editora '${uncfg[0].nome_editora}' não possui desconto configurado para este fornecedor na filial.`
      );
      return;
    }
    setOpenOrderWorkspace((prev) => {
      if (!prev) return prev;
      const map = new Map<number, OrderWorkspaceItem>();
      prev.items.forEach((p) => map.set(p.cod_item, { ...p }));
      incoming.forEach((inc) => {
        const ex = map.get(inc.cod_item);
        if (ex) {
          const nq = ex.quantity + inc.quantity;
          map.set(inc.cod_item, {
            ...ex,
            quantity: nq,
            subtotal_gross: Number((ex.unit_cover_price * nq).toFixed(2)),
            subtotal_net: Number((ex.unit_net_price * nq).toFixed(2)),
          });
        } else {
          map.set(inc.cod_item, {
            cod_item: inc.cod_item,
            isbn: inc.isbn,
            nome_item: inc.nome_item,
            cod_editora: inc.cod_editora,
            nome_editora: inc.nome_editora,
            quantity: inc.quantity,
            unit_cover_price: inc.vlr_capa,
            discount_pct: inc.discount_pct,
            unit_net_price: inc.unit_net_price,
            subtotal_gross: inc.subtotal_gross,
            subtotal_net: inc.subtotal_net,
            stock_at_order: inc.stock_available,
            consigned_at_order: inc.consigned_received,
            publisher_configured: inc.publisher_configured,
          });
        }
      });
      return { ...prev, items: Array.from(map.values()) };
    });
    setOrderEditDirty(true);
  };

  const handleOrderWorkspaceAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openOrderWorkspace || !orderAddItemQuery.trim()) return;
    const ord = openOrderWorkspace.order;
    const effGrp = orderEditSupplier?.cod_grp_fornecedor ?? ord.cod_grp_fornecedor;
    const effForn = orderEditSupplier?.cod_fornecedor ?? ord.cod_fornecedor;
    setSearchingOrderAddItem(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/horus-purchases/items/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          branch_id: ord.branch_id,
          cod_grp_fornecedor: effGrp,
          cod_fornecedor: effForn,
          query: orderAddItemQuery.trim(),
          default_qty: Math.max(1, orderAddItemQty),
          limit: 20,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao buscar item.');
      const list: CartPurchaseItem[] = data.items || [];
      if (list.length === 1) {
        mergeItemsIntoOrderWorkspace([list[0]]);
        setOrderAddItemQuery('');
        setOrderAddLookupResults([]);
      } else {
        setOrderAddLookupResults(list);
        if (list.length === 0) toast.error('Nenhum item encontrado no Horus.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao pesquisar item.');
    } finally {
      setSearchingOrderAddItem(false);
    }
  };

  const handleOrderWorkspaceImportSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openOrderWorkspace || !orderSheetFile) return;
    if (orderSheetFile.size > MAX_SHEET_BYTES) {
      toast.error('O arquivo excede o limite máximo permitido de 10 MB.');
      return;
    }
    const ord = openOrderWorkspace.order;
    const effGrp = orderEditSupplier?.cod_grp_fornecedor ?? ord.cod_grp_fornecedor;
    const effForn = orderEditSupplier?.cod_fornecedor ?? ord.cod_fornecedor;
    setImportingOrderSheet(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('branch_id', String(ord.branch_id));
      fd.append('cod_grp_fornecedor', String(effGrp));
      fd.append('cod_fornecedor', String(effForn));
      fd.append('company_id', String(companyId));
      fd.append('file', orderSheetFile);
      const res = await fetch(`${apiUrl}/horus-purchases/items/import-sheet`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao importar arquivo.');
      mergeItemsIntoOrderWorkspace(data.items || []);
      setOrderSheetFile(null);
      setShowOrderSheetBar(false);
      toast.success('Itens mesclados ao pedido. Clique em Salvar Alterações para gravar no Horus.');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao importar arquivo.');
    } finally {
      setImportingOrderSheet(false);
    }
  };

  const handleSaveOrderEdits = async (targetHorusStatus?: 'AB' | 'AP' | 'AE') => {
    if (!openOrderWorkspace) return;
    const ord = openOrderWorkspace.order;
    const uncfg = openOrderWorkspace.items.find((x) => x.publisher_configured === false);
    if (uncfg) {
      toast.error(
        `A editora '${uncfg.nome_editora}' não possui desconto configurado para o fornecedor selecionado nesta filial.`
      );
      return;
    }
    setSavingOrderEdit(true);
    try {
      const token = getToken();
      const effGrp = orderEditSupplier?.cod_grp_fornecedor ?? ord.cod_grp_fornecedor;
      const effForn = orderEditSupplier?.cod_fornecedor ?? ord.cod_fornecedor;
      const res = await fetch(`${apiUrl}/horus-purchases/orders/${ord.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          cod_grp_fornecedor: effGrp,
          cod_fornecedor: effForn,
          compra_consig: orderEditConsig,
          gerar_pendencia: orderEditGerarPend,
          observations: orderEditObs,
          ...(targetHorusStatus ? { target_horus_status: targetHorusStatus } : {}),
          items: openOrderWorkspace.items.map((x) => ({
            cod_item: x.cod_item,
            quantity: x.quantity,
            discount_pct: x.discount_pct,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar pedido.');
      toast.success(data.message || 'Pedido atualizado no Horus e no Cronuz!');
      await openOrderInline(ord.id, 'ITEMS');
      fetchOrdersList(true);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar alterações do pedido.');
    } finally {
      setSavingOrderEdit(false);
    }
  };

  const orderWorkspaceTotals = useMemo(() => {
    if (!openOrderWorkspace) return { skus: 0, qty: 0, gross: 0, net: 0 };
    let qty = 0;
    let gross = 0;
    let net = 0;
    for (const it of openOrderWorkspace.items) {
      qty += it.quantity;
      gross += it.subtotal_gross;
      net += it.subtotal_net;
    }
    return { skus: openOrderWorkspace.items.length, qty, gross, net };
  }, [openOrderWorkspace]);

  // ── Exportação Excel & Transição de Status (AP -> AE) ──────────────────────
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
        throw new Error(err.detail || 'Erro ao exportar Excel.');
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
          ? 'Excel gerado e status alterado para AE (Aguardando Entrega) no Horus!'
          : 'Excel do Pedido baixado!'
      );
      fetchOrdersList(false);
      if (openOrderWorkspace?.order.id === orderId) {
        await openOrderInline(orderId, orderWorkspaceSubTab);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao exportar Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleManualStatusTransition = async (
    orderId: number,
    newHorusStatus: 'AB' | 'AP' | 'AE' | 'CA',
    reasonText?: string
  ) => {
    setChangingOrderStatus(true);
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
          reason: reasonText?.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao alterar status.');
      toast.success(data.message);
      setShowCancelOrderBar(false);
      setCancelOrderReason('');
      fetchOrdersList(false);
      if (openOrderWorkspace?.order.id === orderId) {
        await openOrderInline(orderId, orderWorkspaceSubTab);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao alterar status.');
    } finally {
      setChangingOrderStatus(false);
    }
  };

  // ── Selecionar / Trocar Fornecedor no Novo Pedido (Preserva Digitação!) ────
  const loadSupplierOverview = async (
    bid: number,
    codGrp: number,
    codForn: number,
    preserveCart = false
  ) => {
    setIsSupplierPickerOpen(false);
    setOpenMergePrompt(null);
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
      if (!res.ok) throw new Error((data as any).detail || 'Erro ao carregar dados do fornecedor.');
      setSupplierOverview(data);
      if (!preserveCart) {
        // Só abre painel de descontos automaticamente se o fornecedor ainda não tiver selo vinculado
        setDeskExpandedPanel(data.is_ready_for_purchase ? 'NONE' : 'DISCOUNTS');
      } else if (!data.is_ready_for_purchase) {
        setDeskExpandedPanel('DISCOUNTS');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar fornecedor.');
    } finally {
      setLoadingOverview(false);
    }
  };

  const handleSelectSupplierOnDesk = async (bid: number, codGrp: number, codForn: number) => {
    const hadItems = cartItems.length > 0;
    const prevSnapshot = [...cartItems];
    await loadSupplierOverview(bid, codGrp, codForn, hadItems);
    if (hadItems) {
      await refreshCurrentCart(bid, codGrp, codForn, prevSnapshot);
      toast.info('Fornecedor alterado! Itens em digitação mantidos e descontos recalculados.');
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

  // ── Selos & Descontos (%) do Fornecedor ────────────────────────────────────
  const searchHorusPublishers = async (q: string, forReconcile = false) => {
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
      toast.error('Selecione ao menos uma editora/selo.');
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
      toast.success(data.message || 'Selos vinculados!');
      setShowAddPublisherBox(false);
      setSelectedPubsForSupplier({});
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, true);
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
      loadSavedSuppliersForBranch(selectedBranchId, '');
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
      toast.success(`Desconto de '${discItem.nome_editora}' atualizado!`);
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
      toast.success('Selo removido.');
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, true);
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
      loadSavedSuppliersForBranch(selectedBranchId, '');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover selo.');
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
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao importar vínculos do Horus.');
    } finally {
      setSavingSupplierDiscounts(false);
    }
  };

  // ── Pesquisa Manual de Item & Importação de Planilha/TXT no Novo Pedido ────
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

  const handleLookupItems = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierOverview || selectedBranchId === null) {
      toast.error('Selecione o fornecedor antes de adicionar itens.');
      return;
    }
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Vincule os selos e descontos do fornecedor antes de digitar itens.');
      setDeskExpandedPanel('DISCOUNTS');
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
      } else {
        setItemLookupResults(list);
        if (list.length === 0) toast.error('Nenhum item encontrado no Horus.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro na busca de itens.');
    } finally {
      setSearchingItems(false);
    }
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

  const updateCartItemDiscount = (codItem: number, rawPct: number) => {
    const pct = Math.min(100, Math.max(0, Number(rawPct) || 0));
    setCartItems((prev) =>
      prev.map((it) => {
        if (it.cod_item !== codItem) return it;
        const unitNet = Number((it.vlr_capa * (1 - pct / 100)).toFixed(4));
        return {
          ...it,
          discount_pct: pct,
          unit_net_price: unitNet,
          subtotal_gross: Number((it.vlr_capa * it.quantity).toFixed(2)),
          subtotal_net: Number((unitNet * it.quantity).toFixed(2)),
        };
      })
    );
  };

  const handleQuickSaveGerarPendDefault = async (val: 'S' | 'N') => {
    if (selectedBranchId === null) return;
    setSavingQuickPendDefault(true);
    try {
      const token = getToken();
      const nextCfg: BranchConfigData = {
        ...branchConfigForm,
        gerar_pendencia_default: val,
      };
      const res = await fetch(`${apiUrl}/horus-purchases/branches/${selectedBranchId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          ...nextCfg,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar padrão de pendência.');
      setBranchConfigForm(nextCfg);
      setBranches((prev) =>
        prev.map((b) => (b.id === selectedBranchId ? { ...b, config: nextCfg } : b))
      );
      toast.success(
        `Padrão da filial atualizado: Gerar Pendência = ${val === 'S' ? 'SIM' : 'NÃO'}.`
      );
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar padrão de pendência.');
    } finally {
      setSavingQuickPendDefault(false);
    }
  };

  const handleQtyKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    totalRows: number,
    prefix = 'compras-qty'
  ) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const nextIdx = (rowIndex + 1) % totalRows;
      const el = document.getElementById(`${prefix}-${nextIdx}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (rowIndex - 1 + totalRows) % totalRows;
      const el = document.getElementById(`${prefix}-${prevIdx}`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    }
  };

  const handleImportSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierOverview || selectedBranchId === null) {
      toast.error('Selecione o fornecedor antes de importar.');
      return;
    }
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Configure os selos e descontos do fornecedor antes de importar.');
      setDeskExpandedPanel('DISCOUNTS');
      return;
    }
    if (intakeMode === 'EXCEL' && !sheetFile) {
      toast.error('Selecione um arquivo (.xlsx, .csv ou .txt).');
      return;
    }
    if (intakeMode === 'TEXT' && !sheetPastedText.trim()) {
      toast.error('Cole os ISBNs e quantidades.');
      return;
    }
    if (sheetFile && sheetFile.size > MAX_SHEET_BYTES) {
      toast.error('O arquivo excede o limite máximo permitido de 10 MB.');
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
      if (!res.ok) throw new Error(data.detail || 'Erro ao processar arquivo.');

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
      setShowDeskImportBar(false);
      setSheetFile(null);
      setSheetPastedText('');

      if (data.unconfigured_publishers_count > 0) {
        toast.warning(
          `${imported.length} item(ns) carregado(s); ${data.unconfigured_publishers_count} com selo não vinculado ao fornecedor.`
        );
      } else {
        toast.success(`${imported.length} item(ns) carregado(s) na grade!`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao importar arquivo.');
    } finally {
      setImportingSheet(false);
    }
  };

  // ── Conciliação Inline de Editora no Horus ─────────────────────────────────
  const startInlineReconcile = (codItems: number[]) => {
    if (!codItems.length) return;
    setReconcileTargetCods(codItems);
    setSelectedReconcilePub(null);
    setReconcileSearch('');
    searchHorusPublishers('', true);
  };

  const handleConfirmCartReconcile = async () => {
    if (!selectedReconcilePub || !reconcileTargetCods.length || !supplierOverview || selectedBranchId === null)
      return;
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
          cod_items: reconcileTargetCods,
          new_cod_editora: selectedReconcilePub.cod_editora,
          origin_module: 'COMPRAS',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao conciliar editora.');
      toast.success(data.message);
      setReconcileTargetCods([]);
      setCheckedCartCods({});
      await refreshCurrentCart(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, cartItems);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar editora no Horus.');
    } finally {
      setSavingReconcile(false);
    }
  };

  // ── Criar Pedido (com detecção automática de pedidos em aberto sem conferência) ──
  const executeCreateNewPurchaseOrder = async () => {
    if (!supplierOverview || selectedBranchId === null) return;
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
          gerar_pendencia: gerarPendencia,
          initial_horus_status: initialHorusStatus,
          observations: orderObservations,
          items: cartItems.map((x) => ({
            cod_item: x.cod_item,
            quantity: x.quantity,
            discount_pct: x.discount_pct,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Falha ao gravar pedido no Horus.');

      toast.success(
        data.message || `Pedido #${data.horus_cod_pedido} gerado no Horus!`
      );
      setOpenMergePrompt(null);
      setCartItems([]);
      setCheckedCartCods({});
      setOrderObservations('');
      await fetchOrdersList(true);
      setActiveMainTab('ORDERS');
      await openOrderInline(data.order_id, 'ITEMS');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar pedido.');
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleAppendToCandidateOrder = async () => {
    if (!openMergePrompt || !openMergePrompt.selectedOrderId) return;
    setAppendingToExisting(true);
    try {
      const token = getToken();
      const targetId = openMergePrompt.selectedOrderId;
      const res = await fetch(`${apiUrl}/horus-purchases/orders/${targetId}/append-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company_id: companyId,
          observations: orderObservations.trim() || undefined,
          items: cartItems.map((x) => ({
            cod_item: x.cod_item,
            quantity: x.quantity,
            discount_pct: x.discount_pct,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao acrescentar itens ao pedido existente.');

      toast.success(data.message || 'Itens acrescentados ao pedido existente com sucesso!');
      setOpenMergePrompt(null);
      setCartItems([]);
      setCheckedCartCods({});
      setOrderObservations('');
      await fetchOrdersList(true);
      setActiveMainTab('ORDERS');
      await openOrderInline(targetId, 'ITEMS');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao mesclar itens no pedido existente.');
    } finally {
      setAppendingToExisting(false);
    }
  };

  const handleCreatePurchaseOrder = async () => {
    if (!supplierOverview || selectedBranchId === null) {
      toast.error('Selecione o fornecedor antes de gerar o pedido.');
      return;
    }
    if (!supplierOverview.is_ready_for_purchase) {
      toast.error('Configure os selos e descontos do fornecedor nesta filial.');
      setDeskExpandedPanel('DISCOUNTS');
      return;
    }
    if (!cartItems.length) {
      toast.error('Adicione itens à grade do pedido.');
      return;
    }
    if (cartSummary.invalidCount > 0) {
      toast.error('Resolva os itens sem selo/preço antes de gravar o pedido.');
      return;
    }

    // Verifica se já existe pedido em aberto/aprovado/aguardando conferência SEM itens conferidos
    setCreatingOrder(true);
    try {
      const token = getToken();
      const sup = supplierOverview.supplier;
      const params = new URLSearchParams({
        company_id: String(companyId),
        branch_id: String(selectedBranchId),
        cod_grp_fornecedor: String(sup.cod_grp_fornecedor),
        cod_fornecedor: String(sup.cod_fornecedor),
      });
      const candRes = await fetch(
        `${apiUrl}/horus-purchases/orders/open-candidates?${params.toString()}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (candRes.ok) {
        const candData = await candRes.json();
        const candidates: OpenOrderCandidate[] = candData.candidates || [];
        if (candidates.length > 0) {
          setOpenMergePrompt({
            candidates,
            selectedOrderId: candidates[0].id,
          });
          setCreatingOrder(false);
          return;
        }
      }
    } catch {
      // Se falhar a consulta preventiva, segue fluxo normal de criação
    }

    await executeCreateNewPurchaseOrder();
  };

  // ── Upload & Análise de XML da NF-e (Inline no Pedido ou na Aba XML) ───────
  const handleUploadAndAnalyzeXml = async (
    e: React.FormEvent,
    forcedOrderId?: number | null,
    forcedBranchId?: number | null
  ) => {
    e.preventDefault();
    if (!xmlUploadFile) {
      toast.error('Selecione o arquivo .xml da NF-e.');
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
      const effBid = forcedBranchId ?? selectedBranchId;
      if (effBid !== null && effBid !== undefined) fd.append('branch_id', String(effBid));
      if (forcedOrderId) {
        fd.append('order_id', String(forcedOrderId));
      } else if (xmlTargetOrderId) {
        fd.append('order_id', xmlTargetOrderId);
      }

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
        toast.warning(data.message || 'XML analisado com divergências identificadas.');
      }

      setXmlUploadFile(null);
      if (orderXmlInputRef.current) orderXmlInputRef.current.value = '';
      if (standaloneXmlInputRef.current) standaloneXmlInputRef.current.value = '';

      await fetchXmlAuditsList(true);
      await fetchOrdersList(true);

      if (forcedOrderId) {
        await openOrderInline(forcedOrderId, 'XML');
      } else {
        await loadXmlAuditDetailInline(auditSummary.id, true);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao processar XML.');
    } finally {
      setAnalyzingXml(false);
    }
  };

  const handleSubmitXmlDecision = async (
    targetStatus: 'XML_OK' | 'ACCEPTED_WITH_DIVERGENCE' | 'REJECTED'
  ) => {
    if (!activeXmlDetail) return;
    const trimmedNotes = decisionNotesDraft.trim();
    if (
      (targetStatus === 'ACCEPTED_WITH_DIVERGENCE' || targetStatus === 'REJECTED') &&
      trimmedNotes.length < 5
    ) {
      toast.error(
        targetStatus === 'ACCEPTED_WITH_DIVERGENCE'
          ? 'Pontue o motivo no parecer antes de Aceitar com Divergência.'
          : 'Pontue o motivo da recusa no parecer antes de Recusar o XML.'
      );
      return;
    }
    if (
      targetStatus === 'XML_OK' &&
      activeXmlDetail.audit.diagnostic_status === 'HAS_DIVERGENCE' &&
      trimmedNotes.length < 5
    ) {
      toast.error('Esta NF possui divergências. Use "Aceitar c/ Divergência" ou justifique no parecer.');
      return;
    }

    setSavingXmlDecision(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${apiUrl}/horus-purchases/xml-audits/${activeXmlDetail.audit.id}/decision`,
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
      await loadXmlAuditDetailInline(activeXmlDetail.audit.id, openStandaloneXmlWorkspace);
      fetchXmlAuditsList(true);
      fetchOrdersList(true);
      if (openOrderWorkspace && openOrderWorkspace.order.id === activeXmlDetail.audit.order_id) {
        await openOrderInline(openOrderWorkspace.order.id, 'XML');
      }
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
      if (!res.ok) throw new Error('Falha ao baixar planilha.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Auditoria_XML_NF_${nfeNum}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Planilha da conferência XML baixada!');
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
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar configuração.');
      toast.success(data.message || 'Parametrização salva!');
      fetchBranches(companyId, selectedBranchId);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar configuração.');
    } finally {
      setSavingBranchConfig(false);
    }
  };

  // ── Memos Auxiliares ───────────────────────────────────────────────────────
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

  const filteredXmlItems = useMemo(() => {
    if (!activeXmlDetail) return [];
    if (xmlItemFilter === 'DIVERGENT') {
      return activeXmlDetail.items.filter((x) => x.line_status === 'DIVERGENT');
    }
    if (xmlItemFilter === 'OK') {
      return activeXmlDetail.items.filter((x) => x.line_status === 'OK');
    }
    return activeXmlDetail.items;
  }, [activeXmlDetail, xmlItemFilter]);

  const supplierQuickStats = useMemo(() => {
    const h = supplierOverview?.history;
    return {
      lastCompra: h?.entradas_compra?.[0] || null,
      consigUnits: h?.consigned_balance_summary?.total_units || 0,
      lastAcerto: h?.acertos_consignacao?.[0] || null,
      lastDevol: h?.devolucoes?.[0] || null,
    };
  }, [supplierOverview]);

  const activeSuppliersInDropdown =
    supplierPickerMode === 'SAVED' ? savedSuppliersList : horusSuppliersList;

  // ── Renderizador Reutilizável de Conferência XML Inline (Sem Modal) ────────
  const renderInlineXmlComparisonPanel = () => {
    if (loadingXmlDetail) {
      return (
        <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          Carregando conferência linha a linha do XML...
        </div>
      );
    }
    if (!activeXmlDetail) {
      return (
        <div className="p-6 text-center text-xs text-slate-500 bg-slate-50/70 dark:bg-slate-900/40 rounded-lg border border-dashed border-slate-300 dark:border-slate-800">
          Nenhum arquivo XML da NF-e anexado ainda para este pedido. Envie o XML acima para validar Preço de Capa, Desconto (%) e Quantidade antes da chegada física.
        </div>
      );
    }

    const aud = activeXmlDetail.audit;
    return (
      <div className="space-y-2.5">
        {/* Tira Sintetizada de Resumo Pedido x XML */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <strong className="text-slate-800 dark:text-slate-100">NF-e {aud.numero_nf}</strong>
              {aud.serie_nf ? `/${aud.serie_nf}` : ''} ({formatDateBr(aud.data_emissao)})
            </span>
            <span className="text-slate-500">
              Peças: <strong className="font-mono text-slate-800 dark:text-slate-200">{aud.order_total_qty}</strong> ped ×{' '}
              <strong className={`font-mono ${aud.xml_total_qty !== aud.order_total_qty ? 'text-amber-700' : 'text-emerald-700'}`}>
                {aud.xml_total_qty}
              </strong>{' '}
              XML
            </span>
            <span className="text-slate-500">
              Líquido: <strong className="font-mono text-slate-800 dark:text-slate-200">{formatMoney(aud.order_total_net)}</strong> ped ×{' '}
              <strong className="font-mono text-indigo-700 dark:text-indigo-300">{formatMoney(aud.xml_total_products_net)}</strong> XML
            </span>
            {aud.xml_ipi_st_outros > 0 && (
              <span className="text-slate-500">
                Total NF: <strong className="font-mono">{formatMoney(aud.xml_total_nf)}</strong>
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getXmlDecisionBadgeClass(
                aud.decision_status
              )}`}
            >
              {aud.decision_label}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {(['ALL', 'DIVERGENT', 'OK'] as const).map((fKey) => (
              <button
                key={fKey}
                type="button"
                onClick={() => setXmlItemFilter(fKey)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                  xmlItemFilter === fKey
                    ? 'bg-indigo-600 text-white border-indigo-700'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                {fKey === 'ALL'
                  ? `Todos (${activeXmlDetail.items.length})`
                  : fKey === 'DIVERGENT'
                    ? `Divergentes (${aud.divergent_items_count})`
                    : `OK (${aud.matched_ok_count})`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleDownloadXmlAuditExcel(aud.id, aud.numero_nf)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Excel XML
            </button>
          </div>
        </div>

        {aud.header_warnings && aud.header_warnings.length > 0 && (
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex flex-wrap gap-3">
            {aud.header_warnings.map((w, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 font-medium">
                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                {w}
              </span>
            ))}
          </div>
        )}

        {/* Grade Comparativa Compacta (Pedido x XML) */}
        <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <th className="py-1.5 px-2 w-10 text-center">#</th>
                <th className="py-1.5 px-2 w-28">ISBN / EAN</th>
                <th className="py-1.5 px-2">Título</th>
                <th className="py-1.5 px-2 text-center w-20">Qtd (P|X)</th>
                <th className="py-1.5 px-2 text-right w-28">Capa (Ped | XML)</th>
                <th className="py-1.5 px-2 text-right w-28">Desc% (Ped | XML)</th>
                <th className="py-1.5 px-2 text-right w-28">Líq.Un (Ped | XML)</th>
                <th className="py-1.5 px-2 w-40">Diagnóstico</th>
                <th className="py-1.5 px-2 w-48">Pontuação no Item</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredXmlItems.map((it, idx) => {
                const isDiv = it.line_status === 'DIVERGENT';
                return (
                  <tr
                    key={it.id}
                    className={
                      isDiv
                        ? 'bg-amber-50/45 dark:bg-amber-950/20 hover:bg-amber-50/80'
                        : idx % 2 === 1
                          ? 'bg-slate-50/50 dark:bg-slate-900/40'
                          : ''
                    }
                  >
                    <td className="py-1.5 px-2 text-center font-mono text-slate-500">
                      {it.xml_n_item ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-slate-700 dark:text-slate-300">
                      {it.isbn || it.xml_ean || it.xml_cprod || '—'}
                    </td>
                    <td className="py-1.5 px-2 font-medium text-slate-900 dark:text-slate-100 max-w-[230px] truncate" title={it.title}>
                      {it.title}
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono">
                      <span>{it.order_qty}</span>
                      <span className="text-slate-400 mx-1">|</span>
                      <strong className={it.has_qty_diff ? 'text-rose-700' : 'text-emerald-700'}>
                        {it.xml_qty}
                      </strong>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      <span>{it.order_cover_price > 0 ? it.order_cover_price.toFixed(2) : '—'}</span>
                      <span className="text-slate-400 mx-1">|</span>
                      <strong className={it.has_cover_diff ? 'text-amber-700' : 'text-slate-800 dark:text-slate-200'}>
                        {it.xml_cover_price > 0 ? it.xml_cover_price.toFixed(2) : '—'}
                      </strong>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      <span>{it.order_discount_pct > 0 ? `${it.order_discount_pct.toFixed(1)}%` : '—'}</span>
                      <span className="text-slate-400 mx-1">|</span>
                      <strong className={it.has_discount_diff ? 'text-rose-700' : 'text-emerald-700'}>
                        {it.xml_effective_discount_pct > 0 ? `${it.xml_effective_discount_pct.toFixed(1)}%` : '0%'}
                      </strong>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      <span>{it.order_unit_net > 0 ? it.order_unit_net.toFixed(2) : '—'}</span>
                      <span className="text-slate-400 mx-1">|</span>
                      <strong className="text-slate-900 dark:text-white">
                        {it.xml_unit_net > 0 ? it.xml_unit_net.toFixed(2) : '—'}
                      </strong>
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex flex-wrap gap-1">
                        {(it.divergence_tags || ['OK']).map((tg) => {
                          const b = formatTagLabel(tg);
                          return (
                            <span
                              key={tg}
                              className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${b.cls}`}
                              title={it.divergence_summary || ''}
                            >
                              {b.text}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={itemNotesDraft[it.id] || ''}
                        onChange={(e) =>
                          setItemNotesDraft((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                        placeholder="Anotar item..."
                        className="w-full px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] focus:outline-none focus:border-indigo-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Barra Compacta de Parecer e Decisão sobre o XML */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="text"
              value={decisionNotesDraft}
              onChange={(e) => setDecisionNotesDraft(e.target.value)}
              placeholder="Parecer / observação da conferência (obrigatório ao aceitar c/ divergência ou recusar)..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:border-indigo-500"
            />
            {aud.order_horus_status === 'AP' && (
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={decisionAdvanceToAe}
                  onChange={(e) => setDecisionAdvanceToAe(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Mudar AP ➔ AE no Horus
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={savingXmlDecision}
              onClick={() => handleSubmitXmlDecision('XML_OK')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aceitar XML OK
            </button>
            <button
              type="button"
              disabled={savingXmlDecision}
              onClick={() => handleSubmitXmlDecision('ACCEPTED_WITH_DIVERGENCE')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Aceitar c/ Divergência
            </button>
            <button
              type="button"
              disabled={savingXmlDecision}
              onClick={() => handleSubmitXmlDecision('REJECTED')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" />
              Recusar XML
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-2.5 pb-12 font-sans text-xs">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MENU FIXO NO TOPO (1º PEDIDOS | 2º NOVO PEDIDO | 3º XML | 4º FILIAL)  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <HorusComprasPinnedNavBar
        activeTab={activeMainTab}
        onSelectTab={(tab) => {
          setActiveMainTab(tab);
          if (tab !== 'ORDERS') setOpenOrderWorkspace(null);
          if (tab !== 'XML_AUDIT') setOpenStandaloneXmlWorkspace(false);
        }}
        ordersCount={ordersList.length}
        pendingXmlCount={xmlKpis.pending_review}
        xmlOkCount={xmlKpis.xml_ok}
      />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 1 (INICIAL): PEDIDOS — LISTA COMPACTA OU FICHA INLINE SEM MODAL   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'ORDERS' && (
        <div className="space-y-2.5">
          {!openOrderWorkspace ? (
            <>
              {/* Barra de Filtros Compacta de Pedidos */}
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Seletor Compacto de Filial */}
                  <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <select
                      disabled={loadingBranches}
                      value={selectedBranchId ?? ''}
                      onChange={(e) => setSelectedBranchId(Number(e.target.value))}
                      className="bg-transparent text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id} className="text-slate-900">
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Pesquisa rápida de pedido / fornecedor / NF */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      fetchOrdersList(false);
                    }}
                    className="relative w-56 sm:w-64"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={orderSearchFilter}
                      onChange={(e) => setOrderSearchFilter(e.target.value)}
                      placeholder="Nº pedido, fornecedor, CNPJ ou NF..."
                      className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                  </form>

                  {/* Pílulas de Status (Oculta Finalizados EE por padrão em ACTIVE) */}
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: 'ACTIVE', label: 'Em Andamento' },
                      { id: 'AB', label: 'Digitação (AB)' },
                      { id: 'AP', label: 'Aprovados (AP)' },
                      { id: 'AE', label: 'Aguard. Entrega (AE)' },
                      { id: 'CA', label: 'Cancelados (CA)' },
                      { id: 'XML_OK', label: 'XML OK' },
                      { id: 'XML_PENDING', label: 'XML Divergente' },
                      { id: 'FINALIZED', label: 'Finalizados (EE)' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setOrderStatusFilter(st.id)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                          orderStatusFilter === st.id
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-500 font-bold'
                            : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ações únicas no topo */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fetchOrdersList(false)}
                    disabled={loadingOrders}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    title="Sincronizar status diretamente com PEDIDOS_COMPRA do Horus"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin text-indigo-600' : ''}`} />
                    Sincronizar Horus
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMainTab('DESK')}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Pedido
                  </button>
                </div>
              </div>

              {/* Grade Datasheet Estilo Access Moderno — Pedidos */}
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <th className="py-1.5 px-2.5 w-24">Pedido #</th>
                        <th className="py-1.5 px-2.5 w-24">Data</th>
                        <th className="py-1.5 px-2.5 w-36">Filial</th>
                        <th className="py-1.5 px-2.5">Fornecedor</th>
                        <th className="py-1.5 px-2.5 text-center w-20">Mod.</th>
                        <th className="py-1.5 px-2.5 text-right w-24">Tít / Peças</th>
                        <th className="py-1.5 px-2.5 text-right w-28">Total Líquido</th>
                        <th className="py-1.5 px-2.5 text-center w-36">Status Pedido</th>
                        <th className="py-1.5 px-2.5 text-center w-36">Status XML</th>
                        <th className="py-1.5 px-2.5 text-right w-28">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {loadingOrders ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500">
                            <RefreshCw className="w-4 h-4 animate-spin inline mr-1.5 text-indigo-600" />
                            Sincronizando pedidos com o Horus...
                          </td>
                        </tr>
                      ) : ordersList.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-500">
                            Nenhum pedido de compra nesta visão.
                          </td>
                        </tr>
                      ) : (
                        ordersList.map((ord, idx) => {
                          const isSel = idx === selectedOrderIndex;
                          return (
                            <tr
                              key={ord.id}
                              onClick={() => setSelectedOrderIndex(idx)}
                              onDoubleClick={() => openOrderInline(ord.id, 'ITEMS')}
                              className={`cursor-pointer transition-colors ${
                                isSel
                                  ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                                  : idx % 2 === 1
                                    ? 'bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100/70'
                                    : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <td className="py-1.5 px-2.5 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                #{ord.horus_cod_pedido || ord.id}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-slate-600 dark:text-slate-400">
                                {formatDateBr(ord.created_at)}
                              </td>
                              <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                                {ord.branch_name}
                              </td>
                              <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[260px]">
                                #{ord.cod_fornecedor} — {ord.nome_fornecedor}
                              </td>
                              <td className="py-1.5 px-2.5 text-center">
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                  {ord.compra_consig === 'S' ? 'Consig.' : 'Firme'}
                                </span>
                              </td>
                              <td className="py-1.5 px-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                                {ord.total_skus} / <strong>{ord.total_quantity}</strong>
                              </td>
                              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                                {formatMoney(ord.total_net)}
                              </td>
                              <td className="py-1.5 px-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${getHorusStatusBadgeClass(
                                    ord.horus_status
                                  )}`}
                                >
                                  {ord.status_label}
                                </span>
                              </td>
                              <td className="py-1.5 px-2.5 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${getXmlDecisionBadgeClass(
                                    ord.xml_status
                                  )}`}
                                >
                                  {ord.last_nfe_number
                                    ? `NF ${ord.last_nfe_number} • ${ord.xml_status_label}`
                                    : ord.xml_status_label}
                                </span>
                              </td>
                              <td className="py-1.5 px-2.5 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      openOrderInline(ord.id, 'ITEMS');
                                    }}
                                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 hover:text-indigo-700 text-[10px] font-bold cursor-pointer"
                                  >
                                    {ord.horus_status === 'AB' ||
                                    ord.horus_status === 'AP' ||
                                    ord.horus_status === 'AE'
                                      ? 'Editar / Ver'
                                      : 'Abrir'}
                                  </button>
                                  {(ord.horus_status === 'AE' || ord.horus_status === 'AP') && (
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        openOrderInline(ord.id, 'XML');
                                      }}
                                      className="px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold cursor-pointer"
                                      title="Validar XML da NF-e neste pedido"
                                    >
                                      XML
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Barra Inferior Estilo Access */}
                <div className="bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={ordersList.length === 0}
                      onClick={() => setSelectedOrderIndex(0)}
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={selectedOrderIndex <= 0}
                      onClick={() => setSelectedOrderIndex((p) => Math.max(0, p - 1))}
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono px-1.5">
                      Registro {ordersList.length === 0 ? 0 : selectedOrderIndex + 1} de {ordersList.length}
                    </span>
                    <button
                      type="button"
                      disabled={selectedOrderIndex >= ordersList.length - 1}
                      onClick={() => setSelectedOrderIndex((p) => Math.min(ordersList.length - 1, p + 1))}
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={ordersList.length === 0}
                      onClick={() => setSelectedOrderIndex(Math.max(0, ordersList.length - 1))}
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-slate-400 ml-2 hidden sm:inline">
                      Duplo clique na linha abre o pedido na tela
                    </span>
                  </div>

                  <div className="font-mono">
                    Soma Líquida Visível:{' '}
                    <strong className="text-slate-900 dark:text-white">{formatMoney(ordersTotalNetSum)}</strong>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── FICHA INLINE DO PEDIDO SELECIONADO (SEM MODAL!) ── */
            (() => {
              const ord = openOrderWorkspace.order;
              const safety = ord.safety;
              const canModifyOrder = safety
                ? safety.can_modify
                : ['AB', 'AP', 'AE'].includes(ord.horus_status);
              const canCancelOrder = safety
                ? safety.can_cancel
                : ['AB', 'AP', 'AE'].includes(ord.horus_status);
              const canReopenOrder = safety ? safety.can_reopen : ord.horus_status === 'CA';
              const displaySupplierName =
                orderEditSupplier?.nome_fornecedor || ord.nome_fornecedor;
              const displaySupplierCode =
                orderEditSupplier?.cod_fornecedor ?? ord.cod_fornecedor;
              const supplierWasChanged =
                Boolean(orderEditSupplier) &&
                (orderEditSupplier!.cod_fornecedor !== ord.cod_fornecedor ||
                  orderEditSupplier!.cod_grp_fornecedor !== ord.cod_grp_fornecedor);

              return (
                <div className="space-y-2.5">
                  {/* Cabeçalho Compacto da Ficha do Pedido */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenOrderWorkspace(null);
                          setActiveXmlDetail(null);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Voltar
                      </button>

                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />

                      <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
                        Pedido #{ord.horus_cod_pedido || ord.id}
                      </span>

                      <span className="font-bold text-slate-900 dark:text-white truncate max-w-md">
                        #{displaySupplierCode} — {displaySupplierName}
                      </span>
                      {supplierWasChanged && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                          Fornecedor trocado (não salvo)
                        </span>
                      )}

                      {canModifyOrder && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = !showOrderSupplierSwap;
                            setShowOrderSupplierSwap(next);
                            if (next) searchSuppliersForOrderSwap('', orderSwapSupplierMode);
                          }}
                          className="px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold cursor-pointer"
                          title="Trocar o fornecedor deste pedido e recalcular descontos"
                        >
                          Trocar Fornecedor
                        </button>
                      )}

                      <span className="text-[11px] text-slate-500">({ord.branch_name})</span>

                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getHorusStatusBadgeClass(
                          ord.horus_status
                        )}`}
                      >
                        {ord.status_label}
                      </span>

                      <span className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        Pendência: {orderEditGerarPend === 'N' ? 'NÃO' : 'SIM'}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getXmlDecisionBadgeClass(
                          ord.xml_status
                        )}`}
                      >
                        {ord.xml_status_label}
                      </span>
                    </div>

                    {/* Ações Contextuais em Linha Única (Salvar | Status AB/AP/AE | Excel | Cancelar / Reativar) */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {canModifyOrder && (
                        <>
                          <button
                            type="button"
                            disabled={savingOrderEdit || !orderEditDirty}
                            onClick={() => handleSaveOrderEdits()}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {savingOrderEdit ? 'Salvando...' : 'Salvar Alterações'}
                          </button>

                          {/* Transições seguras de Status entre AB (Digitação), AP (Aprovado) e AE (Aguard. Entrega) */}
                          <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5 gap-0.5">
                            {(['AB', 'AP', 'AE'] as const).map((stCode) => {
                              const isCurrent = ord.horus_status === stCode;
                              const labelMap = {
                                AB: 'Digitação (AB)',
                                AP: 'Aprovado (AP)',
                                AE: 'Aguard. (AE)',
                              };
                              return (
                                <button
                                  key={stCode}
                                  type="button"
                                  disabled={isCurrent || changingOrderStatus}
                                  onClick={() =>
                                    orderEditDirty
                                      ? handleSaveOrderEdits(stCode)
                                      : handleManualStatusTransition(ord.id, stCode)
                                  }
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                    isCurrent
                                      ? 'bg-slate-900 text-white dark:bg-indigo-600 cursor-default'
                                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-800'
                                  }`}
                                  title={
                                    isCurrent
                                      ? `Status atual: ${stCode}`
                                      : `Mudar status deste pedido para ${labelMap[stCode]} no Horus`
                                  }
                                >
                                  {labelMap[stCode]}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {ord.horus_status !== 'CA' && (
                        <button
                          type="button"
                          disabled={exportingExcel}
                          onClick={() => handleExportOrderExcel(ord.id, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Excel
                        </button>
                      )}

                      {canModifyOrder && (ord.horus_status === 'AP' || ord.horus_status === 'AB') && (
                        <button
                          type="button"
                          disabled={exportingExcel}
                          onClick={() => handleExportOrderExcel(ord.id, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Excel + AE
                        </button>
                      )}

                      {canCancelOrder && (
                        <button
                          type="button"
                          disabled={changingOrderStatus}
                          onClick={() => setShowCancelOrderBar((v) => !v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-[11px] font-bold cursor-pointer"
                          title="Cancelar pedido no Horus mantendo histórico no Cronuz"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancelar (CA)
                        </button>
                      )}

                      {canReopenOrder && (
                        <>
                          <button
                            type="button"
                            disabled={changingOrderStatus}
                            onClick={() =>
                              handleManualStatusTransition(
                                ord.id,
                                'AB',
                                'Pedido reativado para Em Digitação (AB) via Cronuz B2B'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Voltar p/ Digitação (AB)
                          </button>
                          <button
                            type="button"
                            disabled={changingOrderStatus}
                            onClick={() =>
                              handleManualStatusTransition(
                                ord.id,
                                'AP',
                                'Pedido reativado como Aprovado (AP) via Cronuz B2B'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Reativar Aprovado (AP)
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Alerta de Segurança caso o pedido tenha itens conferidos, NF vinculada ou esteja finalizado */}
                  {safety?.block_reason && ord.horus_status !== 'CA' && (
                    <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/35 border border-rose-300 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-900 dark:text-rose-200">
                      <div className="flex items-center gap-2 font-semibold">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          <strong>Trava de Segurança:</strong> {safety.block_reason}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        {safety.conferred_qty > 0 && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 font-bold">
                            Conferidos: {safety.conferred_qty} pçs
                          </span>
                        )}
                        {safety.linked_nf_count > 0 && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 font-bold">
                            NFs vinculadas: {safety.linked_nf_count}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Barra Inline de Confirmação de Cancelamento (CA) */}
                  {showCancelOrderBar && canCancelOrder && (
                    <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-[11px] font-bold text-rose-900 dark:text-rose-200 shrink-0">
                          Cancelar Pedido #{ord.horus_cod_pedido || ord.id} (mantém histórico p/ reativar):
                        </span>
                        <input
                          type="text"
                          value={cancelOrderReason}
                          onChange={(e) => setCancelOrderReason(e.target.value)}
                          placeholder="Motivo do cancelamento (opcional)..."
                          className="flex-1 px-2.5 py-1 rounded-lg border border-rose-300 bg-white dark:bg-slate-900 text-[11px]"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={changingOrderStatus}
                          onClick={() =>
                            handleManualStatusTransition(
                              ord.id,
                              'CA',
                              cancelOrderReason || 'Cancelado pelo usuário via Cronuz B2B'
                            )
                          }
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          {changingOrderStatus ? 'Cancelando...' : 'Confirmar Cancelamento (CA)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCancelOrderBar(false)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold cursor-pointer"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Barra Inline de Troca de Fornecedor no Pedido */}
                  {showOrderSupplierSwap && canModifyOrder && (
                    <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-800 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                            Trocar Fornecedor do Pedido (recalcula descontos automaticamente):
                          </span>
                          <div className="inline-flex p-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => {
                                setOrderSwapSupplierMode('SAVED');
                                searchSuppliersForOrderSwap(orderSwapSupplierQuery, 'SAVED');
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                orderSwapSupplierMode === 'SAVED'
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-600'
                              }`}
                            >
                              Salvos na Filial
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOrderSwapSupplierMode('HORUS');
                                searchSuppliersForOrderSwap(orderSwapSupplierQuery, 'HORUS');
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                orderSwapSupplierMode === 'HORUS'
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-600'
                              }`}
                            >
                              Horus SQL
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={orderSwapSupplierQuery}
                            onChange={(e) => setOrderSwapSupplierQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchSuppliersForOrderSwap(orderSwapSupplierQuery);
                              }
                            }}
                            placeholder="Nome, CNPJ ou código..."
                            className="w-52 px-2.5 py-1 rounded-lg border border-indigo-300 bg-white dark:bg-slate-900 text-[11px]"
                          />
                          <button
                            type="button"
                            disabled={loadingOrderSwapSuppliers}
                            onClick={() => searchSuppliersForOrderSwap(orderSwapSupplierQuery)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold cursor-pointer"
                          >
                            {loadingOrderSwapSuppliers ? '...' : 'Buscar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowOrderSupplierSwap(false)}
                            className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] cursor-pointer"
                          >
                            Fechar
                          </button>
                        </div>
                      </div>

                      <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {orderSwapSuppliersList.map((sup) => (
                          <button
                            key={`${sup.cod_grp_fornecedor}-${sup.cod_fornecedor}`}
                            type="button"
                            onClick={() => handleSelectNewSupplierForOrder(sup)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-500 text-left flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                              #{sup.cod_fornecedor} — {sup.nom_fornecedor}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-700 shrink-0">
                              {sup.configured_publishers_count || 0} selo(s)
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Abas Internas Inline do Pedido: Itens | Validar XML da NF-e | Histórico */}
                  <div className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setOrderWorkspaceSubTab('ITEMS')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          orderWorkspaceSubTab === 'ITEMS'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Itens do Pedido ({orderWorkspaceTotals.skus} tít / {orderWorkspaceTotals.qty} pçs)
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderWorkspaceSubTab('XML')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          orderWorkspaceSubTab === 'XML'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        <FileCheck2 className="w-3.5 h-3.5" />
                        Validar XML da NF-e
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderWorkspaceSubTab('LOGS')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          orderWorkspaceSubTab === 'LOGS'
                            ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        <History className="w-3.5 h-3.5" />
                        Histórico ({openOrderWorkspace.logs.length})
                      </button>
                    </div>

                    <div className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      Bruto: <strong>{formatMoney(orderWorkspaceTotals.gross)}</strong> • Líquido:{' '}
                      <strong className="text-indigo-700 dark:text-indigo-300">
                        {formatMoney(orderWorkspaceTotals.net)}
                      </strong>
                    </div>
                  </div>

                  {/* SUB-ABA 1: ITENS DO PEDIDO (EDITÁVEL SE AB/AP/AE SEM CONFERÊNCIA/NF; LEITURA CASO CONTRÁRIO) */}
                  {orderWorkspaceSubTab === 'ITEMS' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                      {canModifyOrder && (
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <form onSubmit={handleOrderWorkspaceAddItem} className="flex items-center gap-1.5 flex-1 min-w-[260px] max-w-xl">
                              <input
                                type="text"
                                value={orderAddItemQuery}
                                onChange={(e) => setOrderAddItemQuery(e.target.value)}
                                placeholder="Adicionar item ao pedido (ISBN, Cód. ou Título)..."
                                className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] focus:outline-none focus:border-indigo-500"
                              />
                              <input
                                type="number"
                                min={1}
                                value={orderAddItemQty}
                                onChange={(e) => setOrderAddItemQty(Math.max(1, Number(e.target.value) || 1))}
                                className="w-16 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-center font-mono"
                              />
                              <button
                                type="submit"
                                disabled={searchingOrderAddItem}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                              >
                                {searchingOrderAddItem ? '...' : 'Inserir'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowOrderSheetBar((v) => !v)}
                                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                Planilha/TXT
                              </button>
                            </form>

                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={orderEditConsig}
                                onChange={(e) => {
                                  setOrderEditConsig(e.target.value as 'N' | 'S');
                                  setOrderEditDirty(true);
                                }}
                                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold"
                              >
                                <option value="N">Compra Firme</option>
                                <option value="S">Consignação</option>
                              </select>

                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]">
                                <span className="text-[10px] font-bold uppercase text-slate-500">
                                  Pendência:
                                </span>
                                <select
                                  value={orderEditGerarPend}
                                  onChange={(e) => {
                                    setOrderEditGerarPend(e.target.value as 'S' | 'N');
                                    setOrderEditDirty(true);
                                  }}
                                  className="bg-transparent font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                                >
                                  <option value="S">SIM</option>
                                  <option value="N">NÃO</option>
                                </select>
                              </div>

                              <input
                                type="text"
                                value={orderEditObs}
                                onChange={(e) => {
                                  setOrderEditObs(e.target.value);
                                  setOrderEditDirty(true);
                                }}
                                placeholder="Observação do pedido..."
                                className="w-52 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                              />
                            </div>
                          </div>

                          {showOrderSheetBar && (
                            <form onSubmit={handleOrderWorkspaceImportSheet} className="flex items-center gap-2 pt-1">
                              <input
                                type="file"
                                accept=".xlsx,.csv,.txt"
                                onChange={(e) => setOrderSheetFile(e.target.files?.[0] || null)}
                                className="text-[11px] text-slate-600"
                              />
                              <button
                                type="submit"
                                disabled={importingOrderSheet || !orderSheetFile}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                              >
                                {importingOrderSheet ? 'Importando...' : 'Carregar no Pedido'}
                              </button>
                            </form>
                          )}

                          {orderAddLookupResults.length > 1 && (
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                              {orderAddLookupResults.map((cand) => (
                                <div
                                  key={cand.cod_item}
                                  onClick={() => {
                                    mergeItemsIntoOrderWorkspace([cand]);
                                    setOrderAddLookupResults([]);
                                    setOrderAddItemQuery('');
                                  }}
                                  className="px-2.5 py-1.5 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer text-[11px]"
                                >
                                  <span>
                                    <strong className="font-mono">{cand.isbn || cand.cod_item}</strong> — {cand.nome_item} ({cand.nome_editora})
                                  </span>
                                  <span className="font-mono font-bold text-indigo-700">
                                    {formatMoney(cand.vlr_capa)} (-{cand.discount_pct}%)
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                              <th className="py-1.5 px-2.5 w-28">ISBN</th>
                              <th className="py-1.5 px-2 w-16">Cód.</th>
                              <th className="py-1.5 px-2.5">Título</th>
                              <th className="py-1.5 px-2.5 w-36">Editora / Selo</th>
                              <th className="py-1.5 px-2 text-right w-20">Est. Ped</th>
                              <th className="py-1.5 px-2 text-center w-20">Qtd</th>
                              <th className="py-1.5 px-2 text-right w-24">Capa</th>
                              <th className="py-1.5 px-2 text-right w-24">Desc %</th>
                              <th className="py-1.5 px-2 text-right w-24">Líq. Unit</th>
                              <th className="py-1.5 px-2.5 text-right w-28">Subtotal Líq.</th>
                              {canModifyOrder && <th className="py-1.5 px-2 w-10 text-center" />}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {openOrderWorkspace.items.map((it, idx) => (
                              <tr
                                key={it.cod_item}
                                className={
                                  it.publisher_configured === false
                                    ? 'bg-rose-50/60 dark:bg-rose-950/25'
                                    : idx % 2 === 1
                                      ? 'bg-slate-50/50 dark:bg-slate-900/40'
                                      : ''
                                }
                              >
                                <td className="py-1.5 px-2.5 font-mono text-slate-700 dark:text-slate-300">
                                  {it.isbn || '—'}
                                </td>
                                <td className="py-1.5 px-2 font-mono text-slate-500">{it.cod_item}</td>
                                <td className="py-1.5 px-2.5 font-medium text-slate-900 dark:text-slate-100">
                                  {it.nome_item}
                                </td>
                                <td
                                  className={`py-1.5 px-2.5 truncate max-w-[140px] ${
                                    it.publisher_configured === false
                                      ? 'text-rose-700 font-bold'
                                      : 'text-slate-600 dark:text-slate-300'
                                  }`}
                                  title={it.validation_warning || it.nome_editora}
                                >
                                  {it.nome_editora}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                                  {it.stock_at_order}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  {canModifyOrder ? (
                                    <input
                                      id={`order-edit-qty-${idx}`}
                                      type="number"
                                      min={1}
                                      value={it.quantity}
                                      onChange={(e) => updateOrderWorkspaceQty(it.cod_item, Number(e.target.value))}
                                      onKeyDown={(e) =>
                                        handleQtyKeyDown(e, idx, openOrderWorkspace.items.length, 'order-edit-qty')
                                      }
                                      className="w-16 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-center font-mono font-bold focus:border-indigo-500 focus:outline-none"
                                    />
                                  ) : (
                                    <strong className="font-mono">{it.quantity}</strong>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {formatMoney(it.unit_cover_price)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {canModifyOrder ? (
                                    <div className="w-20 ml-auto">
                                      <CurrencyInput
                                        value={it.discount_pct}
                                        onChangeValue={(val) =>
                                          updateOrderWorkspaceDiscount(it.cod_item, val)
                                        }
                                        suffixStr="%"
                                        max={100}
                                        className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 focus:border-indigo-500 focus:outline-none"
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-emerald-700 dark:text-emerald-400">
                                      {it.discount_pct.toFixed(2)}%
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono">
                                  {formatMoney(it.unit_net_price)}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                                  {formatMoney(it.subtotal_net)}
                                </td>
                                {canModifyOrder && (
                                  <td className="py-1.5 px-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeOrderWorkspaceItem(it.cod_item)}
                                      className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                                      title="Remover item do pedido"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SUB-ABA 2: VALIDAR XML DA NF-e DIRETO DENTRO DO PEDIDO */}
                  {orderWorkspaceSubTab === 'XML' && (
                    <div className="space-y-2.5">
                      <form
                        onSubmit={(e) =>
                          handleUploadAndAnalyzeXml(e, ord.id, ord.branch_id)
                        }
                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
                            <Upload className="w-3.5 h-3.5 text-indigo-600" />
                            XML da NF-e deste Pedido:
                          </span>
                          <input
                            ref={orderXmlInputRef}
                            type="file"
                            accept=".xml,text/xml,application/xml"
                            onChange={(e) => setXmlUploadFile(e.target.files?.[0] || null)}
                            className="text-[11px] text-slate-600"
                          />
                          <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={xmlAutoAcceptIfOk}
                              onChange={(e) => setXmlAutoAcceptIfOk(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            Aceitar auto se 100% OK
                          </label>
                          {ord.horus_status === 'AP' && (
                            <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={xmlAdvanceHorusToAe}
                                onChange={(e) => setXmlAdvanceHorusToAe(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600"
                              />
                              Mudar AP ➔ AE
                            </label>
                          )}
                        </div>

                        <button
                          type="submit"
                          disabled={analyzingXml || !xmlUploadFile}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          {analyzingXml ? 'Validando XML...' : 'Validar XML contra Pedido'}
                        </button>
                      </form>

                      {renderInlineXmlComparisonPanel()}
                    </div>
                  )}

                  {/* SUB-ABA 3: HISTÓRICO DO PEDIDO */}
                  {orderWorkspaceSubTab === 'LOGS' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                            <th className="py-1.5 px-2.5 w-36">Data / Hora</th>
                            <th className="py-1.5 px-2.5 w-36">Usuário</th>
                            <th className="py-1.5 px-2.5 w-40">Ação</th>
                            <th className="py-1.5 px-2.5">Detalhes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {openOrderWorkspace.logs.map((lg) => (
                            <tr key={lg.id}>
                              <td className="py-1.5 px-2.5 font-mono text-slate-500">
                                {formatDateTimeBr(lg.created_at)}
                              </td>
                              <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200">
                                {lg.user_name || 'Sistema'}
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-[10px] text-indigo-700 dark:text-indigo-300">
                                {lg.action}
                              </td>
                              <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">
                                {lg.details}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 2: NOVO PEDIDO — FLUXO LINEAR E SINTETIZADO (SEM POLUIÇÃO)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'DESK' && (
        <div className="space-y-2.5">
          {/* PASSO 1 & 2 NO TOPO: 1. Filial ➔ 2. Fornecedor (Instantâneo) ➔ Importar Planilha/TXT */}
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 min-w-0">
              {/* 1. Filial */}
              <div className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 shrink-0">
                <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold uppercase text-slate-500">1. Filial:</span>
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
                  className="bg-transparent text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="text-slate-900">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Seletor Rápido de Fornecedor (Salvos Local ~2ms vs Pesquisa Horus SQL) */}
              <div className="relative flex-1 min-w-[260px] max-w-xl" ref={supplierDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !isSupplierPickerOpen;
                    setIsSupplierPickerOpen(nextOpen);
                    if (nextOpen) {
                      setTimeout(() => supplierSearchInputRef.current?.focus(), 40);
                    }
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                    isSupplierPickerOpen
                      ? 'border-indigo-500 bg-white dark:bg-slate-950 ring-2 ring-indigo-500/15'
                      : 'border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Search className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="text-[10px] font-bold uppercase text-slate-500 shrink-0">
                      2. Fornecedor:
                    </span>
                    {loadingOverview ? (
                      <span className="text-[11px] text-indigo-600 font-semibold truncate">
                        Carregando histórico e selos...
                      </span>
                    ) : supplierOverview ? (
                      <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                        #{supplierOverview.supplier.cod_fornecedor} — {supplierOverview.supplier.nom_fornecedor}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500 truncate">
                        Selecionar salvo ou pesquisar no Horus...
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {supplierOverview && (
                      <span
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (cartItems.length === 0) {
                            setSupplierOverview(null);
                            setCheckedCartCods({});
                          }
                          setIsSupplierPickerOpen(true);
                          setTimeout(() => supplierSearchInputRef.current?.focus(), 40);
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-200/70 hover:bg-indigo-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 hover:text-indigo-700"
                        title="Trocar fornecedor (mantém os itens já digitados e recalcula descontos)"
                      >
                        Trocar
                      </span>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </button>

                {isSupplierPickerOpen && (
                  <div className="absolute left-0 right-0 sm:w-[520px] mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              setSupplierPickerMode('SAVED');
                              if (selectedBranchId !== null) {
                                loadSavedSuppliersForBranch(selectedBranchId, supplierQuery);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                              supplierPickerMode === 'SAVED'
                                ? 'bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Salvos na Filial ({savedSuppliersList.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setSupplierPickerMode('HORUS')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                              supplierPickerMode === 'HORUS'
                                ? 'bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            Consultar no Horus
                          </button>
                        </div>
                      </div>

                      <form onSubmit={executeHorusSupplierSearch} className="flex gap-1.5">
                        <input
                          ref={supplierSearchInputRef}
                          type="text"
                          value={supplierQuery}
                          onChange={(e) => setSupplierQuery(e.target.value)}
                          placeholder={
                            supplierPickerMode === 'SAVED'
                              ? 'Filtrar fornecedores salvos...'
                              : 'Nome, CNPJ ou código no Horus + Pesquisar...'
                          }
                          className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={loadingSuppliers}
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                        >
                          {loadingSuppliers ? '...' : 'Pesquisar'}
                        </button>
                      </form>
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {supplierPickerMode === 'HORUS' && !hasSearchedHorusSuppliers && !loadingSuppliers ? (
                        <div className="p-4 text-center text-[11px] text-slate-500">
                          Digite nome, CNPJ ou código e clique em <strong>Pesquisar</strong> para consultar no Horus.
                        </div>
                      ) : activeSuppliersInDropdown.length === 0 ? (
                        <div className="p-4 text-center text-[11px] text-slate-500">
                          {loadingSuppliers ? 'Consultando...' : 'Nenhum fornecedor encontrado.'}
                        </div>
                      ) : (
                        activeSuppliersInDropdown.map((sup) => (
                          <button
                            key={`${sup.cod_grp_fornecedor}-${sup.cod_fornecedor}`}
                            type="button"
                            onClick={() => {
                              if (selectedBranchId !== null) {
                                handleSelectSupplierOnDesk(
                                  selectedBranchId,
                                  sup.cod_grp_fornecedor,
                                  sup.cod_fornecedor
                                );
                              }
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-indigo-50/70 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                                #{sup.cod_fornecedor} — {sup.nom_fornecedor}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                CNPJ: {formatCnpj(sup.cnpj)}
                              </div>
                            </div>
                            {sup.is_configured ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0">
                                {sup.configured_publishers_count} selo(s)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] shrink-0">
                                Configurar
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Botão Único de Importar Planilha / TXT */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={!supplierOverview}
                onClick={() => setShowDeskImportBar((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Importar Planilha / TXT
              </button>
            </div>
          </div>

          {/* Barra Inline Retrátil de Importação (.xlsx / .csv / .txt) */}
          {showDeskImportBar && supplierOverview && (
            <form
              onSubmit={handleImportSheet}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIntakeMode('EXCEL')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      intakeMode === 'EXCEL'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 border border-slate-300'
                    }`}
                  >
                    Arquivo (.xlsx, .csv, .txt)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntakeMode('TEXT')}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                      intakeMode === 'TEXT'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 border border-slate-300'
                    }`}
                  >
                    Colar ISBN + Qtd
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDeskImportBar(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {intakeMode === 'EXCEL' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept=".xlsx,.csv,.txt"
                    onChange={(e) => setSheetFile(e.target.files?.[0] || null)}
                    className="text-[11px] text-slate-700"
                  />
                  <button
                    type="submit"
                    disabled={importingSheet || !sheetFile}
                    className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                  >
                    {importingSheet ? 'Processando...' : 'Carregar Itens'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <textarea
                    rows={2}
                    value={sheetPastedText}
                    onChange={(e) => setSheetPastedText(e.target.value)}
                    placeholder="Cole linhas no formato: 9788535914849;10 (ISBN e quantidade)"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                  />
                  <button
                    type="submit"
                    disabled={importingSheet || !sheetPastedText.trim()}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold self-end cursor-pointer"
                  >
                    {importingSheet ? 'Processando...' : 'Carregar Texto'}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* PASSO 3: TIRA SINTETIZADA DE RESUMO DO HISTÓRICO + SELOS DO FORNECEDOR */}
          {supplierOverview && (
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
              <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50/80 dark:bg-slate-950/60">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-slate-600 dark:text-slate-400">
                    CNPJ: <strong className="text-slate-900 dark:text-slate-200">{formatCnpj(supplierOverview.supplier.cnpj)}</strong>
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Últ. Compra:{' '}
                    <strong className="text-slate-900 dark:text-slate-200 font-mono">
                      {supplierQuickStats.lastCompra
                        ? `${formatDateBr(supplierQuickStats.lastCompra.data_nf)} (${formatMoney(supplierQuickStats.lastCompra.vlr_liquido)})`
                        : '—'}
                    </strong>
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Consig. Filial:{' '}
                    <strong className="text-slate-900 dark:text-slate-200 font-mono">
                      {supplierQuickStats.consigUnits} pçs
                    </strong>
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Últ. Acerto:{' '}
                    <strong className="text-slate-900 dark:text-slate-200 font-mono">
                      {supplierQuickStats.lastAcerto ? formatDateBr(supplierQuickStats.lastAcerto.data_nf) : '—'}
                    </strong>
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Últ. Devol.:{' '}
                    <strong className="text-slate-900 dark:text-slate-200 font-mono">
                      {supplierQuickStats.lastDevol ? formatDateBr(supplierQuickStats.lastDevol.data_nf) : '—'}
                    </strong>
                  </span>
                  {supplierOverview.supplier.fat_minimo > 0 && (
                    <span className="text-slate-600 dark:text-slate-400">
                      Fat. Mín.:{' '}
                      <strong className="font-mono">{formatMoney(supplierOverview.supplier.fat_minimo)}</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setDeskExpandedPanel((p) => (p === 'DISCOUNTS' ? 'NONE' : 'DISCOUNTS'))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                      !supplierOverview.is_ready_for_purchase
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : deskExpandedPanel === 'DISCOUNTS'
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Tag className="w-3 h-3" />
                    Selos & Descontos ({supplierOverview.configured_discounts.length})
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDeskExpandedPanel((p) => (p === 'HISTORY' ? 'NONE' : 'HISTORY'))
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                      deskExpandedPanel === 'HISTORY'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <History className="w-3 h-3" />
                    Ver Histórico NFs
                  </button>
                </div>
              </div>

              {/* Aviso de Trava caso o Fornecedor ainda não tenha Selos/Descontos configurados na Filial */}
              {!supplierOverview.is_ready_for_purchase && (
                <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 text-amber-900 text-[11px] font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  Obrigatório configurar ao menos 1 selo/editora e seu desconto (%) para liberar a digitação do pedido nesta filial.
                </div>
              )}

              {/* Subpainel Compacto: Selos & Descontos (%) */}
              {deskExpandedPanel === 'DISCOUNTS' && (
                <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {supplierOverview.configured_discounts.map((d) => (
                        <div
                          key={d.id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
                        >
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {d.nome_editora}
                          </span>
                          {editingDiscountId === d.id ? (
                            <div className="inline-flex items-center gap-1 w-28">
                              <CurrencyInput
                                value={editingDiscountPct}
                                onChangeValue={(v) => setEditingDiscountPct(v)}
                                suffixStr="%"
                                max={100}
                                className="px-1.5 py-0.5 rounded border border-indigo-400 bg-white text-[11px] font-mono w-20"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleDiscount(d, editingDiscountPct)}
                                className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDiscountId(d.id);
                                setEditingDiscountPct(d.desconto_percentual);
                              }}
                              className="font-mono font-bold text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer"
                              title="Clique para editar percentual"
                            >
                              {d.desconto_percentual.toFixed(2)}%
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteDiscount(d.id)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Remover selo"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={savingSupplierDiscounts}
                        onClick={handleImportFromHorusEditorasFornec}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Importar EDITORAS_FORNEC
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddPublisherBox((v) => !v);
                          if (!showAddPublisherBox) searchHorusPublishers('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Adicionar Selos
                      </button>
                    </div>
                  </div>

                  {/* Sugestões rápidas do histórico Horus */}
                  {supplierOverview.horus_suggested_publishers.filter((s) => !s.already_configured).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="font-bold uppercase text-slate-400">Sugeridos pelo Histórico:</span>
                      {supplierOverview.horus_suggested_publishers
                        .filter((s) => !s.already_configured)
                        .slice(0, 8)
                        .map((sug) => (
                          <button
                            key={sug.cod_editora}
                            type="button"
                            onClick={() => {
                              setShowAddPublisherBox(true);
                              setSelectedPubsForSupplier((prev) => ({
                                ...prev,
                                [sug.cod_editora]: {
                                  cod_editora: sug.cod_editora,
                                  nome_editora: sug.nome_editora,
                                },
                              }));
                              if (sug.horus_discount > 0) setBatchDiscountPct(sug.horus_discount);
                            }}
                            className="px-2 py-0.5 rounded border border-dashed border-indigo-300 bg-indigo-50/50 text-indigo-800 font-semibold hover:bg-indigo-100 cursor-pointer"
                          >
                            + {sug.nome_editora} {sug.horus_discount > 0 ? `(${sug.horus_discount}%)` : ''}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Caixa Inline de Busca e Vínculo de Múltiplos Selos + CurrencyInput (%) */}
                  {showAddPublisherBox && (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={pubSearchTerm}
                          onChange={(e) => setPubSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              searchHorusPublishers(pubSearchTerm);
                            }
                          }}
                          placeholder="Pesquisar editora no Horus..."
                          className="w-60 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => searchHorusPublishers(pubSearchTerm)}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold cursor-pointer"
                        >
                          {loadingPubSearch ? '...' : 'Buscar'}
                        </button>

                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-[11px] font-semibold text-slate-600">Desconto (%):</span>
                          <div className="w-28">
                            <CurrencyInput
                              value={batchDiscountPct}
                              onChangeValue={(v) => setBatchDiscountPct(v)}
                              suffixStr="%"
                              max={100}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono text-[11px] font-bold"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={savingSupplierDiscounts}
                            onClick={handleSaveBatchSupplierDiscounts}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Vincular ({Object.keys(selectedPubsForSupplier).length})
                          </button>
                        </div>
                      </div>

                      <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                        {pubSearchResults.map((p) => {
                          const checked = Boolean(selectedPubsForSupplier[p.cod_editora]);
                          return (
                            <label
                              key={p.cod_editora}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] cursor-pointer ${
                                checked
                                  ? 'bg-indigo-50 border-indigo-300 font-bold text-indigo-900'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedPubsForSupplier((prev) => {
                                    const copy = { ...prev };
                                    if (e.target.checked) {
                                      copy[p.cod_editora] = {
                                        cod_editora: p.cod_editora,
                                        nome_editora: p.nome_editora,
                                      };
                                    } else {
                                      delete copy[p.cod_editora];
                                    }
                                    return copy;
                                  });
                                }}
                                className="rounded border-slate-300 text-indigo-600"
                              />
                              <span className="truncate">
                                #{p.cod_editora} — {p.nome_editora}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Subpainel Compacto: Últimas Entradas, Consignações, Acertos e Devoluções */}
              {deskExpandedPanel === 'HISTORY' && (
                <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'COMPRAS', label: `Compras (${supplierOverview.history.entradas_compra.length})` },
                      { id: 'CONSIG', label: `Consignações (${supplierOverview.history.consignacoes_recebidas.length})` },
                      { id: 'ACERTOS', label: `Acertos (${supplierOverview.history.acertos_consignacao.length})` },
                      { id: 'DEVOL', label: `Devoluções (${supplierOverview.history.devolucoes.length})` },
                    ].map((tb) => (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => setHistoryTab(tb.id as any)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          historyTab === tb.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-500">
                          <th className="py-1 px-2">NF</th>
                          <th className="py-1 px-2">Data</th>
                          <th className="py-1 px-2">CFOP</th>
                          <th className="py-1 px-2 text-right">SKUs / Peças</th>
                          <th className="py-1 px-2 text-right">Valor Líquido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(historyTab === 'COMPRAS'
                          ? supplierOverview.history.entradas_compra
                          : historyTab === 'CONSIG'
                            ? supplierOverview.history.consignacoes_recebidas
                            : historyTab === 'ACERTOS'
                              ? supplierOverview.history.acertos_consignacao
                              : supplierOverview.history.devolucoes
                        ).map((nf) => (
                          <tr key={`${nf.cod_nf}-${nf.nro_nf}`}>
                            <td className="py-1 px-2 font-mono font-semibold">{nf.nro_nf}</td>
                            <td className="py-1 px-2 font-mono text-slate-500">{formatDateBr(nf.data_nf)}</td>
                            <td className="py-1 px-2 font-mono text-slate-500">{nf.cfop}</td>
                            <td className="py-1 px-2 text-right font-mono">
                              {nf.qtd_skus} / {nf.qtd_exemplares}
                            </td>
                            <td className="py-1 px-2 text-right font-mono font-bold">
                              {formatMoney(nf.vlr_liquido)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PASSO 4: GRADE DE DIGITAÇÃO MANUAL DO PEDIDO (ESTILO ACCESS MODERNO) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            {/* Barra de Inserção Rápida de Item na Grade */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <form onSubmit={handleLookupItems} className="flex items-center gap-1.5 flex-1 min-w-[260px] max-w-2xl">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      disabled={!supplierOverview}
                      value={itemSearchTerm}
                      onChange={(e) => setItemSearchTerm(e.target.value)}
                      placeholder={
                        supplierOverview
                          ? 'Digitar ISBN, Cód. Horus ou Título e teclar Enter...'
                          : 'Selecione o fornecedor acima para habilitar a digitação...'
                      }
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] disabled:opacity-50 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <input
                    type="number"
                    min={1}
                    disabled={!supplierOverview}
                    value={itemSearchDefaultQty}
                    onChange={(e) => setItemSearchDefaultQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono text-[11px] font-bold"
                    title="Quantidade"
                  />
                  <button
                    type="submit"
                    disabled={!supplierOverview || searchingItems}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                  >
                    {searchingItems ? '...' : 'Inserir'}
                  </button>
                </form>

                {cartItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={gridFilterTerm}
                      onChange={(e) => setGridFilterTerm(e.target.value)}
                      placeholder="Filtrar na grade..."
                      className="w-40 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                    />
                    {Object.values(checkedCartCods).some(Boolean) && (
                      <button
                        type="button"
                        onClick={() =>
                          startInlineReconcile(
                            Object.entries(checkedCartCods)
                              .filter(([, v]) => v)
                              .map(([k]) => Number(k))
                          )
                        }
                        className="px-2.5 py-1 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 text-[11px] font-bold cursor-pointer"
                      >
                        Alterar Editora no Horus (Selecionados)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCartItems([]);
                        setCheckedCartCods({});
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:text-rose-600 text-[11px] font-semibold cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </div>

              {/* Lista rápida quando a pesquisa retorna múltiplos títulos */}
              {itemLookupResults.length > 1 && (
                <div className="border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {itemLookupResults.map((cand) => (
                    <div
                      key={cand.cod_item}
                      onClick={() => {
                        addOrMergeItemToCart(cand, Math.max(1, itemSearchDefaultQty));
                        setItemLookupResults([]);
                        setItemSearchTerm('');
                      }}
                      className="px-2.5 py-1.5 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 cursor-pointer text-[11px]"
                    >
                      <div className="truncate">
                        <span className="font-mono font-semibold">{cand.isbn || cand.cod_item}</span> —{' '}
                        <strong className="text-slate-900 dark:text-white">{cand.nome_item}</strong>{' '}
                        <span className="text-slate-500">({cand.nome_editora})</span>
                      </div>
                      <div className="font-mono shrink-0 flex items-center gap-3">
                        <span className="text-slate-500">Est: {cand.stock_available}</span>
                        <span className="font-bold text-indigo-700">
                          {formatMoney(cand.vlr_capa)} ({cand.publisher_configured ? `-${cand.discount_pct}%` : 'Selo s/ %'})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Conciliação Inline de Editora no Horus (sem abrir modal pesada) */}
              {reconcileTargetCods.length > 0 && (
                <div className="p-2 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                      Atualizar Editora no Horus ({reconcileTargetCods.length} item):
                    </span>
                    <input
                      type="text"
                      value={reconcileSearch}
                      onChange={(e) => {
                        setReconcileSearch(e.target.value);
                        searchHorusPublishers(e.target.value, true);
                      }}
                      placeholder="Filtrar editora destino..."
                      className="w-44 px-2 py-1 rounded border border-indigo-300 bg-white text-[11px]"
                    />
                    <select
                      value={selectedReconcilePub?.cod_editora ?? ''}
                      onChange={(e) => {
                        const ce = Number(e.target.value);
                        const found = reconcilePubOptions.find((x) => x.cod_editora === ce) || null;
                        setSelectedReconcilePub(
                          found ? { cod_editora: found.cod_editora, nome_editora: found.nome_editora } : null
                        );
                      }}
                      className="px-2 py-1 rounded border border-indigo-300 bg-white text-[11px] font-semibold max-w-xs"
                    >
                      <option value="">Selecione a editora correta...</option>
                      {reconcilePubOptions.map((op) => (
                        <option key={op.cod_editora} value={op.cod_editora}>
                          #{op.cod_editora} — {op.nome_editora}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!selectedReconcilePub || savingReconcile}
                      onClick={handleConfirmCartReconcile}
                      className="px-2.5 py-1 rounded bg-indigo-600 text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                    >
                      {savingReconcile ? 'Gravando no Horus...' : 'Gravar no Horus'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReconcileTargetCods([])}
                      className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {lastNotFoundIsbns.length > 0 && (
                <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1 flex items-center justify-between">
                  <span>
                    ISBNs não localizados no Horus ({lastNotFoundIsbns.length}):{' '}
                    <strong className="font-mono">{lastNotFoundIsbns.slice(0, 10).join(', ')}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLastNotFoundIsbns([])}
                    className="text-amber-700 font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {/* Tabela Compacta de Itens do Pedido */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <th className="py-1.5 px-2 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={
                          visibleCartItems.length > 0 &&
                          visibleCartItems.every((x) => checkedCartCods[x.cod_item])
                        }
                        onChange={(e) => {
                          const ck = e.target.checked;
                          const next: Record<number, boolean> = { ...checkedCartCods };
                          visibleCartItems.forEach((x) => {
                            next[x.cod_item] = ck;
                          });
                          setCheckedCartCods(next);
                        }}
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="py-1.5 px-2 w-28">ISBN</th>
                    <th className="py-1.5 px-2 w-16">Cód.</th>
                    <th className="py-1.5 px-2.5">Título</th>
                    <th className="py-1.5 px-2 w-36">Editora / Selo</th>
                    <th className="py-1.5 px-2 text-right w-16" title="Saldo disponível na filial">
                      Est.
                    </th>
                    <th className="py-1.5 px-2 text-right w-16" title="Saldo consignado recebido na filial">
                      Consig.
                    </th>
                    <th className="py-1.5 px-2 text-right w-20" title="Vendas 90d / 365d na filial">
                      Giro 90/365
                    </th>
                    <th className="py-1.5 px-2 text-center w-20">Qtd</th>
                    <th className="py-1.5 px-2 text-right w-20">Capa</th>
                    <th className="py-1.5 px-2 text-right w-16">Desc%</th>
                    <th className="py-1.5 px-2 text-right w-20">Líq.Un</th>
                    <th className="py-1.5 px-2.5 text-right w-24">Subtotal</th>
                    <th className="py-1.5 px-2 w-8 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleCartItems.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-8 text-center text-slate-400">
                        {supplierOverview
                          ? 'Digite o ISBN/Título acima ou importe uma planilha/TXT para montar o pedido.'
                          : 'Selecione a Filial e o Fornecedor acima para iniciar.'}
                      </td>
                    </tr>
                  ) : (
                    visibleCartItems.map((it, idx) => {
                      const hasErr = !it.publisher_configured || it.vlr_capa <= 0;
                      return (
                        <tr
                          key={it.cod_item}
                          onClick={() => setSelectedCartIndex(idx)}
                          className={
                            hasErr
                              ? 'bg-amber-50/70 dark:bg-amber-950/25'
                              : idx === selectedCartIndex
                                ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                                : idx % 2 === 1
                                  ? 'bg-slate-50/50 dark:bg-slate-900/40'
                                  : ''
                          }
                        >
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(checkedCartCods[it.cod_item])}
                              onChange={(e) =>
                                setCheckedCartCods((p) => ({ ...p, [it.cod_item]: e.target.checked }))
                              }
                              className="rounded border-slate-300"
                            />
                          </td>
                          <td className="py-1.5 px-2 font-mono text-slate-700 dark:text-slate-300">
                            {it.isbn || '—'}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-slate-500">{it.cod_item}</td>
                          <td className="py-1.5 px-2.5 font-medium text-slate-900 dark:text-slate-100 max-w-[240px] truncate" title={it.nome_item}>
                            {it.nome_item}
                          </td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`truncate max-w-[115px] ${
                                  it.publisher_configured
                                    ? 'text-slate-700 dark:text-slate-300'
                                    : 'text-rose-700 font-bold'
                                }`}
                                title={it.validation_warning || it.nome_editora}
                              >
                                {it.nome_editora}
                              </span>
                              {!it.publisher_configured && (
                                <div className="inline-flex items-center gap-0.5 shrink-0">
                                  {it.cod_editora && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeskExpandedPanel('DISCOUNTS');
                                        setShowAddPublisherBox(true);
                                        setSelectedPubsForSupplier((prev) => ({
                                          ...prev,
                                          [it.cod_editora!]: {
                                            cod_editora: it.cod_editora!,
                                            nome_editora: it.nome_editora,
                                          },
                                        }));
                                      }}
                                      className="px-1 py-0.2 rounded bg-amber-200 text-amber-950 text-[9px] font-bold cursor-pointer"
                                      title="Adicionar desconto deste selo ao fornecedor"
                                    >
                                      +%
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => startInlineReconcile([it.cod_item])}
                                    className="px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold cursor-pointer"
                                    title="Alterar editora do item no cadastro do Horus"
                                  >
                                    Selo
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{it.stock_available}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                            {it.consigned_received}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                            {it.sales_90}/{it.sales_365}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              id={`compras-qty-${idx}`}
                              type="number"
                              min={1}
                              value={it.quantity}
                              onChange={(e) => updateCartItemQty(it.cod_item, Number(e.target.value))}
                              onKeyDown={(e) => handleQtyKeyDown(e, idx, visibleCartItems.length)}
                              className="w-16 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-center font-mono font-bold focus:border-indigo-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">{it.vlr_capa.toFixed(2)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-emerald-700 dark:text-emerald-400">
                            {it.publisher_configured ? (
                              <div className="w-20 ml-auto">
                                <CurrencyInput
                                  value={it.discount_pct}
                                  onChangeValue={(val) => updateCartItemDiscount(it.cod_item, val)}
                                  suffixStr="%"
                                  max={100}
                                  className="w-full px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            {it.unit_net_price.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatMoney(it.subtotal_net)}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                setCartItems((prev) => prev.filter((x) => x.cod_item !== it.cod_item))
                              }
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
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

            {/* Alerta Interativo: Pedido em Aberto Detectado sem Conferência -> Acrescentar vs Criar Novo */}
            {openMergePrompt && (
              <div className="p-3 bg-amber-50/90 dark:bg-amber-950/35 border-t border-amber-300 dark:border-amber-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200 text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Já existe(m) {openMergePrompt.candidates.length} pedido(s) em andamento para este fornecedor nesta filial sem itens conferidos. Como deseja prosseguir?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenMergePrompt(null)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {openMergePrompt.candidates.map((cand) => {
                    const checked = openMergePrompt.selectedOrderId === cand.id;
                    return (
                      <label
                        key={cand.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                          checked
                            ? 'bg-white dark:bg-slate-900 border-indigo-500 ring-1 ring-indigo-500/30 font-semibold'
                            : 'bg-white/70 dark:bg-slate-900/60 border-amber-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="radio"
                            name="mergeTargetOrder"
                            checked={checked}
                            onChange={() =>
                              setOpenMergePrompt((prev) =>
                                prev ? { ...prev, selectedOrderId: cand.id } : null
                              )
                            }
                            className="text-indigo-600"
                          />
                          <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                            Pedido #{cand.horus_cod_pedido || cand.id}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${getHorusStatusBadgeClass(
                              cand.horus_status
                            )}`}
                          >
                            {cand.status_label}
                          </span>
                          <span className="text-slate-500 font-mono">
                            ({formatDateBr(cand.created_at)})
                          </span>
                        </div>
                        <span className="font-mono text-slate-800 dark:text-slate-200 shrink-0">
                          {cand.total_skus} tít / {cand.total_quantity} pçs •{' '}
                          <strong>{formatMoney(cand.total_net)}</strong>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={appendingToExisting || creatingOrder}
                    onClick={handleAppendToCandidateOrder}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {appendingToExisting
                      ? 'Acrescentando Itens...'
                      : `Acrescentar Itens ao Pedido #${
                          openMergePrompt.candidates.find(
                            (c) => c.id === openMergePrompt.selectedOrderId
                          )?.horus_cod_pedido || openMergePrompt.selectedOrderId
                        }`}
                  </button>
                  <button
                    type="button"
                    disabled={creatingOrder || appendingToExisting}
                    onClick={executeCreateNewPurchaseOrder}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {creatingOrder ? 'Criando Novo...' : 'Criar Novo Pedido Separado'}
                  </button>
                </div>
              </div>
            )}

            {/* Rodapé Compacto de Fechamento do Pedido (Grava no Horus c/ Pendência SIM/NÃO) */}
            <div className="bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 px-3 py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={compraConsig}
                  onChange={(e) => setCompraConsig(e.target.value as 'N' | 'S')}
                  className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold"
                >
                  <option value="N">Compra Firme</option>
                  <option value="S">Consignação</option>
                </select>

                {/* Controle Gerar Pendência (SIM / NÃO — Padrão SIM) + Config Rápida da Filial */}
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    Gerar Pendência:
                  </span>
                  <button
                    type="button"
                    onClick={() => setGerarPendencia('S')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      gerarPendencia === 'S'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    type="button"
                    onClick={() => setGerarPendencia('N')}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      gerarPendencia === 'N'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    NÃO
                  </button>
                  {branchConfigForm.gerar_pendencia_default !== gerarPendencia && (
                    <button
                      type="button"
                      disabled={savingQuickPendDefault}
                      onClick={() => handleQuickSaveGerarPendDefault(gerarPendencia)}
                      className="ml-0.5 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-bold border border-indigo-200 cursor-pointer"
                      title="Salvar esta escolha como padrão para novos pedidos desta filial"
                    >
                      {savingQuickPendDefault ? '...' : 'Fixar padrão'}
                    </button>
                  )}
                </div>

                {/* Status Inicial no Horus: AP (Aprovado) ou AB (Em Digitação) */}
                <select
                  value={initialHorusStatus}
                  onChange={(e) => setInitialHorusStatus(e.target.value as 'AP' | 'AB')}
                  className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold"
                  title="Status inicial em que o pedido será gravado no Horus"
                >
                  <option value="AP">Gravar Aprovado (AP)</option>
                  <option value="AB">Gravar em Digitação (AB)</option>
                </select>

                <input
                  type="text"
                  value={orderObservations}
                  onChange={(e) => setOrderObservations(e.target.value)}
                  placeholder="Observações para OBS_PEDIDO_COMPRA no Horus..."
                  className="w-56 sm:w-64 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-slate-600 dark:text-slate-400">
                  SKUs: <strong>{cartSummary.skus}</strong> • Peças: <strong>{cartSummary.totalQty}</strong> • Bruto:{' '}
                  <strong>{formatMoney(cartSummary.gross)}</strong> • Desc.Méd:{' '}
                  <strong>{cartSummary.avgDisc.toFixed(1)}%</strong>
                </span>
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                  Líquido: {formatMoney(cartSummary.net)}
                </span>
                <button
                  type="button"
                  disabled={
                    creatingOrder ||
                    appendingToExisting ||
                    cartItems.length === 0 ||
                    cartSummary.invalidCount > 0 ||
                    !supplierOverview?.is_ready_for_purchase
                  }
                  onClick={handleCreatePurchaseOrder}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold shadow-2xs cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {creatingOrder
                    ? 'Gravando no Horus...'
                    : `Gerar Pedido (${initialHorusStatus})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 3: CONFERÊNCIA XML — LISTA COMPACTA OU ANÁLISE INLINE SEM MODAL   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'XML_AUDIT' && (
        <div className="space-y-2.5">
          {!openStandaloneXmlWorkspace ? (
            <>
              {/* Barra de Upload Rápido de XML + Filtros de Divergência */}
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 space-y-2 shadow-2xs">
                <form
                  onSubmit={(e) => handleUploadAndAnalyzeXml(e)}
                  className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      Validar XML da NF-e:
                    </span>
                    <input
                      ref={standaloneXmlInputRef}
                      type="file"
                      accept=".xml,text/xml,application/xml"
                      onChange={(e) => setXmlUploadFile(e.target.files?.[0] || null)}
                      className="text-[11px] text-slate-600"
                    />
                    <select
                      value={xmlTargetOrderId}
                      onChange={(e) => setXmlTargetOrderId(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] max-w-xs"
                    >
                      <option value="">Auto-localizar pedido pelo CNPJ / xPed</option>
                      {ordersList.map((o) => (
                        <option key={o.id} value={o.id}>
                          #{o.horus_cod_pedido || o.id} — {o.nome_fornecedor} ({formatMoney(o.total_net)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={analyzingXml || !xmlUploadFile}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    {analyzingXml ? 'Analisando...' : 'Analisar XML'}
                  </button>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: 'ALL', label: `Todas (${xmlKpis.total})` },
                      { id: 'PENDING_REVIEW', label: `Com Divergência (${xmlKpis.pending_review})` },
                      { id: 'XML_OK', label: `XML OK (${xmlKpis.xml_ok})` },
                      { id: 'ACCEPTED_WITH_DIVERGENCE', label: `Aceitas c/ Div. (${xmlKpis.accepted_with_divergence})` },
                      { id: 'REJECTED', label: `Recusadas (${xmlKpis.rejected})` },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setXmlDecisionFilter(f.id)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                          xmlDecisionFilter === f.id
                            ? 'bg-slate-900 text-white border-slate-900 font-bold'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <select
                      value={xmlDivergenceAxisFilter}
                      onChange={(e) => setXmlDivergenceAxisFilter(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                    >
                      <option value="ALL">Todos os tipos</option>
                      <option value="DISCOUNT">Divergência Desconto %</option>
                      <option value="COVER">Divergência Preço Capa</option>
                      <option value="QTY">Divergência Quantidade</option>
                      <option value="EXTRA_OR_MISSING">Item Extra / Faltante</option>
                    </select>
                    <input
                      type="text"
                      value={xmlSearchFilter}
                      onChange={(e) => setXmlSearchFilter(e.target.value)}
                      placeholder="NF, pedido ou fornecedor..."
                      className="w-44 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Grade de Conferências de XML */}
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-1.5 px-2.5 w-24">NF-e</th>
                        <th className="py-1.5 px-2.5 w-24">Pedido #</th>
                        <th className="py-1.5 px-2.5">Fornecedor</th>
                        <th className="py-1.5 px-2.5 text-center w-24">Qtd (P|X)</th>
                        <th className="py-1.5 px-2.5 text-right w-28">Líq. Pedido</th>
                        <th className="py-1.5 px-2.5 text-right w-28">Líq. XML</th>
                        <th className="py-1.5 px-2.5 w-48">Apontamentos</th>
                        <th className="py-1.5 px-2.5 text-center w-36">Situação</th>
                        <th className="py-1.5 px-2.5 text-right w-24">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {loadingXmlAudits ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-500">
                            Carregando conferências...
                          </td>
                        </tr>
                      ) : xmlAuditsList.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-500">
                            Nenhuma conferência de XML encontrada.
                          </td>
                        </tr>
                      ) : (
                        xmlAuditsList.map((aud, idx) => (
                          <tr
                            key={aud.id}
                            onClick={() => setSelectedXmlIndex(idx)}
                            onDoubleClick={() => loadXmlAuditDetailInline(aud.id, true)}
                            className={`cursor-pointer ${
                              idx === selectedXmlIndex
                                ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                                : idx % 2 === 1
                                  ? 'bg-slate-50/50 dark:bg-slate-900/40'
                                  : ''
                            }`}
                          >
                            <td className="py-1.5 px-2.5 font-mono font-bold">
                              {aud.numero_nf}
                              {aud.serie_nf ? `/${aud.serie_nf}` : ''}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono font-bold text-indigo-700">
                              #{aud.horus_cod_pedido || aud.order_id}
                            </td>
                            <td className="py-1.5 px-2.5 font-semibold truncate max-w-[220px]">
                              {aud.nome_fornecedor || aud.emit_nome}
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono">
                              {aud.order_total_qty} | <strong>{aud.xml_total_qty}</strong>
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono">
                              {formatMoney(aud.order_total_net)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold">
                              {formatMoney(aud.xml_total_products_net)}
                            </td>
                            <td className="py-1.5 px-2.5">
                              {aud.diagnostic_status === 'MATCH_100' ? (
                                <span className="text-emerald-700 font-bold text-[10px]">100% Compatível</span>
                              ) : (
                                <div className="flex flex-wrap gap-1 text-[9px] font-bold">
                                  {aud.diff_discount_count > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-900">
                                      Desc ({aud.diff_discount_count})
                                    </span>
                                  )}
                                  {aud.diff_cover_count > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                                      Capa ({aud.diff_cover_count})
                                    </span>
                                  )}
                                  {aud.diff_qty_count > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-900">
                                      Qtd ({aud.diff_qty_count})
                                    </span>
                                  )}
                                  {(aud.extra_in_xml_count > 0 || aud.missing_in_xml_count > 0) && (
                                    <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-800">
                                      +{aud.extra_in_xml_count}/-{aud.missing_in_xml_count}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getXmlDecisionBadgeClass(
                                  aud.decision_status
                                )}`}
                              >
                                {aud.decision_label}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 text-right">
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  loadXmlAuditDetailInline(aud.id, true);
                                }}
                                className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:border-indigo-500 text-[10px] font-bold cursor-pointer"
                              >
                                Analisar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* ── ANÁLISE INLINE DE XML NA TELA CONFERÊNCIA XML (SEM MODAL!) ── */
            <div className="space-y-2.5">
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenStandaloneXmlWorkspace(false);
                      setActiveXmlDetail(null);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Voltar para Lista XML
                  </button>
                  {activeXmlDetail && (
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      Pedido #{activeXmlDetail.audit.horus_cod_pedido || activeXmlDetail.audit.order_id} —{' '}
                      {activeXmlDetail.audit.nome_fornecedor}
                    </span>
                  )}
                </div>

                {activeXmlDetail && (
                  <button
                    type="button"
                    onClick={() => {
                      const oid = activeXmlDetail.audit.order_id;
                      setOpenStandaloneXmlWorkspace(false);
                      setActiveMainTab('ORDERS');
                      openOrderInline(oid, 'ITEMS');
                    }}
                    className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-bold cursor-pointer"
                  >
                    Ir para o Pedido
                  </button>
                )}
              </div>

              {renderInlineXmlComparisonPanel()}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 4: PARÂMETROS & E-MAIL DA FILIAL (COMPACTO)                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'BRANCH_CONFIG' && (
        <form
          onSubmit={handleSaveBranchSettings}
          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4 space-y-4 shadow-2xs max-w-4xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">
                Parâmetros de Compras & E-mail por Filial
              </h2>
            </div>

            <select
              value={selectedBranchId ?? ''}
              onChange={(e) => setSelectedBranchId(Number(e.target.value))}
              className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Cód. Local Padrão
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
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Departamento Horus
              </label>
              <select
                value={branchConfigForm.cod_departamento_default ?? ''}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({
                    ...p,
                    cod_departamento_default: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
              >
                <option value="">Automático (Grupo Fornec.)</option>
                {branchDepartments.map((dp) => (
                  <option key={dp.cod_departamento} value={dp.cod_departamento}>
                    #{dp.cod_departamento} — {dp.nom_departamento}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Centro de Custo
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
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Modalidade Padrão
              </label>
              <select
                value={branchConfigForm.compra_consig_default}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({ ...p, compra_consig_default: e.target.value }))
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
              >
                <option value="N">Compra Firme (N)</option>
                <option value="S">Consignação (S)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Gerar Pendência Padrão
              </label>
              <select
                value={branchConfigForm.gerar_pendencia_default || 'S'}
                onChange={(e) =>
                  setBranchConfigForm((p) => ({
                    ...p,
                    gerar_pendencia_default: e.target.value === 'N' ? 'N' : 'S',
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-semibold"
              >
                <option value="S">SIM (S) — Padrão</option>
                <option value="N">NÃO (N)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Mail className="w-3.5 h-3.5 text-indigo-600" />
                E-mail e Texto Padrão de Envio ao Fornecedor (por Filial)
              </span>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={branchConfigForm.email_enabled}
                  onChange={(e) =>
                    setBranchConfigForm((p) => ({ ...p, email_enabled: e.target.checked }))
                  }
                  className="rounded border-slate-300 text-indigo-600"
                />
                Habilitar envio por e-mail nesta filial
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={branchConfigForm.sender_name}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, sender_name: e.target.value }))}
                placeholder="Nome Remetente da Filial"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
              />
              <input
                type="email"
                value={branchConfigForm.sender_email}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, sender_email: e.target.value }))}
                placeholder="E-mail da Filial"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
              />
              <input
                type="text"
                value={branchConfigForm.cc_emails}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, cc_emails: e.target.value }))}
                placeholder="Cópias (CC separados por vírgula)"
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
              />
            </div>

            <input
              type="text"
              value={branchConfigForm.email_subject_template}
              onChange={(e) =>
                setBranchConfigForm((p) => ({ ...p, email_subject_template: e.target.value }))
              }
              placeholder="Assunto do e-mail (ex: Pedido de Compra #{cod_pedido} - {filial})"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
            />

            <textarea
              rows={3}
              value={branchConfigForm.email_body_template}
              onChange={(e) =>
                setBranchConfigForm((p) => ({ ...p, email_body_template: e.target.value }))
              }
              placeholder="Texto padrão do e-mail desta filial..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBranchConfig}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {savingBranchConfig ? 'Salvando...' : 'Salvar Parâmetros'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  DatabaseZap,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Mail,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Tag,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

const MAX_SHEET_BYTES = 10 * 1024 * 1024; // 10 MB (Regra Mandatória AGENTS.md Seção 1)

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

export default function HorusDirectComprasPage() {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
  const [companyId, setCompanyId] = useState<number>(1);
  const [activeMainTab, setActiveMainTab] = useState<'DESK' | 'ORDERS' | 'BRANCH_CONFIG'>('DESK');

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

  // 6. Pedidos Gerados, Exportação Excel (com opção AP -> AE) e Auditoria
  const [ordersList, setOrdersList] = useState<SavedPurchaseOrder[]>([]);
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

  // 7. Parametrização & Template de E-mail da Filial
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
          limit: '50',
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

  useEffect(() => {
    if (selectedBranchId !== null) {
      searchSuppliers(selectedBranchId, supplierQuery, onlyConfiguredSuppliers);
      const b = branches.find((x) => x.id === selectedBranchId);
      if (b) {
        setBranchConfigForm(b.config);
        setCompraConsig(b.config.compra_consig_default === 'S' ? 'S' : 'N');
      }
    }
  }, [selectedBranchId, onlyConfiguredSuppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega departamentos da filial ao abrir aba de Parametrização
  useEffect(() => {
    if (activeMainTab === 'BRANCH_CONFIG' && selectedBranchId !== null) {
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
  }, [activeMainTab, selectedBranchId, apiUrl, companyId]);

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

  // Revalida o carrinho atual contra os novos descontos/editoras no backend
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
        // Se bateu 1 único ISBN/Código exato, adiciona direto na grade para alta produtividade!
        addOrMergeItemToCart(list[0], Math.max(1, itemSearchDefaultQty));
        setItemSearchTerm('');
        setItemLookupResults([]);
        toast.success(`Item '${list[0].nome_item}' adicionado ao pedido.`);
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
        return updated;
      }
      const q = Math.max(1, addQty);
      return [
        ...prev,
        {
          ...newItem,
          quantity: q,
          subtotal_gross: Number((newItem.vlr_capa * q).toFixed(2)),
          subtotal_net: Number((newItem.unit_net_price * q).toFixed(2)),
        },
      ];
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
          `${imported.length} item(ns) importado(s), porém ${data.unconfigured_publishers_count} possuem editora não vinculada ao fornecedor. Confira os alertas em amarelo!`
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
    let skus = cartItems.length;
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
      // Abre imediatamente a opção de exportar o Excel e (opcionalmente) mudar para AE!
      setExportPromptOrder({
        id: data.order_id,
        horus_cod_pedido: data.horus_cod_pedido,
        horus_status: 'AP',
        nome_fornecedor: sup.nom_fornecedor,
      });
      await loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor, false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar pedido de compra.');
    } finally {
      setCreatingOrder(false);
    }
  };

  // ── Listagem de Pedidos, Exportação Excel (AP -> AE) e Auditoria ───────────
  const fetchOrdersList = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        company_id: String(companyId),
        status: orderStatusFilter,
        sync_horus_status: 'true',
        limit: '80',
      });
      if (selectedBranchId !== null) params.append('branch_id', String(selectedBranchId));
      if (orderSearchFilter.trim()) params.append('search', orderSearchFilter.trim());
      const res = await fetch(`${apiUrl}/horus-purchases/orders?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        setOrdersList(d.orders || []);
      }
    } catch {
      toast.error('Erro ao carregar histórico de pedidos de compra.');
    } finally {
      setLoadingOrders(false);
    }
  }, [apiUrl, companyId, orderStatusFilter, orderSearchFilter, selectedBranchId]);

  useEffect(() => {
    if (activeMainTab === 'ORDERS') {
      fetchOrdersList();
    }
  }, [activeMainTab, fetchOrdersList]);

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
      if (activeMainTab === 'ORDERS') fetchOrdersList();
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
      fetchOrdersList();
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

  return (
    <div className="w-full space-y-3 pb-10">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA SUPERIOR: TÍTULO + SELETOR DE FILIAL + ABAS DO MÓDULO           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  Compras &amp; Reposição (Horus Direct)
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  SQL DIRETO • AP → AE
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Selecione a filial e o fornecedor, valide histórico/descontos por selo, concilie editoras no Horus e gere pedidos aprovados.
              </p>
            </div>
          </div>

          {/* Seletor Obrigatório de Filial */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[10px] uppercase font-extrabold text-slate-400 leading-none">
                  1º Passo • Filial Ativa
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
                  className="bg-transparent text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white focus:outline-none pr-4 cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="text-slate-900">
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Navegação de Abas */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveMainTab('DESK')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition cursor-pointer ${
                  activeMainTab === 'DESK'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Mesa de Compras
              </button>
              <button
                type="button"
                onClick={() => setActiveMainTab('ORDERS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeMainTab === 'ORDERS'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Pedidos (AP / AE)
              </button>
              <button
                type="button"
                onClick={() => setActiveMainTab('BRANCH_CONFIG')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeMainTab === 'BRANCH_CONFIG'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                E-mail &amp; Filial
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 1: MESA DE COMPRAS & FORNECEDOR                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'DESK' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
          {/* COLUNA ESQUERDA (XL 4): BUSCA DE FORNECEDORES NA FILIAL */}
          <div className="xl:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 flex flex-col max-h-[680px]">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400">
                  2º Passo • Fornecedor da Filial
                </span>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Selecionar Fornecedor ({selectedBranch?.nome || ''})
                </h2>
              </div>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyConfiguredSuppliers}
                  onChange={(e) => setOnlyConfiguredSuppliers(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Configurados
              </label>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedBranchId !== null) {
                  searchSuppliers(selectedBranchId, supplierQuery, onlyConfiguredSuppliers);
                }
              }}
              className="flex gap-1.5 mb-3"
            >
              <input
                type="text"
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                placeholder="Nome, Fantasia, CNPJ ou Código..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="submit"
                disabled={loadingSuppliers}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1"
              >
                {loadingSuppliers ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                Buscar
              </button>
            </form>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
              {loadingSuppliers ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-indigo-600" />
                  Consultando FORNECEDORES_GERAL na filial...
                </div>
              ) : supplierResults.length === 0 ? (
                <div className="py-10 px-4 text-center text-xs text-slate-500">
                  Nenhum fornecedor localizado nesta filial para o filtro informado.
                </div>
              ) : (
                supplierResults.map((sup) => {
                  const isActive =
                    supplierOverview?.supplier.cod_fornecedor === sup.cod_fornecedor &&
                    supplierOverview?.supplier.cod_grp_fornecedor === sup.cod_grp_fornecedor;
                  return (
                    <button
                      key={`${sup.cod_grp_fornecedor}-${sup.cod_fornecedor}`}
                      type="button"
                      onClick={() => {
                        if (selectedBranchId !== null) {
                          loadSupplierOverview(selectedBranchId, sup.cod_grp_fornecedor, sup.cod_fornecedor);
                        }
                      }}
                      className={`w-full p-2.5 text-left transition cursor-pointer flex items-start justify-between gap-2 ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-l-4 border-indigo-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {sup.nom_fornecedor}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          Cód. {sup.cod_fornecedor} (Grp {sup.cod_grp_fornecedor}) • CNPJ {formatCnpj(sup.cnpj)}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {sup.is_configured ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-extrabold">
                            <Check className="w-3 h-3" />
                            {sup.configured_publishers_count} selo(s)
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
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

          {/* COLUNA DIREITA (XL 8): DOSSIÊ DO FORNECEDOR + DESCONTOS + MONTAGEM DO PEDIDO */}
          <div className="xl:col-span-8 space-y-3">
            {loadingOverview ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                Carregando entradas, consignações, acertos, devoluções e descontos do fornecedor na filial...
              </div>
            ) : !supplierOverview ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-2">
                <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
                  Selecione um Fornecedor na lista ao lado
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Ao selecionar o fornecedor na filial ativa, o sistema exibirá as últimas entradas, consignações, acertos, devoluções e os descontos por editora/selo para liberar o pedido de compra.
                </p>
              </div>
            ) : (
              <>
                {/* CARD DO FORNECEDOR: CABEÇALHO + SUB-ABAS DE HISTÓRICO E SELOS */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                  <div className="p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                          {supplierOverview.supplier.nom_fornecedor}
                        </h2>
                        <span className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 font-mono text-[11px] font-bold">
                          Cód. {supplierOverview.supplier.cod_fornecedor} / Grp {supplierOverview.supplier.cod_grp_fornecedor}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                        <span>CNPJ: <strong className="font-mono text-slate-700 dark:text-slate-300">{formatCnpj(supplierOverview.supplier.cnpj)}</strong></span>
                        {supplierOverview.supplier.prazo_pagamentos && (
                          <span>Prazo: <strong>{supplierOverview.supplier.prazo_pagamentos}</strong></span>
                        )}
                        {supplierOverview.supplier.fat_minimo > 0 && (
                          <span>Fat. Mínimo: <strong>{formatMoney(supplierOverview.supplier.fat_minimo)}</strong></span>
                        )}
                        <span>
                          Saldo Consig. na Filial:{' '}
                          <strong className="text-purple-700 dark:text-purple-300">
                            {supplierOverview.history.consigned_balance_summary.total_units} ex. ({supplierOverview.history.consigned_balance_summary.total_skus} títulos)
                          </strong>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPubsForSupplier({});
                        setPubSearchTerm('');
                        setShowAddPublisherModal(true);
                        searchHorusPublishersForModal('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      Vincular Selos / Descontos
                    </button>
                  </div>

                  {/* Alerta bloqueante caso o fornecedor ainda não tenha selos/descontos na filial */}
                  {!supplierOverview.is_ready_for_purchase && (
                    <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-extrabold">Pedido bloqueado: configure os Selos (Editoras) e Descontos deste fornecedor nesta filial.</p>
                          <p className="text-[11px] opacity-90">
                            Clique em <strong>Vincular Selos / Descontos</strong> ou aproveite abaixo as editoras sugeridas do histórico do Horus.
                          </p>
                        </div>
                      </div>
                      {supplierOverview.horus_suggested_publishers.some((s) => s.source === 'EDITORAS_FORNEC') && (
                        <button
                          type="button"
                          disabled={savingSupplierDiscounts}
                          onClick={handleImportFromHorusEditorasFornec}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold whitespace-nowrap cursor-pointer"
                        >
                          Importar de EDITORAS_FORNEC
                        </button>
                      )}
                    </div>
                  )}

                  {/* Abas do Dossiê 360° */}
                  <div className="px-4 pt-3 flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 text-xs">
                    {[
                      { id: 'DISCOUNTS', label: `Selos & Descontos (${supplierOverview.configured_discounts.length})` },
                      { id: 'ENTRADAS', label: `Últ. Entradas Compra (${supplierOverview.history.entradas_compra.length})` },
                      { id: 'CONSIG', label: `Consignação (${supplierOverview.history.consignacoes_recebidas.length})` },
                      { id: 'ACERTOS', label: `Acertos (${supplierOverview.history.acertos_consignacao.length})` },
                      { id: 'DEVOLUCOES', label: `Devoluções (${supplierOverview.history.devolucoes.length})` },
                      { id: 'PEDIDOS_HORUS', label: `Pedidos Horus (${supplierOverview.history.pedidos_compra_horus.length})` },
                    ].map((tb) => (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => setSupplierSubTab(tb.id as any)}
                        className={`px-3 py-2 font-extrabold border-b-2 whitespace-nowrap transition cursor-pointer ${
                          supplierSubTab === tb.id
                            ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>

                  {/* Conteúdo da Sub-Aba ativa */}
                  <div className="p-4">
                    {supplierSubTab === 'DISCOUNTS' && (
                      <div className="space-y-3">
                        {supplierOverview.configured_discounts.length > 0 ? (
                          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-600 dark:text-slate-300">
                                <tr>
                                  <th className="py-2 px-3">Cód. Editora</th>
                                  <th className="py-2 px-3">Editora / Selo</th>
                                  <th className="py-2 px-3">CNPJ Fornecedor</th>
                                  <th className="py-2 px-3 text-right">Desconto (%)</th>
                                  <th className="py-2 px-3">Atualizado por</th>
                                  <th className="py-2 px-3 text-right">Ações</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                                {supplierOverview.configured_discounts.map((d) => (
                                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-2 px-3 font-mono font-bold">#{d.cod_editora}</td>
                                    <td className="py-2 px-3 font-extrabold text-slate-900 dark:text-white">
                                      {d.nome_editora}
                                    </td>
                                    <td className="py-2 px-3 font-mono text-slate-500">
                                      {formatCnpj(d.cnpj_fornecedor)}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      {editingDiscountId === d.id ? (
                                        <div className="inline-flex items-center gap-1 justify-end">
                                          <CurrencyInput
                                            value={editingDiscountPct}
                                            onChangeValue={(val) => setEditingDiscountPct(val)}
                                            suffixStr="%"
                                            max={100}
                                            className="w-24 text-right px-2 py-1 rounded-lg border border-indigo-400 bg-white dark:bg-slate-800 font-mono text-xs font-extrabold"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateSingleDiscount(d, editingDiscountPct)}
                                            className="p-1 rounded bg-emerald-600 text-white cursor-pointer"
                                            title="Salvar"
                                          >
                                            <Check className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingDiscountId(null)}
                                            className="p-1 rounded bg-slate-200 text-slate-700 cursor-pointer"
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
                                          className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono font-extrabold hover:ring-1 hover:ring-emerald-400 cursor-pointer"
                                          title="Clique para editar o desconto (%)"
                                        >
                                          {d.desconto_percentual.toLocaleString('pt-BR', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                          % ✎
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-[11px] text-slate-500">
                                      {d.updated_by_name || '—'}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteDiscount(d.id)}
                                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
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
                          <p className="text-xs text-slate-500 py-2">
                            Nenhum selo/editora vinculado ainda para este fornecedor nesta filial.
                          </p>
                        )}

                        {/* Sugestões inteligentes de Editoras detectadas nas NFs / Horus deste fornecedor */}
                        {supplierOverview.horus_suggested_publishers.some((s) => !s.already_configured) && (
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <p className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-2">
                              Editoras identificadas no histórico deste fornecedor no Horus (clique para pré-selecionar):
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {supplierOverview.horus_suggested_publishers
                                .filter((s) => !s.already_configured)
                                .slice(0, 15)
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
                                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-indigo-500 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-1"
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
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 max-h-64">
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
                              <div className="p-6 text-center text-xs text-slate-500">
                                Nenhum registro nos últimos 12 meses nesta filial.
                              </div>
                            );
                          }
                          return (
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-600 dark:text-slate-300 sticky top-0">
                                <tr>
                                  <th className="py-2 px-3">NF</th>
                                  <th className="py-2 px-3">Data</th>
                                  <th className="py-2 px-3">CFOP</th>
                                  <th className="py-2 px-3 text-right">Títulos</th>
                                  <th className="py-2 px-3 text-right">Exemplares</th>
                                  <th className="py-2 px-3 text-right">Valor Líquido</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono font-bold">
                                {rows.map((nf) => (
                                  <tr key={`${nf.cod_nf}-${nf.nro_nf}`}>
                                    <td className="py-1.5 px-3">{nf.nro_nf}</td>
                                    <td className="py-1.5 px-3">{formatDateBr(nf.data_nf)}</td>
                                    <td className="py-1.5 px-3">
                                      {nf.cfop} {nf.tipo ? `• ${nf.tipo}` : ''}
                                    </td>
                                    <td className="py-1.5 px-3 text-right">{nf.qtd_skus}</td>
                                    <td className="py-1.5 px-3 text-right">{nf.qtd_exemplares}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-900 dark:text-white">
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
                      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 max-h-64">
                        {supplierOverview.history.pedidos_compra_horus.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500">
                            Nenhum pedido de compra anterior registrado em PEDIDOS_COMPRA para este fornecedor nesta filial.
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-600 dark:text-slate-300 sticky top-0">
                              <tr>
                                <th className="py-2 px-3">Pedido #</th>
                                <th className="py-2 px-3">Data</th>
                                <th className="py-2 px-3">Status Horus</th>
                                <th className="py-2 px-3 text-right">Exemplares</th>
                                <th className="py-2 px-3 text-right">Desc. Médio</th>
                                <th className="py-2 px-3 text-right">Líquido</th>
                                <th className="py-2 px-3">Usuário</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono font-bold">
                              {supplierOverview.history.pedidos_compra_horus.map((pc) => (
                                <tr key={pc.cod_pedido}>
                                  <td className="py-1.5 px-3 text-indigo-700 dark:text-indigo-300">#{pc.cod_pedido}</td>
                                  <td className="py-1.5 px-3">{formatDateBr(pc.dat_pedido)}</td>
                                  <td className="py-1.5 px-3 font-sans">{pc.status_label}</td>
                                  <td className="py-1.5 px-3 text-right">{pc.qtd_itens}</td>
                                  <td className="py-1.5 px-3 text-right">{pc.per_desconto.toFixed(1)}%</td>
                                  <td className="py-1.5 px-3 text-right">{formatMoney(pc.vlr_liquido)}</td>
                                  <td className="py-1.5 px-3 font-sans text-slate-500">{pc.nom_usuario}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* ════════════════════════════════════════════════════════════════════ */}
                {/* 3º PASSO: PESQUISA DE ITENS / PLANILHA + GRADE DO PEDIDO DE COMPRA  */}
                {/* ════════════════════════════════════════════════════════════════════ */}
                {supplierOverview.is_ready_for_purchase && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-3 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase text-emerald-600">
                          3º Passo • Montagem do Pedido na Filial
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                          Pesquisar Item (ISBN / Título / Cód.) ou Importar Planilha
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {Object.values(checkedCartCods).some(Boolean) && (
                          <button
                            type="button"
                            onClick={() => {
                              const targets = cartItems.filter((c) => checkedCartCods[c.cod_item]);
                              openCartReconcileModal(targets);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                          >
                            <DatabaseZap className="w-3.5 h-3.5" />
                            Ajustar Editora em Lote ({Object.values(checkedCartCods).filter(Boolean).length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowSheetModal(true)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Importar Planilha (ISBN + Qtd)
                        </button>
                      </div>
                    </div>

                    {/* Barra de Busca Rápida de Item */}
                    <form onSubmit={handleLookupItems} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-8">
                        <input
                          type="text"
                          value={itemSearchTerm}
                          onChange={(e) => setItemSearchTerm(e.target.value)}
                          placeholder="Bipe ou digite o ISBN, Cód. Horus ou Título do Livro..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={itemSearchDefaultQty}
                          onChange={(e) => setItemSearchDefaultQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          placeholder="Qtd"
                          title="Quantidade padrão ao adicionar"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-extrabold text-right"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          disabled={searchingItems}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {searchingItems ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                          Pesquisar
                        </button>
                      </div>
                    </form>

                    {/* Resultados de Pesquisa quando há múltiplos itens */}
                    {itemLookupResults.length > 0 && (
                      <div className="border border-indigo-200 dark:border-indigo-900 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden">
                        <div className="px-3 py-1.5 bg-indigo-100/70 dark:bg-indigo-950/60 flex items-center justify-between text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
                          <span>Resultados no Acervo Horus ({itemLookupResults.length}) — Clique para incluir no pedido:</span>
                          <button
                            type="button"
                            onClick={() => setItemLookupResults([])}
                            className="text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Fechar
                          </button>
                        </div>
                        <div className="max-h-56 overflow-y-auto divide-y divide-indigo-100 dark:divide-indigo-900/50 text-xs">
                          {itemLookupResults.map((resIt) => (
                            <div
                              key={resIt.cod_item}
                              className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white dark:hover:bg-slate-900"
                            >
                              <div className="min-w-0">
                                <div className="font-extrabold text-slate-900 dark:text-white truncate">
                                  <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                                    [{resIt.isbn || resIt.cod_item}]
                                  </span>
                                  {resIt.nome_item}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                                  <span>
                                    Editora:{' '}
                                    <strong className={resIt.publisher_configured ? 'text-emerald-700' : 'text-amber-700'}>
                                      {resIt.nome_editora}
                                    </strong>
                                  </span>
                                  <span>Saldo Filial: <strong>{resIt.stock_available}</strong></span>
                                  <span>Consig. Rec.: <strong>{resIt.consigned_received}</strong></span>
                                  <span>VDS 90d: <strong>{resIt.sales_90}</strong></span>
                                  <span>Capa: <strong>{formatMoney(resIt.vlr_capa)}</strong></span>
                                  <span>
                                    Desc.:{' '}
                                    <strong className={resIt.publisher_configured ? 'text-emerald-700' : 'text-rose-600'}>
                                      {resIt.publisher_configured ? `${resIt.discount_pct.toFixed(2)}%` : 'Não config.'}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  addOrMergeItemToCart(resIt, Math.max(1, itemSearchDefaultQty));
                                  toast.success(`'${resIt.nome_item}' incluído no pedido.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shrink-0 cursor-pointer"
                              >
                                + Incluir ({itemSearchDefaultQty})
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Alerta de ISBNs não localizados na última importação */}
                    {lastNotFoundIsbns.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-start justify-between gap-2">
                        <div>
                          <strong>Atenção:</strong> {lastNotFoundIsbns.length} código(s)/ISBN(s) da planilha não existem em{' '}
                          <code>ITENS_ESTOQUE_GERAL</code> no Horus (cadastre primeiro no Horus ERP):{' '}
                          <span className="font-mono">{lastNotFoundIsbns.slice(0, 12).join(', ')}</span>
                          {lastNotFoundIsbns.length > 12 && '...'}
                        </div>
                        <button
                          type="button"
                          onClick={() => setLastNotFoundIsbns([])}
                          className="text-rose-600 font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Grade de Itens do Pedido de Compra */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs min-w-[980px]">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-600 dark:text-slate-300">
                          <tr>
                            <th className="py-2 px-2.5 w-9 text-center">
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
                            <th className="py-2 px-2.5">ISBN / Cód.</th>
                            <th className="py-2 px-2.5">Título</th>
                            <th className="py-2 px-2.5">Editora / Selo (Horus)</th>
                            <th className="py-2 px-2.5 text-right">Saldo / Mín.</th>
                            <th className="py-2 px-2.5 text-right">Consig / VDS 90d</th>
                            <th className="py-2 px-2.5 text-right w-24">Qtd.</th>
                            <th className="py-2 px-2.5 text-right">Capa</th>
                            <th className="py-2 px-2.5 text-right">Desc.</th>
                            <th className="py-2 px-2.5 text-right">Líq. Unit.</th>
                            <th className="py-2 px-2.5 text-right">Subtotal Líq.</th>
                            <th className="py-2 px-2.5 text-center w-12">Rem.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                          {cartItems.length === 0 ? (
                            <tr>
                              <td colSpan={12} className="py-10 text-center text-slate-400">
                                Nenhum item adicionado ainda. Use a busca acima ou importe uma planilha ISBN + Quantidade.
                              </td>
                            </tr>
                          ) : (
                            cartItems.map((it) => {
                              const hasWarning = !it.publisher_configured || it.vlr_capa <= 0;
                              return (
                                <tr
                                  key={it.cod_item}
                                  className={
                                    hasWarning
                                      ? 'bg-amber-50/90 dark:bg-amber-950/30'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                  }
                                >
                                  <td className="py-2 px-2.5 text-center">
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
                                  <td className="py-2 px-2.5 font-mono text-[11px]">
                                    <div className="font-bold text-slate-900 dark:text-white">{it.isbn || '—'}</div>
                                    <div className="text-slate-400">#{it.cod_item}</div>
                                  </td>
                                  <td className="py-2 px-2.5 max-w-[240px]">
                                    <div className="font-extrabold text-slate-900 dark:text-white truncate" title={it.nome_item}>
                                      {it.nome_item}
                                    </div>
                                    {it.last_entry_date && (
                                      <div className="text-[10px] text-slate-500">
                                        Últ. {it.last_entry_type}: {formatDateBr(it.last_entry_date)} ({it.last_entry_qty} un)
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`font-bold ${
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
                                        className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white text-[10px] font-extrabold cursor-pointer"
                                        title="Alterar Editora/Selo deste item no Horus + Cronuz"
                                      >
                                        Ajustar Selo
                                      </button>
                                    </div>
                                    {!it.publisher_configured && it.cod_editora && (
                                      <div className="mt-1 flex flex-wrap items-center gap-1">
                                        <span className="text-[10px] font-extrabold text-rose-600">
                                          ⚠ Editora sem desconto neste fornecedor
                                        </span>
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
                                          + Cadastrar Desconto
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono">
                                    <span className={it.stock_available <= 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                                      {it.stock_available}
                                    </span>
                                    <span className="text-slate-400"> / {it.min_stock || '—'}</span>
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono text-[11px]">
                                    <span className="text-purple-700 dark:text-purple-300">{it.consigned_received}</span>
                                    <span className="text-slate-400"> / {it.sales_90}</span>
                                  </td>
                                  <td className="py-2 px-2.5 text-right">
                                    <input
                                      type="number"
                                      min={1}
                                      value={it.quantity}
                                      onChange={(e) => updateCartItemQty(it.cod_item, parseInt(e.target.value, 10) || 1)}
                                      className="w-18 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono font-extrabold"
                                    />
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono">{formatMoney(it.vlr_capa)}</td>
                                  <td className="py-2 px-2.5 text-right font-mono">
                                    {it.publisher_configured ? (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">
                                        {it.discount_pct.toFixed(2)}%
                                      </span>
                                    ) : (
                                      <span className="text-rose-600 font-extrabold">Pendente</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono">{formatMoney(it.unit_net_price)}</td>
                                  <td className="py-2 px-2.5 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                                    {formatMoney(it.subtotal_net)}
                                  </td>
                                  <td className="py-2 px-2.5 text-center">
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

                    {/* Rodapé de Fechamento & Botão Único de Geração AP no Horus */}
                    {cartItems.length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-extrabold text-slate-600 dark:text-slate-300 mb-1">
                              Modalidade no Horus (COMPRA_CONSIG)
                            </label>
                            <select
                              value={compraConsig}
                              onChange={(e) => setCompraConsig(e.target.value === 'S' ? 'S' : 'N')}
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                            >
                              <option value="N">Compra Firme (N)</option>
                              <option value="S">Consignação (S)</option>
                            </select>
                          </div>
                          <div className="md:col-span-9">
                            <label className="block text-[11px] font-extrabold text-slate-600 dark:text-slate-300 mb-1">
                              Observações do Pedido (enviadas em CAIXA ALTA para OBS_PEDIDO_COMPRA no Horus)
                            </label>
                            <input
                              type="text"
                              maxLength={250}
                              value={orderObservations}
                              onChange={(e) => setOrderObservations(e.target.value)}
                              placeholder="Ex: REPOSIÇÃO LOJA POMPEIA - FRETE CIF..."
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold uppercase"
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-4 text-xs">
                            <div>
                              <span className="text-slate-500">Títulos / Exemplares:</span>{' '}
                              <strong className="font-mono text-slate-900 dark:text-white">
                                {cartSummary.skus} / {cartSummary.totalQty}
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Bruto:</span>{' '}
                              <strong className="font-mono">{formatMoney(cartSummary.gross)}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Desc. Médio:</span>{' '}
                              <strong className="font-mono text-emerald-700">{cartSummary.avgDisc.toFixed(2)}%</strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Total Líquido:</span>{' '}
                              <strong className="font-mono text-base text-indigo-700 dark:text-indigo-300">
                                {formatMoney(cartSummary.net)}
                              </strong>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={creatingOrder || cartSummary.invalidCount > 0}
                            onClick={handleCreatePurchaseOrder}
                            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
                          >
                            {creatingOrder ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            {cartSummary.invalidCount > 0
                              ? `Corrija ${cartSummary.invalidCount} item(ns) pendente(s)`
                              : 'Gerar Pedido no Horus (Status AP - Aprovado)'}
                          </button>
                        </div>
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
      {/* ABA 2: PEDIDOS GERADOS (AP / AE / HISTÓRICO & EXPORTAÇÃO EXCEL)       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'ORDERS' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'ALL', label: 'Todos' },
                { key: 'AP', label: 'Aprovados (AP)' },
                { key: 'AE', label: 'Aguardando Entrega (AE)' },
                { key: 'EE', label: 'Encerrados / Recebidos (EE)' },
                { key: 'CA', label: 'Cancelados (CA)' },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setOrderStatusFilter(st.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    orderStatusFilter === st.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={orderSearchFilter}
                onChange={(e) => setOrderSearchFilter(e.target.value)}
                placeholder="Nº Pedido Horus ou Fornecedor..."
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              />
              <button
                type="button"
                onClick={fetchOrdersList}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
                Sincronizar Horus
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs min-w-[920px]">
              <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Pedido Horus</th>
                  <th className="py-2.5 px-3">Filial</th>
                  <th className="py-2.5 px-3">Fornecedor</th>
                  <th className="py-2.5 px-3">Data / Criado por</th>
                  <th className="py-2.5 px-3 text-right">Itens / Exemp.</th>
                  <th className="py-2.5 px-3 text-right">Total Líquido</th>
                  <th className="py-2.5 px-3 text-center">Status (Horus / Cronuz)</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                {loadingOrders ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1.5 text-indigo-600" />
                      Sincronizando status dos pedidos com PEDIDOS_COMPRA no Horus...
                    </td>
                  </tr>
                ) : ordersList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Nenhum pedido de compra encontrado para este filtro.
                    </td>
                  </tr>
                ) : (
                  ordersList.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-700 dark:text-indigo-300">
                        #{ord.horus_cod_pedido || ord.id}
                      </td>
                      <td className="py-2.5 px-3">{ord.branch_name}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-extrabold text-slate-900 dark:text-white">{ord.nome_fornecedor}</div>
                        <div className="text-[11px] font-mono text-slate-400">{formatCnpj(ord.cnpj_fornecedor)}</div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        <div>{formatDateTimeBr(ord.created_at)}</div>
                        <div className="text-slate-400">por {ord.created_by_name || '—'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {ord.total_skus} / <strong>{ord.total_quantity}</strong>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-white">
                        {formatMoney(ord.total_net)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                            ord.horus_status === 'AP'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : ord.horus_status === 'AE'
                              ? 'bg-sky-50 text-sky-800 border-sky-300'
                              : ord.horus_status === 'EE'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : ord.horus_status === 'CA'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {ord.status_label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
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
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            Gerar Excel
                          </button>
                          {ord.horus_status === 'AP' && (
                            <button
                              type="button"
                              onClick={() => handleManualStatusTransition(ord.id, 'AE')}
                              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-extrabold cursor-pointer"
                              title="Mudar status para AE (Aguardando Entrega) no Horus e no Cronuz"
                            >
                              Mudar p/ AE
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openOrderDetailModal(ord.id)}
                            className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            Histórico
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
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ABA 3: PARAMETRIZAÇÃO OPERACIONAL & TEMPLATE DE E-MAIL POR FILIAL     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'BRANCH_CONFIG' && selectedBranch && (
        <form
          onSubmit={handleSaveBranchSettings}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 shadow-xs max-w-4xl"
        >
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" />
              Parametrização de Compras &amp; E-mail — {selectedBranch.label}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada filial possui seus próprios padrões operacionais no Horus e seu próprio remetente/texto de e-mail para envio de pedidos aos fornecedores.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
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
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="N">Compra Firme (N)</option>
                <option value="S">Consignação (S)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
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
                Habilitar disparo para esta filial
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome de Exibição (Filial)
                </label>
                <input
                  type="text"
                  value={branchConfigForm.sender_name || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, sender_name: e.target.value }))}
                  placeholder="Ex: Compras Paisagem Pompeia"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail de Resposta (Reply-To da Filial)
                </label>
                <input
                  type="email"
                  value={branchConfigForm.reply_to_email || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, reply_to_email: e.target.value }))}
                  placeholder="compras.pompeia@livrariapaisagem.com.br"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cópias Ocultas / CC da Filial
                </label>
                <input
                  type="text"
                  value={branchConfigForm.cc_emails || ''}
                  onChange={(e) => setBranchConfigForm((p) => ({ ...p, cc_emails: e.target.value }))}
                  placeholder="recebimento@..., gerencia@..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Assunto do E-mail
              </label>
              <input
                type="text"
                value={branchConfigForm.email_subject_template || ''}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_subject_template: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Texto Padrão do E-mail desta Filial (suporta {'{fornecedor_nome}'}, {'{cod_pedido}'}, {'{filial_nome}'}, {'{filial_cnpj}'}, {'{qtd_exemplares}'}, {'{valor_liquido}'})
              </label>
              <textarea
                rows={5}
                value={branchConfigForm.email_body_template || ''}
                onChange={(e) => setBranchConfigForm((p) => ({ ...p, email_body_template: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBranchConfig}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
            >
              {savingBranchConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar Parametrização desta Filial
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
              className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">
                    Vincular Editoras / Selos e Desconto (%) na Filial
                  </h3>
                  <p className="text-[11px] text-slate-300 truncate">
                    Fornecedor: {supplierOverview.supplier.nom_fornecedor} • Filial: {selectedBranch?.nome}
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
                      Pesquisar Editora/Selo na tabela EDITORA do Horus (marque 1 ou mais):
                    </label>
                    <input
                      type="text"
                      value={pubSearchTerm}
                      onChange={(e) => {
                        setPubSearchTerm(e.target.value);
                        searchHorusPublishersForModal(e.target.value);
                      }}
                      placeholder="Nome ou código da editora no Horus..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
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
                      className="w-full px-3 py-2 rounded-xl border border-indigo-400 bg-white dark:bg-slate-800 text-right font-mono text-xs font-extrabold"
                    />
                  </div>
                </div>

                {Object.keys(selectedPubsForSupplier).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                    {Object.values(selectedPubsForSupplier).map((sp) => (
                      <span
                        key={sp.cod_editora}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold"
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
                          className={`px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer ${
                            checked ? 'bg-indigo-50 dark:bg-indigo-950/50 font-extrabold' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 font-semibold'
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

              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {Object.keys(selectedPubsForSupplier).length} editora(s) marcada(s) • Desconto:{' '}
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
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">Importar Planilha de Pedido (ISBN + Quantidade)</h3>
                  <p className="text-[11px] text-slate-300">
                    Reconhece automaticamente colunas ISBN/EAN e Quantidade (.xlsx ou .csv até 10 MB).
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
                    Arquivo Excel (.xlsx) ou CSV (máx. 10 MB):
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
                  className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-bold border border-slate-300 dark:border-slate-700 rounded-xl p-2"
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
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
                  Processar e Validar na Filial
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
              className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-2">
                    <DatabaseZap className="w-4 h-4 text-amber-400" />
                    Conciliar Editora / Selo do(s) Item(ns) (Horus + Cronuz)
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
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                />

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {reconcilePubOptions.map((pub) => {
                    const isSel = selectedReconcilePub?.cod_editora === pub.cod_editora;
                    return (
                      <button
                        key={pub.cod_editora}
                        type="button"
                        onClick={() =>
                          setSelectedReconcilePub({ cod_editora: pub.cod_editora, nome_editora: pub.nome_editora })
                        }
                        className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs cursor-pointer ${
                          isSel ? 'bg-indigo-50 dark:bg-indigo-950/60 font-extrabold text-indigo-800 dark:text-indigo-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 font-semibold'
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

              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
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
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 bg-emerald-900 text-white flex items-center justify-between">
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

              <div className="p-5 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  A planilha Excel será gerada com <strong>ISBN, Título, Editora, Quantidade, Preço Capa, Desconto (%) e Preço Líquido</strong> para o fornecedor{' '}
                  <strong>{exportPromptOrder.nome_fornecedor}</strong>.
                </p>

                {exportPromptOrder.horus_status === 'AP' ? (
                  <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 space-y-1">
                    <p className="font-extrabold">Deseja também avançar o status para AE (Aguardando Entrega)?</p>
                    <p className="text-[11px]">
                      Ao confirmar com transição, o sistema altera o pedido no Horus para <code>AE</code> (alimentando o saldo previsto aguardando entrega) e no Cronuz para <strong>Aguardando Entrega</strong>, gravando seu usuário e data/hora no histórico.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Status atual do pedido: <strong>{exportPromptOrder.horus_status}</strong>.
                  </p>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  {exportPromptOrder.horus_status === 'AP' && (
                    <button
                      type="button"
                      disabled={exportingExcel}
                      onClick={() => handleExportOrderExcel(exportPromptOrder.id, true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {exportingExcel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      Baixar Excel + Mudar para AE (Aguardando Entrega)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={exportingExcel}
                    onClick={() => handleExportOrderExcel(exportPromptOrder.id, false)}
                    className="w-full py-2 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    Apenas Baixar Excel (Manter status {exportPromptOrder.horus_status})
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 5: DETALHES DO PEDIDO & AUDITORIA COMPLETA DE USUÁRIOS/DATAS     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {(detailModalData || loadingOrderDetail) && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold">
                    Detalhes &amp; Auditoria do Pedido #{detailModalData?.order.horus_cod_pedido || detailModalData?.order.id || ''}
                  </h3>
                  {detailModalData && (
                    <p className="text-[11px] text-slate-300">
                      {detailModalData.order.branch_name} • {detailModalData.order.nome_fornecedor} •{' '}
                      <strong>{detailModalData.order.status_label}</strong>
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
                  Carregando itens e trilha de auditoria...
                </div>
              ) : (
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                  {/* Trilha de Auditoria (Usuários e Datas das Alterações) */}
                  <div>
                    <h4 className="text-xs font-extrabold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600" />
                      Histórico de Alterações, Exportações e Status (Auditoria)
                    </h4>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800/40 text-xs">
                      {detailModalData.logs.map((lg) => (
                        <div key={lg.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b last:border-0 border-slate-200/70 dark:border-slate-700/60">
                          <div>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-mono text-[10px] font-extrabold mr-2">
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

                  {/* Itens Gravados */}
                  <div>
                    <h4 className="text-xs font-extrabold uppercase text-slate-500 mb-2">
                      Itens do Pedido ({detailModalData.items.length})
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 max-h-72">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-[11px] font-extrabold uppercase text-slate-600 sticky top-0">
                          <tr>
                            <th className="py-2 px-3">ISBN</th>
                            <th className="py-2 px-3">Título</th>
                            <th className="py-2 px-3">Editora</th>
                            <th className="py-2 px-3 text-right">Qtd</th>
                            <th className="py-2 px-3 text-right">Capa</th>
                            <th className="py-2 px-3 text-right">Desc.</th>
                            <th className="py-2 px-3 text-right">Subtotal Líq.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                          {detailModalData.items.map((it) => (
                            <tr key={it.id}>
                              <td className="py-1.5 px-3 font-mono">{it.isbn || `#${it.cod_item}`}</td>
                              <td className="py-1.5 px-3 font-bold">{it.nome_item}</td>
                              <td className="py-1.5 px-3">{it.nome_editora}</td>
                              <td className="py-1.5 px-3 text-right font-mono">{it.quantity}</td>
                              <td className="py-1.5 px-3 text-right font-mono">{formatMoney(it.unit_cover_price)}</td>
                              <td className="py-1.5 px-3 text-right font-mono text-emerald-700">
                                {Number(it.discount_pct || 0).toFixed(2)}%
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono font-extrabold">
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
    </div>
  );
}

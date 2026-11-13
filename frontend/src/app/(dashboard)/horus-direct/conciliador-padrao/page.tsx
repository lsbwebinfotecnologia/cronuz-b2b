'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Building2,
  ArrowRight,
  Search,
  RefreshCw,
  Check,
  Download,
  Layers,
  Link2,
  ShieldCheck,
  Settings,
  Info,
  Eye,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Keyboard,
  Clock,
  Database,
  History,
  FileText,
  Plus,
  Trash2,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const MAX_SHEET_BYTES = 10 * 1024 * 1024; // 10 MB (Regra 1 AGENTS.md)

interface ColumnMappingConfig {
  engine_preset?: 'DYNAMIC' | 'SHOPEE' | 'VINDI' | 'TIKTOK' | string;
  key_col?: string;
  key_extract_rule?: 'AUTO' | 'EXACT' | 'DIGITS_ONLY' | 'AFTER_HASH' | 'REGEX' | string;
  key_regex?: string;
  valor_liquido_col?: string;
  valor_bruto_col?: string;
  taxa_col?: string;
  data_pagamento_col?: string;
  tipo_transacao_col?: string;
  cliente_col?: string;
  documento_col?: string;
  deduct_debit_rows?: boolean;
  bridge_channel_key_col?: string;
  bridge_channel_extract_rule?: string;
  bridge_horus_key_col?: string;
  bridge_horus_extract_rule?: string;
  bridge_valor_pedido_col?: string;
}

interface DynamicTemplate {
  id: number;
  company_id: number;
  code: string;
  name: string;
  short_name: string;
  channel_label: string;
  hub_label: string;
  badge: string;
  description: string;
  mode: 'SINGLE_FILE' | 'DUAL_FILE';
  file_1_label: string;
  file_2_label: string | null;
  horus_match_field:
    | 'NRO_NOTA_FISCAL'
    | 'COD_PED_VENDA'
    | 'NRO_LANCTO_CRECEBER'
    | 'COD_PEDIDO_ORIGEM'
    | 'AUTO'
    | string;
  column_mapping: ColumnMappingConfig;
  forma_pagto: string;
  forma_pagto_credito_maior: string;
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  payment_date_mode: 'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN' | string;
  unify_installments: boolean;
  split_excess_launch: boolean;
  is_active: boolean;
  is_system_preset: boolean;
  bank_configured: boolean;
  effective_bank: BankConfig;
}

interface SecurityAuditInfo {
  verified: boolean;
  elapsed_seconds: number;
  total_batches: number;
  total_orders_checked: number;
  horus_titles_fetched: number;
  completed_at: string;
}

interface JobProgressState {
  status: 'RUNNING' | 'COMPLETED' | 'ERROR';
  phase: string;
  percent: number;
  message: string;
  current_batch: number;
  total_batches: number;
  processed_orders: number;
  total_orders: number;
  horus_found_count: number;
  elapsed_seconds: number;
  bordero_number?: number;
}

interface SummaryData {
  profile_code?: string;
  template_id?: number;
  horus_match_field?: string;
  is_dual_file?: boolean;
  unify_installments?: boolean;
  split_excess_launch?: boolean;
  forma_pagto_credito_maior?: string;
  credito_maior_count?: number;
  credito_maior_total?: number;
  unificadas_orders_count?: number;
  unificadas_parcelas_count?: number;
  total_planilha_qtd: number;
  total_planilha_linhas?: number;
  total_planilha_valor: number;
  total_planilha_liq?: number;
  total_planilha_entradas_liq?: number;
  total_planilha_saidas_qtd?: number;
  total_planilha_saidas_valor?: number;
  tray_total_rows?: number;
  tray_linked_qtd?: number;
  tray_unlinked_qtd?: number;
  ready_qtd: number;
  ready_valor: number;
  divergence_qtd: number;
  divergence_valor: number;
  divergence_diff_total?: number;
  total_taxa_vindi?: number;
  already_paid_qtd: number;
  already_paid_valor?: number;
  abertos_qtd?: number;
  abertos_valor?: number;
  abertos_valor_liquido?: number;
  pagos_qtd?: number;
  pagos_valor?: number;
  not_found_qtd: number;
  not_found_valor: number;
  filial_consultada: string;
  security_audit?: SecurityAuditInfo;
}

interface BankConfig {
  profile_code?: string;
  forma_pagto: string;
  forma_pagto_credito_maior?: string;
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  payment_date_mode?: string;
  unify_installments?: boolean;
  split_excess_launch?: boolean;
  cod_empresa: string;
  cod_filial: string;
  is_configured: boolean;
}

interface ReleaseItem {
  linha: number;
  pedido_canal?: string;
  pedido_tray?: string;
  vinculo_tray_ok?: boolean;
  valor_tray?: number;
  pedido_web: string;
  nro_lancamento?: number;
  cod_ped_venda?: number;
  cod_filial?: string;
  nro_nota_fiscal?: string;
  cliente_nome: string;
  documento: string;
  valor_vindi: number;
  valor_horus?: number;
  valor_horus_original?: number;
  valor_credito_maior?: number;
  has_credito_maior_split?: boolean;
  forma_pagto_credito_maior?: string;
  acrescimo_tray?: number;
  desconto_tray?: number;
  valor_liquido?: number;
  valor_bruto?: number;
  taxa?: number;
  diff_taxa?: number;
  diff_taxa_abs?: number;
  diferenca_valor_abs?: number;
  diferenca_valor?: number;
  data_pagamento: string;
  status_horus?: string;
  situacao_horus?: string;
  status_vindi?: string;
  cod_bordero?: number | null;
  forma_pagamento?: string;
  motivo?: string;
  is_mais_recente?: boolean;
  has_multiplos?: boolean;
  total_pedidos_horus?: number;
  total_parcelas?: number;
  parcela_num?: number;
  grouped_lancto_ids?: number[];
  unificadas_qtd?: number;
  selected?: boolean;
  _category?: 'ready' | 'divergence' | 'already_paid' | 'not_found';
}

const HORUS_MATCH_LABELS: Record<string, { label: string; badge: string; desc: string }> = {
  NRO_NOTA_FISCAL: {
    label: 'Nº da Nota Fiscal (NRO_NOTA_FISCAL)',
    badge: 'Nota Fiscal (NF)',
    desc: 'Busca o título em aberto no Horus pelo número da Nota Fiscal (NF_MESTRE.NRO_NOTA_FISCAL).',
  },
  COD_PED_VENDA: {
    label: 'Código do Pedido Horus (COD_PED_VENDA)',
    badge: 'Pedido Horus',
    desc: 'Busca pelo código numérico do Pedido de Venda no Horus (PEDIDOS_VENDA.COD_PED_VENDA).',
  },
  NRO_LANCTO_CRECEBER: {
    label: 'Nº Direto do Lançamento (NRO_LANCTO_CRECEBER)',
    badge: 'Nº Lançamento Direto',
    desc: 'Busca diretamente pelo número do título/lançamento no Contas a Receber (LANCTOS_CRECEBER).',
  },
  COD_PEDIDO_ORIGEM: {
    label: 'Pedido Web / E-commerce (COD_PEDIDO_ORIGEM)',
    badge: 'Pedido Origem / Web',
    desc: 'Busca pelo código do pedido de origem da loja virtual/hub gravado em PEDIDOS_VENDA.COD_PEDIDO_ORIGEM.',
  },
  AUTO: {
    label: 'Automático Multi-Chave (NF / Pedido / Lançamento)',
    badge: 'Automático Multi-Chave',
    desc: 'Tenta localizar automaticamente por Pedido Origem, Pedido Horus, Nota Fiscal ou Nº Lançamento.',
  },
};

function formatBRL(v: number | undefined | null): string {
  return Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ConciliadorPadraoPage() {
  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  // Modelos Dinâmicos da Empresa
  const [templates, setTemplates] = useState<DynamicTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [migratingPresets, setMigratingPresets] = useState(false);

  // Upload de planilhas para conciliação
  const [channelFile, setChannelFile] = useState<File | null>(null);
  const [trayFile, setTrayFile] = useState<File | null>(null);
  const [selectedFilial, setSelectedFilial] = useState('1');
  const [reading, setReading] = useState(false);
  const [jobProgress, setJobProgress] = useState<JobProgressState | null>(null);

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [bankConfig, setBankConfig] = useState<BankConfig | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Listas de conciliação
  const [itemsReady, setItemsReady] = useState<ReleaseItem[]>([]);
  const [itemsDivergence, setItemsDivergence] = useState<ReleaseItem[]>([]);
  const [itemsAlreadyPaid, setItemsAlreadyPaid] = useState<ReleaseItem[]>([]);
  const [itemsNotFound, setItemsNotFound] = useState<ReleaseItem[]>([]);

  // Filtros e busca na grade Excel
  const [activeFilterTab, setActiveFilterTab] = useState<
    'all' | 'abertos' | 'credito_maior' | 'pagos' | 'divergence' | 'not_found'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [inspectedItem, setInspectedItem] = useState<ReleaseItem | null>(null);

  // Modal de Borderô e Acompanhamento em Tempo Real
  const [showBorderoModal, setShowBorderoModal] = useState(false);
  const [creatingBordero, setCreatingBordero] = useState(false);
  const [borderoProgress, setBorderoProgress] = useState<JobProgressState | null>(null);
  const [paymentDateMode, setPaymentDateMode] = useState<
    'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN'
  >('CHANNEL_DATE');
  const [unifyInstallments, setUnifyInstallments] = useState<boolean>(true);
  const [splitExcessLaunch, setSplitExcessLaunch] = useState<boolean>(true);
  const [formaPagtoCreditoMaior, setFormaPagtoCreditoMaior] = useState<string>('');
  const [specificPaymentDate, setSpecificPaymentDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [borderoSuccess, setBorderoSuccess] = useState<{
    number: number;
    total: number;
    qtd: number;
    verified_count?: number;
    completed_at?: string;
    payment_date_mode?: string;
  } | null>(null);

  // Modal Construtor / Editor de Modelo Dinâmico ("De -> Para" + Banco)
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [inspectingSample, setInspectingSample] = useState(false);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [builderForm, setBuilderForm] = useState({
    name: '',
    short_name: '',
    channel_label: '',
    description: '',
    mode: 'SINGLE_FILE' as 'SINGLE_FILE' | 'DUAL_FILE',
    file_1_label: '',
    file_2_label: '',
    horus_match_field: 'NRO_NOTA_FISCAL',
    engine_preset: 'DYNAMIC',
    key_col: '',
    key_extract_rule: 'AUTO',
    key_regex: '',
    valor_liquido_col: '',
    valor_bruto_col: '',
    taxa_col: '',
    data_pagamento_col: '',
    tipo_transacao_col: '',
    cliente_col: '',
    documento_col: '',
    deduct_debit_rows: true,
    bridge_channel_key_col: '',
    bridge_horus_key_col: '',
    bridge_valor_pedido_col: '',
    forma_pagto: '',
    forma_pagto_credito_maior: '',
    banco: '',
    agencia: '',
    conta: '',
    carteira: '',
    payment_date_mode: 'CHANNEL_DATE',
    unify_installments: true,
    split_excess_launch: true,
  });

  // Histórico de Fechamentos
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [closingsList, setClosingsList] = useState<any[]>([]);
  const [loadingClosings, setLoadingClosings] = useState(false);
  const [selectedClosingDetail, setSelectedClosingDetail] = useState<any | null>(null);
  const [loadingClosingDetail, setLoadingClosingDetail] = useState(false);

  const channelFileInputRef = useRef<HTMLInputElement>(null);
  const trayFileInputRef = useRef<HTMLInputElement>(null);
  const sampleFileInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Carrega os modelos dinâmicos da empresa
  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/templates`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.default_filial) {
          setSelectedFilial(String(data.default_filial).trim());
        }
        const list: DynamicTemplate[] = Array.isArray(data.templates) ? data.templates : [];
        setTemplates(list);
        if (list.length > 0 && (!activeTemplateId || !list.some((t) => t.id === activeTemplateId))) {
          setActiveTemplateId(list[0].id);
        }
      }
    } catch {
      toast.error('Erro ao carregar modelos de conciliação.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [companyId]);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || templates[0] || null,
    [templates, activeTemplateId]
  );

  // Sincroniza configurações quando o modelo ativo muda
  useEffect(() => {
    if (!activeTemplate) return;
    setBankConfig(activeTemplate.effective_bank);
    setPaymentDateMode(
      (activeTemplate.payment_date_mode || 'CHANNEL_DATE') as
        | 'CHANNEL_DATE'
        | 'SPECIFIC_DATE'
        | 'BORDERO_OPEN'
    );
    setUnifyInstallments(Boolean(activeTemplate.unify_installments));
    setSplitExcessLaunch(Boolean(activeTemplate.split_excess_launch));
    setFormaPagtoCreditoMaior(activeTemplate.forma_pagto_credito_maior || '');
  }, [activeTemplate]);

  const isDualFileMode = activeTemplate?.mode === 'DUAL_FILE';

  const handleSelectTemplate = (tplId: number) => {
    setActiveTemplateId(tplId);
    setChannelFile(null);
    setTrayFile(null);
    setSummary(null);
    setItemsReady([]);
    setItemsDivergence([]);
    setItemsAlreadyPaid([]);
    setItemsNotFound([]);
    setWarnings([]);
    setBorderoSuccess(null);
    setActiveRowIndex(0);
    if (channelFileInputRef.current) channelFileInputRef.current.value = '';
    if (trayFileInputRef.current) trayFileInputRef.current.value = '';
  };

  const handleMigratePresets = async () => {
    setMigratingPresets(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/migrate-presets`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao sincronizar modelos padrão.');
      setTemplates(data.templates || []);
      toast.success(data.message || 'Modelos padrão migrados e sincronizados com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao sincronizar modelos.');
    } finally {
      setMigratingPresets(false);
    }
  };

  // Abre modal para criar Novo Modelo ou Editar Modelo Existente
  const openBuilderModal = (tpl?: DynamicTemplate) => {
    setDetectedHeaders([]);
    setSampleRows([]);
    if (tpl) {
      setEditingTemplateId(tpl.id);
      const cm = tpl.column_mapping || {};
      setBuilderForm({
        name: tpl.name || '',
        short_name: tpl.short_name || '',
        channel_label: tpl.channel_label || '',
        description: tpl.description || '',
        mode: tpl.mode || 'SINGLE_FILE',
        file_1_label: tpl.file_1_label || '',
        file_2_label: tpl.file_2_label || '',
        horus_match_field: tpl.horus_match_field || 'NRO_NOTA_FISCAL',
        engine_preset: cm.engine_preset || 'DYNAMIC',
        key_col: cm.key_col || '',
        key_extract_rule: cm.key_extract_rule || 'AUTO',
        key_regex: cm.key_regex || '',
        valor_liquido_col: cm.valor_liquido_col || '',
        valor_bruto_col: cm.valor_bruto_col || '',
        taxa_col: cm.taxa_col || '',
        data_pagamento_col: cm.data_pagamento_col || '',
        tipo_transacao_col: cm.tipo_transacao_col || '',
        cliente_col: cm.cliente_col || '',
        documento_col: cm.documento_col || '',
        deduct_debit_rows: cm.deduct_debit_rows !== undefined ? Boolean(cm.deduct_debit_rows) : true,
        bridge_channel_key_col: cm.bridge_channel_key_col || '',
        bridge_horus_key_col: cm.bridge_horus_key_col || '',
        bridge_valor_pedido_col: cm.bridge_valor_pedido_col || '',
        forma_pagto: tpl.forma_pagto || tpl.effective_bank?.forma_pagto || '',
        forma_pagto_credito_maior: tpl.forma_pagto_credito_maior || '',
        banco: tpl.banco || tpl.effective_bank?.banco || '',
        agencia: tpl.agencia || tpl.effective_bank?.agencia || '',
        conta: tpl.conta || tpl.effective_bank?.conta || '',
        carteira: tpl.carteira || tpl.effective_bank?.carteira || '',
        payment_date_mode: tpl.payment_date_mode || 'CHANNEL_DATE',
        unify_installments: Boolean(tpl.unify_installments),
        split_excess_launch: Boolean(tpl.split_excess_launch),
      });
    } else {
      setEditingTemplateId(null);
      const baseBank = activeTemplate?.effective_bank;
      setBuilderForm({
        name: '',
        short_name: '',
        channel_label: '',
        description: '',
        mode: 'SINGLE_FILE',
        file_1_label: '',
        file_2_label: '',
        horus_match_field: 'NRO_NOTA_FISCAL',
        engine_preset: 'DYNAMIC',
        key_col: '',
        key_extract_rule: 'AUTO',
        key_regex: '',
        valor_liquido_col: '',
        valor_bruto_col: '',
        taxa_col: '',
        data_pagamento_col: '',
        tipo_transacao_col: '',
        cliente_col: '',
        documento_col: '',
        deduct_debit_rows: true,
        bridge_channel_key_col: '',
        bridge_horus_key_col: '',
        bridge_valor_pedido_col: '',
        forma_pagto: baseBank?.forma_pagto || '',
        forma_pagto_credito_maior: baseBank?.forma_pagto_credito_maior || '',
        banco: baseBank?.banco || '',
        agencia: baseBank?.agencia || '',
        conta: baseBank?.conta || '',
        carteira: baseBank?.carteira || '',
        payment_date_mode: 'CHANNEL_DATE',
        unify_installments: true,
        split_excess_launch: true,
      });
    }
    setShowBuilderModal(true);
  };

  // Inspeciona planilha de exemplo para preencher automaticamente os cabeçalhos do De -> Para
  const handleInspectSampleSpreadsheet = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_SHEET_BYTES) {
      toast.error('O arquivo excede o limite máximo de 10 MB.');
      return;
    }
    setInspectingSample(true);
    try {
      const token = getToken();
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/inspect-columns`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao ler colunas da planilha.');

      setDetectedHeaders(data.headers || []);
      setSampleRows(data.sample_rows || []);
      const sug = data.suggested_mapping || {};
      setBuilderForm((prev) => ({
        ...prev,
        key_col: sug.key_col || prev.key_col,
        valor_liquido_col: sug.valor_liquido_col || prev.valor_liquido_col,
        valor_bruto_col: sug.valor_bruto_col || prev.valor_bruto_col,
        taxa_col: sug.taxa_col || prev.taxa_col,
        data_pagamento_col: sug.data_pagamento_col || prev.data_pagamento_col,
        tipo_transacao_col: sug.tipo_transacao_col || prev.tipo_transacao_col,
        cliente_col: sug.cliente_col || prev.cliente_col,
        documento_col: sug.documento_col || prev.documento_col,
      }));
      toast.success(
        `${(data.headers || []).length} colunas detectadas (cabeçalho na linha ${data.header_row_number})!`
      );
    } catch (e: any) {
      toast.error(e.message || 'Erro ao inspecionar planilha.');
    } finally {
      setInspectingSample(false);
    }
  };

  // Salva Novo Modelo ou Atualiza Modelo Existente
  const handleSaveTemplate = async () => {
    if (!builderForm.name.trim()) {
      toast.error('Informe o nome do Modelo de Conciliação.');
      return;
    }
    if (
      !builderForm.forma_pagto.trim() ||
      !builderForm.banco.trim() ||
      !builderForm.agencia.trim() ||
      !builderForm.conta.trim()
    ) {
      toast.error(
        'Preencha os códigos bancários do Horus (COD_FORMA, COD_BANCO, COD_AGENCIA e COD_CONTAC).'
      );
      return;
    }

    setSavingTemplate(true);
    try {
      const token = getToken();
      const payload = {
        name: builderForm.name.trim(),
        short_name: (builderForm.short_name || builderForm.name).trim(),
        channel_label: (
          builderForm.channel_label ||
          builderForm.short_name ||
          builderForm.name
        ).trim(),
        description: builderForm.description.trim(),
        mode: builderForm.mode,
        file_1_label: builderForm.file_1_label.trim(),
        file_2_label: builderForm.mode === 'DUAL_FILE' ? builderForm.file_2_label.trim() : null,
        horus_match_field: builderForm.horus_match_field,
        column_mapping: {
          engine_preset: builderForm.engine_preset || 'DYNAMIC',
          key_col: builderForm.key_col.trim(),
          key_extract_rule: builderForm.key_extract_rule,
          key_regex: builderForm.key_regex.trim(),
          valor_liquido_col: builderForm.valor_liquido_col.trim(),
          valor_bruto_col: builderForm.valor_bruto_col.trim(),
          taxa_col: builderForm.taxa_col.trim(),
          data_pagamento_col: builderForm.data_pagamento_col.trim(),
          tipo_transacao_col: builderForm.tipo_transacao_col.trim(),
          cliente_col: builderForm.cliente_col.trim(),
          documento_col: builderForm.documento_col.trim(),
          deduct_debit_rows: Boolean(builderForm.deduct_debit_rows),
          bridge_channel_key_col: builderForm.bridge_channel_key_col.trim(),
          bridge_horus_key_col: builderForm.bridge_horus_key_col.trim(),
          bridge_valor_pedido_col: builderForm.bridge_valor_pedido_col.trim(),
        },
        forma_pagto: builderForm.forma_pagto.trim(),
        forma_pagto_credito_maior: builderForm.forma_pagto_credito_maior.trim(),
        banco: builderForm.banco.trim(),
        agencia: builderForm.agencia.trim(),
        conta: builderForm.conta.trim(),
        carteira: builderForm.carteira.trim(),
        payment_date_mode: builderForm.payment_date_mode,
        unify_installments: Boolean(builderForm.unify_installments),
        split_excess_launch: Boolean(builderForm.split_excess_launch),
      };

      const url = editingTemplateId
        ? `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/templates/${editingTemplateId}`
        : `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/templates`;

      const res = await fetch(url, {
        method: editingTemplateId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar modelo.');

      setTemplates(data.templates || []);
      if (data.template?.id) {
        setActiveTemplateId(data.template.id);
      }
      setShowBuilderModal(false);
      toast.success(
        editingTemplateId
          ? `Modelo "${builderForm.name}" atualizado com sucesso!`
          : `Novo modelo "${builderForm.name}" criado com sucesso!`
      );
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar modelo.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (tpl: DynamicTemplate) => {
    if (!window.confirm(`Deseja realmente excluir o modelo "${tpl.name}"?`)) return;
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/templates/${tpl.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao excluir modelo.');
      setTemplates(data.templates || []);
      setShowBuilderModal(false);
      toast.success(`Modelo "${tpl.name}" removido.`);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover modelo.');
    }
  };

  // Validação de tamanho de arquivo (10 MB máx - Regra 1 AGENTS.md)
  const validateAndSetFile = (file: File | undefined, slot: 'CHANNEL' | 'TRAY') => {
    if (!file) return;
    if (file.size > MAX_SHEET_BYTES) {
      toast.error(
        `O arquivo "${file.name}" excede o limite máximo permitido de 10 MB para planilhas.`
      );
      return;
    }
    if (slot === 'CHANNEL') setChannelFile(file);
    else setTrayFile(file);
  };

  // Executa a conciliação usando o Modelo Dinâmico selecionado
  const handleRunReconciliation = async () => {
    if (!activeTemplate) return;
    if (!channelFile) {
      toast.error(`Selecione a planilha de ${activeTemplate.channel_label} para conciliar.`);
      return;
    }
    if (isDualFileMode && !trayFile) {
      toast.error(
        `O modelo "${activeTemplate.short_name}" utiliza 2 planilhas. Envie também o 2º arquivo.`
      );
      return;
    }

    setReading(true);
    setBorderoSuccess(null);
    setJobProgress({
      status: 'RUNNING',
      phase: 'LENDO_PLANILHAS',
      percent: 5,
      message: 'Enviando planilhas e aplicando mapeamento De/Para do modelo...',
      current_batch: 0,
      total_batches: 0,
      processed_orders: 0,
      total_orders: 0,
      horus_found_count: 0,
      elapsed_seconds: 0,
    });

    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', channelFile);
      if (isDualFileMode && trayFile) {
        formData.append('tray_file', trayFile);
      }

      const qs = new URLSearchParams({
        template_id: String(activeTemplate.id),
        filial: selectedFilial.trim() || '1',
        async_job: 'true',
        unify_installments: unifyInstallments ? 'true' : 'false',
        split_excess_launch: splitExcessLaunch ? 'true' : 'false',
      });

      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/preview?${qs.toString()}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const initialData = await res.json();
      if (!res.ok) {
        throw new Error(initialData.detail || 'Erro ao iniciar conciliação com o Horus SQL.');
      }

      let finalResult = initialData;
      if (initialData.job_id) {
        const jobId = initialData.job_id;
        let completed = false;
        while (!completed) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const pollRes = await fetch(
            `${API}/companies/${companyId}/horus-sql/reconciliation/jobs/${jobId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!pollRes.ok) {
            const errData = await pollRes.json().catch(() => ({}));
            throw new Error(errData.detail || 'Falha ao consultar progresso da conciliação.');
          }
          const jobState = await pollRes.json();
          setJobProgress({
            status: jobState.status,
            phase: jobState.phase || 'CONSULTANDO_HORUS',
            percent: jobState.percent ?? 20,
            message: jobState.message || 'Consultando títulos no Horus ERP...',
            current_batch: jobState.current_batch || 0,
            total_batches: jobState.total_batches || 0,
            processed_orders: jobState.processed_orders || 0,
            total_orders: jobState.total_orders || 0,
            horus_found_count: jobState.horus_found_count || 0,
            elapsed_seconds: jobState.elapsed_seconds || 0,
          });

          if (jobState.status === 'ERROR' || jobState.status === 'FAILED') {
            throw new Error(
              jobState.error || jobState.message || 'Erro durante o processamento dos lotes SQL.'
            );
          }
          if (jobState.status === 'COMPLETED' && jobState.result) {
            finalResult = jobState.result;
            completed = true;
          }
        }
      }

      setSummary(finalResult.summary);
      if (finalResult.bank_config) setBankConfig(finalResult.bank_config);
      setWarnings(Array.isArray(finalResult.warnings) ? finalResult.warnings : []);
      setItemsReady(
        (finalResult.items_ready || []).map((i: ReleaseItem) => ({ ...i, selected: true }))
      );
      setItemsDivergence(
        (finalResult.items_divergence || []).map((i: ReleaseItem) => ({ ...i, selected: true }))
      );
      setItemsAlreadyPaid(finalResult.items_already_paid || []);
      setItemsNotFound(finalResult.items_not_found || []);
      setActiveFilterTab('all');
      setActiveRowIndex(0);
      toast.success('Conciliação finalizada com 100% de integridade!');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao processar planilhas.');
    } finally {
      setReading(false);
      setJobProgress(null);
    }
  };

  // Lista consolidada para a grade Excel
  const unifiedRows = useMemo(() => {
    const r = itemsReady.map((i) => ({ ...i, _category: 'ready' as const }));
    const d = itemsDivergence.map((i) => ({ ...i, _category: 'divergence' as const }));
    const p = itemsAlreadyPaid.map((i) => ({ ...i, _category: 'already_paid' as const }));
    const n = itemsNotFound.map((i) => ({ ...i, _category: 'not_found' as const }));
    return [...r, ...d, ...p, ...n];
  }, [itemsReady, itemsDivergence, itemsAlreadyPaid, itemsNotFound]);

  const filteredRows = useMemo(() => {
    return unifiedRows.filter((row) => {
      if (activeFilterTab === 'abertos' && row.situacao_horus !== 'ABERTO') return false;
      if (activeFilterTab === 'credito_maior' && !(Number(row.valor_credito_maior || 0) > 0.009))
        return false;
      if (activeFilterTab === 'pagos' && row.situacao_horus !== 'PAGO') return false;
      if (activeFilterTab === 'divergence' && row._category !== 'divergence') return false;
      if (activeFilterTab === 'not_found' && row._category !== 'not_found') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCanal = (row.pedido_canal || '').toLowerCase().includes(q);
        const matchTray = (row.pedido_tray || '').toLowerCase().includes(q);
        const matchWeb = (row.pedido_web || '').toLowerCase().includes(q);
        const matchCli = (row.cliente_nome || '').toLowerCase().includes(q);
        const matchDoc = (row.documento || '').toLowerCase().includes(q);
        const matchNf = String(row.nro_nota_fiscal || '').toLowerCase().includes(q);
        const matchLanc = String(row.nro_lancamento || '').includes(q);
        const matchPed = String(row.cod_ped_venda || '').includes(q);
        return (
          matchCanal ||
          matchTray ||
          matchWeb ||
          matchCli ||
          matchDoc ||
          matchNf ||
          matchLanc ||
          matchPed
        );
      }
      return true;
    });
  }, [unifiedRows, activeFilterTab, searchQuery]);

  useEffect(() => {
    setActiveRowIndex(0);
  }, [activeFilterTab, searchQuery]);

  // Selecionados para gerar Borderô
  const selectedReleases = useMemo(() => {
    return [
      ...itemsReady.filter((i) => i.selected && i.nro_lancamento),
      ...itemsDivergence.filter((i) => i.selected && i.nro_lancamento),
    ];
  }, [itemsReady, itemsDivergence]);

  const totalSelectedBrutoAmount = useMemo(() => {
    return selectedReleases.reduce((acc, cur) => acc + (cur.valor_horus || cur.valor_vindi || 0), 0);
  }, [selectedReleases]);

  const totalSelectedTaxaAmount = useMemo(() => {
    return selectedReleases.reduce(
      (acc, cur) =>
        acc + (cur.diff_taxa !== undefined ? Math.abs(cur.diff_taxa) : cur.taxa || 0),
      0
    );
  }, [selectedReleases]);

  const totalSelectedAmount = useMemo(() => {
    return selectedReleases.reduce((acc, cur) => {
      if (unifyInstallments && cur.valor_liquido !== undefined && cur.valor_liquido > 0) {
        return acc + cur.valor_liquido;
      }
      return acc + (cur.valor_horus || cur.valor_vindi || 0);
    }, 0);
  }, [selectedReleases, unifyInstallments]);

  const toggleItemSelection = (nro_lancamento: number | undefined, cat: string | undefined) => {
    if (!nro_lancamento) return;
    if (cat === 'ready') {
      setItemsReady((prev) =>
        prev.map((item) =>
          item.nro_lancamento === nro_lancamento ? { ...item, selected: !item.selected } : item
        )
      );
    } else if (cat === 'divergence') {
      setItemsDivergence((prev) =>
        prev.map((item) =>
          item.nro_lancamento === nro_lancamento ? { ...item, selected: !item.selected } : item
        )
      );
    }
  };

  const toggleSelectAllOpen = (selectAll: boolean) => {
    setItemsReady((prev) => prev.map((i) => ({ ...i, selected: selectAll })));
    setItemsDivergence((prev) => prev.map((i) => ({ ...i, selected: selectAll })));
  };

  // Geração do Borderô no Horus ERP com Acompanhamento em Tempo Real
  const handleConfirmBordero = async () => {
    if (!activeTemplate) return;
    if (selectedReleases.length === 0) {
      toast.error('Selecione pelo menos um lançamento em aberto para gerar o borderô.');
      return;
    }
    if (paymentDateMode === 'SPECIFIC_DATE' && !specificPaymentDate.trim()) {
      toast.error('Informe a data específica de pagamento.');
      return;
    }

    setCreatingBordero(true);
    setBorderoProgress({
      status: 'RUNNING',
      phase: 'VALIDANDO_SEGURANCA',
      percent: 5,
      message: 'Validando integridade e bloqueio concorrente dos títulos no Horus ERP...',
      current_batch: 0,
      total_batches: Math.max(1, Math.ceil(selectedReleases.length / 200)),
      processed_orders: 0,
      total_orders: selectedReleases.length,
      horus_found_count: 0,
      elapsed_seconds: 0,
    });

    try {
      const token = getToken();
      const payload = {
        profile_code: activeTemplate.code,
        payment_date_mode: paymentDateMode,
        unify_installments: unifyInstallments,
        split_excess_launch: splitExcessLaunch,
        forma_pagto_credito_maior: formaPagtoCreditoMaior || undefined,
        channel_filename: channelFile?.name || undefined,
        tray_filename: trayFile?.name || undefined,
        specific_payment_date:
          paymentDateMode === 'SPECIFIC_DATE' ? specificPaymentDate : undefined,
        releases: selectedReleases.map((r) => ({
          nro_lancamento: r.nro_lancamento!,
          cod_filial: r.cod_filial || selectedFilial || '1',
          cod_ped_venda: r.cod_ped_venda,
          pedido_web: r.pedido_web,
          pedido_canal: r.pedido_canal || r.pedido_web,
          pedido_tray: r.pedido_tray || undefined,
          nro_nota_fiscal: r.nro_nota_fiscal || undefined,
          cliente_nome: r.cliente_nome || undefined,
          valor: r.valor_horus || r.valor_vindi,
          valor_liquido: r.valor_liquido,
          taxa: r.diff_taxa !== undefined ? Math.abs(r.diff_taxa) : r.taxa || 0,
          valor_horus_original: r.valor_horus_original ?? r.valor_horus,
          valor_credito_maior: r.valor_credito_maior || 0,
          unificadas_qtd: r.unificadas_qtd || 1,
          grouped_lancto_ids: r.grouped_lancto_ids,
          status: r.status_horus || 'AB',
          data_pagamento: r.data_pagamento || '',
        })),
      };

      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/dynamic-reconciliation/bordero?template_id=${activeTemplate.id}&async_job=true`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const initialData = await res.json();
      if (!res.ok) {
        throw new Error(initialData.detail || 'Erro ao gerar borderô no Horus.');
      }

      let data = initialData;
      if (initialData.job_id && initialData.status === 'RUNNING') {
        const jobId = initialData.job_id;
        while (true) {
          await new Promise((resolve) => setTimeout(resolve, 450));
          const pollRes = await fetch(
            `${API}/companies/${companyId}/horus-sql/reconciliation/jobs/${jobId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!pollRes.ok) {
            const errJson = await pollRes.json().catch(() => ({}));
            throw new Error(
              errJson.detail || 'Falha ao consultar andamento da geração do Borderô.'
            );
          }
          const jobState = await pollRes.json();
          setBorderoProgress({
            status: jobState.status,
            phase: jobState.phase || 'PROCESSANDO',
            percent: jobState.percent ?? jobState.progress ?? 50,
            message: jobState.message || 'Processando lotes SQL...',
            current_batch: jobState.current_batch ?? 0,
            total_batches: jobState.total_batches ?? 1,
            processed_orders: jobState.processed_orders ?? 0,
            total_orders: jobState.total_orders ?? selectedReleases.length,
            horus_found_count: jobState.horus_found_count ?? 0,
            elapsed_seconds: jobState.elapsed_seconds ?? 0,
            bordero_number: jobState.bordero_number,
          });

          if (jobState.status === 'FAILED' || jobState.status === 'ERROR') {
            throw new Error(
              jobState.error || jobState.message || 'Erro na transação SQL do Borderô.'
            );
          }
          if (jobState.status === 'COMPLETED' && jobState.result) {
            data = jobState.result;
            await new Promise((resolve) => setTimeout(resolve, 450));
            break;
          }
        }
      }

      setBorderoSuccess({
        number: data.bordero_number,
        total: data.total_valor,
        qtd: data.itens_baixados,
        verified_count: data.security_verification?.verified_count ?? data.itens_baixados,
        completed_at: data.security_verification?.completed_at,
        payment_date_mode: data.payment_date_mode || paymentDateMode,
      });
      setShowBorderoModal(false);
      toast.success(data.message || `Borderô #${data.bordero_number} gerado com sucesso!`);

      const processedLanctos = new Set(selectedReleases.map((r) => r.nro_lancamento));
      const newlyPaid = [
        ...itemsReady.filter((i) => processedLanctos.has(i.nro_lancamento)),
        ...itemsDivergence.filter((i) => processedLanctos.has(i.nro_lancamento)),
      ].map((i) => ({
        ...i,
        selected: false,
        cod_bordero: data.bordero_number,
        situacao_horus: 'PAGO',
        motivo: `Vinculado ao Borderô #${data.bordero_number}.`,
      }));

      setItemsReady((prev) => prev.filter((i) => !processedLanctos.has(i.nro_lancamento)));
      setItemsDivergence((prev) => prev.filter((i) => !processedLanctos.has(i.nro_lancamento)));
      setItemsAlreadyPaid((prev) => [...newlyPaid, ...prev]);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gravar borderô.');
    } finally {
      setCreatingBordero(false);
      setBorderoProgress(null);
    }
  };

  // Histórico de Fechamentos salvos no banco do Cronuz
  const openHistoryModal = async () => {
    setShowHistoryModal(true);
    setSelectedClosingDetail(null);
    setLoadingClosings(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/closings?limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setClosingsList(data.closings || []);
      }
    } catch {
      toast.error('Erro ao carregar histórico de fechamentos.');
    } finally {
      setLoadingClosings(false);
    }
  };

  const handleInspectClosingDetail = async (closingId: number) => {
    setLoadingClosingDetail(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/closings/${closingId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedClosingDetail(data.closing);
      }
    } catch {
      toast.error('Erro ao carregar itens do fechamento.');
    } finally {
      setLoadingClosingDetail(false);
    }
  };

  const matchMeta =
    HORUS_MATCH_LABELS[activeTemplate?.horus_match_field || 'AUTO'] || HORUS_MATCH_LABELS.AUTO;

  return (
    <div className="p-3 sm:p-5 max-w-[1650px] mx-auto space-y-4">
      {/* ─── BARRA DE TOPO COMPACTA: TÍTULO + FILIAL + AÇÕES DE MODELOS ─── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Conciliador Dinâmico &amp; Construtor de Modelos (Horus ERP)
                </h1>
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  <Sparkles className="h-3 w-3" /> De/Para Configurável
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vincule planilhas por <b>Nota Fiscal</b>, <b>Pedido Horus</b>, <b>Nº do Lançamento</b> ou{' '}
                <b>Pedido Web/Ponte</b> com parâmetros bancários dedicados por modelo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filial Horus */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Filial:</span>
              <input
                type="text"
                value={selectedFilial}
                onChange={(e) => setSelectedFilial(e.target.value)}
                className="w-9 bg-transparent text-center font-mono text-xs font-extrabold text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            {/* Botão Migrar / Sincronizar Padrões (Shopee, Vindi + 3 Formatos) */}
            <button
              type="button"
              onClick={handleMigratePresets}
              disabled={migratingPresets}
              title="Sincroniza os códigos bancários da rotina atual (Vindi/Shopee) e garante os 5 modelos padrão"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {migratingPresets ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
              )}
              Sincronizar Padrões
            </button>

            {/* Botão Histórico de Fechamentos */}
            <button
              type="button"
              onClick={openHistoryModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer"
            >
              <History className="h-3.5 w-3.5" />
              Histórico de Borderôs
            </button>

            {/* Botão Editar Modelo Ativo */}
            {activeTemplate && (
              <button
                type="button"
                onClick={() => openBuilderModal(activeTemplate)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer ${
                  activeTemplate.bank_configured
                    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
              >
                <Settings className="h-3.5 w-3.5" />
                {activeTemplate.bank_configured
                  ? `Editar Modelo (Banco ${activeTemplate.effective_bank.banco} • Forma ${activeTemplate.effective_bank.forma_pagto})`
                  : 'Configurar Modelo & Banco'}
              </button>
            )}

            {/* Botão + Novo Modelo de Conciliação */}
            <button
              type="button"
              onClick={() => openBuilderModal(undefined)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Modelo
            </button>

            {/* Botão Conciliar no Horus */}
            <button
              type="button"
              onClick={handleRunReconciliation}
              disabled={reading || !channelFile || (isDualFileMode && !trayFile)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 text-xs font-extrabold text-white shadow-xs transition-all cursor-pointer"
            >
              {reading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Database className="h-3.5 w-3.5" />
                  Conciliar no Horus
                </>
              )}
            </button>
          </div>
        </div>

        {/* Seletor de Modelos (Tabs Dinâmicas) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Modelos:
          </span>
          {loadingTemplates ? (
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando modelos...
            </span>
          ) : (
            templates.map((tpl) => {
              const isSelected = tpl.id === activeTemplate?.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <span>{tpl.short_name}</span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold uppercase ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {tpl.mode === 'DUAL_FILE' ? '2 Arq.' : tpl.horus_match_field}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Resumo das Regras de Relacionamento do Modelo Ativo + Dropzones */}
        {activeTemplate && (
          <div className="space-y-2.5 pt-1">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Relacionamento Horus:
                </span>
                <span className="rounded-md bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 text-[11px] font-mono font-bold">
                  {matchMeta.label}
                </span>
                {activeTemplate.column_mapping?.key_col && (
                  <span className="text-[11px] text-slate-500">
                    • Coluna Chave:{' '}
                    <b className="font-mono text-slate-700 dark:text-slate-300">
                      {activeTemplate.column_mapping.key_col}
                    </b>{' '}
                    ({activeTemplate.column_mapping.key_extract_rule || 'AUTO'})
                  </span>
                )}
                {activeTemplate.column_mapping?.valor_liquido_col && (
                  <span className="text-[11px] text-slate-500">
                    • Coluna Valor Líq:{' '}
                    <b className="font-mono text-slate-700 dark:text-slate-300">
                      {activeTemplate.column_mapping.valor_liquido_col}
                    </b>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Baixa:{' '}
                  <b className="text-slate-700 dark:text-slate-300">
                    {activeTemplate.payment_date_mode === 'CHANNEL_DATE'
                      ? 'Data da Planilha'
                      : activeTemplate.payment_date_mode === 'SPECIFIC_DATE'
                      ? 'Data Específica'
                      : 'Apenas Borderô Aberto (AP)'}
                  </b>
                </span>
              </div>
            </div>

            {/* Dropzones de 1 ou 2 Planilhas */}
            <div
              className={`grid grid-cols-1 ${
                isDualFileMode ? 'md:grid-cols-2' : 'md:grid-cols-1'
              } gap-3`}
            >
              {/* Slot 1 */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-indigo-600 text-[10px] font-black text-white">
                      1
                    </span>
                    {activeTemplate.file_1_label}
                  </span>
                </div>
                <div
                  onClick={() => channelFileInputRef.current?.click()}
                  className={`flex items-center justify-between gap-3 rounded-xl border border-dashed px-3.5 py-2.5 cursor-pointer transition-all ${
                    channelFile
                      ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20'
                      : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-white dark:bg-slate-900'
                  }`}
                >
                  <input
                    ref={channelFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => validateAndSetFile(e.target.files?.[0], 'CHANNEL')}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet
                      className={`h-5 w-5 shrink-0 ${
                        channelFile ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    />
                    {channelFile ? (
                      <div className="truncate">
                        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate">
                          {channelFile.name}
                        </p>
                        <p className="text-[10px] text-emerald-600">
                          {(channelFile.size / 1024).toFixed(1)} KB pronto para leitura
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 truncate">
                        Clique para selecionar a planilha (.xlsx ou .csv)
                      </p>
                    )}
                  </div>
                  <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                    {channelFile ? 'Trocar' : 'Selecionar'}
                  </span>
                </div>
              </div>

              {/* Slot 2 (se DUAL_FILE) */}
              {isDualFileMode && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-violet-600 text-[10px] font-black text-white">
                        2
                      </span>
                      {activeTemplate.file_2_label || '2º Arquivo: Planilha Ponte (.xlsx ou .csv)'}
                    </span>
                  </div>
                  <div
                    onClick={() => trayFileInputRef.current?.click()}
                    className={`flex items-center justify-between gap-3 rounded-xl border border-dashed px-3.5 py-2.5 cursor-pointer transition-all ${
                      trayFile
                        ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20'
                        : 'border-slate-300 dark:border-slate-700 hover:border-violet-400 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <input
                      ref={trayFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => validateAndSetFile(e.target.files?.[0], 'TRAY')}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Link2
                        className={`h-5 w-5 shrink-0 ${
                          trayFile ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      />
                      {trayFile ? (
                        <div className="truncate">
                          <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 truncate">
                            {trayFile.name}
                          </p>
                          <p className="text-[10px] text-emerald-600">
                            {(trayFile.size / 1024).toFixed(1)} KB pronto para cruzamento
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 truncate">
                          Clique para selecionar a 2ª planilha ponte (.xlsx ou .csv)
                        </p>
                      )}
                    </div>
                    <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {trayFile ? 'Trocar' : 'Selecionar'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── TELEMETRIA EM TEMPO REAL DURANTE A LEITURA ─── */}
      <AnimatePresence>
        {reading && jobProgress && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-5 shadow-md space-y-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                    {jobProgress.phase}
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {jobProgress.message}
                  </h3>
                </div>
              </div>
              <span className="text-xl font-black font-mono text-indigo-600">
                {jobProgress.percent}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(5, Math.min(100, jobProgress.percent))}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── BANNER DE BORDERÔ GERADO COM SUCESSO ─── */}
      <AnimatePresence>
        {borderoSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-extrabold text-emerald-950 dark:text-emerald-200">
                  Borderô #{borderoSuccess.number} gravado no Horus ERP!
                </span>{' '}
                <span className="text-emerald-800 dark:text-emerald-300">
                  {borderoSuccess.qtd} lançamento(s) • Total Líquido:{' '}
                  <b className="font-mono">R$ {formatBRL(borderoSuccess.total)}</b>
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBorderoSuccess(null)}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Fechar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── INDICADORES E GRADE DE CONCILIAÇÃO ─── */}
      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                1. Lidos ({activeTemplate?.channel_label})
              </span>
              <p className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5">
                {summary.total_planilha_qtd}
                {summary.total_planilha_linhas &&
                  summary.total_planilha_linhas > summary.total_planilha_qtd && (
                    <span className="text-[10px] font-normal text-slate-400 ml-1">
                      ({summary.total_planilha_linhas} linhas)
                    </span>
                  )}
              </p>
              <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                Bruto: R$ {formatBRL(summary.total_planilha_valor)}
              </p>
              {(summary.total_planilha_saidas_valor ?? 0) > 0 && (
                <p className="text-[10px] font-mono text-rose-600 dark:text-rose-400">
                  {summary.total_planilha_saidas_qtd} saídas: -R${' '}
                  {formatBRL(summary.total_planilha_saidas_valor)}
                </p>
              )}
              <p className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                Líq: R$ {formatBRL(summary.total_planilha_liq ?? summary.total_planilha_valor)}
              </p>
            </div>

            <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3">
              <span className="text-[10px] font-extrabold uppercase text-violet-700 dark:text-violet-300 block">
                2. Chave Horus ({summary.horus_match_field})
              </span>
              <p className="text-lg font-black text-violet-700 dark:text-violet-300 font-mono mt-0.5">
                {summary.tray_linked_qtd ?? summary.total_planilha_qtd}
              </p>
              <p className="text-[11px] text-violet-700 dark:text-violet-400">
                {summary.is_dual_file
                  ? `Ponte: ${summary.tray_total_rows ?? 0} linhas`
                  : 'Vínculo Direto 1 Planilha'}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300 block">
                3. Em Aberto no Horus (AB)
              </span>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                {summary.abertos_qtd ?? summary.ready_qtd}
              </p>
              <p className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                Baixar: R${' '}
                {formatBRL(
                  summary.abertos_valor_liquido ??
                    summary.total_planilha_liq ??
                    summary.abertos_valor
                )}
              </p>
              <p className="text-[10px] font-mono text-slate-500">
                Bruto Títulos: R$ {formatBRL(summary.abertos_valor ?? summary.ready_valor)}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3">
              <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-300 block">
                4. Divergência Bruto
              </span>
              <p className="text-lg font-black text-amber-700 dark:text-amber-300 font-mono mt-0.5">
                {summary.divergence_qtd}
              </p>
              <p className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                Dif: R$ {formatBRL(summary.divergence_diff_total)}
              </p>
            </div>

            <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 p-3">
              <span className="text-[10px] font-extrabold uppercase text-purple-700 dark:text-purple-300 block">
                5. Taxas / Abatimentos
              </span>
              <p className="text-base font-black text-purple-700 dark:text-purple-300 font-mono mt-1">
                -R$ {formatBRL(summary.total_taxa_vindi)}
              </p>
              <p className="text-[10px] text-purple-600 dark:text-purple-400">
                Comissão / Tarifa retida
              </p>
            </div>

            <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 p-3">
              <span className="text-[10px] font-extrabold uppercase text-rose-700 dark:text-rose-300 block">
                6. Não Achados no Horus
              </span>
              <p className="text-lg font-black text-rose-700 dark:text-rose-300 font-mono mt-0.5">
                {summary.not_found_qtd}
              </p>
              <p className="text-[11px] font-mono text-rose-700 dark:text-rose-400">
                R$ {formatBRL(summary.not_found_valor)}
              </p>
            </div>
          </div>

          {/* Grade de Conciliação + Barra de Ação do Borderô */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 bg-slate-50/70 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `Todos (${unifiedRows.length})` },
                  {
                    id: 'abertos',
                    label: `Em Aberto AB (${summary.abertos_qtd ?? summary.ready_qtd})`,
                  },
                  ...(Number(summary.credito_maior_count || 0) > 0
                    ? [
                        {
                          id: 'credito_maior',
                          label: `Crédito Maior Separado (${summary.credito_maior_count})`,
                        },
                      ]
                    : []),
                  { id: 'divergence', label: `Divergências (${itemsDivergence.length})` },
                  {
                    id: 'pagos',
                    label: `Já Baixados (${summary.pagos_qtd ?? itemsAlreadyPaid.length})`,
                  },
                  { id: 'not_found', label: `Não Localizados (${itemsNotFound.length})` },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveFilterTab(t.id as any)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      activeFilterTab === t.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar chave, NF, pedido, cliente..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => toggleSelectAllOpen(true)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Marcar Abertos
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAllOpen(false)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Desmarcar
                </button>

                {selectedReleases.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBorderoModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-xs transition-all cursor-pointer"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Gerar Borderô ({selectedReleases.length}) • R$ {formatBRL(totalSelectedAmount)}
                  </button>
                )}
              </div>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto max-h-[58vh]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/95 border-b border-slate-200 dark:border-slate-700 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 px-2.5 text-center w-9">✓</th>
                    <th className="py-2.5 px-2 w-12">#</th>
                    <th className="py-2.5 px-2.5">Chave Planilha</th>
                    {isDualFileMode && <th className="py-2.5 px-2.5">Ponte</th>}
                    <th className="py-2.5 px-2.5">Pedido Horus</th>
                    <th className="py-2.5 px-2.5">Lanç.</th>
                    <th className="py-2.5 px-2.5">NF</th>
                    <th className="py-2.5 px-2.5">Cliente</th>
                    <th className="py-2.5 px-2.5 text-right">Bruto</th>
                    <th className="py-2.5 px-2.5 text-right">Taxa</th>
                    <th className="py-2.5 px-2.5 text-right">Líq. Repasse</th>
                    <th className="py-2.5 px-2.5 text-right">Valor Horus</th>
                    <th className="py-2.5 px-2.5 text-center">Situação</th>
                    <th className="py-2.5 px-2.5 text-center">Borderô</th>
                    <th className="py-2.5 px-2.5">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                  {filteredRows.map((row, idx) => {
                    const isSelectable =
                      row._category === 'ready' || row._category === 'divergence';
                    const isPaid = row.situacao_horus === 'PAGO';
                    return (
                      <tr
                        key={`${row._category}-${row.linha}-${row.nro_lancamento || idx}`}
                        onClick={() => setActiveRowIndex(idx)}
                        className={`transition-colors cursor-pointer ${
                          idx === activeRowIndex
                            ? 'bg-indigo-50/90 dark:bg-indigo-950/40'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td
                          className="py-2 px-2.5 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isSelectable ? (
                            <input
                              type="checkbox"
                              checked={Boolean(row.selected)}
                              onChange={() => toggleItemSelection(row.nro_lancamento, row._category)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-2 font-mono text-[11px] text-slate-400">
                          {row.linha}
                        </td>
                        <td className="py-2 px-2.5 font-mono font-bold text-slate-900 dark:text-white">
                          {row.pedido_canal || row.pedido_web}
                        </td>
                        {isDualFileMode && (
                          <td className="py-2 px-2.5 font-mono text-violet-700 dark:text-violet-300">
                            {row.pedido_tray && row.pedido_tray !== '-'
                              ? `#${row.pedido_tray}`
                              : '—'}
                          </td>
                        )}
                        <td className="py-2 px-2.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {row.cod_ped_venda ? `#${row.cod_ped_venda}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-600 dark:text-slate-300">
                          {row.nro_lancamento ? `#${row.nro_lancamento}` : '—'}
                          {(row.unificadas_qtd || 1) > 1 && (
                            <span className="ml-1 rounded bg-violet-100 text-violet-800 px-1 py-0.2 text-[9px] font-extrabold">
                              {row.unificadas_qtd}x UNIF.
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-600 dark:text-slate-300">
                          {row.nro_nota_fiscal || '—'}
                        </td>
                        <td className="py-2 px-2.5 truncate max-w-[180px] text-slate-800 dark:text-slate-200">
                          {row.cliente_nome}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold">
                          R$ {formatBRL(row.valor_vindi)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-purple-600">
                          {(row.taxa || 0) > 0 ? `-R$ ${formatBRL(row.taxa)}` : 'R$ 0,00'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-indigo-700 dark:text-indigo-300">
                          R$ {formatBRL(row.valor_liquido ?? row.valor_vindi)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold">
                          {row.valor_horus !== undefined ? `R$ ${formatBRL(row.valor_horus)}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          {row._category === 'not_found' ? (
                            <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-extrabold">
                              NÃO ACHADO
                            </span>
                          ) : isPaid ? (
                            <span className="rounded bg-sky-100 text-sky-800 px-2 py-0.5 text-[10px] font-extrabold">
                              BAIXADO
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-extrabold">
                              ABERTO
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-center font-mono">
                          {row.cod_bordero ? `#${row.cod_bordero}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-[11px] text-slate-500 max-w-[260px] truncate">
                          {row.motivo}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL CONSTRUTOR / EDITOR DE MODELO DINÂMICO ("DE -> PARA" + BANCO) ─── */}
      <AnimatePresence>
        {showBuilderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="bg-indigo-600 px-5 py-3.5 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <Sliders className="h-5 w-5" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold">
                      {editingTemplateId
                        ? `Configurar Modelo de Conciliação: ${builderForm.name}`
                        : 'Novo Modelo Dinâmico de Conciliação Horus ERP'}
                    </h3>
                    <p className="text-[11px] text-indigo-100">
                      Defina o campo de vínculo no Horus (NF, Pedido, Lançamento), o De/Para de colunas da planilha e os códigos bancários do Borderô
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBuilderModal(false)}
                  className="text-white/80 hover:text-white text-sm font-bold px-2 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Body em 2 Colunas */}
              <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* COLUNA ESQUERDA (7 cols): Identificação, Relacionamento Horus e De/Para da Planilha */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Bloco 1: Nome, Modo de Arquivos e Chave de Relacionamento Horus */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3 bg-slate-50/40 dark:bg-slate-800/30">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      1. Identificação &amp; Chave de Vínculo no Horus ERP
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Nome do Modelo *
                        </label>
                        <input
                          type="text"
                          value={builderForm.name}
                          onChange={(e) =>
                            setBuilderForm((p) => ({
                              ...p,
                              name: e.target.value,
                              short_name: p.short_name || e.target.value.slice(0, 28),
                            }))
                          }
                          placeholder="Ex: Mercado Livre por Nota Fiscal"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Nome Curto (Aba)
                        </label>
                        <input
                          type="text"
                          value={builderForm.short_name}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, short_name: e.target.value }))
                          }
                          placeholder="Ex: ML por NF"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Campo de Vínculo no Horus ERP *
                        </label>
                        <select
                          value={builderForm.horus_match_field}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, horus_match_field: e.target.value }))
                          }
                          className="w-full rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200"
                        >
                          <option value="NRO_NOTA_FISCAL">
                            Nº da Nota Fiscal (NRO_NOTA_FISCAL)
                          </option>
                          <option value="COD_PED_VENDA">
                            Código do Pedido Horus (COD_PED_VENDA)
                          </option>
                          <option value="NRO_LANCTO_CRECEBER">
                            Nº Direto do Lançamento (NRO_LANCTO_CRECEBER)
                          </option>
                          <option value="COD_PEDIDO_ORIGEM">
                            Código Pedido Web / Origem (COD_PEDIDO_ORIGEM)
                          </option>
                          <option value="AUTO">
                            Automático Multi-Chave (NF / Pedido / Lançamento)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Quantidade de Planilhas
                        </label>
                        <select
                          value={builderForm.mode}
                          onChange={(e) =>
                            setBuilderForm((p) => ({
                              ...p,
                              mode: e.target.value as 'SINGLE_FILE' | 'DUAL_FILE',
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                        >
                          <option value="SINGLE_FILE">
                            1 Planilha (Vínculo Direto com Horus)
                          </option>
                          <option value="DUAL_FILE">
                            2 Planilhas (Extrato do Canal + Planilha Ponte ex: Tray)
                          </option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Bloco 2: Leitor de Planilha de Amostra + Mapeamento De/Para */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          2. Mapeamento De/Para das Colunas da Planilha
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Envie uma planilha de exemplo para ler os nomes das colunas automaticamente ou digite abaixo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => sampleFileInputRef.current?.click()}
                        disabled={inspectingSample}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 px-3 py-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer"
                      >
                        {inspectingSample ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5" />
                        )}
                        Ler Colunas de Planilha Exemplo
                      </button>
                      <input
                        ref={sampleFileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => handleInspectSampleSpreadsheet(e.target.files?.[0])}
                        className="hidden"
                      />
                    </div>

                    {detectedHeaders.length > 0 && (
                      <div className="rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-2.5 text-[11px]">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">
                          Colunas encontradas na planilha ({detectedHeaders.length}):
                        </span>{' '}
                        <span className="font-mono text-slate-600 dark:text-slate-300">
                          {detectedHeaders.join(' | ')}
                        </span>
                      </div>
                    )}

                    <datalist id="dynamic-sheet-headers">
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h} />
                      ))}
                    </datalist>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Coluna da Chave (NF / Pedido / Lançamento) *
                        </label>
                        <input
                          type="text"
                          list="dynamic-sheet-headers"
                          value={builderForm.key_col}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, key_col: e.target.value }))
                          }
                          placeholder="Ex: Nota Fiscal, Pedido, Lancamento"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Regra de Limpeza da Chave
                        </label>
                        <select
                          value={builderForm.key_extract_rule}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, key_extract_rule: e.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                        >
                          <option value="AUTO">Inteligente (Automático)</option>
                          <option value="DIGITS_ONLY">Apenas Números (Ex: NF / Lançamento)</option>
                          <option value="AFTER_HASH">Extrair Código após # (Ex: #48465)</option>
                          <option value="EXACT">Texto Exato</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Coluna de Valor Líquido / Repasse *
                        </label>
                        <input
                          type="text"
                          list="dynamic-sheet-headers"
                          value={builderForm.valor_liquido_col}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, valor_liquido_col: e.target.value }))
                          }
                          placeholder="Ex: Valor Liquido, Valor, Repasse"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Coluna de Data do Pagamento
                        </label>
                        <input
                          type="text"
                          list="dynamic-sheet-headers"
                          value={builderForm.data_pagamento_col}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, data_pagamento_col: e.target.value }))
                          }
                          placeholder="Ex: Data Pagamento, Data"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Coluna de Valor Bruto (Opcional)
                        </label>
                        <input
                          type="text"
                          list="dynamic-sheet-headers"
                          value={builderForm.valor_bruto_col}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, valor_bruto_col: e.target.value }))
                          }
                          placeholder="Vazio = usa Valor do Horus ou Ponte"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          Coluna de Taxa / Comissão (Opcional)
                        </label>
                        <input
                          type="text"
                          list="dynamic-sheet-headers"
                          value={builderForm.taxa_col}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, taxa_col: e.target.value }))
                          }
                          placeholder="Vazio = calcula Bruto - Líquido"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA (5 cols): Parâmetros Bancários do Borderô e Regras de Baixa */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3 bg-slate-50/40 dark:bg-slate-800/30">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      3. Conta Bancária &amp; Parâmetros do Borderô Horus
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Forma Pagto (COD_FORMA) *
                        </label>
                        <input
                          type="text"
                          value={builderForm.forma_pagto}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, forma_pagto: e.target.value }))
                          }
                          placeholder="Ex: 114"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Banco (COD_BANCO) *
                        </label>
                        <input
                          type="text"
                          value={builderForm.banco}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, banco: e.target.value }))
                          }
                          placeholder="Ex: 2"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Agência (COD_AGENCIA) *
                        </label>
                        <input
                          type="text"
                          value={builderForm.agencia}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, agencia: e.target.value }))
                          }
                          placeholder="Ex: 7"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Conta (COD_CONTAC) *
                        </label>
                        <input
                          type="text"
                          value={builderForm.conta}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, conta: e.target.value }))
                          }
                          placeholder="Ex: 1"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                          Carteira (NRO_CARTEIRA)
                        </label>
                        <input
                          type="text"
                          value={builderForm.carteira}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, carteira: e.target.value }))
                          }
                          placeholder="Ex: 109"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-amber-800 dark:text-amber-300 block mb-1">
                          COD_FORMA Crédito Maior
                        </label>
                        <input
                          type="text"
                          value={builderForm.forma_pagto_credito_maior}
                          onChange={(e) =>
                            setBuilderForm((p) => ({
                              ...p,
                              forma_pagto_credito_maior: e.target.value,
                            }))
                          }
                          placeholder="Ex: 135"
                          className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                        Regra Padrão de Data de Baixa no Borderô
                      </label>
                      <select
                        value={builderForm.payment_date_mode}
                        onChange={(e) =>
                          setBuilderForm((p) => ({ ...p, payment_date_mode: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-bold"
                      >
                        <option value="CHANNEL_DATE">
                          1. Usar Data de Pagamento da Planilha (Baixar PG)
                        </option>
                        <option value="SPECIFIC_DATE">
                          2. Usar uma Data Específica (Baixar PG)
                        </option>
                        <option value="BORDERO_OPEN">
                          3. Apenas Criar Borderô em Aberto (Sem Pagar - AP)
                        </option>
                      </select>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Unificar Parcelas + Gravar Taxa (Abatimento)
                        </span>
                        <input
                          type="checkbox"
                          checked={builderForm.unify_installments}
                          onChange={(e) =>
                            setBuilderForm((p) => ({ ...p, unify_installments: e.target.checked }))
                          }
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Separar Crédito Maior em Novo Lançamento
                        </span>
                        <input
                          type="checkbox"
                          checked={builderForm.split_excess_launch}
                          onChange={(e) =>
                            setBuilderForm((p) => ({
                              ...p,
                              split_excess_launch: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div>
                  {editingTemplateId && activeTemplate && !activeTemplate.is_system_preset && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(activeTemplate)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir Modelo
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowBuilderModal(false)}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white shadow-md cursor-pointer"
                  >
                    {savingTemplate ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Salvar Modelo de Conciliação
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL COMPACTA EM 2 COLUNAS DE GERAÇÃO E ACOMPANHAMENTO DO BORDERÔ ─── */}
      <AnimatePresence>
        {showBorderoModal && activeTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 px-5 py-3.5 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold leading-tight">
                      {creatingBordero
                        ? `Gerando e Auditando Borderô no Horus ERP (${activeTemplate.short_name})`
                        : `Confirmar Borderô no Horus (${activeTemplate.short_name})`}
                    </h3>
                    <p className="text-[11px] text-indigo-100">
                      {creatingBordero
                        ? 'Transação SQL atômica em andamento — não feche esta janela'
                        : `Vínculo por ${activeTemplate.horus_match_field} • Revise os parâmetros e confirme`}
                    </p>
                  </div>
                </div>
                {!creatingBordero && (
                  <button
                    type="button"
                    onClick={() => setShowBorderoModal(false)}
                    className="text-white/80 hover:text-white text-sm font-bold px-2 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {creatingBordero && borderoProgress ? (
                <div className="p-6 space-y-5 overflow-y-auto">
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                            {borderoProgress.phase}
                          </span>
                          {borderoProgress.bordero_number && (
                            <span className="rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[11px] font-mono font-black">
                              BORDERÔ #{borderoProgress.bordero_number}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                          {borderoProgress.message}
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                        {borderoProgress.percent}%
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Tempo: {borderoProgress.elapsed_seconds.toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 transition-all duration-300"
                        style={{ width: `${Math.max(5, Math.min(100, borderoProgress.percent))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>
                        Títulos processados: <b>{borderoProgress.processed_orders}</b> /{' '}
                        <b>{borderoProgress.total_orders}</b>
                      </span>
                      <span>
                        Lote SQL: <b>{borderoProgress.current_batch}</b> /{' '}
                        <b>{borderoProgress.total_batches}</b>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Títulos Selecionados para o Borderô
                      </p>
                      <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                        <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                          {selectedReleases.length} lançamentos em aberto
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          (Bruto: R$ {formatBRL(totalSelectedBrutoAmount)} • Taxas/Saídas: -R${' '}
                          {formatBRL(totalSelectedTaxaAmount)})
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Valor Líquido a Baixar no Borderô
                      </p>
                      <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        R$ {formatBRL(totalSelectedAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-5 space-y-3">
                      {bankConfig && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                              Parâmetros Bancários (Horus)
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowBorderoModal(false);
                                openBuilderModal(activeTemplate);
                              }}
                              className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Settings className="h-3 w-3" /> Editar Modelo
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                              <span className="text-slate-400 block text-[10px]">Emp / Filial</span>
                              <b className="font-mono">
                                {bankConfig.cod_empresa} / {selectedFilial || bankConfig.cod_filial}
                              </b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                              <span className="text-slate-400 block text-[10px]">COD_FORMA</span>
                              <b className="font-mono">{bankConfig.forma_pagto || 'NÃO DEF.'}</b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                              <span className="text-slate-400 block text-[10px]">COD_BANCO</span>
                              <b className="font-mono">{bankConfig.banco || 'NÃO DEF.'}</b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                              <span className="text-slate-400 block text-[10px]">COD_AGENCIA</span>
                              <b className="font-mono">{bankConfig.agencia || 'NÃO DEF.'}</b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                              <span className="text-slate-400 block text-[10px]">COD_CONTAC</span>
                              <b className="font-mono">{bankConfig.conta || 'NÃO DEF.'}</b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5">
                              <span className="text-slate-400 block text-[10px]">CARTEIRA</span>
                              <b className="font-mono">{bankConfig.carteira || '—'}</b>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-7 space-y-2">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">
                        Regra de Data de Pagamento &amp; Baixa no Horus ERP
                      </label>
                      {[
                        {
                          mode: 'CHANNEL_DATE',
                          title: `1. Usar Data de Pagamento da Planilha (${activeTemplate.channel_label})`,
                          desc: 'Gera o Borderô pago (PG) e grava em cada lançamento a data da planilha.',
                        },
                        {
                          mode: 'SPECIFIC_DATE',
                          title: '2. Usar Borderô e Pagar com uma Data Específica',
                          desc: 'Gera o Borderô pago (PG) com uma única data escolhida.',
                        },
                        {
                          mode: 'BORDERO_OPEN',
                          title: '3. Apenas Gerar Borderô em Aberto (Sem Pagar no Horus)',
                          desc: 'Cria o Borderô com status AP mantendo os títulos em aberto (AB).',
                        },
                      ].map((opt) => (
                        <div
                          key={opt.mode}
                          onClick={() => setPaymentDateMode(opt.mode as any)}
                          className={`w-full text-left rounded-xl border p-3 transition-all cursor-pointer ${
                            paymentDateMode === opt.mode
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white block">
                            {opt.title}
                          </span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            {opt.desc}
                          </span>
                          {opt.mode === 'SPECIFIC_DATE' && paymentDateMode === 'SPECIFIC_DATE' && (
                            <div
                              className="mt-2 flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="date"
                                value={specificPaymentDate}
                                onChange={(e) => setSpecificPaymentDate(e.target.value)}
                                className="rounded-lg border border-indigo-300 px-2.5 py-1 text-xs font-mono font-bold"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Verifica status <code>AB</code> antes de gravar e salva cópia no Histórico do Cronuz.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowBorderoModal(false)}
                    disabled={creatingBordero}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBordero}
                    disabled={creatingBordero || Boolean(bankConfig && !bankConfig.is_configured)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white shadow-md cursor-pointer"
                  >
                    {creatingBordero ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Gerando Borderô ({borderoProgress?.percent ?? 0}%)...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Confirmar e Gerar Borderô (R$ {formatBRL(totalSelectedAmount)})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL DE HISTÓRICO DE FECHAMENTOS / BORDERÔS ─── */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 px-5 py-3.5 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <History className="h-5 w-5" />
                  <h3 className="text-sm font-bold">
                    Histórico de Fechamentos &amp; Borderôs Gerados no Cronuz B2B
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="text-white/80 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 overflow-y-auto">
                {loadingClosings ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
                  </div>
                ) : closingsList.length === 0 ? (
                  <p className="text-center py-10 text-xs text-slate-500">
                    Nenhum fechamento registrado até o momento.
                  </p>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase text-slate-400">
                        <th className="py-2 px-2.5">Borderô</th>
                        <th className="py-2 px-2.5">Modelo</th>
                        <th className="py-2 px-2.5">Data / Hora</th>
                        <th className="py-2 px-2.5 text-right">Títulos</th>
                        <th className="py-2 px-2.5 text-right">Líquido Borderô</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {closingsList.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-2.5 font-mono font-black text-emerald-600">
                            #{c.bordero_number}
                          </td>
                          <td className="py-2.5 px-2.5 font-bold">{c.profile_code}</td>
                          <td className="py-2.5 px-2.5 font-mono text-slate-500">
                            {c.created_at_br || c.created_at}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono">{c.total_titles}</td>
                          <td className="py-2.5 px-2.5 text-right font-mono font-bold text-indigo-600">
                            R$ {formatBRL(c.total_net_bordero)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

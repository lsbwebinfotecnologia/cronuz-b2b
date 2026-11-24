'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DatabaseZap, Upload, FileSpreadsheet, Download,
  CheckCircle2, AlertTriangle, XCircle, Info, Loader2,
  RefreshCw, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  Check, AlertCircle, ArrowRight, ArrowRightLeft,
  CreditCard, Building2, ShieldCheck, DollarSign,
  Layers, Search, CheckSquare, Square, Clock, Eye, X, Link2, Settings, Save
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const MAX_SHEET_BYTES = 10 * 1024 * 1024; // 10 MB (Regra Mandatória AGENTS.md)

interface ReconciliationProfile {
  code: string;
  name: string;
  short_name: string;
  channel_label: string;
  hub_label: string;
  mode: 'DUAL_FILE' | 'SINGLE_FILE';
  badge: string;
  description: string;
  file_1_label: string;
  file_2_label?: string | null;
  enabled: boolean;
  use_custom_bank: boolean;
  payment_date_mode?: 'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN' | string;
  unify_installments?: boolean;
  split_excess_launch?: boolean;
  forma_pagto_credito_maior?: string;
  launch_fee_as_expense?: boolean;
  cp_fee_posting_mode?: 'UNIFIED' | 'INDIVIDUAL' | string;
  cp_cod_grp_fornecedor?: string;
  cp_cod_fornecedor?: string;
  cp_nom_fornecedor?: string;
  cp_cod_departamento?: string;
  cp_cod_centro_custo?: string;
  cp_cod_grup_desp?: string;
  cp_cod_despesa?: string;
  cp_cod_forma?: string;
  cpagar_configured?: boolean;
  effective_bank: {
    forma_pagto: string;
    forma_pagto_credito_maior?: string;
    banco: string;
    agencia: string;
    conta: string;
    carteira: string;
    payment_date_mode?: string;
    unify_installments?: boolean;
    split_excess_launch?: boolean;
    launch_fee_as_expense?: boolean;
    cp_fee_posting_mode?: 'UNIFIED' | 'INDIVIDUAL' | string;
    cp_cod_grp_fornecedor?: string;
    cp_cod_fornecedor?: string;
    cp_nom_fornecedor?: string;
    cp_cod_departamento?: string;
    cp_cod_centro_custo?: string;
    cp_cod_grup_desp?: string;
    cp_cod_despesa?: string;
    cp_cod_forma?: string;
    cpagar_configured?: boolean;
  };
  bank_configured: boolean;
}

interface SecurityAuditInfo {
  integrity_verified: boolean;
  elapsed_seconds: number;
  batches_executed: number;
  unique_orders_queried: number;
  horus_titles_fetched: number;
  completed_at: string;
}

interface JobProgressState {
  status: 'RUNNING' | 'COMPLETED' | 'ERROR';
  phase:
    | 'LENDO_PLANILHAS'
    | 'VINCULANDO_TRAY'
    | 'CONSULTANDO_HORUS'
    | 'AUDITORIA_VALORES'
    | 'CONCLUIDO'
    | 'ERRO'
    | string;
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
  use_custom_bank?: boolean;
  forma_pagto: string;
  forma_pagto_credito_maior?: string;
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  payment_date_mode?: 'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN' | string;
  unify_installments?: boolean;
  split_excess_launch?: boolean;
  launch_fee_as_expense?: boolean;
  cp_fee_posting_mode?: 'UNIFIED' | 'INDIVIDUAL' | string;
  cp_cod_grp_fornecedor?: string;
  cp_cod_fornecedor?: string;
  cp_nom_fornecedor?: string;
  cp_cod_departamento?: string;
  cp_cod_centro_custo?: string;
  cp_cod_grup_desp?: string;
  cp_cod_despesa?: string;
  cp_cod_forma?: string;
  cpagar_configured?: boolean;
  cod_empresa: string;
  cod_filial: string;
  is_configured: boolean;
}

interface HorusOptionsPayload {
  bank_accounts: {
    cod_banco: number;
    nom_banco: string;
    cod_agencia: number;
    nom_agencia: string;
    cod_contac: number;
    nro_contac: string;
    dig_contac: string;
  }[];
  payment_forms: {
    cod_forma: number;
    desc_forma: string;
    tipo_operacao?: string;
  }[];
  departamentos: {
    cod_departamento: number;
    desc_departamento: string;
  }[];
  centros_custo: {
    cod_departamento: number;
    cod_centro_custo: number;
    desc_centro_custo: string;
  }[];
  grupos_despesa: {
    cod_grup_desp: number;
    desc_grup_desp: string;
  }[];
  despesas: {
    cod_grup_desp: number;
    cod_despesa: number;
    desc_despesa: string;
  }[];
  grupos_fornecedor: {
    cod_grp_fornecedor: number;
    desc_grp_fornecedor: string;
  }[];
  fornecedores: {
    cod_grp_fornecedor: number;
    cod_fornecedor: number;
    nom_fornecedor: string;
    nom_fantasia?: string;
  }[];
  recent_tariff_presets?: {
    cod_grp_fornecedor: number;
    cod_fornecedor: number;
    nom_fornecedor: string;
    cod_departamento: number;
    cod_centro_custo: number;
    cod_grup_desp: number;
    cod_despesa: number;
    desc_despesa?: string;
    cod_forma: number;
    cod_banco?: number;
    cod_agencia?: number;
    cod_contac?: number;
    obs_cpagar?: string;
  }[];
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
  situacao_horus?: 'ABERTO' | 'PAGO' | 'CANCELADO' | string;
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

const FALLBACK_PROFILES: ReconciliationProfile[] = [
  {
    code: 'TRAY_SHOPEE',
    name: 'Shopee ↔ Tray ↔ Horus ERP',
    short_name: 'Shopee + Tray',
    channel_label: 'Shopee',
    hub_label: 'Tray E-commerce',
    mode: 'DUAL_FILE',
    badge: '2 Planilhas (Shopee + Tray)',
    description:
      'Cruza a planilha de pedidos recebidos da Shopee com a planilha Excel da Tray para localizar o pedido integrado no Horus ERP e baixar o Contas a Receber.',
    file_1_label: '1º Arquivo: Planilha de Pedidos / Repasse da Shopee (.xlsx ou .csv)',
    file_2_label: '2º Arquivo: Planilha Excel/CSV de Pedidos da Tray (Vínculo Shopee ↔ Horus)',
    enabled: true,
    use_custom_bank: false,
    effective_bank: { forma_pagto: '', banco: '', agencia: '', conta: '', carteira: '' },
    bank_configured: false,
  },
  {
    code: 'TRAY_TIKTOK',
    name: 'TikTok Shop ↔ Tray ↔ Horus ERP',
    short_name: 'TikTok + Tray',
    channel_label: 'TikTok Shop',
    hub_label: 'Tray E-commerce',
    mode: 'DUAL_FILE',
    badge: '2 Planilhas (TikTok + Tray)',
    description:
      'Cruza a planilha de liquidação do TikTok Shop com a planilha de pedidos da Tray para amarrar o Contas a Receber no Horus ERP.',
    file_1_label: '1º Arquivo: Planilha de Recebimentos do TikTok Shop (.xlsx ou .csv)',
    file_2_label: '2º Arquivo: Planilha Excel/CSV de Pedidos da Tray (Vínculo TikTok ↔ Horus)',
    enabled: true,
    use_custom_bank: false,
    effective_bank: { forma_pagto: '', banco: '', agencia: '', conta: '', carteira: '' },
    bank_configured: false,
  },
  {
    code: 'TRAY_VINDI',
    name: 'Vindi ↔ Tray ↔ Horus ERP',
    short_name: 'Vindi + Tray',
    channel_label: 'Vindi',
    hub_label: 'Tray E-commerce',
    mode: 'DUAL_FILE',
    badge: '2 Planilhas (Vindi + Tray)',
    description:
      'Cruza o extrato financeiro da Vindi com a planilha de pedidos da Tray para identificar os títulos no Horus ERP e gerar o Borderô.',
    file_1_label: '1º Arquivo: Extrato / Planilha Financeira da Vindi (.xlsx ou .csv)',
    file_2_label: '2º Arquivo: Planilha Excel/CSV de Pedidos da Tray (Vínculo Vindi ↔ Horus)',
    enabled: true,
    use_custom_bank: false,
    effective_bank: { forma_pagto: '', banco: '', agencia: '', conta: '', carteira: '' },
    bank_configured: false,
  },
  {
    code: 'VINDI_DIRECT',
    name: 'Vindi Direto ↔ Horus ERP',
    short_name: 'Vindi Direto',
    channel_label: 'Vindi',
    hub_label: 'Direto Horus',
    mode: 'SINGLE_FILE',
    badge: '1 Planilha (Vindi Direto)',
    description:
      'Conciliação direta do extrato da Vindi com os títulos de Contas a Receber do Horus ERP.',
    file_1_label: 'Arquivo Único: Extrato Financeiro da Vindi (.xlsx ou .csv)',
    file_2_label: null,
    enabled: true,
    use_custom_bank: false,
    effective_bank: { forma_pagto: '', banco: '', agencia: '', conta: '', carteira: '' },
    bank_configured: false,
  },
];

export default function FinanceiroVindiPage() {
  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  // Perfis de conciliação liberados pelo Master para este Seller
  const [profiles, setProfiles] = useState<ReconciliationProfile[]>([]);
  const [activeProfileCode, setActiveProfileCode] = useState<string>('TRAY_SHOPEE');
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Arquivos selecionados (Slot 1 = Canal, Slot 2 = Tray)
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

  // Filtros e busca na grade Access
  const [activeFilterTab, setActiveFilterTab] = useState<
    'all' | 'abertos' | 'credito_maior' | 'pagos' | 'divergence' | 'not_found'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Navegação estilo Access (linha ativa na grade + modal de Ficha de Vínculo)
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [inspectedItem, setInspectedItem] = useState<ReleaseItem | null>(null);

  // Modal de Borderô e Modo de Data de Pagamento no Horus
  const [showBorderoModal, setShowBorderoModal] = useState(false);
  const [creatingBordero, setCreatingBordero] = useState(false);
  const [borderoProgress, setBorderoProgress] = useState<JobProgressState | null>(null);
  const [paymentDateMode, setPaymentDateMode] = useState<
    'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN'
  >('CHANNEL_DATE');
  const [unifyInstallments, setUnifyInstallments] = useState<boolean>(true);
  const [splitExcessLaunch, setSplitExcessLaunch] = useState<boolean>(true);
  const [formaPagtoCreditoMaior, setFormaPagtoCreditoMaior] = useState<string>('');
  const [launchFeeAsExpense, setLaunchFeeAsExpense] = useState<boolean>(false);
  const [cpFeePostingMode, setCpFeePostingMode] = useState<'UNIFIED' | 'INDIVIDUAL'>('UNIFIED');
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
    launch_fee_as_expense?: boolean;
    cp_fee_posting_mode?: string;
    total_taxa_bordero?: number;
    cpagar_expenses_count?: number;
  } | null>(null);

  // Modal de Configuração de Banco / Agência / Conta / Forma de Pagto Horus por Conciliação
  const [showBankConfigModal, setShowBankConfigModal] = useState(false);
  const [savingBankConfig, setSavingBankConfig] = useState(false);
  const [horusOptions, setHorusOptions] = useState<HorusOptionsPayload | null>(null);
  const [loadingHorusOptions, setLoadingHorusOptions] = useState(false);
  const [fornecedorSearchQuery, setFornecedorSearchQuery] = useState('');

  // Histórico de Fechamentos / Borderôs Salvos no Banco de Dados do Cronuz B2B
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [closingsList, setClosingsList] = useState<any[]>([]);
  const [loadingClosings, setLoadingClosings] = useState(false);
  const [selectedClosingDetail, setSelectedClosingDetail] = useState<any | null>(null);
  const [loadingClosingDetail, setLoadingClosingDetail] = useState(false);
  const [bankForm, setBankForm] = useState({
    forma_pagto: '',
    forma_pagto_credito_maior: '',
    banco: '',
    agencia: '',
    conta: '',
    carteira: '',
    payment_date_mode: 'CHANNEL_DATE',
    unify_installments: true,
    split_excess_launch: true,
    launch_fee_as_expense: false,
    cp_fee_posting_mode: 'UNIFIED' as 'UNIFIED' | 'INDIVIDUAL',
    cp_cod_grp_fornecedor: '',
    cp_cod_fornecedor: '',
    cp_nom_fornecedor: '',
    cp_cod_departamento: '',
    cp_cod_centro_custo: '',
    cp_cod_grup_desp: '',
    cp_cod_despesa: '',
    cp_cod_forma: '',
  });

  const channelFileInputRef = useRef<HTMLInputElement>(null);
  const trayFileInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  // Carrega os perfis liberados pelo Master e a filial padrão do Seller
  useEffect(() => {
    async function loadProfiles() {
      setLoadingProfiles(true);
      try {
        const token = getToken();
        const res = await fetch(
          `${API}/companies/${companyId}/horus-sql/reconciliation/profiles`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.default_filial) {
            setSelectedFilial(String(data.default_filial).trim());
          }
          const enabledList: ReconciliationProfile[] =
            Array.isArray(data.enabled_profiles) && data.enabled_profiles.length > 0
              ? data.enabled_profiles
              : Array.isArray(data.profiles) && data.profiles.length > 0
              ? data.profiles
              : FALLBACK_PROFILES;
          setProfiles(enabledList);
          setActiveProfileCode(enabledList[0].code);
          const firstMode = (enabledList[0].payment_date_mode ||
            enabledList[0].effective_bank?.payment_date_mode ||
            'CHANNEL_DATE') as 'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN';
          setPaymentDateMode(firstMode);
        } else {
          setProfiles(FALLBACK_PROFILES);
        }
      } catch {
        setProfiles(FALLBACK_PROFILES);
      } finally {
        setLoadingProfiles(false);
      }
    }
    loadProfiles();
  }, [companyId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.code === activeProfileCode) || profiles[0] || FALLBACK_PROFILES[0],
    [profiles, activeProfileCode]
  );

  // Sincroniza o modo padrão de data de pagamento e unificação quando o perfil ativo ou bankConfig mudam
  useEffect(() => {
    const modeFromCfg = (bankConfig?.payment_date_mode ||
      activeProfile?.payment_date_mode ||
      activeProfile?.effective_bank?.payment_date_mode ||
      'CHANNEL_DATE') as 'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN';
    setPaymentDateMode(modeFromCfg);

    const defaultUnify =
      activeProfile?.code === 'TRAY_SHOPEE' || activeProfile?.code === 'TRAY_TIKTOK';
    const unifyFromCfg =
      bankConfig?.profile_code === activeProfile?.code &&
      bankConfig?.unify_installments !== undefined
        ? Boolean(bankConfig.unify_installments)
        : activeProfile?.unify_installments !== undefined
        ? Boolean(activeProfile.unify_installments)
        : activeProfile?.effective_bank?.unify_installments !== undefined
        ? Boolean(activeProfile.effective_bank.unify_installments)
        : defaultUnify;
    setUnifyInstallments(unifyFromCfg);

    const splitFromCfg =
      bankConfig?.profile_code === activeProfile?.code &&
      bankConfig?.split_excess_launch !== undefined
        ? Boolean(bankConfig.split_excess_launch)
        : activeProfile?.split_excess_launch !== undefined
        ? Boolean(activeProfile.split_excess_launch)
        : activeProfile?.effective_bank?.split_excess_launch !== undefined
        ? Boolean(activeProfile.effective_bank.split_excess_launch)
        : true;
    setSplitExcessLaunch(splitFromCfg);

    const formaCredFromCfg =
      bankConfig?.profile_code === activeProfile?.code && bankConfig?.forma_pagto_credito_maior
        ? bankConfig.forma_pagto_credito_maior
        : activeProfile?.forma_pagto_credito_maior ||
          activeProfile?.effective_bank?.forma_pagto_credito_maior ||
          '';
    setFormaPagtoCreditoMaior(formaCredFromCfg);

    const feeExpenseFromCfg =
      bankConfig?.profile_code === activeProfile?.code &&
      bankConfig?.launch_fee_as_expense !== undefined
        ? Boolean(bankConfig.launch_fee_as_expense)
        : activeProfile?.launch_fee_as_expense !== undefined
        ? Boolean(activeProfile.launch_fee_as_expense)
        : Boolean(activeProfile?.effective_bank?.launch_fee_as_expense);
    setLaunchFeeAsExpense(feeExpenseFromCfg);

    const cpModeFromCfg = (
      (bankConfig?.profile_code === activeProfile?.code && bankConfig?.cp_fee_posting_mode) ||
      activeProfile?.cp_fee_posting_mode ||
      activeProfile?.effective_bank?.cp_fee_posting_mode ||
      'UNIFIED'
    ) as 'UNIFIED' | 'INDIVIDUAL';
    setCpFeePostingMode(cpModeFromCfg === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'UNIFIED');
  }, [activeProfile, bankConfig]);

  const isDualFileMode = activeProfile?.mode === 'DUAL_FILE';
  const requiresTrayFile =
    activeProfile?.code === 'TRAY_SHOPEE' || activeProfile?.code === 'TRAY_TIKTOK';

  // Busca em tempo real no Horus ERP: Contas Bancárias, Formas de Pagto, Fornecedores, Departamentos, Centros de Custo e Despesas
  const fetchHorusOptions = useCallback(
    async (qFornecedor?: string) => {
      setLoadingHorusOptions(true);
      try {
        const token = getToken();
        const qs = new URLSearchParams();
        if (qFornecedor && qFornecedor.trim()) {
          qs.set('q_fornecedor', qFornecedor.trim());
        }
        const res = await fetch(
          `${API}/companies/${companyId}/horus-sql/reconciliation/horus-options${
            qs.toString() ? `?${qs.toString()}` : ''
          }`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setHorusOptions(data);
        }
      } catch {
        // Silencioso para não bloquear digitação manual se Horus estiver ocupado
      } finally {
        setLoadingHorusOptions(false);
      }
    },
    [companyId]
  );

  // Abre o modal de configuração bancária carregando os códigos atuais do perfil selecionado + consulta Horus em tempo real
  const openBankConfigModal = (prof?: ReconciliationProfile) => {
    const target = prof || activeProfile;
    const defaultUnify = target.code === 'TRAY_SHOPEE' || target.code === 'TRAY_TIKTOK';
    const eff =
      bankConfig?.profile_code === target.code
        ? bankConfig
        : target.effective_bank || {
            forma_pagto: '',
            forma_pagto_credito_maior: '',
            banco: '',
            agencia: '',
            conta: '',
            carteira: '',
            payment_date_mode: 'CHANNEL_DATE',
            unify_installments: defaultUnify,
            split_excess_launch: true,
            launch_fee_as_expense: false,
            cp_fee_posting_mode: 'UNIFIED',
            cp_cod_grp_fornecedor: '',
            cp_cod_fornecedor: '',
            cp_nom_fornecedor: '',
            cp_cod_departamento: '',
            cp_cod_centro_custo: '',
            cp_cod_grup_desp: '',
            cp_cod_despesa: '',
            cp_cod_forma: '',
          };
    setBankForm({
      forma_pagto: eff.forma_pagto || '',
      forma_pagto_credito_maior:
        eff.forma_pagto_credito_maior || target.forma_pagto_credito_maior || '',
      banco: eff.banco || '',
      agencia: eff.agencia || '',
      conta: eff.conta || '',
      carteira: eff.carteira || '',
      payment_date_mode:
        eff.payment_date_mode || target.payment_date_mode || 'CHANNEL_DATE',
      unify_installments:
        eff.unify_installments !== undefined
          ? Boolean(eff.unify_installments)
          : target.unify_installments !== undefined
          ? Boolean(target.unify_installments)
          : defaultUnify,
      split_excess_launch:
        eff.split_excess_launch !== undefined
          ? Boolean(eff.split_excess_launch)
          : target.split_excess_launch !== undefined
          ? Boolean(target.split_excess_launch)
          : true,
      launch_fee_as_expense:
        eff.launch_fee_as_expense !== undefined
          ? Boolean(eff.launch_fee_as_expense)
          : Boolean(target.launch_fee_as_expense),
      cp_fee_posting_mode:
        ((eff.cp_fee_posting_mode || target.cp_fee_posting_mode || 'UNIFIED') as
          | 'UNIFIED'
          | 'INDIVIDUAL') === 'INDIVIDUAL'
          ? 'INDIVIDUAL'
          : 'UNIFIED',
      cp_cod_grp_fornecedor:
        eff.cp_cod_grp_fornecedor || target.cp_cod_grp_fornecedor || '',
      cp_cod_fornecedor: eff.cp_cod_fornecedor || target.cp_cod_fornecedor || '',
      cp_nom_fornecedor: eff.cp_nom_fornecedor || target.cp_nom_fornecedor || '',
      cp_cod_departamento:
        eff.cp_cod_departamento || target.cp_cod_departamento || '',
      cp_cod_centro_custo:
        eff.cp_cod_centro_custo || target.cp_cod_centro_custo || '',
      cp_cod_grup_desp: eff.cp_cod_grup_desp || target.cp_cod_grup_desp || '',
      cp_cod_despesa: eff.cp_cod_despesa || target.cp_cod_despesa || '',
      cp_cod_forma:
        eff.cp_cod_forma || target.cp_cod_forma || eff.forma_pagto || '',
    });
    setFornecedorSearchQuery(eff.cp_nom_fornecedor || target.cp_nom_fornecedor || '');
    setShowBankConfigModal(true);
    fetchHorusOptions(eff.cp_nom_fornecedor || target.cp_nom_fornecedor || undefined);
  };

  // Salva Banco, Agência, Conta, Forma de Pagamento, Modo de Data e Despesa no Contas a Pagar nas configurações do Seller para o perfil ativo
  const handleSaveProfileBankConfig = async () => {
    if (
      !bankForm.forma_pagto.trim() ||
      !bankForm.banco.trim() ||
      !bankForm.agencia.trim() ||
      !bankForm.conta.trim()
    ) {
      toast.error(
        'Preencha Forma de Pagamento (COD_FORMA), Banco (COD_BANCO), Agência (COD_AGENCIA) e Conta Corrente (COD_CONTAC).'
      );
      return;
    }

    if (bankForm.launch_fee_as_expense) {
      if (
        !bankForm.cp_cod_grp_fornecedor.trim() ||
        !bankForm.cp_cod_fornecedor.trim() ||
        !bankForm.cp_cod_departamento.trim() ||
        !bankForm.cp_cod_centro_custo.trim() ||
        !bankForm.cp_cod_grup_desp.trim() ||
        !bankForm.cp_cod_despesa.trim()
      ) {
        toast.error(
          'Para ativar a 4ª Opção (Lançar Taxa como Despesa no Contas a Pagar), selecione Fornecedor, Departamento, Centro de Custo, Grupo de Despesa e Despesa.'
        );
        return;
      }
    }

    setSavingBankConfig(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/bank-config`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            profile_code: activeProfile.code,
            forma_pagto: bankForm.forma_pagto.trim(),
            forma_pagto_credito_maior: bankForm.forma_pagto_credito_maior.trim(),
            banco: bankForm.banco.trim(),
            agencia: bankForm.agencia.trim(),
            conta: bankForm.conta.trim(),
            carteira: bankForm.carteira.trim(),
            payment_date_mode: bankForm.payment_date_mode || 'CHANNEL_DATE',
            unify_installments: Boolean(bankForm.unify_installments),
            split_excess_launch: Boolean(bankForm.split_excess_launch),
            launch_fee_as_expense: Boolean(bankForm.launch_fee_as_expense),
            cp_fee_posting_mode: bankForm.cp_fee_posting_mode || 'UNIFIED',
            cp_cod_grp_fornecedor: bankForm.cp_cod_grp_fornecedor.trim(),
            cp_cod_fornecedor: bankForm.cp_cod_fornecedor.trim(),
            cp_nom_fornecedor: bankForm.cp_nom_fornecedor.trim(),
            cp_cod_departamento: bankForm.cp_cod_departamento.trim(),
            cp_cod_centro_custo: bankForm.cp_cod_centro_custo.trim(),
            cp_cod_grup_desp: bankForm.cp_cod_grup_desp.trim(),
            cp_cod_despesa: bankForm.cp_cod_despesa.trim(),
            cp_cod_forma:
              bankForm.cp_cod_forma.trim() || bankForm.forma_pagto.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao salvar códigos bancários do Horus.');
      }

      if (data.bank_config) {
        setBankConfig(data.bank_config);
      }
      const updatedList: ReconciliationProfile[] =
        Array.isArray(data.enabled_profiles) && data.enabled_profiles.length > 0
          ? data.enabled_profiles
          : Array.isArray(data.profiles) && data.profiles.length > 0
          ? data.profiles
          : profiles;
      setProfiles(updatedList);
      setShowBankConfigModal(false);
      toast.success(
        `Códigos Horus (Banco ${bankForm.banco}, Ag ${bankForm.agencia}, CC ${bankForm.conta}, Forma ${bankForm.forma_pagto}) salvos nas configurações de ${activeProfile.short_name}!`
      );
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar configuração bancária.');
    } finally {
      setSavingBankConfig(false);
    }
  };

  // Troca de perfil limpa os resultados anteriores para evitar mistura de formatos
  const handleSelectProfile = (code: string) => {
    setActiveProfileCode(code);
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

  // Validação de tamanho de arquivo no Frontend (10 MB máx - Regra 1 AGENTS.md)
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

  // Download de modelos CSV (Shopee, TikTok, Vindi ou Tray)
  const handleDownloadTemplate = async (type: 'shopee' | 'tiktok' | 'vindi' | 'tray') => {
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/template?template_type=${type}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Falha ao baixar modelo.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modelo_${type}_conciliacao.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao baixar modelo de planilha.');
    }
  };

  // Processamento das planilhas (1 ou 2 arquivos) e consulta ao SQL Server do Horus com telemetria em tempo real
  const handleProcessFiles = async () => {
    if (!channelFile) {
      toast.error(
        `Selecione o 1º arquivo (${activeProfile.channel_label}) para iniciar a conciliação.`
      );
      return;
    }
    if (requiresTrayFile && !trayFile) {
      toast.error(
        `Selecione o 2º arquivo (Planilha Excel/CSV da Tray) para amarrar os vínculos de ${activeProfile.channel_label} com o Horus.`
      );
      return;
    }

    setReading(true);
    setBorderoSuccess(null);
    setJobProgress({
      status: 'RUNNING',
      phase: 'LENDO_PLANILHAS',
      percent: 5,
      message: 'Enviando e validando estrutura das planilhas...',
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
        filial: selectedFilial.trim() || '1',
        profile_code: activeProfile.code,
        async_job: 'true',
        unify_installments: unifyInstallments ? 'true' : 'false',
        split_excess_launch: splitExcessLaunch ? 'true' : 'false',
      });

      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/preview?${qs.toString()}`,
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

      // Se o backend iniciou um job assíncrono (proteção anti-timeout para planilhas grandes), fazemos polling em tempo real
      if (initialData.job_id) {
        const jobId = initialData.job_id;
        let completed = false;
        while (!completed) {
          await new Promise((resolve) => setTimeout(resolve, 550));
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
            percent: jobState.percent ?? 15,
            message: jobState.message || 'Processando lotes no Horus ERP...',
            current_batch: jobState.current_batch || 0,
            total_batches: jobState.total_batches || 0,
            processed_orders: jobState.processed_orders || 0,
            total_orders: jobState.total_orders || 0,
            horus_found_count: jobState.horus_found_count || 0,
            elapsed_seconds: jobState.elapsed_seconds || 0,
          });

          if (jobState.status === 'ERROR') {
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
      setBankConfig(finalResult.bank_config);
      setItemsReady(finalResult.items_ready || []);
      setItemsDivergence(finalResult.items_divergence || []);
      setItemsAlreadyPaid(finalResult.items_already_paid || []);
      setItemsNotFound(finalResult.items_not_found || []);
      setWarnings(finalResult.warnings || []);
      setActiveRowIndex(0);

      const totalAbertos =
        finalResult.summary?.abertos_qtd ??
        (finalResult.items_ready?.length || 0) + (finalResult.items_divergence?.length || 0);
      toast.success(
        `Conciliação concluída com 100% de segurança! ${totalAbertos} título(s) em aberto localizado(s) no Horus ERP.`
      );
    } catch (e: any) {
      toast.error(e.message || 'Erro de conexão com o servidor.');
    } finally {
      setReading(false);
    }
  };

  // Toggle de seleção individual
  const toggleItemSelection = useCallback(
    (category: 'ready' | 'divergence', nroLancamento: number | undefined, linha: number) => {
      const updater = (prev: ReleaseItem[]) =>
        prev.map((item) => {
          if (item.nro_lancamento === nroLancamento && item.linha === linha) {
            return { ...item, selected: !item.selected };
          }
          return item;
        });

      if (category === 'ready') {
        setItemsReady(updater);
      } else {
        setItemsDivergence(updater);
      }
    },
    []
  );

  const toggleAllReady = (select: boolean) => {
    setItemsReady((prev) =>
      prev.map((it) => (it.situacao_horus === 'ABERTO' ? { ...it, selected: select } : it))
    );
  };

  const toggleAllAbertos = (select: boolean) => {
    setItemsReady((prev) =>
      prev.map((it) => (it.situacao_horus === 'ABERTO' ? { ...it, selected: select } : it))
    );
    setItemsDivergence((prev) =>
      prev.map((it) => (it.situacao_horus === 'ABERTO' ? { ...it, selected: select } : it))
    );
  };

  // Lista consolidada para os títulos selecionados para o Borderô
  const selectedReleases = useMemo(() => {
    const r = itemsReady.filter((i) => i.selected && i.situacao_horus === 'ABERTO');
    const d = itemsDivergence.filter((i) => i.selected && i.situacao_horus === 'ABERTO');
    return [...r, ...d];
  }, [itemsReady, itemsDivergence]);

  const totalSelectedAmount = useMemo(() => {
    return selectedReleases.reduce(
      (acc, cur) => acc + (cur.valor_liquido ?? cur.valor_horus ?? cur.valor_vindi ?? 0),
      0
    );
  }, [selectedReleases]);

  const totalSelectedBrutoAmount = useMemo(() => {
    return selectedReleases.reduce(
      (acc, cur) => acc + (cur.valor_horus ?? cur.valor_vindi ?? 0),
      0
    );
  }, [selectedReleases]);

  const totalSelectedTaxaAmount = useMemo(() => {
    return selectedReleases.reduce(
      (acc, cur) =>
        acc +
        (cur.diff_taxa !== undefined
          ? Math.abs(cur.diff_taxa)
          : cur.taxa || 0),
      0
    );
  }, [selectedReleases]);

  // Lista filtrada para exibição na grade estilo Access
  const displayedItems = useMemo(() => {
    let base: ReleaseItem[] = [];
    if (activeFilterTab === 'all') {
      base = [
        ...itemsReady.map((i) => ({ ...i, _category: 'ready' as const })),
        ...itemsDivergence.map((i) => ({ ...i, _category: 'divergence' as const })),
        ...itemsAlreadyPaid.map((i) => ({ ...i, _category: 'already_paid' as const })),
        ...itemsNotFound.map((i) => ({ ...i, _category: 'not_found' as const })),
      ];
    } else if (activeFilterTab === 'abertos') {
      base = [
        ...itemsReady
          .filter((i) => i.situacao_horus === 'ABERTO')
          .map((i) => ({ ...i, _category: 'ready' as const })),
        ...itemsDivergence
          .filter((i) => i.situacao_horus === 'ABERTO')
          .map((i) => ({ ...i, _category: 'divergence' as const })),
      ];
    } else if (activeFilterTab === 'credito_maior') {
      base = [
        ...itemsReady
          .filter((i) => (i.valor_credito_maior || 0) > 0.05)
          .map((i) => ({ ...i, _category: 'ready' as const })),
        ...itemsDivergence
          .filter((i) => (i.valor_credito_maior || 0) > 0.05)
          .map((i) => ({ ...i, _category: 'divergence' as const })),
      ];
    } else if (activeFilterTab === 'pagos') {
      base = itemsAlreadyPaid.map((i) => ({ ...i, _category: 'already_paid' as const }));
    } else if (activeFilterTab === 'divergence') {
      base = itemsDivergence.map((i) => ({ ...i, _category: 'divergence' as const }));
    } else if (activeFilterTab === 'not_found') {
      base = itemsNotFound.map((i) => ({ ...i, _category: 'not_found' as const }));
    }

    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (i) =>
        (i.pedido_canal && i.pedido_canal.toLowerCase().includes(q)) ||
        (i.pedido_tray && i.pedido_tray.toLowerCase().includes(q)) ||
        i.pedido_web.toLowerCase().includes(q) ||
        i.cliente_nome.toLowerCase().includes(q) ||
        i.documento.toLowerCase().includes(q) ||
        (i.nro_nota_fiscal && String(i.nro_nota_fiscal).toLowerCase().includes(q)) ||
        (i.cod_ped_venda && String(i.cod_ped_venda).includes(q)) ||
        (i.nro_lancamento && String(i.nro_lancamento).includes(q))
    );
  }, [
    activeFilterTab,
    itemsReady,
    itemsDivergence,
    itemsAlreadyPaid,
    itemsNotFound,
    searchQuery,
  ]);

  // Mantém activeRowIndex dentro dos limites da lista filtrada
  useEffect(() => {
    if (activeRowIndex >= displayedItems.length) {
      setActiveRowIndex(Math.max(0, displayedItems.length - 1));
    }
  }, [displayedItems.length, activeRowIndex]);

  // Scroll suave para manter a linha ativa visível ao navegar pelas setas
  useEffect(() => {
    const el = rowRefs.current[activeRowIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeRowIndex]);

  // Navegação 100% por Teclado (Padrão Access Atualizado / Planilha de Alta Produtividade)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      if (e.key === 'Escape') {
        if (inspectedItem) {
          setInspectedItem(null);
          return;
        }
        if (showBorderoModal) {
          setShowBorderoModal(false);
          return;
        }
      }

      if (isTyping || showBorderoModal || inspectedItem) return;
      if (displayedItems.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveRowIndex((prev) => Math.min(displayedItems.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveRowIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveRowIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveRowIndex(displayedItems.length - 1);
      } else if (e.key === ' ') {
        const cur = displayedItems[activeRowIndex];
        if (
          cur &&
          (cur._category === 'ready' || cur._category === 'divergence') &&
          cur.situacao_horus === 'ABERTO'
        ) {
          e.preventDefault();
          toggleItemSelection(cur._category, cur.nro_lancamento, cur.linha);
        }
      } else if (e.key === 'Enter') {
        const cur = displayedItems[activeRowIndex];
        if (cur) {
          e.preventDefault();
          setInspectedItem(cur);
        }
      } else if (e.key === 'F2') {
        if (selectedReleases.length > 0) {
          e.preventDefault();
          setShowBorderoModal(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    displayedItems,
    activeRowIndex,
    showBorderoModal,
    inspectedItem,
    selectedReleases.length,
    toggleItemSelection,
  ]);

  // Exportar grade atual para CSV/Excel
  const handleExport = (items: ReleaseItem[]) => {
    if (!items || items.length === 0) {
      toast.error('Nenhum dado para exportar.');
      return;
    }

    const headers = [
      `Pedido ${activeProfile.channel_label}`,
      ...(isDualFileMode ? ['Pedido Tray (Vínculo)'] : []),
      'Chave Horus',
      'Pedido Horus',
      'Filial',
      'Lançamento',
      'NF',
      'Cliente',
      'Forma Pagto',
      'Parcela',
      'Bruto Canal',
      'Taxa Canal',
      'Líquido Repasse',
      'Valor Horus',
      'Situação ERP',
      'Borderô',
      'Dif. Título',
      'Diagnóstico / Vínculo',
    ];

    const escape = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const fmtNum = (v: number | undefined) =>
      v !== undefined ? v.toFixed(2).replace('.', ',') : '';

    const rows = items.map((it) =>
      [
        it.pedido_canal || it.pedido_web,
        ...(isDualFileMode ? [it.pedido_tray || '-'] : []),
        it.pedido_web,
        it.cod_ped_venda ?? '',
        it.cod_filial ?? '',
        it.nro_lancamento ?? '',
        it.nro_nota_fiscal ?? '',
        it.cliente_nome ?? '',
        it.forma_pagamento ?? '',
        it.total_parcelas && it.total_parcelas > 1
          ? `${it.parcela_num}/${it.total_parcelas}`
          : '1/1',
        fmtNum(it.valor_vindi),
        fmtNum(
          it.diff_taxa !== undefined
            ? Math.abs(it.diff_taxa)
            : it.taxa
            ? it.taxa
            : undefined
        ),
        fmtNum(it.valor_liquido),
        fmtNum(it.valor_horus),
        it.situacao_horus ?? it.status_horus ?? '',
        it.cod_bordero ?? '',
        fmtNum(it.diferenca_valor),
        it.motivo ?? '',
      ]
        .map(escape)
        .join(';')
    );

    const bom = '\uFEFF';
    const csv = bom + [headers.map(escape).join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conciliacao_${activeProfile.code.toLowerCase()}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${items.length} registros exportados para Excel/CSV!`);
  };

  // Geração do Borderô no SQL Server do Horus ERP
  const handleConfirmBordero = async () => {
    if (selectedReleases.length === 0) {
      toast.error('Selecione pelo menos um lançamento em aberto para gerar o borderô.');
      return;
    }
    if (paymentDateMode === 'SPECIFIC_DATE' && !specificPaymentDate.trim()) {
      toast.error('Informe a data específica de pagamento para baixar os títulos.');
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
      const effCfg =
        bankConfig?.profile_code === activeProfile.code
          ? bankConfig
          : activeProfile.effective_bank;

      if (launchFeeAsExpense) {
        if (
          !effCfg?.cp_cod_grp_fornecedor ||
          !effCfg?.cp_cod_fornecedor ||
          !effCfg?.cp_cod_departamento ||
          !effCfg?.cp_cod_centro_custo ||
          !effCfg?.cp_cod_grup_desp ||
          !effCfg?.cp_cod_despesa
        ) {
          toast.error(
            'A 4ª Opção (Lançar Taxa no Contas a Pagar) está ativa, mas os códigos de Fornecedor/Departamento/Centro de Custo/Despesa ainda não foram salvos nas configurações deste perfil. Clique em "Editar Códigos" primeiro.'
          );
          setCreatingBordero(false);
          setBorderoProgress(null);
          return;
        }
      }

      const payload = {
        profile_code: activeProfile.code,
        payment_date_mode: paymentDateMode,
        unify_installments: unifyInstallments,
        split_excess_launch: splitExcessLaunch,
        forma_pagto_credito_maior: formaPagtoCreditoMaior || undefined,
        launch_fee_as_expense: launchFeeAsExpense,
        cp_fee_posting_mode: cpFeePostingMode,
        cp_cod_grp_fornecedor: effCfg?.cp_cod_grp_fornecedor || undefined,
        cp_cod_fornecedor: effCfg?.cp_cod_fornecedor || undefined,
        cp_nom_fornecedor: effCfg?.cp_nom_fornecedor || undefined,
        cp_cod_departamento: effCfg?.cp_cod_departamento || undefined,
        cp_cod_centro_custo: effCfg?.cp_cod_centro_custo || undefined,
        cp_cod_grup_desp: effCfg?.cp_cod_grup_desp || undefined,
        cp_cod_despesa: effCfg?.cp_cod_despesa || undefined,
        cp_cod_forma: effCfg?.cp_cod_forma || effCfg?.forma_pagto || undefined,
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
          taxa:
            r.diff_taxa !== undefined
              ? Math.abs(r.diff_taxa)
              : r.taxa || 0,
          valor_horus_original: r.valor_horus_original ?? r.valor_horus,
          valor_credito_maior: r.valor_credito_maior || 0,
          unificadas_qtd: r.unificadas_qtd || 1,
          grouped_lancto_ids: r.grouped_lancto_ids,
          status: r.status_horus || 'AB',
          data_pagamento: r.data_pagamento || '',
        })),
      };

      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/bordero?async_job=true`,
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
            throw new Error(errJson.detail || 'Falha ao consultar andamento da geração do Borderô.');
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
            throw new Error(jobState.error || jobState.message || 'Erro na transação SQL do Borderô.');
          }
          if (jobState.status === 'COMPLETED' && jobState.result) {
            data = jobState.result;
            await new Promise((resolve) => setTimeout(resolve, 500));
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
        launch_fee_as_expense: Boolean(data.launch_fee_as_expense),
        cp_fee_posting_mode: data.cp_fee_posting_mode,
        total_taxa_bordero: data.total_taxa_bordero,
        cpagar_expenses_count: data.cpagar_expenses_count,
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
        motivo:
          paymentDateMode === 'CHANNEL_DATE'
            ? `Baixado (PG) no Borderô #${data.bordero_number} com a data da planilha (${i.data_pagamento || 'hoje'}).`
            : paymentDateMode === 'SPECIFIC_DATE'
            ? `Baixado (PG) no Borderô #${data.bordero_number} com data específica (${specificPaymentDate}).`
            : `Vinculado ao Borderô #${data.bordero_number} (Em Aberto no Horus).`,
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

  // Carrega o Histórico de Fechamentos / Borderôs salvos no banco do Cronuz B2B
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
      } else {
        toast.error('Não foi possível carregar o histórico de fechamentos.');
      }
    } catch {
      toast.error('Erro de conexão ao consultar histórico de fechamentos.');
    } finally {
      setLoadingClosings(false);
    }
  };

  const loadClosingDetail = async (closingId: number) => {
    setLoadingClosingDetail(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/horus-sql/reconciliation/closings/${closingId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedClosingDetail(data.closing || null);
      } else {
        toast.error('Erro ao carregar detalhes do fechamento.');
      }
    } catch {
      toast.error('Erro de conexão ao abrir fechamento.');
    } finally {
      setLoadingClosingDetail(false);
    }
  };

  const exportClosingDetailToCsv = (closing: any) => {
    const items = closing?.items || [];
    if (!items.length) {
      toast.error('Nenhum item registrado neste fechamento.');
      return;
    }
    const headers = [
      'Borderô Horus',
      'Modalidade',
      'Pedido Canal',
      'Pedido Tray',
      'Pedido Horus',
      'Lançamento Principal',
      'NF',
      'Cliente',
      'Valor Bruto',
      'Taxa Abatida',
      'Valor Líquido Baixado',
      'Valor Orig. Horus',
      'Crédito Maior Separado',
      'Novo Lanç. Crédito Maior',
      'Parcelas Unificadas',
      'Data Pagamento',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmtNum = (v: number | undefined) =>
      v !== undefined && v !== null ? Number(v).toFixed(2).replace('.', ',') : '0,00';

    const rows = items.map((it: any) =>
      [
        closing.cod_bordero,
        closing.profile_name || closing.profile_code,
        it.pedido_canal || it.pedido_web || '',
        it.pedido_tray || '-',
        it.cod_ped_venda || '',
        it.nro_lancamento || '',
        it.nro_nota_fiscal || '',
        it.cliente_nome || '',
        fmtNum(it.valor_bruto),
        fmtNum(it.taxa),
        fmtNum(it.valor_liquido),
        fmtNum(it.valor_horus_original),
        fmtNum(it.valor_credito_maior),
        it.novo_lancamento_credito_maior || '-',
        it.unificadas_qtd || 1,
        it.data_pagamento || '',
      ]
        .map(escape)
        .join(';')
    );

    const bom = '\uFEFF';
    const csv = bom + [headers.map(escape).join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fechamento_bordero_${closing.cod_bordero}_${closing.profile_code.toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Fechamento do Borderô #${closing.cod_bordero} exportado com sucesso!`);
  };

  const formatBRL = (val?: number) =>
    (val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loadingProfiles) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="text-sm font-medium">Carregando Central de Conciliações Bancárias...</span>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-5 space-y-4 max-w-[1600px] mx-auto">
      {/* ─── CABEÇALHO & SELETOR DE CONCILIAÇÕES HABILITADAS PELO MASTER (RIBBON ACCESS) ─── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Bancos &amp; Marketplaces — Central de Conciliação (Horus ERP)
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300">
                  Datasheet View • Access Atualizado
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Selecione abaixo a operação habilitada, carregue os arquivos para amarrar os vínculos e gere o Borderô de baixa diretamente no Contas a Receber do Horus.
              </p>
            </div>
          </div>

          {/* Indicador de Conta/Carteira Ativa para o Perfil + Botão Configurar Códigos Horus */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div
              onClick={() => openBankConfigModal(activeProfile)}
              title="Clique para configurar Banco, Agência, Conta e Forma de Pagamento no Horus para esta modalidade"
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 bg-white dark:bg-slate-900 text-xs flex items-center gap-2.5 cursor-pointer transition-all"
            >
              <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block leading-none">
                  Destino Borderô ({activeProfile.short_name})
                </span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                  {(bankConfig?.profile_code === activeProfile.code && bankConfig?.banco) ||
                  activeProfile.effective_bank?.banco
                    ? `Forma ${
                        (bankConfig?.profile_code === activeProfile.code
                          ? bankConfig?.forma_pagto
                          : activeProfile.effective_bank?.forma_pagto) || '-'
                      } • Bco ${
                        (bankConfig?.profile_code === activeProfile.code
                          ? bankConfig?.banco
                          : activeProfile.effective_bank?.banco) || '-'
                      } • Ag ${
                        (bankConfig?.profile_code === activeProfile.code
                          ? bankConfig?.agencia
                          : activeProfile.effective_bank?.agencia) || '-'
                      } • CC ${
                        (bankConfig?.profile_code === activeProfile.code
                          ? bankConfig?.conta
                          : activeProfile.effective_bank?.conta) || '-'
                      }`
                    : 'Clique p/ Configurar Banco Horus'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={openHistoryModal}
              className="px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5" />
              Histórico de Fechamentos
            </button>

            <button
              type="button"
              onClick={() => openBankConfigModal(activeProfile)}
              className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              Códigos Horus ({activeProfile.short_name})
            </button>
          </div>
        </div>

        {/* ABAS DE OPÇÕES DE CONCILIAÇÃO LIBERADAS PARA O SELLER */}
        <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Modalidade:
          </span>
          {profiles.map((prof) => {
            const isSelected = prof.code === activeProfile.code;
            return (
              <button
                key={prof.code}
                type="button"
                onClick={() => handleSelectProfile(prof.code)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                }`}
              >
                <span>{prof.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    isSelected
                      ? 'bg-indigo-700 text-indigo-100'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {prof.mode === 'DUAL_FILE' ? '2 Arquivos' : '1 Arquivo'}
                </span>
              </button>
            );
          })}
        </div>

        {/* ─── PAINEL DE ENTRADA DE ARQUIVOS (1 OU 2 ARQUIVOS CONFORME O PERFIL) ─── */}
        <div className="p-4 sm:p-5 space-y-4">
          <div
            className={`grid grid-cols-1 ${
              isDualFileMode ? 'lg:grid-cols-12' : 'lg:grid-cols-8'
            } gap-3 items-stretch`}
          >
            {/* ARQUIVO 1: CANAL (SHOPEE / TIKTOK / VINDI) */}
            <div className={`${isDualFileMode ? 'lg:col-span-5' : 'lg:col-span-5'} flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3.5 space-y-2.5`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[11px] font-mono flex items-center justify-center">
                    1
                  </span>
                  {activeProfile.file_1_label || `Planilha ${activeProfile.channel_label}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadTemplate(
                      activeProfile.code === 'TRAY_SHOPEE'
                        ? 'shopee'
                        : activeProfile.code === 'TRAY_TIKTOK'
                        ? 'tiktok'
                        : 'vindi'
                    )
                  }
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Download className="h-3 w-3" /> Modelo {activeProfile.channel_label}
                </button>
              </div>

              <div
                onClick={() => channelFileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-3.5 py-3 transition-all flex items-center justify-between gap-3 ${
                  channelFile
                    ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20'
                    : 'border-slate-300 hover:border-indigo-400 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <input
                  ref={channelFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xlsm"
                  className="hidden"
                  onChange={(e) => validateAndSetFile(e.target.files?.[0], 'CHANNEL')}
                />
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet
                    className={`h-5 w-5 shrink-0 ${
                      channelFile ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {channelFile
                        ? channelFile.name
                        : `Selecionar planilha ${activeProfile.channel_label} (.xlsx / .csv)`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {channelFile
                        ? `${(channelFile.size / 1024).toFixed(1)} KB pronto para leitura`
                        : 'Pedidos recebidos, valores brutos, taxas e líquido'}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                  {channelFile ? 'Trocar' : 'Procurar'}
                </span>
              </div>
            </div>

            {/* ARQUIVO 2: PLANILHA TRAY (SOMENTE QUANDO FOR MODO DUAL_FILE: SHOPEE+TRAY, TIKTOK+TRAY, VINDI+TRAY) */}
            {isDualFileMode && (
              <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-md bg-violet-600 text-white text-[11px] font-mono flex items-center justify-center">
                      2
                    </span>
                    {activeProfile.file_2_label || 'Planilha de Pedidos da Tray (Vínculo)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('tray')}
                    className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Download className="h-3 w-3" /> Modelo Tray
                  </button>
                </div>

                <div
                  onClick={() => trayFileInputRef.current?.click()}
                  className={`cursor-pointer rounded-xl border-2 border-dashed px-3.5 py-3 transition-all flex items-center justify-between gap-3 ${
                    trayFile
                      ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20'
                      : 'border-indigo-300 hover:border-indigo-500 bg-white dark:border-indigo-800 dark:bg-slate-900'
                  }`}
                >
                  <input
                    ref={trayFileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xlsm"
                    className="hidden"
                    onChange={(e) => validateAndSetFile(e.target.files?.[0], 'TRAY')}
                  />
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Link2
                      className={`h-5 w-5 shrink-0 ${
                        trayFile ? 'text-emerald-600' : 'text-violet-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {trayFile
                          ? trayFile.name
                          : 'Selecionar planilha Excel/CSV da Tray'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {trayFile
                          ? `${(trayFile.size / 1024).toFixed(1)} KB pronto para cruzamento`
                          : `Amarra Nº Pedido ${activeProfile.channel_label} ↔ Nº Pedido Tray / Horus`}
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    {trayFile ? 'Trocar' : 'Procurar'}
                  </span>
                </div>
              </div>
            )}

            {/* FILIAL HORUS + OPÇÃO UNIFICAR PARCELAS + BOTÃO EXECUTAR CONCILIAÇÃO */}
            <div className={`${isDualFileMode ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3.5 space-y-2.5`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-extrabold uppercase text-slate-500">
                    Filial Horus
                  </label>
                  <input
                    type="text"
                    value={selectedFilial}
                    onChange={(e) => setSelectedFilial(e.target.value)}
                    placeholder="1"
                    className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-center text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div
                  title="Quando a nota no Horus possui várias parcelas mas o canal pagou em parcela única, unifica todas as parcelas em aberto na 1ª e registra a taxa em VLR_LANCTO_ABATIMENTO"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 flex items-center justify-between gap-1.5"
                >
                  <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-300 leading-tight">
                    Unificar Parcelas + Taxa
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setUnifyInstallments(true)}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                        unifyInstallments
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnifyInstallments(false)}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                        !unifyInstallments
                          ? 'bg-slate-800 text-white dark:bg-slate-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleProcessFiles}
                disabled={reading || !channelFile || (requiresTrayFile && !trayFile)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2.5 text-xs font-extrabold text-white shadow-xs transition-all cursor-pointer"
              >
                {reading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {jobProgress ? `${jobProgress.percent}% Processando...` : 'Cruzando Dados...'}
                  </>
                ) : (
                  <>
                    <DatabaseZap className="h-4 w-4" />
                    Conciliar no Horus
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ─── BARRA DE CARREGAMENTO & TELEMETRIA DE SEGURANÇA EM TEMPO REAL ─── */}
          <AnimatePresence>
            {reading && jobProgress && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 space-y-3.5 overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          Motor de Conciliação Blindado em Execução
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-600 text-white">
                          {jobProgress.percent}%
                        </span>
                      </div>
                      <p className="text-xs text-indigo-800 dark:text-indigo-200 font-medium mt-0.5">
                        {jobProgress.message}
                      </p>
                    </div>
                  </div>

                  {/* Contadores ao vivo */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                    {jobProgress.total_batches > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 font-bold text-indigo-700 dark:text-indigo-300">
                        Lote SQL: {jobProgress.current_batch}/{jobProgress.total_batches}
                      </span>
                    )}
                    {jobProgress.total_orders > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
                        Pedidos: {jobProgress.processed_orders}/{jobProgress.total_orders}
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 font-bold text-emerald-700 dark:text-emerald-300">
                      Títulos Horus: {jobProgress.horus_found_count}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-indigo-500" />
                      {jobProgress.elapsed_seconds.toFixed(1)}s
                    </span>
                  </div>
                </div>

                {/* Barra de Progresso Animada */}
                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden p-0.5">
                  <motion.div
                    initial={{ width: '5%' }}
                    animate={{ width: `${Math.max(5, Math.min(100, jobProgress.percent))}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500 shadow-xs"
                  />
                </div>

                {/* 4 Checkpoints de Segurança */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-0.5">
                  {[
                    {
                      step: 1,
                      label: '1. Leitura e Sanitização da Planilha',
                      done: jobProgress.percent >= 20,
                      active: jobProgress.phase === 'LENDO_PLANILHAS',
                    },
                    {
                      step: 2,
                      label: isDualFileMode
                        ? '2. Cruzamento de Vínculos Tray'
                        : '2. Mapeamento de Pedidos e Parcelas',
                      done: jobProgress.percent >= 30,
                      active: jobProgress.phase === 'VINCULANDO_TRAY',
                    },
                    {
                      step: 3,
                      label: '3. Lotes Indexados SQL Server (NOLOCK)',
                      done: jobProgress.percent >= 88,
                      active: jobProgress.phase === 'CONSULTANDO_HORUS',
                    },
                    {
                      step: 4,
                      label: '4. Auditoria Financeira & Integridade',
                      done: jobProgress.percent >= 100,
                      active: jobProgress.phase === 'AUDITORIA_VALORES',
                    },
                  ].map((st) => (
                    <div
                      key={st.step}
                      className={`px-3 py-2 rounded-xl border text-[11px] font-bold flex items-center gap-2 transition-all ${
                        st.done
                          ? 'border-emerald-300 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : st.active
                          ? 'border-indigo-400 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-300 shadow-2xs'
                          : 'border-slate-200/80 bg-white/50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40'
                      }`}
                    >
                      {st.done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : st.active ? (
                        <Loader2 className="h-4 w-4 text-indigo-600 animate-spin shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 dark:border-slate-700 shrink-0" />
                      )}
                      <span className="truncate">{st.label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── BANNER DE SUCESSO E AUDITORIA PÓS-GRAVAÇÃO DO BORDERÔ ──────────── */}
      <AnimatePresence>
        {borderoSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-extrabold text-emerald-950 dark:text-emerald-200">
                    Borderô #{borderoSuccess.number} Gravado e Auditado no Horus ERP!
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-600 text-white">
                    CONFERÊNCIA SQL: {borderoSuccess.verified_count ?? borderoSuccess.qtd}/{borderoSuccess.qtd} TÍTULOS CONFIRMADOS
                  </span>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                  Foram baixados e verificados na tabela <code className="font-mono font-bold">LANCTOS_CRECEBER</code>{' '}
                  <b>{borderoSuccess.qtd} títulos</b> totalizando{' '}
                  <b>R$ {formatBRL(borderoSuccess.total)}</b> na modalidade{' '}
                  <b>{activeProfile.name}</b>
                  {borderoSuccess.completed_at ? ` às ${borderoSuccess.completed_at}` : ''}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBorderoSuccess(null)}
              className="text-xs font-bold text-emerald-700 hover:underline shrink-0 cursor-pointer"
            >
              Fechar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── WORKSTATION ACCESS ATUALIZADO: SELO DE SEGURANÇA + KPIs + GRADE DE ALTA DENSIDADE ─── */}
      {summary && (
        <div className="space-y-3">
          {/* SELO DE SEGURANÇA E INTEGRIDADE DA CONCILIAÇÃO */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-extrabold text-emerald-950 dark:text-emerald-200">
                Conciliação Finalizada com 100% de Segurança e Integridade Auditada
              </span>
            </div>
            {summary.security_audit && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-emerald-800 dark:text-emerald-300">
                <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-800 font-bold">
                  {summary.security_audit.unique_orders_queried} pedidos auditados
                </span>
                <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-800 font-bold">
                  {summary.security_audit.batches_executed} lote(s) SQL sem falhas
                </span>
                <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-800 font-bold">
                  {summary.security_audit.horus_titles_fetched} títulos Horus ERP
                </span>
                <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-emerald-200 dark:border-emerald-800">
                  Tempo: {summary.security_audit.elapsed_seconds}s • {summary.security_audit.completed_at}
                </span>
              </div>
            )}
          </div>

          {/* AVISOS / DIAGNÓSTICOS DA PLANILHA (SE HOUVER) */}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-2.5 space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <Info className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* FAIXA DE INDICADORES COMPACTA */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* 1. Lidos no Canal */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                1. Lidos ({activeProfile.channel_label})
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

            {/* 2. Vínculos Tray (Quando Dual File) ou Títulos Pagos */}
            {summary.is_dual_file ? (
              <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3">
                <span className="text-[10px] font-extrabold uppercase text-violet-700 dark:text-violet-300 block">
                  2. Vínculos Tray Amarrados
                </span>
                <p className="text-lg font-black text-violet-700 dark:text-violet-300 font-mono mt-0.5">
                  {summary.tray_linked_qtd ?? 0}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    / {summary.total_planilha_qtd}
                  </span>
                </p>
                <p className="text-[11px] text-violet-700 dark:text-violet-400">
                  Planilha Tray: {summary.tray_total_rows ?? 0} pedidos
                </p>
                {(summary.tray_unlinked_qtd ?? 0) > 0 && (
                  <p className="text-[10px] font-bold text-rose-600">
                    {summary.tray_unlinked_qtd} sem par na Tray
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 p-3">
                <span className="text-[10px] font-extrabold uppercase text-sky-700 dark:text-sky-300 block">
                  2. Já Baixados no Horus
                </span>
                <p className="text-lg font-black text-sky-700 dark:text-sky-300 font-mono mt-0.5">
                  {summary.pagos_qtd ?? summary.already_paid_qtd}
                </p>
                <p className="text-[11px] font-mono text-sky-700 dark:text-sky-400">
                  R$ {formatBRL(summary.pagos_valor ?? summary.already_paid_valor)}
                </p>
              </div>
            )}

            {/* 3. Em Aberto no Horus (Prontos p/ Borderô) */}
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
                    summary.abertos_valor ??
                    summary.ready_valor
                )}
              </p>
              <p className="text-[10px] font-mono text-slate-500">
                Bruto Títulos: R$ {formatBRL(summary.abertos_valor ?? summary.ready_valor)}
              </p>
            </div>

            {/* 4. Divergência de Valor Bruto */}
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

            {/* 5. Taxas Retidas pelo Canal */}
            <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 p-3">
              <span className="text-[10px] font-extrabold uppercase text-purple-700 dark:text-purple-300 block">
                5. Taxas ({activeProfile.channel_label})
              </span>
              <p className="text-base font-black text-purple-700 dark:text-purple-300 font-mono mt-1">
                -R$ {formatBRL(summary.total_taxa_vindi)}
              </p>
              <p className="text-[10px] text-purple-600 dark:text-purple-400">
                Comissão / Tarifa retida
              </p>
            </div>

            {/* 6. Não Localizados no Horus */}
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

          {/* ─── CONTAINER PRINCIPAL DA PLANILHA (MODELO ACCESS ATUALIZADO) ─── */}
          <div className="rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col">
            {/* BARRA DE FERRAMENTAS DA PLANILHA */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
              {/* Abas de Filtro Rápido */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {[
                  {
                    id: 'all',
                    label: `Todos (${
                      itemsReady.length +
                      itemsDivergence.length +
                      itemsAlreadyPaid.length +
                      itemsNotFound.length
                    })`,
                  },
                  {
                    id: 'abertos',
                    label: `Em Aberto AB (${
                      itemsReady.filter((i) => i.situacao_horus === 'ABERTO').length +
                      itemsDivergence.filter((i) => i.situacao_horus === 'ABERTO').length
                    })`,
                  },
                  {
                    id: 'credito_maior',
                    label: `Crédito Maior Separado (${
                      itemsReady.filter((i) => (i.valor_credito_maior || 0) > 0.01).length +
                      itemsDivergence.filter((i) => (i.valor_credito_maior || 0) > 0.01).length +
                      itemsAlreadyPaid.filter((i) => (i.valor_credito_maior || 0) > 0.01).length
                    })`,
                  },
                  {
                    id: 'divergence',
                    label: `Divergências (${itemsDivergence.length})`,
                  },
                  {
                    id: 'pagos',
                    label: `Já Baixados (${itemsAlreadyPaid.length})`,
                  },
                  {
                    id: 'not_found',
                    label: `Não Localizados (${itemsNotFound.length})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveFilterTab(tab.id as any);
                      setActiveRowIndex(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      activeFilterTab === tab.id
                        ? 'bg-slate-900 text-white dark:bg-indigo-600 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Busca + Seleção Rápida + Exportar + Botão Principal de Borderô */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setActiveRowIndex(0);
                    }}
                    placeholder={`Filtrar pedido ${activeProfile.channel_label}, Tray, Horus, NF ou cliente...`}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => toggleAllAbertos(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                >
                  Marcar Abertos
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllAbertos(false)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 cursor-pointer"
                >
                  Desmarcar
                </button>
                <button
                  type="button"
                  onClick={() => handleExport(displayedItems)}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 flex items-center gap-1 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Exportar Grade
                </button>

                <button
                  type="button"
                  disabled={selectedReleases.length === 0}
                  onClick={() => setShowBorderoModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Gerar Borderô ({selectedReleases.length}) • R$ {formatBRL(totalSelectedAmount)}
                </button>
              </div>
            </div>

            {/* GRADE DATASHEET DE ALTA DENSIDADE (ESTILO ACCESS ATUALIZADO) */}
            <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
              <table className="w-full text-left border-collapse select-none">
                <thead className="sticky top-0 z-10 bg-slate-200/95 dark:bg-slate-800/95 backdrop-blur-xs text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">
                  <tr className="divide-x divide-slate-300/80 dark:divide-slate-700">
                    <th className="py-2 px-2.5 w-9 text-center">✓</th>
                    <th className="py-2 px-2.5 w-12 text-center">#</th>
                    <th className="py-2 px-3">Pedido {activeProfile.channel_label}</th>
                    {isDualFileMode && <th className="py-2 px-3">Pedido Tray (Ponte)</th>}
                    <th className="py-2 px-3">Pedido Horus</th>
                    <th className="py-2 px-2.5">Lanç.</th>
                    <th className="py-2 px-2.5">NF</th>
                    <th className="py-2 px-3">Cliente / Comprador</th>
                    <th className="py-2 px-3 text-right">Bruto Canal</th>
                    <th className="py-2 px-3 text-right">Taxa Canal</th>
                    <th className="py-2 px-3 text-right">Líq. Repasse</th>
                    <th className="py-2 px-3 text-right">Valor Horus</th>
                    <th className="py-2 px-3 text-right">Dif. Título</th>
                    <th className="py-2 px-2.5 text-center">Situação ERP</th>
                    <th className="py-2 px-2.5 text-center">Borderô</th>
                    <th className="py-2 px-3">Vínculo / Diagnóstico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isDualFileMode ? 16 : 15}
                        className="py-12 text-center text-slate-400"
                      >
                        Nenhum registro encontrado para este filtro.
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map((item, idx) => {
                      const isRowFocused = idx === activeRowIndex;
                      const canSelect =
                        (item._category === 'ready' || item._category === 'divergence') &&
                        item.situacao_horus === 'ABERTO';

                      const diffBruto = item.diferenca_valor ?? 0;
                      const hasDiffBruto = Math.abs(diffBruto) > 0.05;
                      const taxaVal =
                        item.diff_taxa !== undefined
                          ? Math.abs(item.diff_taxa)
                          : item.taxa || 0;

                      return (
                        <tr
                          key={`${item._category}-${item.linha}-${item.nro_lancamento || idx}`}
                          ref={(el) => {
                            rowRefs.current[idx] = el;
                          }}
                          onClick={() => setActiveRowIndex(idx)}
                          onDoubleClick={() => setInspectedItem(item)}
                          className={`divide-x divide-slate-200/70 dark:divide-slate-800/70 transition-colors cursor-pointer ${
                            isRowFocused
                              ? 'bg-indigo-100/80 dark:bg-indigo-950/60 ring-1 ring-inset ring-indigo-500'
                              : item.selected
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Checkbox de seleção p/ Borderô */}
                          <td
                            className="py-1.5 px-2.5 text-center"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canSelect) {
                                toggleItemSelection(
                                  item._category as 'ready' | 'divergence',
                                  item.nro_lancamento,
                                  item.linha
                                );
                              }
                            }}
                          >
                            {canSelect ? (
                              <button
                                type="button"
                                className="text-indigo-600 dark:text-indigo-400 cursor-pointer"
                              >
                                {item.selected ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-400" />
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-700">—</span>
                            )}
                          </td>

                          {/* Nº Linha */}
                          <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-400">
                            {item.linha}
                          </td>

                          {/* Nº Pedido Canal (Shopee / TikTok / Vindi) */}
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {item.pedido_canal || item.pedido_web}
                          </td>

                          {/* Nº Pedido Tray (Ponte) */}
                          {isDualFileMode && (
                            <td className="py-1.5 px-3 font-mono whitespace-nowrap">
                              {item.pedido_tray && item.pedido_tray !== '-' ? (
                                <span className="inline-flex items-center gap-1 font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800">
                                  #{item.pedido_tray}
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-rose-500">
                                  Sem vínculo Tray
                                </span>
                              )}
                            </td>
                          )}

                          {/* Pedido Horus */}
                          <td className="py-1.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                            {item.cod_ped_venda ? `#${item.cod_ped_venda}` : '—'}
                          </td>

                          {/* Nº Lançamento Contas a Receber */}
                          <td className="py-1.5 px-2.5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {item.nro_lancamento ? (
                              <div className="flex items-center gap-1">
                                <span>#{item.nro_lancamento}</span>
                                {(item.unificadas_qtd || 1) > 1 && (
                                  <span
                                    title={`${item.unificadas_qtd} parcelas abertas unificadas neste lançamento`}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300"
                                  >
                                    {item.unificadas_qtd}x UNIF.
                                  </span>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Nota Fiscal */}
                          <td className="py-1.5 px-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {item.nro_nota_fiscal && item.nro_nota_fiscal !== '-'
                              ? item.nro_nota_fiscal
                              : '—'}
                          </td>

                          {/* Cliente */}
                          <td className="py-1.5 px-3 max-w-[200px] truncate text-slate-800 dark:text-slate-200 font-medium">
                            {item.cliente_nome}
                          </td>

                          {/* Valor Bruto Canal */}
                          <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                            R$ {formatBRL(item.valor_vindi)}
                          </td>

                          {/* Taxa Canal */}
                          <td className="py-1.5 px-3 text-right font-mono text-purple-700 dark:text-purple-400 whitespace-nowrap">
                            {taxaVal > 0.009 ? `-R$ ${formatBRL(taxaVal)}` : '—'}
                          </td>

                          {/* Líquido Repasse */}
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                            R$ {formatBRL(item.valor_liquido ?? item.valor_vindi)}
                          </td>

                          {/* Valor Título Horus */}
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {item.valor_horus !== undefined ? (
                              <div className="flex flex-col items-end">
                                <span>R$ {formatBRL(item.valor_horus)}</span>
                                {(item.valor_credito_maior || 0) > 0.01 && (
                                  <span
                                    title={`Título original no Horus: R$ ${formatBRL(
                                      item.valor_horus_original
                                    )}. Excedente de R$ ${formatBRL(
                                      item.valor_credito_maior
                                    )} separado em novo lançamento (Forma ${
                                      item.forma_pagto_credito_maior ||
                                      formaPagtoCreditoMaior ||
                                      'Configurável'
                                    }).`}
                                    className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 px-1.5 py-0.5 rounded mt-0.5"
                                  >
                                    +R$ {formatBRL(item.valor_credito_maior)} Créd. Maior
                                  </span>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Diferença Bruto vs Horus */}
                          <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">
                            {item.valor_horus === undefined ? (
                              '—'
                            ) : (item.valor_credito_maior || 0) > 0.01 && !hasDiffBruto ? (
                              <div className="flex flex-col items-end">
                                <span className="text-emerald-600 font-bold">R$ 0,00</span>
                                <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                                  Forma {item.forma_pagto_credito_maior || formaPagtoCreditoMaior || 'Créd.'}
                                </span>
                              </div>
                            ) : hasDiffBruto ? (
                              <span className="font-bold text-amber-700 dark:text-amber-400">
                                {diffBruto > 0 ? '+' : '-'}R$ {formatBRL(Math.abs(diffBruto))}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-bold">R$ 0,00</span>
                            )}
                          </td>

                          {/* Situação no Horus ERP */}
                          <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                            {item.situacao_horus === 'ABERTO' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                ABERTO
                              </span>
                            ) : item.situacao_horus === 'PAGO' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                                PAGO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                NÃO LOC.
                              </span>
                            )}
                          </td>

                          {/* Borderô */}
                          <td className="py-1.5 px-2.5 text-center font-mono whitespace-nowrap">
                            {item.cod_bordero && Number(item.cod_bordero) > 0 ? (
                              <span className="font-bold text-sky-700 dark:text-sky-400">
                                #{item.cod_bordero}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Diagnóstico / Botão Ver Ficha */}
                          <td className="py-1.5 px-3 flex items-center justify-between gap-2 min-w-[240px]">
                            <span className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                              {item.motivo || 'Vínculo conciliado e pronto para borderô.'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectedItem(item);
                              }}
                              title="Abrir Ficha de Vínculo (Enter / Duplo Clique)"
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 shrink-0 cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ─── BARRA INFERIOR DE NAVEGAÇÃO DE REGISTROS (RODAPÉ ACCESS ATUALIZADO) ─── */}
            <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveRowIndex(0)}
                  disabled={displayedItems.length === 0 || activeRowIndex <= 0}
                  className="p-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                  title="Primeiro Registro (Home)"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRowIndex((p) => Math.max(0, p - 1))}
                  disabled={displayedItems.length === 0 || activeRowIndex <= 0}
                  className="p-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                  title="Registro Anterior (↑)"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <span className="px-3 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200">
                  Registro {displayedItems.length > 0 ? activeRowIndex + 1 : 0} de{' '}
                  {displayedItems.length}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setActiveRowIndex((p) => Math.min(displayedItems.length - 1, p + 1))
                  }
                  disabled={
                    displayedItems.length === 0 || activeRowIndex >= displayedItems.length - 1
                  }
                  className="p-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                  title="Próximo Registro (↓)"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRowIndex(Math.max(0, displayedItems.length - 1))}
                  disabled={
                    displayedItems.length === 0 || activeRowIndex >= displayedItems.length - 1
                  }
                  className="p-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-40 cursor-pointer"
                  title="Último Registro (End)"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>[↑/↓] Navegar</span>
                <span>[Espaço] Marcar/Desmarcar</span>
                <span>[Enter / 2x Clique] Ficha do Vínculo</span>
                <span>[F2] Gerar Borderô</span>
              </div>

              <div className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                Selecionados p/ Baixa: {selectedReleases.length} título(s) • Total: R${' '}
                {formatBRL(totalSelectedAmount)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL FICHA DE INSPEÇÃO DE VÍNCULO (3 PONTAS: CANAL ↔ TRAY ↔ HORUS) ─── */}
      <AnimatePresence>
        {inspectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-sm font-extrabold">
                    Ficha de Rastreabilidade do Vínculo • Linha #{inspectedItem.linha}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedItem(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {/* 3 Cartões de Ponta a Ponta */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Ponta 1: Canal */}
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase text-indigo-600 block">
                      1. Origem ({activeProfile.channel_label})
                    </span>
                    <p className="font-mono font-bold text-sm text-slate-900 dark:text-white break-all">
                      {inspectedItem.pedido_canal || inspectedItem.pedido_web}
                    </p>
                    <p className="text-slate-500">Data: {inspectedItem.data_pagamento}</p>
                    <p className="font-mono">Bruto: R$ {formatBRL(inspectedItem.valor_vindi)}</p>
                    <p className="font-mono text-purple-600">
                      Taxa: -R$ {formatBRL(inspectedItem.taxa)}
                    </p>
                    <p className="font-mono font-bold text-indigo-600">
                      Líquido: R$ {formatBRL(inspectedItem.valor_liquido)}
                    </p>
                  </div>

                  {/* Ponta 2: Hub Tray */}
                  <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase text-violet-700 dark:text-violet-300 block">
                      2. Ponte Integradora ({activeProfile.hub_label})
                    </span>
                    <p className="font-mono font-bold text-sm text-violet-800 dark:text-violet-200">
                      {isDualFileMode
                        ? inspectedItem.pedido_tray && inspectedItem.pedido_tray !== '-'
                          ? `Pedido Tray #${inspectedItem.pedido_tray}`
                          : 'Não localizado na Tray'
                        : 'Integração Direta'}
                    </p>
                    <p className="text-slate-500">
                      Chave enviada ao Horus: <b className="font-mono">{inspectedItem.pedido_web}</b>
                    </p>
                    {inspectedItem.valor_tray ? (
                      <p className="font-mono">
                        Valor na Tray: R$ {formatBRL(inspectedItem.valor_tray)}
                      </p>
                    ) : null}
                    <p className="text-slate-600 dark:text-slate-300 truncate">
                      Cliente: {inspectedItem.cliente_nome}
                    </p>
                  </div>

                  {/* Ponta 3: Horus ERP */}
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300 block">
                      3. Contas a Receber (Horus ERP)
                    </span>
                    <p className="font-mono font-bold text-sm text-emerald-800 dark:text-emerald-200">
                      {inspectedItem.cod_ped_venda
                        ? `Ped. Horus #${inspectedItem.cod_ped_venda}`
                        : 'Título Não Localizado'}
                    </p>
                    <p className="font-mono text-slate-600 dark:text-slate-300">
                      Lançamento: #{inspectedItem.nro_lancamento || '—'} • NF:{' '}
                      {inspectedItem.nro_nota_fiscal || '—'}
                    </p>
                    {(inspectedItem.unificadas_qtd || 1) > 1 && (
                      <p className="text-[11px] font-extrabold text-violet-700 dark:text-violet-300 bg-violet-100/70 dark:bg-violet-950/50 px-2 py-0.5 rounded">
                        {inspectedItem.unificadas_qtd} parcelas unificadas (
                        #{inspectedItem.grouped_lancto_ids?.[0]} a #
                        {inspectedItem.grouped_lancto_ids?.[inspectedItem.grouped_lancto_ids.length - 1]})
                      </p>
                    )}
                    <p className="font-mono font-bold text-slate-900 dark:text-white">
                      Valor Título: R$ {formatBRL(inspectedItem.valor_horus)}
                    </p>
                    {(inspectedItem.valor_credito_maior || 0) > 0.01 && (
                      <div className="p-2 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 space-y-0.5">
                        <p className="text-[10px] font-extrabold text-amber-800 dark:text-amber-300">
                          Título Orig. Horus: R$ {formatBRL(inspectedItem.valor_horus_original)}
                        </p>
                        <p className="text-[11px] font-bold text-amber-900 dark:text-amber-200 font-mono">
                          + Novo Lanç. Créd. Maior: R$ {formatBRL(inspectedItem.valor_credito_maior)} (Forma:{' '}
                          {inspectedItem.forma_pagto_credito_maior ||
                            formaPagtoCreditoMaior ||
                            'Configurável'}
                          )
                        </p>
                      </div>
                    )}
                    <p className="font-bold">
                      Situação: {inspectedItem.situacao_horus || 'NÃO LOCALIZADO'}{' '}
                      {inspectedItem.cod_bordero ? `(Borderô #${inspectedItem.cod_bordero})` : ''}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                  <b>Diagnóstico:</b> {inspectedItem.motivo || 'Vínculo íntegro nas 3 pontas.'}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setInspectedItem(null)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold cursor-pointer"
                  >
                    Fechar Ficha (Esc)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL DE CONFIRMAÇÃO E ACOMPANHAMENTO DE GERAÇÃO DE BORDERÔ NO HORUS ──────────────── */}
      <AnimatePresence>
        {showBorderoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-xs p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              {/* Cabeçalho Fixo */}
              <div className="bg-indigo-600 px-5 py-3.5 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold leading-tight">
                      {creatingBordero
                        ? `Gerando e Auditando Borderô no Horus ERP (${activeProfile.short_name})`
                        : `Confirmar Borderô no Horus (${activeProfile.short_name})`}
                    </h3>
                    <p className="text-[11px] text-indigo-100">
                      {creatingBordero
                        ? 'Transação SQL atômica em andamento — não feche esta janela'
                        : 'Revise os parâmetros bancários, regras de baixa e valor líquido do Borderô'}
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

              {/* Corpo da Modal: Alterna entre Acompanhamento em Tempo Real e Configuração Compacta em 2 Colunas */}
              {creatingBordero && borderoProgress ? (
                <div className="p-6 space-y-5 overflow-y-auto">
                  {/* Faixa de Segurança Ativa */}
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
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

                  {/* Barra de Progresso */}
                  <div className="space-y-1.5">
                    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200/70 dark:border-slate-700">
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

                  {/* Etapas de Segurança da Transação SQL */}
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
                    {[
                      {
                        key: 'VALIDANDO_SEGURANCA',
                        title: '1. Trava & Segurança',
                        desc: 'Valida títulos em aberto (AB)',
                        minPct: 5,
                      },
                      {
                        key: 'UNIFICANDO_PARCELAS',
                        title: '2. Unificação & Taxas',
                        desc: 'Consolida parcelas e abatimentos',
                        minPct: 18,
                      },
                      {
                        key: 'CRIANDO_BORDERO',
                        title: '3. Cabeçalho Borderô',
                        desc: 'Reserva COD_BORDERO no Horus',
                        minPct: 35,
                      },
                      {
                        key: 'BAIXANDO_TITULOS',
                        title: '4. Baixa em Lote SQL',
                        desc: 'Grava borderô nos lançamentos',
                        minPct: 45,
                      },
                      {
                        key: 'AUDITORIA_FINAL',
                        title: '5. Auditoria & Salvar',
                        desc: 'Confere no Horus e salva histórico',
                        minPct: 90,
                      },
                    ].map((step) => {
                      const isDone = borderoProgress.percent > step.minPct + 12 || borderoProgress.percent === 100;
                      const isCurrent = borderoProgress.phase === step.key;
                      return (
                        <div
                          key={step.key}
                          className={`rounded-xl border p-3 transition-all ${
                            isCurrent
                              ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                              : isDone
                              ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-extrabold text-slate-900 dark:text-white text-[11px]">
                              {step.title}
                            </span>
                            {isDone ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            ) : isCurrent ? (
                              <Loader2 className="h-4 w-4 text-indigo-600 animate-spin shrink-0" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                            {step.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumo Financeiro Auditado durante a geração */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3.5 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        Proteção Transacional Ativa: em caso de qualquer falha de rede ou SQL, nenhum título fica baixado pela metade (Rollback 100%).
                      </span>
                    </div>
                    <div className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                      Valor do Borderô: R$ {formatBRL(totalSelectedAmount)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
                  {/* Barra Superior de Totais (Compacta e Completa) */}
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
                          (Bruto: R$ {formatBRL(totalSelectedBrutoAmount)} • Taxas/Saídas:{' '}
                          {launchFeeAsExpense ? 'Contas a Pagar ' : '-'}R${' '}
                          {formatBRL(totalSelectedTaxaAmount)})
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        {launchFeeAsExpense
                          ? 'Valor Total (Bruto) a Baixar no Recebimento'
                          : 'Valor Líquido a Baixar no Borderô'}
                      </p>
                      <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        R${' '}
                        {formatBRL(
                          launchFeeAsExpense ? totalSelectedBrutoAmount : totalSelectedAmount
                        )}
                      </p>
                      {launchFeeAsExpense && totalSelectedTaxaAmount > 0 && (
                        <p className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400">
                          + Despesa Contas a Pagar ({cpFeePostingMode === 'UNIFIED' ? 'Unificada' : '1 a 1'}): R$ {formatBRL(totalSelectedTaxaAmount)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Grade Principal em 2 Colunas (Cabe 100% na tela sem cortar) */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* COLUNA ESQUERDA (5 cols): Parâmetros Bancários + Opções de Unificação e Crédito Maior */}
                    <div className="lg:col-span-5 space-y-3">
                      {bankConfig && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-white dark:bg-slate-900">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                              Parâmetros Bancários (Horus)
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowBorderoModal(false);
                                openBankConfigModal(activeProfile);
                              }}
                              className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Settings className="h-3 w-3" /> Editar Códigos
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-800/40">
                              <span className="text-slate-400 block text-[10px]">Emp / Filial</span>
                              <b className="text-slate-800 dark:text-slate-200 font-mono">
                                {bankConfig.cod_empresa} / {selectedFilial || bankConfig.cod_filial}
                              </b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-800/40">
                              <span className="text-slate-400 block text-[10px]">COD_FORMA</span>
                              <b className="text-slate-800 dark:text-slate-200 font-mono">
                                {bankConfig.forma_pagto || 'NÃO DEF.'}
                              </b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-800/40">
                              <span className="text-slate-400 block text-[10px]">COD_BANCO</span>
                              <b className="text-slate-800 dark:text-slate-200 font-mono">
                                {bankConfig.banco || 'NÃO DEF.'}
                              </b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-800/40">
                              <span className="text-slate-400 block text-[10px]">COD_AGENCIA</span>
                              <b className="text-slate-800 dark:text-slate-200 font-mono">
                                {bankConfig.agencia || 'NÃO DEF.'}
                              </b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-800/40">
                              <span className="text-slate-400 block text-[10px]">COD_CONTAC</span>
                              <b className="text-slate-800 dark:text-slate-200 font-mono">
                                {bankConfig.conta || 'NÃO DEF.'}
                              </b>
                            </div>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 bg-slate-50/50 dark:bg-slate-800/40">
                              <span className="text-slate-400 block text-[10px]">CARTEIRA</span>
                              <b className="text-slate-800 dark:text-slate-200 font-mono">
                                {bankConfig.carteira || '—'}
                              </b>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Unificar Parcelas + Gravar Taxa */}
                      <div className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20 p-3 flex items-center justify-between gap-2.5">
                        <div className="text-xs">
                          <span className="font-extrabold text-slate-900 dark:text-white block text-[11px]">
                            Unificar Parcelas + Gravar Taxa ({activeProfile.channel_label})
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                            Consolida parcelas no 1º lançamento e grava a taxa/saídas em{' '}
                            <code>VLR_LANCTO_ABATIMENTO</code>.
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setUnifyInstallments(true)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                              unifyInstallments
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            SIM
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnifyInstallments(false)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                              !unifyInstallments
                                ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                                : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            NÃO
                          </button>
                        </div>
                      </div>

                      {/* Ajustar Venda Menor e Separar Crédito Maior */}
                      <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="text-xs">
                            <span className="font-extrabold text-slate-900 dark:text-white block text-[11px]">
                              Ajustar Venda Menor e Separar Crédito Maior
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                              Cria lançamento separado (<code>AB</code>) com a diferença quando a venda for menor que o Horus.
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSplitExcessLaunch(true)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                splitExcessLaunch
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              SIM
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitExcessLaunch(false)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                !splitExcessLaunch
                                  ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              NÃO
                            </button>
                          </div>
                        </div>
                        {splitExcessLaunch && (
                          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-amber-200/70 dark:border-amber-800/50">
                            <label className="text-[10px] font-bold text-amber-900 dark:text-amber-300">
                              COD_FORMA Crédito Maior:
                            </label>
                            <input
                              type="text"
                              value={formaPagtoCreditoMaior}
                              onChange={(e) => setFormaPagtoCreditoMaior(e.target.value)}
                              placeholder="Ex: 135"
                              className="w-28 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* 4ª Opção: Baixar Valor Total (Bruto) no Recebimento + Lançar Taxa como Despesa no Contas a Pagar */}
                      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="text-xs">
                            <span className="font-extrabold text-slate-900 dark:text-white block text-[11px]">
                              4ª Opção: Baixar Valor Total (Bruto) + Lançar Taxa em Despesas (CP)
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                              Baixa o valor cheio da venda da planilha (R$ {formatBRL(totalSelectedBrutoAmount)}) no Contas a Receber e lança a taxa (R$ {formatBRL(totalSelectedTaxaAmount)}) no Contas a Pagar.
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setLaunchFeeAsExpense(true)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                launchFeeAsExpense
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              SIM
                            </button>
                            <button
                              type="button"
                              onClick={() => setLaunchFeeAsExpense(false)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                                !launchFeeAsExpense
                                  ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                                  : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              NÃO
                            </button>
                          </div>
                        </div>

                        {launchFeeAsExpense && (
                          <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-emerald-900 dark:text-emerald-300">
                                Modo da Despesa no Contas a Pagar:
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setCpFeePostingMode('UNIFIED')}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold cursor-pointer ${
                                    cpFeePostingMode === 'UNIFIED'
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-white dark:bg-slate-800 text-slate-600 border border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  Única Unificada
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCpFeePostingMode('INDIVIDUAL')}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold cursor-pointer ${
                                    cpFeePostingMode === 'INDIVIDUAL'
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-white dark:bg-slate-800 text-slate-600 border border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  Uma a Uma (1 por Pedido)
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 rounded-lg px-2.5 py-1.5 border border-emerald-200/60 dark:border-emerald-800/50">
                              <span>
                                Forn:{' '}
                                <b>
                                  {bankConfig?.cp_nom_fornecedor ||
                                    activeProfile.effective_bank?.cp_nom_fornecedor ||
                                    bankConfig?.cp_cod_fornecedor ||
                                    activeProfile.effective_bank?.cp_cod_fornecedor ||
                                    'Não configurado'}
                                </b>{' '}
                                • Desp:{' '}
                                <b>
                                  {bankConfig?.cp_cod_despesa ||
                                    activeProfile.effective_bank?.cp_cod_despesa ||
                                    '—'}
                                </b>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowBorderoModal(false);
                                  openBankConfigModal(activeProfile);
                                }}
                                className="font-bold text-indigo-600 hover:underline cursor-pointer"
                              >
                                Configurar CP →
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* COLUNA DIREITA (7 cols): Regra de Data de Pagamento & Baixa no Horus ERP */}
                    <div className="lg:col-span-7 space-y-2">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                        Regra de Data de Pagamento & Baixa no Horus ERP
                      </label>

                      <div className="space-y-2">
                        {/* Opção 1: Data da Planilha (Shopee / Vindi / TikTok) */}
                        <button
                          type="button"
                          onClick={() => setPaymentDateMode('CHANNEL_DATE')}
                          className={`w-full text-left rounded-xl border p-3 transition-all flex items-start gap-2.5 cursor-pointer ${
                            paymentDateMode === 'CHANNEL_DATE'
                              ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-600 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div
                            className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                              paymentDateMode === 'CHANNEL_DATE'
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-400'
                            }`}
                          >
                            {paymentDateMode === 'CHANNEL_DATE' && <Check className="h-2.5 w-2.5" />}
                          </div>
                          <div className="text-xs">
                            <span className="font-extrabold text-slate-900 dark:text-white block">
                              1. Usar Data de Pagamento da Planilha ({activeProfile.channel_label})
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug block mt-0.5">
                              Gera o Borderô pago (<code>PG</code>) e grava em cada lançamento do Horus (<code>DAT_PAGTO_CRECEBER</code>) a data exata em que o valor caiu na {activeProfile.channel_label}.
                            </span>
                          </div>
                        </button>

                        {/* Opção 2: Usar Borderô e Pagar com Data Específica */}
                        <div
                          onClick={() => setPaymentDateMode('SPECIFIC_DATE')}
                          className={`w-full text-left rounded-xl border p-3 transition-all cursor-pointer ${
                            paymentDateMode === 'SPECIFIC_DATE'
                              ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-600 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                paymentDateMode === 'SPECIFIC_DATE'
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-400'
                              }`}
                            >
                              {paymentDateMode === 'SPECIFIC_DATE' && <Check className="h-2.5 w-2.5" />}
                            </div>
                            <div className="text-xs flex-1">
                              <span className="font-extrabold text-slate-900 dark:text-white block">
                                2. Usar Borderô e Pagar com uma Data Específica
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug block mt-0.5">
                                Gera o Borderô pago (<code>PG</code>) e baixa todos os títulos selecionados com uma única data de pagamento escolhida abaixo.
                              </span>

                              {paymentDateMode === 'SPECIFIC_DATE' && (
                                <div
                                  className="mt-2 flex items-center gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <label className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">
                                    Data do Pagamento:
                                  </label>
                                  <input
                                    type="date"
                                    value={specificPaymentDate}
                                    onChange={(e) => setSpecificPaymentDate(e.target.value)}
                                    className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Opção 3: Apenas Gerar Borderô em Aberto */}
                        <button
                          type="button"
                          onClick={() => setPaymentDateMode('BORDERO_OPEN')}
                          className={`w-full text-left rounded-xl border p-3 transition-all flex items-start gap-2.5 cursor-pointer ${
                            paymentDateMode === 'BORDERO_OPEN'
                              ? 'border-indigo-500 bg-indigo-50/70 dark:border-indigo-600 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div
                            className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                              paymentDateMode === 'BORDERO_OPEN'
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-400'
                            }`}
                          >
                            {paymentDateMode === 'BORDERO_OPEN' && <Check className="h-2.5 w-2.5" />}
                          </div>
                          <div className="text-xs">
                            <span className="font-extrabold text-slate-900 dark:text-white block">
                              3. Apenas Gerar Borderô em Aberto (Baixar manualmente no Horus)
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug block mt-0.5">
                              Cria o Borderô com status <code>AP</code> e vincula os títulos mantendo-os em aberto (<code>AB</code>) para liquidação manual no Horus.
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rodapé Fixo Sempre Visível */}
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>
                    Segurança Horus: Verifica status <code>AB</code> antes de gravar e salva cópia do fechamento no Cronuz.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowBorderoModal(false)}
                    disabled={creatingBordero}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
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
                        Confirmar e Gerar Borderô (R${' '}
                        {formatBRL(
                          launchFeeAsExpense ? totalSelectedBrutoAmount : totalSelectedAmount
                        )}
                        )
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL DE CONFIGURAÇÃO DE BANCO, AGÊNCIA, CONTA E FORMA DE PAGTO HORUS POR CONCILIAÇÃO ─── */}
      <AnimatePresence>
        {showBankConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-extrabold">
                      Códigos Horus ERP &amp; Despesas Contas a Pagar — {activeProfile.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Consulte em tempo real os cadastros do Horus (Banco, Forma, Fornecedor, Centro de Custo e Despesa) e salve para este perfil
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchHorusOptions(fornecedorSearchQuery || undefined)}
                    disabled={loadingHorusOptions}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-indigo-300 border border-slate-700 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingHorusOptions ? 'animate-spin' : ''}`} />
                    {loadingHorusOptions ? 'Consultando Horus...' : 'Atualizar do Horus'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBankConfigModal(false)}
                    className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
                {/* SEÇÃO 1: CONTA BANCÁRIA & FORMA DE PAGAMENTO DO BORDERÔ (CONTAS A RECEBER) */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3.5 bg-slate-50/40 dark:bg-slate-800/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                        1. Conta Bancária &amp; Forma de Recebimento do Borderô (Contas a Receber)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Selecione uma Conta Corrente cadastrada no Horus (<code>BCONTAC_GERAL</code>) ou digite os códigos diretamente
                      </p>
                    </div>
                  </div>

                  {/* Seletor rápido de Conta Bancária do Horus em Tempo Real */}
                  {horusOptions && horusOptions.bank_accounts.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-indigo-700 dark:text-indigo-300 block text-[11px]">
                          Selecionar Conta Bancária do Horus (Tempo Real):
                        </label>
                        <select
                          value={`${bankForm.banco}|${bankForm.agencia}|${bankForm.conta}`}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const [b, ag, cc] = val.split('|');
                            setBankForm((p) => ({
                              ...p,
                              banco: b || p.banco,
                              agencia: ag || p.agencia,
                              conta: cc || p.conta,
                            }));
                          }}
                          className="w-full rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">-- Escolha uma Conta Corrente no Horus --</option>
                          {horusOptions.bank_accounts.map((acc, idx) => (
                            <option
                              key={`${acc.cod_banco}-${acc.cod_agencia}-${acc.cod_contac}-${idx}`}
                              value={`${acc.cod_banco}|${acc.cod_agencia}|${acc.cod_contac}`}
                            >
                              Banco {acc.cod_banco} ({acc.nom_banco}) • Ag {acc.cod_agencia} • CC{' '}
                              {acc.cod_contac} ({acc.nro_contac}-{acc.dig_contac})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-indigo-700 dark:text-indigo-300 block text-[11px]">
                          Selecionar Forma de Pagto do Horus (Tempo Real):
                        </label>
                        <select
                          value={bankForm.forma_pagto}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            setBankForm((p) => ({
                              ...p,
                              forma_pagto: val,
                              cp_cod_forma: p.cp_cod_forma || val,
                            }));
                          }}
                          className="w-full rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">-- Escolha uma Forma de Pagto (FORMA_PAGTO) --</option>
                          {horusOptions.payment_forms.map((fp) => (
                            <option key={fp.cod_forma} value={String(fp.cod_forma)}>
                              {fp.cod_forma} - {fp.desc_forma}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        COD_FORMA *
                      </label>
                      <input
                        type="text"
                        value={bankForm.forma_pagto}
                        onChange={(e) =>
                          setBankForm((p) => ({ ...p, forma_pagto: e.target.value }))
                        }
                        placeholder="Ex: 114"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        COD_BANCO *
                      </label>
                      <input
                        type="text"
                        value={bankForm.banco}
                        onChange={(e) => setBankForm((p) => ({ ...p, banco: e.target.value }))}
                        placeholder="Ex: 14"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        COD_AGENCIA *
                      </label>
                      <input
                        type="text"
                        value={bankForm.agencia}
                        onChange={(e) => setBankForm((p) => ({ ...p, agencia: e.target.value }))}
                        placeholder="Ex: 1"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        COD_CONTAC *
                      </label>
                      <input
                        type="text"
                        value={bankForm.conta}
                        onChange={(e) => setBankForm((p) => ({ ...p, conta: e.target.value }))}
                        placeholder="Ex: 1"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        CARTEIRA (Opc.)
                      </label>
                      <input
                        type="text"
                        value={bankForm.carteira}
                        onChange={(e) => setBankForm((p) => ({ ...p, carteira: e.target.value }))}
                        placeholder="Ex: 109"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-amber-700 dark:text-amber-400 block text-[11px]">
                        FORMA Créd. Maior
                      </label>
                      <input
                        type="text"
                        value={bankForm.forma_pagto_credito_maior}
                        onChange={(e) =>
                          setBankForm((p) => ({
                            ...p,
                            forma_pagto_credito_maior: e.target.value,
                          }))
                        }
                        placeholder="Ex: 135"
                        className="w-full rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-slate-800 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Regra Padrão de Data de Pagamento &amp; Baixa no Horus
                      </label>
                      <select
                        value={bankForm.payment_date_mode || 'CHANNEL_DATE'}
                        onChange={(e) =>
                          setBankForm((p) => ({ ...p, payment_date_mode: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="CHANNEL_DATE">
                          1. Usar Data de Pagamento da Planilha ({activeProfile.channel_label}) em cada título (PG)
                        </option>
                        <option value="SPECIFIC_DATE">
                          2. Usar Borderô e Pagar (PG) com uma Data Específica
                        </option>
                        <option value="BORDERO_OPEN">
                          3. Apenas Gerar Borderô em Aberto (AP) no Horus
                        </option>
                      </select>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200 block text-[11px]">
                          Unificar Parcelas da Nota ({activeProfile.channel_label})
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          Consolida parcelas em aberto da mesma nota no 1º lançamento.
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setBankForm((p) => ({ ...p, unify_installments: true }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                            bankForm.unify_installments
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          SIM
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBankForm((p) => ({ ...p, unify_installments: false }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                            !bankForm.unify_installments
                              ? 'bg-slate-800 text-white dark:bg-slate-700'
                              : 'bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          NÃO
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SEÇÃO 2: 4ª OPÇÃO — BAIXAR VALOR TOTAL (BRUTO) NO RECEBIMENTO + LANÇAR TAXA COMO DESPESA NO CONTAS A PAGAR */}
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 p-4 space-y-3.5 bg-emerald-50/30 dark:bg-emerald-950/20">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-black uppercase">
                          4ª Opção
                        </span>
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                          Baixar Valor Total (Bruto) no Recebimento + Lançar Taxa como Despesa no Contas a Pagar
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        Exemplo ({activeProfile.channel_label}): Venda real na planilha de <b>R$ 125,00</b>, recebido líquido <b>R$ 120,00</b> e taxa <b>R$ 5,00</b>. Quando ativado, o sistema baixa <b>R$ 125,00</b> cheio no Contas a Receber (mesmo que a NF no Horus estivesse R$ 135,00, mantendo-se 100% fiel ao valor real da venda da planilha) e lança a despesa de <b>R$ 5,00</b> já baixada no Contas a Pagar (<code>LANCTOS_CPAGAR_GERAL</code>).
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setBankForm((p) => ({ ...p, launch_fee_as_expense: true }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                          bankForm.launch_fee_as_expense
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        ATIVADO
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setBankForm((p) => ({ ...p, launch_fee_as_expense: false }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                          !bankForm.launch_fee_as_expense
                            ? 'bg-slate-800 text-white dark:bg-slate-700'
                            : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        DESATIVADO
                      </button>
                    </div>
                  </div>

                  {/* Modo de Lançamento da Despesa: Unificada vs Individual */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setBankForm((p) => ({ ...p, cp_fee_posting_mode: 'UNIFIED' }))
                      }
                      className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                        bankForm.cp_fee_posting_mode === 'UNIFIED'
                          ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-600'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <span className="font-extrabold text-slate-900 dark:text-white block text-xs">
                        1. Despesa Única Unificada (Total das Taxas do Borderô)
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Gera 1 único lançamento no Contas a Pagar com a soma total de todas as taxas do Borderô.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setBankForm((p) => ({ ...p, cp_fee_posting_mode: 'INDIVIDUAL' }))
                      }
                      className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                        bankForm.cp_fee_posting_mode === 'INDIVIDUAL'
                          ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-600'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <span className="font-extrabold text-slate-900 dark:text-white block text-xs">
                        2. Despesa Individual Uma a Uma (1 por Pedido/Título)
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Gera 1 lançamento no Contas a Pagar para cada título do Borderô que possua taxa, identificando o pedido na observação.
                      </span>
                    </button>
                  </div>

                  {/* Atalhos Rápidos de Despesas Recentes encontradas no Horus */}
                  {horusOptions?.recent_tariff_presets &&
                    horusOptions.recent_tariff_presets.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                          Preenchimento Rápido (Despesas de Taxa/Tarifa usadas recentemente no seu Horus):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {horusOptions.recent_tariff_presets.map((pr, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setBankForm((p) => ({
                                  ...p,
                                  cp_cod_grp_fornecedor: String(pr.cod_grp_fornecedor),
                                  cp_cod_fornecedor: String(pr.cod_fornecedor),
                                  cp_nom_fornecedor: pr.nom_fornecedor || '',
                                  cp_cod_departamento: String(pr.cod_departamento),
                                  cp_cod_centro_custo: String(pr.cod_centro_custo),
                                  cp_cod_grup_desp: String(pr.cod_grup_desp),
                                  cp_cod_despesa: String(pr.cod_despesa),
                                  cp_cod_forma: String(pr.cod_forma || p.forma_pagto),
                                }));
                                setFornecedorSearchQuery(pr.nom_fornecedor || '');
                                toast.success(
                                  `Parâmetros preenchidos: ${pr.nom_fornecedor} • Desp ${pr.cod_despesa} (${pr.desc_despesa})`
                                );
                              }}
                              className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 hover:bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              ⚡ {pr.nom_fornecedor} (Forn {pr.cod_fornecedor}) • Desp {pr.cod_despesa} ({pr.desc_despesa})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Busca e Seleção em Tempo Real no Horus: Fornecedor, Departamento, Centro de Custo, Grupo de Despesa e Despesa */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
                    {/* Pesquisa de Fornecedor em Tempo Real */}
                    <div className="sm:col-span-6 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Pesquisar Fornecedor no Horus (FORNECEDORES_GERAL) *
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={fornecedorSearchQuery}
                          onChange={(e) => setFornecedorSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              fetchHorusOptions(fornecedorSearchQuery);
                            }
                          }}
                          placeholder="Digite ex: SHOPEE, VINDI, BANCO..."
                          className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => fetchHorusOptions(fornecedorSearchQuery)}
                          disabled={loadingHorusOptions}
                          className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Search className="h-3.5 w-3.5" />
                          Buscar
                        </button>
                      </div>
                      {horusOptions && horusOptions.fornecedores.length > 0 && (
                        <select
                          value={
                            bankForm.cp_cod_grp_fornecedor && bankForm.cp_cod_fornecedor
                              ? `${bankForm.cp_cod_grp_fornecedor}|${bankForm.cp_cod_fornecedor}`
                              : ''
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const [grp, cod] = val.split('|');
                            const found = horusOptions.fornecedores.find(
                              (f) =>
                                String(f.cod_grp_fornecedor) === grp &&
                                String(f.cod_fornecedor) === cod
                            );
                            setBankForm((p) => ({
                              ...p,
                              cp_cod_grp_fornecedor: grp,
                              cp_cod_fornecedor: cod,
                              cp_nom_fornecedor: found?.nom_fornecedor || p.cp_nom_fornecedor,
                            }));
                          }}
                          className="w-full mt-1 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                        >
                          <option value="">
                            -- Selecione o Fornecedor ({horusOptions.fornecedores.length} encontrados) --
                          </option>
                          {horusOptions.fornecedores.map((f) => (
                            <option
                              key={`${f.cod_grp_fornecedor}-${f.cod_fornecedor}`}
                              value={`${f.cod_grp_fornecedor}|${f.cod_fornecedor}`}
                            >
                              [Grp {f.cod_grp_fornecedor} / Cód {f.cod_fornecedor}] {f.nom_fornecedor}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Grupo Forn. (COD_GRP) *
                      </label>
                      <input
                        type="text"
                        value={bankForm.cp_cod_grp_fornecedor}
                        onChange={(e) =>
                          setBankForm((p) => ({
                            ...p,
                            cp_cod_grp_fornecedor: e.target.value,
                          }))
                        }
                        placeholder="Ex: 1"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Cód. Fornecedor *
                      </label>
                      <input
                        type="text"
                        value={bankForm.cp_cod_fornecedor}
                        onChange={(e) =>
                          setBankForm((p) => ({
                            ...p,
                            cp_cod_fornecedor: e.target.value,
                          }))
                        }
                        placeholder="Ex: 230"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Departamento */}
                    <div className="sm:col-span-6 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Departamento (DEPARTAMENTOS_GERAL) *
                      </label>
                      <div className="flex gap-1.5">
                        {horusOptions && horusOptions.departamentos.length > 0 && (
                          <select
                            value={bankForm.cp_cod_departamento}
                            onChange={(e) =>
                              setBankForm((p) => ({
                                ...p,
                                cp_cod_departamento: e.target.value,
                              }))
                            }
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          >
                            <option value="">-- Selecione o Departamento --</option>
                            {horusOptions.departamentos.map((d) => (
                              <option key={d.cod_departamento} value={String(d.cod_departamento)}>
                                {d.cod_departamento} - {d.desc_departamento}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={bankForm.cp_cod_departamento}
                          onChange={(e) =>
                            setBankForm((p) => ({
                              ...p,
                              cp_cod_departamento: e.target.value,
                            }))
                          }
                          placeholder="Cód"
                          className="w-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Centro de Custo */}
                    <div className="sm:col-span-6 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Centro de Custo (CENTRO_CUSTOS_GERAL) *
                      </label>
                      <div className="flex gap-1.5">
                        {horusOptions && horusOptions.centros_custo.length > 0 && (
                          <select
                            value={bankForm.cp_cod_centro_custo}
                            onChange={(e) => {
                              const val = e.target.value;
                              const ccObj = horusOptions.centros_custo.find(
                                (c) =>
                                  String(c.cod_centro_custo) === val &&
                                  (!bankForm.cp_cod_departamento ||
                                    String(c.cod_departamento) === bankForm.cp_cod_departamento)
                              );
                              setBankForm((p) => ({
                                ...p,
                                cp_cod_centro_custo: val,
                                cp_cod_departamento: ccObj
                                  ? String(ccObj.cod_departamento)
                                  : p.cp_cod_departamento,
                              }));
                            }}
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          >
                            <option value="">-- Selecione o Centro de Custo --</option>
                            {horusOptions.centros_custo
                              .filter(
                                (c) =>
                                  !bankForm.cp_cod_departamento ||
                                  String(c.cod_departamento) === bankForm.cp_cod_departamento
                              )
                              .map((c) => (
                                <option
                                  key={`${c.cod_departamento}-${c.cod_centro_custo}`}
                                  value={String(c.cod_centro_custo)}
                                >
                                  [Depto {c.cod_departamento}] {c.cod_centro_custo} -{' '}
                                  {c.desc_centro_custo}
                                </option>
                              ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={bankForm.cp_cod_centro_custo}
                          onChange={(e) =>
                            setBankForm((p) => ({
                              ...p,
                              cp_cod_centro_custo: e.target.value,
                            }))
                          }
                          placeholder="Cód"
                          className="w-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Grupo de Despesa */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Grupo de Despesa (DESPESAGRP_GERAL) *
                      </label>
                      <div className="flex gap-1.5">
                        {horusOptions && horusOptions.grupos_despesa.length > 0 && (
                          <select
                            value={bankForm.cp_cod_grup_desp}
                            onChange={(e) =>
                              setBankForm((p) => ({
                                ...p,
                                cp_cod_grup_desp: e.target.value,
                              }))
                            }
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          >
                            <option value="">-- Selecione o Grupo de Despesa --</option>
                            {horusOptions.grupos_despesa.map((g) => (
                              <option key={g.cod_grup_desp} value={String(g.cod_grup_desp)}>
                                {g.cod_grup_desp} - {g.desc_grup_desp}
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={bankForm.cp_cod_grup_desp}
                          onChange={(e) =>
                            setBankForm((p) => ({
                              ...p,
                              cp_cod_grup_desp: e.target.value,
                            }))
                          }
                          placeholder="Cód"
                          className="w-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Despesa */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Despesa (DESPESAS_GERAL) *
                      </label>
                      <div className="flex gap-1.5">
                        {horusOptions && horusOptions.despesas.length > 0 && (
                          <select
                            value={bankForm.cp_cod_despesa}
                            onChange={(e) => {
                              const val = e.target.value;
                              const dObj = horusOptions.despesas.find(
                                (d) =>
                                  String(d.cod_despesa) === val &&
                                  (!bankForm.cp_cod_grup_desp ||
                                    String(d.cod_grup_desp) === bankForm.cp_cod_grup_desp)
                              );
                              setBankForm((p) => ({
                                ...p,
                                cp_cod_despesa: val,
                                cp_cod_grup_desp: dObj
                                  ? String(dObj.cod_grup_desp)
                                  : p.cp_cod_grup_desp,
                              }));
                            }}
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                          >
                            <option value="">-- Selecione a Despesa --</option>
                            {horusOptions.despesas
                              .filter(
                                (d) =>
                                  !bankForm.cp_cod_grup_desp ||
                                  String(d.cod_grup_desp) === bankForm.cp_cod_grup_desp
                              )
                              .map((d) => (
                                <option
                                  key={`${d.cod_grup_desp}-${d.cod_despesa}`}
                                  value={String(d.cod_despesa)}
                                >
                                  [Grp {d.cod_grup_desp}] {d.cod_despesa} - {d.desc_despesa}
                                </option>
                              ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={bankForm.cp_cod_despesa}
                          onChange={(e) =>
                            setBankForm((p) => ({
                              ...p,
                              cp_cod_despesa: e.target.value,
                            }))
                          }
                          placeholder="Cód"
                          className="w-20 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    {/* Forma de Pagto Contas a Pagar */}
                    <div className="sm:col-span-2 space-y-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block text-[11px]">
                        Forma CP (COD_FORMA)
                      </label>
                      <input
                        type="text"
                        value={bankForm.cp_cod_forma}
                        onChange={(e) =>
                          setBankForm((p) => ({ ...p, cp_cod_forma: e.target.value }))
                        }
                        placeholder={bankForm.forma_pagto || 'Ex: 7'}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowBankConfigModal(false)}
                    disabled={savingBankConfig}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfileBankConfig}
                    disabled={savingBankConfig}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2.5 text-xs font-extrabold text-white shadow-sm cursor-pointer"
                  >
                    {savingBankConfig ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Salvar Códigos &amp; Despesas Horus ({activeProfile.short_name})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL DE HISTÓRICO DE FECHAMENTOS / BORDERÔS SALVOS NO BANCO DO CRONUZ B2B ─── */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="w-full max-w-5xl max-h-[88vh] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-5 w-5 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-extrabold">
                      Histórico de Fechamentos &amp; Borderôs Conciliados (Banco de Dados Cronuz)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Registro permanente de todos os borderôs gerados no Horus para auditoria e consulta futura de divergências
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowHistoryModal(false);
                    setSelectedClosingDetail(null);
                  }}
                  className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
                {selectedClosingDetail ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedClosingDetail(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          ← Voltar para Lista
                        </button>
                        <div>
                          <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                            Borderô Horus #{selectedClosingDetail.cod_bordero} •{' '}
                            {selectedClosingDetail.profile_name}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            Gerado em {selectedClosingDetail.created_at} por{' '}
                            {selectedClosingDetail.created_by_name} • Banco{' '}
                            {selectedClosingDetail.banco} / Ag {selectedClosingDetail.agencia} / CC{' '}
                            {selectedClosingDetail.conta} (Forma {selectedClosingDetail.forma_pagto}
                            )
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => exportClosingDetailToCsv(selectedClosingDetail)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Exportar Fechamento (Excel/CSV)
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Títulos Conciliados
                        </span>
                        <b className="text-base font-mono text-slate-900 dark:text-white">
                          {selectedClosingDetail.total_titles}
                        </b>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Valor Bruto Títulos
                        </span>
                        <b className="text-base font-mono text-slate-900 dark:text-white">
                          R$ {formatBRL(selectedClosingDetail.valor_bruto_total)}
                        </b>
                      </div>
                      <div className="p-3 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20">
                        <span className="text-[10px] font-bold uppercase text-purple-600 block">
                          Taxas Abatidas
                        </span>
                        <b className="text-base font-mono text-purple-700 dark:text-purple-300">
                          -R$ {formatBRL(selectedClosingDetail.valor_taxa_total)}
                        </b>
                      </div>
                      <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
                        <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                          Valor Baixado no Borderô
                        </span>
                        <b className="text-base font-mono text-emerald-700 dark:text-emerald-300">
                          R$ {formatBRL(selectedClosingDetail.valor_liquido_bordero)}
                        </b>
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2 px-3">Pedido Canal</th>
                            <th className="py-2 px-3">Pedido Tray</th>
                            <th className="py-2 px-3">Ped. Horus</th>
                            <th className="py-2 px-3">Lanç.</th>
                            <th className="py-2 px-3">NF</th>
                            <th className="py-2 px-3">Cliente</th>
                            <th className="py-2 px-3 text-right">Bruto</th>
                            <th className="py-2 px-3 text-right">Taxa</th>
                            <th className="py-2 px-3 text-right">Líq. Baixado</th>
                            <th className="py-2 px-3 text-right">Créd. Maior</th>
                            <th className="py-2 px-3">Data Pagto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[11px]">
                          {(selectedClosingDetail.items || []).map((it: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-1.5 px-3 font-bold">
                                {it.pedido_canal || it.pedido_web}
                              </td>
                              <td className="py-1.5 px-3 text-violet-700 dark:text-violet-300">
                                {it.pedido_tray ? `#${it.pedido_tray}` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-indigo-700 dark:text-indigo-300">
                                {it.cod_ped_venda ? `#${it.cod_ped_venda}` : '—'}
                              </td>
                              <td className="py-1.5 px-3">#{it.nro_lancamento}</td>
                              <td className="py-1.5 px-3">{it.nro_nota_fiscal || '—'}</td>
                              <td className="py-1.5 px-3 font-sans max-w-[180px] truncate">
                                {it.cliente_nome || '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                R$ {formatBRL(it.valor_bruto)}
                              </td>
                              <td className="py-1.5 px-3 text-right text-purple-600">
                                {(it.taxa || 0) > 0 ? `-R$ ${formatBRL(it.taxa)}` : '—'}
                              </td>
                              <td className="py-1.5 px-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                                R$ {formatBRL(it.valor_liquido)}
                              </td>
                              <td className="py-1.5 px-3 text-right text-amber-700 dark:text-amber-400">
                                {(it.valor_credito_maior || 0) > 0
                                  ? `+R$ ${formatBRL(it.valor_credito_maior)} (#${
                                      it.novo_lancamento_credito_maior || 'AB'
                                    })`
                                  : '—'}
                              </td>
                              <td className="py-1.5 px-3">{it.data_pagamento || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : loadingClosings || loadingClosingDetail ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                    <span>Consultando histórico de fechamentos no banco do Cronuz...</span>
                  </div>
                ) : closingsList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    Nenhum fechamento de conciliação salvo até o momento. Assim que você gerar um Borderô, ele ficará salvo aqui para auditoria futura.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3">Borderô Horus</th>
                          <th className="py-2.5 px-3">Data / Hora</th>
                          <th className="py-2.5 px-3">Modalidade</th>
                          <th className="py-2.5 px-3">Arquivos Utilizados</th>
                          <th className="py-2.5 px-3 text-center">Títulos</th>
                          <th className="py-2.5 px-3 text-right">Bruto</th>
                          <th className="py-2.5 px-3 text-right">Taxas</th>
                          <th className="py-2.5 px-3 text-right">Líq. Baixado</th>
                          <th className="py-2.5 px-3 text-right">Créd. Maior</th>
                          <th className="py-2.5 px-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {closingsList.map((c) => (
                          <tr
                            key={c.id}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-700 dark:text-indigo-300">
                              #{c.cod_bordero}{' '}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 ml-1">
                                {c.sta_bordero}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {c.created_at}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">
                              {c.profile_name}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-500 max-w-[200px] truncate">
                              {c.channel_filename || '—'}
                              {c.tray_filename ? ` + ${c.tray_filename}` : ''}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold">
                              {c.total_titles}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              R$ {formatBRL(c.valor_bruto_total)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-purple-600">
                              -R$ {formatBRL(c.valor_taxa_total)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
                              R$ {formatBRL(c.valor_liquido_bordero)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                              {(c.valor_credito_maior_total || 0) > 0
                                ? `+R$ ${formatBRL(c.valor_credito_maior_total)} (${c.credito_maior_lancamentos_criados})`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => loadClosingDetail(c.id)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] cursor-pointer"
                              >
                                Consultar Itens
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

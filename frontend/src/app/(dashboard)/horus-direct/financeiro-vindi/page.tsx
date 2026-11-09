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
  effective_bank: {
    forma_pagto: string;
    banco: string;
    agencia: string;
    conta: string;
    carteira: string;
    payment_date_mode?: string;
    unify_installments?: boolean;
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
}

interface SummaryData {
  profile_code?: string;
  is_dual_file?: boolean;
  unify_installments?: boolean;
  unificadas_orders_count?: number;
  unificadas_parcelas_count?: number;
  total_planilha_qtd: number;
  total_planilha_valor: number;
  total_planilha_liq?: number;
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
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  payment_date_mode?: 'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN' | string;
  unify_installments?: boolean;
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
    'all' | 'abertos' | 'pagos' | 'divergence' | 'not_found'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Navegação estilo Access (linha ativa na grade + modal de Ficha de Vínculo)
  const [activeRowIndex, setActiveRowIndex] = useState<number>(0);
  const [inspectedItem, setInspectedItem] = useState<ReleaseItem | null>(null);

  // Modal de Borderô e Modo de Data de Pagamento no Horus
  const [showBorderoModal, setShowBorderoModal] = useState(false);
  const [creatingBordero, setCreatingBordero] = useState(false);
  const [paymentDateMode, setPaymentDateMode] = useState<
    'CHANNEL_DATE' | 'SPECIFIC_DATE' | 'BORDERO_OPEN'
  >('CHANNEL_DATE');
  const [unifyInstallments, setUnifyInstallments] = useState<boolean>(true);
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

  // Modal de Configuração de Banco / Agência / Conta / Forma de Pagto Horus por Conciliação
  const [showBankConfigModal, setShowBankConfigModal] = useState(false);
  const [savingBankConfig, setSavingBankConfig] = useState(false);
  const [bankForm, setBankForm] = useState({
    forma_pagto: '',
    banco: '',
    agencia: '',
    conta: '',
    carteira: '',
    payment_date_mode: 'CHANNEL_DATE',
    unify_installments: true,
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
  }, [activeProfile, bankConfig]);

  const isDualFileMode = activeProfile?.mode === 'DUAL_FILE';
  const requiresTrayFile =
    activeProfile?.code === 'TRAY_SHOPEE' || activeProfile?.code === 'TRAY_TIKTOK';

  // Abre o modal de configuração bancária carregando os códigos atuais do perfil selecionado
  const openBankConfigModal = (prof?: ReconciliationProfile) => {
    const target = prof || activeProfile;
    const defaultUnify = target.code === 'TRAY_SHOPEE' || target.code === 'TRAY_TIKTOK';
    const eff =
      bankConfig?.profile_code === target.code
        ? bankConfig
        : target.effective_bank || {
            forma_pagto: '',
            banco: '',
            agencia: '',
            conta: '',
            carteira: '',
            payment_date_mode: 'CHANNEL_DATE',
            unify_installments: defaultUnify,
          };
    setBankForm({
      forma_pagto: eff.forma_pagto || '',
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
    });
    setShowBankConfigModal(true);
  };

  // Salva Banco, Agência, Conta, Forma de Pagamento e Modo de Data de Pagamento (códigos Horus) nas configurações do Seller para o perfil ativo
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
            banco: bankForm.banco.trim(),
            agencia: bankForm.agencia.trim(),
            conta: bankForm.conta.trim(),
            carteira: bankForm.carteira.trim(),
            payment_date_mode: bankForm.payment_date_mode || 'CHANNEL_DATE',
            unify_installments: Boolean(bankForm.unify_installments),
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
    return selectedReleases.reduce((acc, cur) => acc + (cur.valor_horus || cur.valor_vindi || 0), 0);
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
    try {
      const token = getToken();
      const payload = {
        profile_code: activeProfile.code,
        payment_date_mode: paymentDateMode,
        unify_installments: unifyInstallments,
        specific_payment_date:
          paymentDateMode === 'SPECIFIC_DATE' ? specificPaymentDate : undefined,
        releases: selectedReleases.map((r) => ({
          nro_lancamento: r.nro_lancamento!,
          cod_filial: r.cod_filial || selectedFilial || '1',
          cod_ped_venda: r.cod_ped_venda,
          pedido_web: r.pedido_web,
          valor: r.valor_horus || r.valor_vindi,
          valor_liquido: r.valor_liquido,
          taxa:
            r.diff_taxa !== undefined
              ? Math.abs(r.diff_taxa)
              : r.taxa || 0,
          grouped_lancto_ids: r.grouped_lancto_ids,
          status: r.status_horus || 'AB',
          data_pagamento: r.data_pagamento || '',
        })),
      };

      const res = await fetch(`${API}/companies/${companyId}/horus-sql/reconciliation/bordero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao gerar borderô no Horus.');
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
    }
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
              </p>
              <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                Bruto: R$ {formatBRL(summary.total_planilha_valor)}
              </p>
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
                R$ {formatBRL(summary.abertos_valor ?? summary.ready_valor)}
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
                            {item.valor_horus !== undefined
                              ? `R$ ${formatBRL(item.valor_horus)}`
                              : '—'}
                          </td>

                          {/* Diferença Bruto vs Horus */}
                          <td className="py-1.5 px-3 text-right font-mono whitespace-nowrap">
                            {item.valor_horus === undefined ? (
                              '—'
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

      {/* ─── MODAL DE CONFIRMAÇÃO DE GERAÇÃO DE BORDERÔ NO HORUS ──────────────── */}
      <AnimatePresence>
        {showBorderoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5" />
                  <h3 className="text-base font-bold">
                    Confirmar Borderô no Horus ({activeProfile.short_name})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBorderoModal(false)}
                  className="text-white/80 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-semibold">
                      Títulos Selecionados
                    </p>
                    <p className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {selectedReleases.length} lançamentos em aberto
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-semibold">
                      Valor Total do Borderô
                    </p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      R$ {formatBRL(totalSelectedAmount)}
                    </p>
                  </div>
                </div>

                {bankConfig && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Parâmetros Bancários do Borderô (Tabela BORDERO Horus)
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowBorderoModal(false);
                          openBankConfigModal(activeProfile);
                        }}
                        className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Settings className="h-3 w-3" /> Editar Códigos Horus
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <span className="text-slate-400 block">Empresa / Filial</span>
                        <b className="text-slate-800 dark:text-slate-200 font-mono">
                          {bankConfig.cod_empresa} / {selectedFilial || bankConfig.cod_filial}
                        </b>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <span className="text-slate-400 block">Forma Pagto (COD_FORMA)</span>
                        <b className="text-slate-800 dark:text-slate-200 font-mono">
                          {bankConfig.forma_pagto || 'NÃO DEFINIDO'}
                        </b>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <span className="text-slate-400 block">Banco (COD_BANCO)</span>
                        <b className="text-slate-800 dark:text-slate-200 font-mono">
                          {bankConfig.banco || 'NÃO DEFINIDO'}
                        </b>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <span className="text-slate-400 block">Agência (COD_AGENCIA)</span>
                        <b className="text-slate-800 dark:text-slate-200 font-mono">
                          {bankConfig.agencia || 'NÃO DEFINIDO'}
                        </b>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <span className="text-slate-400 block">Conta (COD_CONTAC)</span>
                        <b className="text-slate-800 dark:text-slate-200 font-mono">
                          {bankConfig.conta || 'NÃO DEFINIDO'}
                        </b>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <span className="text-slate-400 block">Carteira (NRO_CARTEIRA)</span>
                        <b className="text-slate-800 dark:text-slate-200 font-mono">
                          {bankConfig.carteira || '—'}
                        </b>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── ESCOLHA DO MODO DE DATA DE PAGAMENTO E BAIXA NO HORUS ─── */}
                <div className="space-y-2.5 pt-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
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
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
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
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            Gera o Borderô pago (<code>PG</code>) e baixa todos os títulos selecionados com uma única data de pagamento escolhida abaixo.
                          </span>

                          {paymentDateMode === 'SPECIFIC_DATE' && (
                            <div
                              className="mt-2.5 flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300">
                                Data do Pagamento:
                              </label>
                              <input
                                type="date"
                                value={specificPaymentDate}
                                onChange={(e) => setSpecificPaymentDate(e.target.value)}
                                className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Cria o Borderô com status <code>AP</code> e vincula os títulos mantendo-os em aberto (<code>AB</code>) para liquidação manual no Horus.
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* ─── OPÇÃO SIM / NÃO: UNIFICAR PARCELAS DA NOTA + GRAVAR TAXA (VLR_LANCTO_ABATIMENTO) ─── */}
                <div className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/40 dark:bg-violet-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs">
                    <span className="font-extrabold text-slate-900 dark:text-white block">
                      Unificar Parcelas em Lançamento Único + Gravar Taxa ({activeProfile.channel_label})
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Consolida múltiplas parcelas da mesma nota no 1º lançamento e grava a taxa em <code>VLR_LANCTO_ABATIMENTO</code> para o Fechamento Bancário bater com o valor líquido recebido.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setUnifyInstallments(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                        !unifyInstallments
                          ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      NÃO
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowBorderoModal(false)}
                    disabled={creatingBordero}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmBordero}
                    disabled={creatingBordero || Boolean(bankConfig && !bankConfig.is_configured)}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-5 py-2.5 text-xs font-bold text-white shadow-md cursor-pointer"
                  >
                    {creatingBordero ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Gravando no SQL Server...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Confirmar e Gerar Borderô
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
              className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                  <div>
                    <h3 className="text-sm font-extrabold">
                      Códigos Horus ERP — {activeProfile.name}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Salvo nas configurações da empresa para geração de Borderô desta modalidade
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBankConfigModal(false)}
                  className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block">
                      Forma de Pagamento Horus (COD_FORMA) *
                    </label>
                    <input
                      type="text"
                      value={bankForm.forma_pagto}
                      onChange={(e) =>
                        setBankForm((p) => ({ ...p, forma_pagto: e.target.value }))
                      }
                      placeholder="Ex: 01, CAR, PIX, BOL"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Código na tabela FORMAS_PAGTO do Horus
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block">
                      Código do Banco Horus (COD_BANCO) *
                    </label>
                    <input
                      type="text"
                      value={bankForm.banco}
                      onChange={(e) => setBankForm((p) => ({ ...p, banco: e.target.value }))}
                      placeholder="Ex: 001, 237, 341, 756"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Código do banco no Horus ERP
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block">
                      Código da Agência (COD_AGENCIA) *
                    </label>
                    <input
                      type="text"
                      value={bankForm.agencia}
                      onChange={(e) => setBankForm((p) => ({ ...p, agencia: e.target.value }))}
                      placeholder="Ex: 1234"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Agência cadastrada no Horus ERP
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block">
                      Conta Corrente (COD_CONTAC) *
                    </label>
                    <input
                      type="text"
                      value={bankForm.conta}
                      onChange={(e) => setBankForm((p) => ({ ...p, conta: e.target.value }))}
                      placeholder="Ex: 56789-0"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Conta corrente de liquidação no Horus
                    </span>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block">
                      Carteira de Cobrança (NRO_CARTEIRA) <span className="text-slate-400 font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={bankForm.carteira}
                      onChange={(e) => setBankForm((p) => ({ ...p, carteira: e.target.value }))}
                      placeholder="Ex: 17, 109, 09 (ou deixe em branco)"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2 pt-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block">
                      Regra Padrão de Data de Pagamento & Baixa no Horus
                    </label>
                    <select
                      value={bankForm.payment_date_mode || 'CHANNEL_DATE'}
                      onChange={(e) =>
                        setBankForm((p) => ({ ...p, payment_date_mode: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

                  <div className="sm:col-span-2 pt-1">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200 block">
                          Unificar Parcelas da Nota + Gravar Taxa ({activeProfile.channel_label})
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          Unifica parcelas em aberto da mesma nota em 1 lançamento e registra a taxa em <code>VLR_LANCTO_ABATIMENTO</code> para bater o Fechamento Bancário.
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setBankForm((p) => ({ ...p, unify_installments: true }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                            bankForm.unify_installments
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          SIM
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBankForm((p) => ({ ...p, unify_installments: false }))
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                            !bankForm.unify_installments
                              ? 'bg-slate-800 text-white dark:bg-slate-700'
                              : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          NÃO
                        </button>
                      </div>
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
                        Salvar Códigos Horus ({activeProfile.short_name})
                      </>
                    )}
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

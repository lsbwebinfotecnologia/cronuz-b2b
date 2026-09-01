'use client';

import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DatabaseZap, Upload, FileSpreadsheet, Download,
  CheckCircle2, AlertTriangle, XCircle, Info, Loader2,
  RefreshCw, ChevronRight, Check, AlertCircle, ArrowRight,
  CreditCard, Building2, ShieldCheck, DollarSign, Filter,
  Layers, Search, CheckSquare, Square, CheckCircle, Clock
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SummaryData {
  total_planilha_qtd: number;
  total_planilha_valor: number;
  ready_qtd: number;
  ready_valor: number;
  divergence_qtd: number;
  divergence_valor: number;
  already_paid_qtd: number;
  already_paid_valor?: number;
  abertos_qtd?: number;
  abertos_valor?: number;
  pagos_qtd?: number;
  pagos_valor?: number;
  not_found_qtd: number;
  not_found_valor: number;
  filial_consultada: string;
}

interface BankConfig {
  forma_pagto: string;
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  cod_empresa: string;
  cod_filial: string;
  is_configured: boolean;
}

interface ReleaseItem {
  linha: number;
  pedido_web: string;
  nro_lancamento?: number;
  cod_ped_venda?: number;
  cod_filial?: string;
  nro_nota_fiscal?: string;
  cliente_nome: string;
  documento: string;
  valor_vindi: number;
  valor_horus?: number;
  diferenca_valor?: number;
  data_pagamento: string;
  status_horus?: string;
  situacao_horus?: 'ABERTO' | 'PAGO' | 'CANCELADO' | string;
  status_vindi?: string;
  cod_bordero?: number | null;
  forma_pagamento?: string;
  motivo?: string;
  is_mais_recente?: boolean;
  total_matches?: number;
  match_index?: number;
  has_multiplos?: boolean;
  total_pedidos_horus?: number;
  total_parcelas?: number;
  parcela_num?: number;
  selected?: boolean;
}

export default function FinanceiroVindiPage() {
  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilial, setSelectedFilial] = useState('1');
  const [reading, setReading] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [bankConfig, setBankConfig] = useState<BankConfig | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Listas de conciliação
  const [itemsReady, setItemsReady] = useState<ReleaseItem[]>([]);
  const [itemsDivergence, setItemsDivergence] = useState<ReleaseItem[]>([]);
  const [itemsAlreadyPaid, setItemsAlreadyPaid] = useState<ReleaseItem[]>([]);
  const [itemsNotFound, setItemsNotFound] = useState<ReleaseItem[]>([]);

  // Filtros e busca
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'abertos' | 'pagos' | 'divergence' | 'not_found'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal de Borderô
  const [showBorderoModal, setShowBorderoModal] = useState(false);
  const [creatingBordero, setCreatingBordero] = useState(false);
  const [borderoSuccess, setBorderoSuccess] = useState<{ number: number; total: number; qtd: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega filial padrão da empresa
  useState(() => {
    async function loadDefaultFilial() {
      try {
        const token = getToken();
        const res = await fetch(`${API}/companies/${companyId}/horus-sql/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.horus_sql_cod_filial) {
            setSelectedFilial(String(data.horus_sql_cod_filial).trim());
          }
        }
      } catch (e) {}
    }
    loadDefaultFilial();
  });

  // Download do modelo CSV
  const handleDownloadTemplate = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/horus-sql/vindi/template`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao baixar modelo.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_planilha_vindi.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Erro ao baixar modelo de planilha.');
    }
  };

  // Upload e Leitura da Planilha
  const handleProcessFile = async () => {
    if (!selectedFile) {
      toast.error('Selecione uma planilha (CSV ou Excel) para continuar.');
      return;
    }

    setReading(true);
    setBorderoSuccess(null);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', selectedFile);

      const filialParam = encodeURIComponent(selectedFilial.trim() || '1');
      const res = await fetch(`${API}/companies/${companyId}/horus-sql/vindi/preview?filial=${filialParam}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao processar planilha com o Horus SQL.');
      }

      setSummary(data.summary);
      setBankConfig(data.bank_config);
      setItemsReady(data.items_ready || []);
      setItemsDivergence(data.items_divergence || []);
      setItemsAlreadyPaid(data.items_already_paid || []);
      setItemsNotFound(data.items_not_found || []);
      setWarnings(data.warnings || []);

      const totalAbertos = data.summary?.abertos_qtd ?? (data.items_ready?.length + data.items_divergence?.length);
      toast.success(`Planilha processada! ${totalAbertos} lançamentos em aberto localizados.`);
    } catch (e: any) {
      toast.error(e.message || 'Erro de conexão.');
    } finally {
      setReading(false);
    }
  };

  // Toggle de seleção individual por id do item
  const toggleItemSelection = (linha: number, pedidoWeb: string, nroLancamento?: number) => {
    const updateList = (list: ReleaseItem[]) =>
      list.map(it =>
        it.linha === linha && it.pedido_web === pedidoWeb && (nroLancamento === undefined || it.nro_lancamento === nroLancamento)
          ? { ...it, selected: !it.selected }
          : it
      );

    setItemsReady(updateList);
    setItemsDivergence(updateList);
    setItemsAlreadyPaid(updateList);
  };

  // Seleções em Massa
  const selectOnlyAbertos = () => {
    // Marca apenas o lançamento mais recente de cada pedido para evitar duplicidades
    const markAbertos = (list: ReleaseItem[]) =>
      list.map(it => ({
        ...it,
        selected: Boolean(
          (it.situacao_horus === 'ABERTO' || (!it.cod_bordero && it.status_horus === 'AB')) &&
          (it.is_mais_recente ?? true)
        )
      }));
    const unmarkAll = (list: ReleaseItem[]) => list.map(it => ({ ...it, selected: false }));

    setItemsReady(markAbertos);
    setItemsDivergence(markAbertos);
    setItemsAlreadyPaid(unmarkAll);
    toast.info('Selecionados apenas os lançamentos em Aberto mais recentes.');
  };

  const selectOnlyPagos = () => {
    const markPagos = (list: ReleaseItem[]) =>
      list.map(it => ({ ...it, selected: it.situacao_horus === 'PAGO' || Boolean(it.cod_bordero) || it.status_horus !== 'AB' }));
    const unmarkAll = (list: ReleaseItem[]) => list.map(it => ({ ...it, selected: false }));

    setItemsReady(unmarkAll);
    setItemsDivergence(unmarkAll);
    setItemsAlreadyPaid(markPagos);
    toast.info('Selecionados lançamentos já Pagos / Baixados.');
  };

  const selectAll = () => {
    const markAll = (list: ReleaseItem[]) => list.map(it => ({ ...it, selected: true }));
    setItemsReady(markAll);
    setItemsDivergence(markAll);
    setItemsAlreadyPaid(markAll);
    toast.info('Todos os lançamentos foram marcados.');
  };

  const unselectAll = () => {
    const unmarkAll = (list: ReleaseItem[]) => list.map(it => ({ ...it, selected: false }));
    setItemsReady(unmarkAll);
    setItemsDivergence(unmarkAll);
    setItemsAlreadyPaid(unmarkAll);
    toast.info('Seleção desmarcada.');
  };

  // Totais selecionados em tempo real
  const selectedReleases = useMemo(() => {
    const list: ReleaseItem[] = [];
    itemsReady.forEach(item => { if (item.selected) list.push(item); });
    itemsDivergence.forEach(item => { if (item.selected) list.push(item); });
    itemsAlreadyPaid.forEach(item => { if (item.selected) list.push(item); });
    return list;
  }, [itemsReady, itemsDivergence, itemsAlreadyPaid]);

  const totalSelectedAmount = useMemo(() => {
    return selectedReleases.reduce((acc, item) => acc + (item.valor_horus || item.valor_vindi || 0), 0);
  }, [selectedReleases]);

  // Lista combinada e filtrada para a tabela
  const displayedItems = useMemo(() => {
    let list: (ReleaseItem & { category: 'ready' | 'divergence' | 'already_paid' | 'not_found' })[] = [];

    if (activeFilterTab === 'all') {
      list.push(...itemsReady.map(i => ({ ...i, category: 'ready' as const })));
      list.push(...itemsDivergence.map(i => ({ ...i, category: 'divergence' as const })));
      list.push(...itemsAlreadyPaid.map(i => ({ ...i, category: 'already_paid' as const })));
      list.push(...itemsNotFound.map(i => ({ ...i, category: 'not_found' as const })));
    } else if (activeFilterTab === 'abertos') {
      list.push(...itemsReady.map(i => ({ ...i, category: 'ready' as const })));
      list.push(...itemsDivergence.filter(i => i.situacao_horus === 'ABERTO' || i.status_horus === 'AB').map(i => ({ ...i, category: 'divergence' as const })));
    } else if (activeFilterTab === 'pagos') {
      list.push(...itemsAlreadyPaid.map(i => ({ ...i, category: 'already_paid' as const })));
    } else if (activeFilterTab === 'divergence') {
      list.push(...itemsDivergence.map(i => ({ ...i, category: 'divergence' as const })));
    } else if (activeFilterTab === 'not_found') {
      list.push(...itemsNotFound.map(i => ({ ...i, category: 'not_found' as const })));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i =>
        i.pedido_web.toLowerCase().includes(q) ||
        i.cliente_nome.toLowerCase().includes(q) ||
        i.documento.toLowerCase().includes(q) ||
        (i.nro_nota_fiscal && i.nro_nota_fiscal.toLowerCase().includes(q)) ||
        (i.nro_lancamento && String(i.nro_lancamento).includes(q))
      );
    }

    return list;
  }, [activeFilterTab, itemsReady, itemsDivergence, itemsAlreadyPaid, itemsNotFound, searchQuery]);

  // Executar Borderô no Horus
  const handleExecuteBordero = async () => {
    if (selectedReleases.length === 0) {
      toast.error('Nenhum título selecionado.');
      return;
    }

    if (!bankConfig?.is_configured) {
      toast.error('Parâmetros bancários não configurados em Configurações > Horus SQL.');
      return;
    }

    setCreatingBordero(true);
    try {
      const token = getToken();
      const payload = {
        releases: selectedReleases.map(r => ({
          nro_lancamento: r.nro_lancamento!,
          cod_filial: r.cod_filial || bankConfig.cod_filial || '1',
          cod_ped_venda: r.cod_ped_venda,
          pedido_web: r.pedido_web,
          valor: r.valor_horus || r.valor_vindi,
          status: 'AB',
        }))
      };

      const res = await fetch(`${API}/companies/${companyId}/horus-sql/vindi/bordero`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      });
      setShowBorderoModal(false);
      toast.success(`Borderô #${data.bordero_number} gerado com sucesso no Horus ERP!`);

      // Remove os itens baixados da lista ativa
      const downloadedIds = new Set(selectedReleases.map(r => r.nro_lancamento));
      setItemsReady(prev => prev.filter(r => !downloadedIds.has(r.nro_lancamento)));
      setItemsDivergence(prev => prev.filter(r => !downloadedIds.has(r.nro_lancamento)));
      setItemsAlreadyPaid(prev => prev.filter(r => !downloadedIds.has(r.nro_lancamento)));
    } catch (e: any) {
      toast.error(e.message || 'Erro de conexão ao gerar borderô.');
    } finally {
      setCreatingBordero(false);
    }
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  // Contagens para os botões de filtro
  const countAbertos = (summary?.abertos_qtd ?? (itemsReady.length + itemsDivergence.length));
  const countPagos = (summary?.pagos_qtd ?? itemsAlreadyPaid.length);
  const countDivergencias = itemsDivergence.length;
  const countNaoEncontrados = itemsNotFound.length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Baixa Financeira com Vindi
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                  Horus SQL Direct
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Importe extratos da Vindi, concilie os lançamentos com o ERP Horus e gere borderôs automáticos
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Download className="h-4 w-4 text-violet-600" />
          Baixar Modelo CSV
        </button>
      </div>

      {/* Banner de Sucesso do Borderô */}
      {borderoSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/90 dark:border-emerald-800/40 dark:bg-emerald-950/30 flex items-start justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Borderô #{borderoSuccess.number} gerado com sucesso no Horus ERP!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                Foram vinculados <strong>{borderoSuccess.qtd} lançamentos</strong> no valor total de{' '}
                <strong>{formatBRL(borderoSuccess.total)}</strong> às tabelas <code>BORDERO</code> e <code>LANCTOS_CRECEBER</code>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBorderoSuccess(null)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-bold shrink-0"
          >
            Fechar
          </button>
        </motion.div>
      )}

      {/* ─── CARD DE UPLOAD E LEITURA ─────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Upload className="h-4 w-4 text-violet-500" />
            Upload da Planilha de Pagamentos (Vindi)
          </h2>
          {summary && (
            <span className="text-xs text-slate-400 font-medium">
              Filial consultada no Horus: <strong>{summary.filial_consultada}</strong>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          {/* Input de Arquivo */}
          <div className="md:col-span-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 flex items-center gap-3.5 cursor-pointer transition-all ${
                selectedFile
                  ? 'border-violet-400 bg-violet-50/50 dark:border-violet-700 dark:bg-violet-950/20'
                  : 'border-slate-300 dark:border-slate-700 hover:border-violet-400 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <FileSpreadsheet className={`h-8 w-8 shrink-0 ${selectedFile ? 'text-violet-600' : 'text-slate-400'}`} />
              <div className="truncate flex-1">
                {selectedFile ? (
                  <>
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{selectedFile.name}</p>
                    <p className="text-[11px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB — Clique para trocar de arquivo</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Clique para selecionar a planilha Vindi (.csv ou .xlsx)</p>
                    <p className="text-[11px] text-slate-400">Suporta exportações com colunas Pedido/Código, Cliente, Valor e Data</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
                className="hidden"
              />
            </div>
          </div>

          {/* Seletor de Filial Horus */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
              Filial no Horus ERP:
            </label>
            <input
              type="text"
              value={selectedFilial}
              onChange={(e) => setSelectedFilial(e.target.value)}
              placeholder="Ex: 1 ou 2"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-3 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">Filtra pedidos da Filial</p>
          </div>

          {/* Botão Ler Planilha */}
          <div>
            <label className="text-[11px] font-bold text-transparent block mb-1 select-none">
              Ação
            </label>
            <button
              type="button"
              onClick={handleProcessFile}
              disabled={reading || !selectedFile}
              className={`w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                selectedFile && !reading
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/20 hover:shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              {reading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <DatabaseZap className="h-4 w-4" />
                  Ler e Conciliar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Avisos do parser se houver */}
        {warnings.length > 0 && (
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
            {warnings.map((w, idx) => <p key={idx}>• {w}</p>)}
          </div>
        )}
      </div>

      {/* ─── DASHBOARD DE CONCILIAÇÃO ────────────────────────────── */}
      {summary && (
        <div className="space-y-6">

          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {/* Total Planilha */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total na Planilha</p>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{formatBRL(summary.total_planilha_valor)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{summary.total_planilha_qtd} títulos importados</p>
            </div>

            {/* Em Aberto */}
            <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Em Aberto (Horus)</p>
                <Clock className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1">
                {formatBRL(summary.abertos_valor ?? (summary.ready_valor + summary.divergence_valor))}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                {countAbertos} lançamentos disponíveis
              </p>
            </div>

            {/* Já Pagos / Baixados */}
            <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-950/20 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Já Pagos / Baixados</p>
                <CheckCircle className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-lg font-black text-blue-700 dark:text-blue-300 mt-1">
                {formatBRL(summary.already_paid_valor ?? 0)}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{countPagos} já liquidados / no borderô</p>
            </div>

            {/* Divergências / Não Encontrados */}
            <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Divergências</p>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-lg font-black text-amber-700 dark:text-amber-300 mt-1">{formatBRL(summary.divergence_valor)}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{countDivergencias} com diferença de valor</p>
            </div>
          </div>

          {/* ─── TABELA DE CONCILIAÇÃO INTERATIVA ──────────────────── */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">

            {/* Filtros e Busca */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    activeFilterTab === 'all'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                  }`}
                >
                  Todos ({summary.total_planilha_qtd})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilterTab('abertos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    activeFilterTab === 'abertos'
                      ? 'bg-emerald-600 text-white'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Em Aberto ({countAbertos})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilterTab('pagos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    activeFilterTab === 'pagos'
                      ? 'bg-blue-600 text-white'
                      : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                  }`}
                >
                  <CheckCircle className="h-3 w-3" />
                  Já Pagos ({countPagos})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilterTab('divergence')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    activeFilterTab === 'divergence'
                      ? 'bg-amber-600 text-white'
                      : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Divergências ({countDivergencias})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFilterTab('not_found')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    activeFilterTab === 'not_found'
                      ? 'bg-rose-600 text-white'
                      : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                  }`}
                >
                  <XCircle className="h-3 w-3" />
                  Não Encontrados ({countNaoEncontrados})
                </button>
              </div>

              {/* Busca */}
              <div className="relative w-full sm:w-64">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar pedido, cliente, NF..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* ─── BARRA DE SELEÇÃO EM MASSA (Abertos, Pagos, Todos) ──── */}
            <div className="px-5 py-3 bg-slate-50/90 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-500 mr-1">Seleção rápida:</span>

                <button
                  type="button"
                  onClick={selectOnlyAbertos}
                  className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                >
                  ✓ Marcar só os Abertos
                </button>

                <button
                  type="button"
                  onClick={selectOnlyPagos}
                  className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                >
                  ✓ Marcar só os Pagos
                </button>

                <button
                  type="button"
                  onClick={selectAll}
                  className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition-colors"
                >
                  Marcar Todos
                </button>

                <button
                  type="button"
                  onClick={unselectAll}
                  className="px-2.5 py-1 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                >
                  Desmarcar Todos
                </button>
              </div>

              <div className="font-bold text-slate-700 dark:text-slate-300 bg-violet-50 dark:bg-violet-950/30 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-800/50">
                Selecionados p/ Borderô:{' '}
                <span className="text-violet-700 dark:text-violet-300 font-black">
                  {selectedReleases.length} títulos ({formatBRL(totalSelectedAmount)})
                </span>
              </div>
            </div>

            {/* Tabela de Lançamentos */}
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">✓</th>
                    <th className="p-3">Pedido Web</th>
                    <th className="p-3">Pedido Horus</th>
                    <th className="p-3">Filial</th>
                    <th className="p-3">Lançamento Horus</th>
                    <th className="p-3">NF</th>
                    <th className="p-3">Cliente / Sacado</th>
                    <th className="p-3 text-right">Valor Vindi</th>
                    <th className="p-3 text-right">Valor Horus</th>
                    <th className="p-3 text-center">Situação no ERP</th>
                    <th className="p-3 text-center">Status / Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400">
                        Nenhum lançamento corresponde ao filtro atual.
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map((item, idx) => {
                      const isAberto = item.situacao_horus === 'ABERTO' || (!item.cod_bordero && item.status_horus === 'AB');
                      const isPago = item.situacao_horus === 'PAGO' || Boolean(item.cod_bordero) || (item.status_horus && item.status_horus !== 'AB');
                      const isNotFound = item.category === 'not_found';
                      const hasDivergence = Boolean(item.diferenca_valor && item.diferenca_valor > 0);

                      return (
                        <tr
                          key={`${item.linha}-${item.pedido_web}-${idx}`}
                          className={`transition-colors ${
                            item.selected
                              ? 'bg-violet-50/60 dark:bg-violet-950/25'
                              : isNotFound
                              ? 'bg-rose-50/20 dark:bg-rose-950/10 opacity-70'
                              : isPago
                              ? 'bg-slate-50/70 dark:bg-slate-900/40'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center">
                            {!isNotFound ? (
                              <button
                                type="button"
                                onClick={() => toggleItemSelection(item.linha, item.pedido_web, item.nro_lancamento)}
                                className="text-violet-600 hover:scale-110 transition-transform"
                              >
                                {item.selected ? (
                                  <CheckSquare className="h-4 w-4 text-violet-600" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Pedido Web */}
                          <td className="p-3">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">#{item.pedido_web}</span>
                          </td>

                          {/* Pedido Horus */}
                          <td className="p-3">
                            <div className="flex flex-col gap-1 items-start">
                              {item.cod_ped_venda ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-xs border ${
                                  item.has_multiplos
                                    ? item.is_mais_recente
                                      ? 'text-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-sm'
                                      : 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700 opacity-75'
                                    : 'text-violet-700 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800'
                                }`}>
                                  #{item.cod_ped_venda}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}

                              {item.has_multiplos && (
                                item.is_mais_recente ? (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                                    ★ Pedido Atual
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                    Pedido Anterior
                                  </span>
                                )
                              )}
                            </div>
                          </td>

                          {/* Filial */}
                          <td className="p-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300">
                              Filial {item.cod_filial || selectedFilial}
                            </span>
                          </td>

                          {/* Lançamento Horus */}
                          <td className="p-3">
                            <div className="flex flex-col gap-0.5 items-start">
                              {item.nro_lancamento ? (
                                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-bold text-slate-800 dark:text-slate-200">
                                  {item.nro_lancamento}
                                </span>
                              ) : '-'}
                              {item.total_parcelas && item.total_parcelas > 1 && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                  Parcela {item.parcela_num}/{item.total_parcelas}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* NF */}
                          <td className="p-3 text-slate-600 dark:text-slate-400">
                            {item.nro_nota_fiscal && item.nro_nota_fiscal !== '-' ? (
                              <span className="font-semibold text-slate-800 dark:text-slate-200">NF {item.nro_nota_fiscal}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>

                          {/* Cliente */}
                          <td className="p-3 truncate max-w-[180px]">
                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{item.cliente_nome || '-'}</p>
                            {item.documento && item.documento !== '-' && (
                              <p className="text-[10px] text-slate-400 font-mono">{item.documento}</p>
                            )}
                          </td>

                          {/* Valor Vindi */}
                          <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatBRL(item.valor_vindi)}
                          </td>

                          {/* Valor Horus */}
                          <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            {item.valor_horus !== undefined ? formatBRL(item.valor_horus) : '—'}
                          </td>

                          {/* Situação no ERP (ABERTO / PAGO) */}
                          <td className="p-3 text-center">
                            {isAberto ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Em Aberto (AB)
                              </span>
                            ) : isPago ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100/70 dark:bg-blue-950/40 dark:text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-300 dark:border-blue-800">
                                <CheckCircle className="h-3 w-3 text-blue-500" />
                                {item.cod_bordero ? `Borderô #${item.cod_bordero}` : 'Pago / Liquidado'}
                              </span>
                            ) : isNotFound ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                                <XCircle className="h-3 w-3" /> Fora do Horus
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">{item.status_horus || '-'}</span>
                            )}
                          </td>

                          {/* Status / Diferença */}
                          <td className="p-3 text-center">
                            {hasDivergence ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100/70 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800" title={item.motivo}>
                                <AlertTriangle className="h-3 w-3 text-amber-600" /> Dif. R$ {item.diferenca_valor?.toFixed(2)}
                              </span>
                            ) : !isNotFound ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                <Check className="h-3 w-3 text-emerald-500" /> Valor confere
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">{item.motivo || '-'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé com CTA para Borderô */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  Ao gerar o borderô, os lançamentos selecionados receberão o número do borderô no Horus ERP.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowBorderoModal(true)}
                disabled={selectedReleases.length === 0}
                className={`inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-md ${
                  selectedReleases.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                <CreditCard className="h-4 w-4" />
                Gerar Borderô no Horus ({selectedReleases.length} títulos · {formatBRL(totalSelectedAmount)})
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ─── MODAL DE CONFIRMAÇÃO DO BORDERÔ ─────────────────────── */}
      <AnimatePresence>
        {showBorderoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-lg w-full shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirmar Geração de Borderô</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Gravação direta no banco SQL Server do ERP Horus</p>
                </div>
              </div>

              {/* Resumo financeiro */}
              <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Títulos Selecionados:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedReleases.length} lançamentos</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Valor Total do Borderô:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{formatBRL(totalSelectedAmount)}</span>
                </div>
              </div>

              {/* Parâmetros Bancários Usados */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-violet-500" />
                  Parâmetros Bancários do Horus:
                </p>

                {bankConfig?.is_configured ? (
                  <div className="grid grid-cols-2 gap-2 text-[11px] p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div>Forma Pagto: <strong className="font-mono">{bankConfig.forma_pagto}</strong></div>
                    <div>Banco: <strong className="font-mono">{bankConfig.banco}</strong></div>
                    <div>Agência: <strong className="font-mono">{bankConfig.agencia}</strong></div>
                    <div>Conta Corrente: <strong className="font-mono">{bankConfig.conta}</strong></div>
                    <div>Carteira: <strong className="font-mono">{bankConfig.carteira}</strong></div>
                    <div>Filial: <strong className="font-mono">{bankConfig.cod_filial}</strong></div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/30 dark:bg-rose-950/20 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Parâmetros bancários incompletos!</p>
                      <p className="mt-0.5">Preencha os códigos de banco, agência e carteira em <Link href="/settings" className="underline font-bold">Configurações &gt; Horus SQL</Link> antes de continuar.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBorderoModal(false)}
                  disabled={creatingBordero}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleExecuteBordero}
                  disabled={creatingBordero || !bankConfig?.is_configured}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-all shadow-md"
                >
                  {creatingBordero ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gravando Borderô no Horus...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Confirmar e Gravar Borderô
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

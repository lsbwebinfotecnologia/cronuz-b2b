'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download, FileArchive, Calendar, Building2, FileText,
  Loader2, AlertCircle, CheckCircle2, ChevronRight, Info,
  ShieldCheck, ShieldX, Key, ChevronDown, ChevronUp, X
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Branch {
  id: number;
  nome: string;
  cnpj: string | null;
  cod_empresa: string;
  cod_filial: string;
  sefaz_environment: 'HOMOLOGACAO' | 'PRODUCAO';
  uf: string;
  has_sefaz_cert: boolean;
  active: boolean;
  sefaz_ultimo_nsu: string | null;
}

type DocModel = '55' | '65';

type ProgressStep = {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
};

const STEPS: ProgressStep[] = [
  { label: 'Conectando à SEFAZ com certificado mTLS', status: 'pending' },
  { label: 'Consultando documentos por NSU', status: 'pending' },
  { label: 'Filtrando por período e modelo', status: 'pending' },
  { label: 'Gerando arquivo ZIP', status: 'pending' },
];

export default function SefazDownloadPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [modelos, setModelos] = useState<DocModel[]>(['55', '65']);
  const [downloading, setDownloading] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>(STEPS.map(s => ({ ...s })));
  const [lastResult, setLastResult] = useState<{ total: number; nomeZip: string } | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');

  // ── Consulta por Chave ──
  const [chaveOpen, setChaveOpen] = useState(false);
  const [chavesInput, setChavesInput] = useState('');
  const [downloadingChave, setDownloadingChave] = useState(false);
  const [chaveResult, setChaveResult] = useState<{ total: number; erros: number } | null>(null);

  // Chave do localStorage é por filial — cada filial tem seu próprio cooldown
  const storageKey = selectedBranch ? `sefaz_blocked_until_${selectedBranch}` : null;

  // Carrega/recarrega bloqueio sempre que trocar de filial
  useEffect(() => {
    if (!storageKey) { setBlockedUntil(null); return; }
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const until = new Date(saved);
      if (until > new Date()) setBlockedUntil(until);
      else { localStorage.removeItem(storageKey); setBlockedUntil(null); }
    } else {
      setBlockedUntil(null);
    }
  }, [storageKey]);

  // Countdown regressivo
  useEffect(() => {
    if (!blockedUntil) { setCountdown(''); return; }
    const tick = () => {
      const diff = blockedUntil.getTime() - Date.now();
      if (diff <= 0) {
        setBlockedUntil(null);
        setCountdown('');
        if (storageKey) localStorage.removeItem(storageKey);
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${m}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  function markBlocked() {
    if (!storageKey) return;
    const until = new Date(Date.now() + 60 * 60 * 1000); // +1 hora
    setBlockedUntil(until);
    localStorage.setItem(storageKey, until.toISOString());
  }

  function clearBlock() {
    setBlockedUntil(null);
    if (storageKey) localStorage.removeItem(storageKey);
  }

  useEffect(() => {
    // Remove chave legada (formato antigo sem branch_id) se existir
    localStorage.removeItem('sefaz_blocked_until');
    fetchBranches();
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - 30);
    setDataFim(today.toISOString().slice(0, 10));
    setDataInicio(from.toISOString().slice(0, 10));
  }, []);

  async function fetchBranches() {
    setLoadingBranches(true);
    try {
      const res = await fetch(`${API}/sefaz/branches`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data: Branch[] = await res.json();
        setBranches(data.filter(b => b.active));
      }
    } finally {
      setLoadingBranches(false);
    }
  }

  function toggleModelo(m: DocModel) {
    setModelos(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  async function handleResetNsu() {
    if (!selectedBranch) return;
    const branch = branches.find(b => b.id === Number(selectedBranch));
    if (!confirm(
      `⚠️ Isso vai zerar o NSU da filial "${branch?.nome}" e forçar uma varredura completa na próxima consulta.\n\n` +
      `Isso pode retornar um volume grande de documentos e está sujeito ao bloqueio da SEFAZ (cStat=656) se repetido várias vezes.\n\n` +
      `Confirma?`
    )) return;

    try {
      const res = await fetch(`${API}/sefaz/branches/${selectedBranch}/reset-nsu`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setBranches(prev => prev.map(b => b.id === updated.id ? { ...b, sefaz_ultimo_nsu: updated.sefaz_ultimo_nsu } : b));
        toast.success('NSU resetado! A próxima consulta partirá do início.');
      } else {
        toast.error('Erro ao resetar NSU.');
      }
    } catch {
      toast.error('Erro de conexão.');
    }
  }

  async function handleDownloadChave() {
    if (!selectedBranch) { toast.error('Selecione uma filial primeiro.'); return; }

    const chaves = chavesInput
      .split(/[\n,;]+/)
      .map(s => s.replace(/\D/g, '').trim())
      .filter(s => s.length > 0);

    if (chaves.length === 0) { toast.error('Cole ao menos uma chave de acesso.'); return; }
    if (chaves.length > 50) { toast.error('Máximo de 50 chaves por consulta.'); return; }

    const invalidas = chaves.filter(c => c.length !== 44);
    if (invalidas.length > 0) {
      toast.error(`${invalidas.length} chave(s) com tamanho inválido (precisam ter 44 dígitos).`);
      return;
    }

    setDownloadingChave(true);
    setChaveResult(null);

    try {
      const res = await fetch(`${API}/sefaz/consulta-chave`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ branch_id: Number(selectedBranch), chaves }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Erro ao consultar SEFAZ.');
        return;
      }

      const total  = parseInt(res.headers.get('X-Total-XMLs') || '0', 10);
      const erros  = parseInt(res.headers.get('X-Erros') || '0', 10);

      setChaveResult({ total, erros });

      if (total > 0) {
        const blob   = await res.blob();
        const url    = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href       = url;
        a.download   = 'xmls_chave.zip';
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${total} XML(s) baixados com sucesso.`);
      } else {
        toast.error('Nenhum documento encontrado para as chaves informadas.');
      }

    } catch {
      toast.error('Erro de conexão com a API.');
    } finally {
      setDownloadingChave(false);
    }
  }

  function setStep(idx: number, status: ProgressStep['status']) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, status } : s));
  }

  function resetSteps() {
    setSteps(STEPS.map(s => ({ ...s, status: 'pending' })));
  }

  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBranch) { toast.error('Selecione uma filial.'); return; }
    if (modelos.length === 0) { toast.error('Selecione ao menos um tipo de documento.'); return; }

    // Guard: bloqueia mesmo que o botão seja ativado de outra forma (ex: Enter)
    if (blockedUntil) {
      toast.error(`⏳ Aguarde ${countdown} antes de tentar novamente.`);
      return;
    }

    const branch = branches.find(b => b.id === Number(selectedBranch));
    if (!branch?.has_sefaz_cert) {
      toast.error('Esta filial não possui certificado digital. Configure em Fiscal SEFAZ.');
      return;
    }

    setDownloading(true);
    setLastResult(null);
    resetSteps();

    try {
      // Etapa 1 — conectando
      setStep(0, 'running');
      await new Promise(r => setTimeout(r, 400));
      setStep(0, 'done');

      // Etapa 2 — consultando NSU
      setStep(1, 'running');

      const params = new URLSearchParams({
        branch_id: selectedBranch,
        data_inicio: dataInicio,
        data_fim: dataFim,
      });
      modelos.forEach(m => params.append('modelos', m));

      const res = await fetch(`${API}/sefaz/download-xml?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      setStep(1, res.ok ? 'done' : 'error');

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStep(2, 'error');
        setStep(3, 'error');
        if (res.status === 429) {
          markBlocked(); // inicia cooldown de 1 hora no frontend para ESTA filial
          toast.error(
            '⏳ Bloqueio cStat=656: A SEFAZ bloqueou o certificado por 1h. ' +
            'Todas as filiais com o mesmo .pfx estão temporariamente bloqueadas.',
            { duration: 15000 }
          );
        } else {
          toast.error(err.detail || 'Erro ao consultar a SEFAZ.');
        }
        return;
      }

      // Etapa 3 — filtrando
      setStep(2, 'running');
      await new Promise(r => setTimeout(r, 300));
      setStep(2, 'done');

      // Etapa 4 — gerando ZIP
      setStep(3, 'running');
      const totalXmls = parseInt(res.headers.get('X-Total-XMLs') || '0');
      const blob = await res.blob();
      setStep(3, 'done');

      // Dispara download
      const cnpj = branch?.cnpj?.replace(/\D/g, '') || 'cnpj';
      const nomeZip = `xmls_${cnpj}_${dataInicio.replace(/-/g, '')}_a_${dataFim.replace(/-/g, '')}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nomeZip;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastResult({ total: totalXmls, nomeZip });
      toast.success(`Download concluído! ${totalXmls} XML(s) encontrados.`);
    } catch {
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
      toast.error('Erro de conexão ao consultar a SEFAZ.');
    } finally {
      setDownloading(false);
    }
  }

  const selectedBranchObj = branches.find(b => b.id === Number(selectedBranch));
  const periodDays = dataInicio && dataFim
    ? Math.round((new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / 86400000)
    : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400">
        <Link href="/settings" className="hover:text-slate-600 transition-colors">Configurações</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-slate-600 font-medium">Download XML SEFAZ</span>
      </nav>

      {/* Título */}
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-800">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <FileArchive className="w-5 h-5 text-indigo-600" />
          </div>
          Download de XML SEFAZ
        </h1>
        <p className="text-slate-500 text-sm mt-2">
          Baixe NF-e (modelo 55) e NFC-e (modelo 65) em formato ZIP por período.
          Inclui documentos autorizados e cancelamentos.
        </p>
      </div>

      {/* Aviso sem filiais */}
      {!loadingBranches && branches.length === 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Nenhuma filial configurada</p>
            <p className="text-amber-700 mt-0.5">
              Acesse{' '}
              <Link href="/settings" className="underline font-medium">
                Configurações → Fiscal SEFAZ
              </Link>{' '}
              para cadastrar a filial e carregar o certificado digital.
            </p>
          </div>
        </div>
      )}

      {/* Formulário */}
      <form onSubmit={handleDownload} className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* ── Filial ── */}
        <div className="p-6 border-b border-slate-100">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Building2 className="w-4 h-4 text-indigo-500" />
            Empresa / Filial
          </label>

          {loadingBranches ? (
            <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
          ) : (
            <select
              required
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Selecione a filial...</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.nome} — CNPJ: {b.cnpj || '—'} [{b.sefaz_environment === 'PRODUCAO' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'} / {b.uf}]
                </option>
              ))}
            </select>
          )}

          {/* Status do certificado */}
          {selectedBranchObj && (
            <div className="mt-3 space-y-2">
              <div className={`flex items-center gap-2 text-sm font-medium ${
                selectedBranchObj.has_sefaz_cert ? 'text-emerald-700' : 'text-red-600'
              }`}>
                {selectedBranchObj.has_sefaz_cert
                  ? <><ShieldCheck className="w-4 h-4" /> Certificado configurado ({selectedBranchObj.sefaz_environment === 'PRODUCAO' ? 'Produção' : 'Homologação'} / {selectedBranchObj.uf})</>
                  : <><ShieldX className="w-4 h-4" /> Certificado não configurado para esta filial</>
                }
              </div>

              {/* Painel NSU */}
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">Último NSU: </span>
                  {selectedBranchObj.sefaz_ultimo_nsu && selectedBranchObj.sefaz_ultimo_nsu.replace(/^0+/, '') !== ''
                    ? <code className="font-mono text-indigo-600 font-semibold">{selectedBranchObj.sefaz_ultimo_nsu}</code>
                    : <span className="text-slate-400 italic">não iniciado (partirá do zero)</span>
                  }
                </div>
                <button
                  type="button"
                  onClick={handleResetNsu}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors font-medium whitespace-nowrap"
                  title="Zera o NSU para forçar varredura completa na próxima consulta"
                >
                  🔄 Reiniciar do zero
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Período ── */}
        <div className="p-6 border-b border-slate-100">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Período
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1.5 font-medium">Data de Início</p>
              <input
                type="date"
                required
                value={dataInicio}
                onChange={e => setDataInicio(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5 font-medium">Data de Fim</p>
              <input
                type="date"
                required
                value={dataFim}
                onChange={e => setDataFim(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          {periodDays > 0 && (
            <div className={`flex items-center gap-1.5 mt-3 text-sm ${periodDays > 100 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
              <Info className="w-3.5 h-3.5" />
              {periodDays} dia(s) selecionado(s)
              {periodDays > 100 && ' — máximo permitido pela SEFAZ é 100 dias.'}
            </div>
          )}
        </div>

        {/* ── Tipo de Documento ── */}
        <div className="p-6 border-b border-slate-100">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <FileText className="w-4 h-4 text-indigo-500" />
            Tipo de Documento
          </label>
          <div className="flex gap-3">
            {([
              { value: '55' as DocModel, label: 'NF-e', sub: 'Nota Fiscal Eletrônica (modelo 55)' },
              { value: '65' as DocModel, label: 'NFC-e', sub: 'Cupom Fiscal Eletrônico (modelo 65)' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleModelo(opt.value)}
                className={`flex-1 text-left p-4 rounded-xl border-2 transition-all ${
                  modelos.includes(opt.value)
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    modelos.includes(opt.value) ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                  }`}>
                    {modelos.includes(opt.value) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                  </span>
                  <span className={`font-bold text-sm ${modelos.includes(opt.value) ? 'text-indigo-700' : 'text-slate-500'}`}>
                    {opt.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 ml-6">{opt.sub}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Inclui automaticamente documentos autorizados e eventos de cancelamento.
          </p>
        </div>

        {/* ── Footer com botão ── */}
        <div className="px-6 py-4 bg-slate-50 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-400 leading-relaxed">
            <p>Máximo de 100 dias retroativos por consulta.</p>
            <p>O arquivo ZIP é gerado com todos os XMLs do período.</p>
          </div>
          <button
            type="submit"
            disabled={downloading || modelos.length === 0 || periodDays > 100 || !!blockedUntil}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Consultando SEFAZ...</>
              : blockedUntil
                ? <><Loader2 className="w-4 h-4" /> Aguardando ({countdown})</>
                : <><Download className="w-4 h-4" /> Baixar XMLs (.zip)</>
            }
          </button>
        </div>
      </form>

      {/* ── Banner de Cooldown 656 ── */}
      {blockedUntil && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800">SEFAZ em cooldown — consulta bloqueada temporariamente</p>
            <p className="text-amber-700 mt-0.5">
              A SEFAZ bloqueia por <strong>1 hora</strong> quando detecta consultas repetidas.
              Cada nova tentativa <strong>reinicia</strong> o contador. Aguarde o tempo zerar antes de tentar.
            </p>
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 rounded-lg px-4 py-2">
                <span className="text-xs text-amber-700 font-medium">Liberado em:</span>
                <span className="font-mono font-bold text-amber-900 text-lg">{countdown}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={clearBlock}
                  className="text-xs text-amber-700 font-medium underline hover:text-amber-900"
                >
                  Liberar esta filial
                </button>
                <span className="text-amber-300">|</span>
                <button
                  onClick={() => {
                    // Remove TODAS as chaves sefaz do localStorage (global e por filial)
                    Object.keys(localStorage)
                      .filter(k => k.startsWith('sefaz_blocked_until'))
                      .forEach(k => localStorage.removeItem(k));
                    setBlockedUntil(null);
                    toast.success('Todos os bloqueios de cooldown foram removidos.');
                  }}
                  className="text-xs text-red-600 font-medium underline hover:text-red-800"
                >
                  🗑 Limpar todos os bloqueios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Painel de Progresso ── */}
      {downloading && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            Processando consulta na SEFAZ...
          </p>

          {/* Barra geral */}
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-2 bg-indigo-500 rounded-full transition-all duration-500"
              style={{
                width: `${(steps.filter(s => s.status === 'done').length / steps.length) * 100}%`,
              }}
            />
          </div>

          {/* Etapas */}
          <div className="space-y-2.5">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {step.status === 'done' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                )}
                {step.status === 'running' && (
                  <Loader2 className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />
                )}
                {step.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                )}
                {step.status === 'pending' && (
                  <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                )}
                <span className={
                  step.status === 'done' ? 'text-emerald-700 font-medium' :
                  step.status === 'running' ? 'text-indigo-700 font-semibold' :
                  step.status === 'error' ? 'text-red-600' :
                  'text-slate-400'
                }>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            A consulta pode levar até 90 segundos dependendo do volume de documentos.
          </p>
        </div>
      )}

      {/* Resultado */}
      {lastResult && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
          lastResult.total > 0
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {lastResult.total > 0
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          }
          <div>
            <p className={`font-semibold ${lastResult.total > 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
              {lastResult.total > 0 ? 'Download concluído!' : 'Nenhum documento encontrado'}
            </p>
            <p className={`mt-0.5 ${lastResult.total > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {lastResult.total > 0
                ? <>{lastResult.total} XML(s) → <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-xs">{lastResult.nomeZip}</code></>
                : 'Tente ampliar o período ou verifique se houve emissões no ambiente configurado.'
              }
            </p>
          </div>
        </div>
      )}

      {/* ── Consulta por Chave de Acesso ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header colapsável */}
        <button
          type="button"
          onClick={() => setChaveOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Key className="w-5 h-5 text-violet-600" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-slate-800 text-sm">Consulta por Chave de Acesso</p>
              <p className="text-xs text-slate-500 mt-0.5">
                NF-e ou NFC-e individual · Cole a chave de 44 dígitos do ERP · Funciona para qualquer estado
              </p>
            </div>
          </div>
          {chaveOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {chaveOpen && (
          <div className="border-t border-slate-100 px-6 py-5 space-y-4">
            {/* Info */}
            <div className="flex items-start gap-2 p-3 bg-violet-50 border border-violet-100 rounded-lg text-xs text-violet-800">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-500" />
              <span>
                Cole uma ou várias chaves de acesso (uma por linha). Funciona para <strong>NF-e (55)</strong> e{' '}
                <strong>NFC-e (65)</strong> de qualquer estado. O endpoint da SEFAZ é determinado automaticamente pela chave.
                Máximo de <strong>50 chaves</strong> por consulta.
              </span>
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Chaves de Acesso <span className="text-slate-400 font-normal">(44 dígitos cada — com ou sem formatação)</span>
              </label>
              <div className="relative">
                <textarea
                  rows={5}
                  placeholder={"35240941778264000581650010000001231234567890\n35240941778264000581650010000001241234567891\n..."}
                  value={chavesInput}
                  onChange={e => setChavesInput(e.target.value)}
                  className="w-full font-mono text-xs px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent resize-none bg-slate-50"
                />
                {chavesInput && (
                  <button
                    type="button"
                    onClick={() => { setChavesInput(''); setChaveResult(null); }}
                    className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Preview de chaves parseadas */}
              {chavesInput && (() => {
                const linhas = chavesInput.split(/[\n,;]+/).map(s => s.replace(/\D/g, '').trim()).filter(Boolean);
                const validas = linhas.filter(c => c.length === 44);
                const invalidas = linhas.filter(c => c.length > 0 && c.length !== 44);
                return (
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {validas.length > 0 && (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {validas.length} chave{validas.length > 1 ? 's' : ''} válida{validas.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {invalidas.length > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" /> {invalidas.length} inválida{invalidas.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {validas.length > 0 && (() => {
                      const tipos = validas.reduce((acc, c) => {
                        const t = c[20] === '6' && c[21] === '5' ? 'NFC-e' : 'NF-e';
                        acc[t] = (acc[t] || 0) + 1;
                        return acc;
                      }, {} as Record<string,number>);
                      return (
                        <span className="text-slate-500">
                          ({Object.entries(tipos).map(([t,n]) => `${n} ${t}`).join(' · ')})
                        </span>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>

            {/* Resultado */}
            {chaveResult && (
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                chaveResult.total > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {chaveResult.total > 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>
                  {chaveResult.total > 0
                    ? `${chaveResult.total} XML(s) baixados com sucesso.`
                    : 'Nenhum documento encontrado.'}
                  {chaveResult.erros > 0 && ` (${chaveResult.erros} erro(s) — verifique os logs)`}
                </span>
              </div>
            )}

            {/* Botão */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400">
                Filial selecionada: <span className="font-medium text-slate-600">
                  {branches.find(b => b.id === Number(selectedBranch))?.nome || '—'}
                </span>
              </p>
              <button
                type="button"
                onClick={handleDownloadChave}
                disabled={downloadingChave || !selectedBranch || !chavesInput.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingChave
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Consultando SEFAZ...</>
                  : <><Download className="w-4 h-4" /> Baixar XML(s)</>
                }
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { 
  BarChart3, Download, ArrowLeft, TrendingUp, AlertTriangle, 
  Users, Layers, DollarSign, BookOpen, Clock, RefreshCw,
  FileText, CheckCircle2, ChevronRight
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface ExecutiveReport {
  kpis: {
    total_projects: number;
    active_projects: number;
    completed_projects: number;
    total_tiragem: number;
    total_orcado: number;
    total_realizado: number;
    custo_medio_exemplar: number;
    desvio_orcamentario_percentual: number;
  };
  stages_bottlenecks: {
    pipeline_name: string;
    stage_name: string;
    stage_color: string;
    sla_days: number;
    projects_count: number;
    avg_days_in_stage: number;
    is_bottleneck: boolean;
  }[];
  professionals_ranking: {
    professional_id: number;
    name: string;
    specialty: string;
    rating: number;
    total_services: number;
    total_paid: number;
  }[];
}

interface ProjectOption {
  id: number;
  title: string;
  isbn?: string;
}

export default function EditorialReportsPage() {
  const [user, setUser] = useState<any>(null);
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Estados da Central de Exportação
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [exportingServices, setExportingServices] = useState<'excel' | 'pdf' | null>(null);
  const [exportingMovements, setExportingMovements] = useState<'excel' | 'pdf' | null>(null);

  const companyId = user?.company_id || 1;

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) {
      const cid = u.company_id || 1;
      loadExecutiveReport(cid);
      loadProjects(cid);
    }
  }, []);

  const loadProjects = async (cid: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/projects`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error('Erro ao carregar lista de projetos para filtro', e);
    }
  };

  const loadExecutiveReport = async (cid: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/reports/executive`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (e) {
      toast.error('Erro ao carregar relatórios gerenciais');
    } finally {
      setLoading(false);
    }
  };

  const handleExportServices = async (format: 'excel' | 'pdf') => {
    try {
      setExportingServices(format);
      const projParam = selectedProjectId !== 'all' ? `&project_id=${selectedProjectId}` : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/exports/services?format=${format}${projParam}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      if (!res.ok) throw new Error('Falha ao exportar relatório de serviços');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const targetProj = projects.find(p => String(p.id) === selectedProjectId);
      const scopeLabel = targetProj ? targetProj.title.replace(/[^a-zA-Z0-9]/g, '_') : 'Geral';
      a.download = `Relatorio_Servicos_${scopeLabel}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Relatório de serviços (${format.toUpperCase()}) gerado com sucesso!`);
    } catch (e) {
      toast.error('Erro ao baixar relatório de serviços');
    } finally {
      setExportingServices(null);
    }
  };

  const handleExportMovements = async (format: 'excel' | 'pdf') => {
    try {
      setExportingMovements(format);
      const projParam = selectedProjectId !== 'all' ? `&project_id=${selectedProjectId}` : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/exports/movements?format=${format}${projParam}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      if (!res.ok) throw new Error('Falha ao exportar relatório de movimentações');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const targetProj = projects.find(p => String(p.id) === selectedProjectId);
      const scopeLabel = targetProj ? targetProj.title.replace(/[^a-zA-Z0-9]/g, '_') : 'Geral';
      a.download = `Relatorio_Movimentacoes_${scopeLabel}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Relatório de movimentações (${format.toUpperCase()}) gerado com sucesso!`);
    } catch (e) {
      toast.error('Erro ao baixar relatório de movimentações');
    } finally {
      setExportingMovements(null);
    }
  };

  const handleDownloadManualPdf = async () => {
    try {
      setDownloadingPdf(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/manual/download-pdf`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) {
        throw new Error('Falha ao gerar PDF');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Manual_Producao_Editorial_Cronuz_Empresa_${companyId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Manual Operacional em PDF baixado com sucesso!');
    } catch (e) {
      toast.error('Erro ao gerar manual em PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Topo / Voltar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/editorial"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Quadro Editorial</span>
        </Link>

        {/* Botão Baixar Manual em PDF */}
        <button
          onClick={handleDownloadManualPdf}
          disabled={downloadingPdf}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-sm w-fit"
        >
          {downloadingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          <span>{downloadingPdf ? 'Gerando Manual...' : 'Baixar Manual Operacional (PDF)'}</span>
        </button>
      </div>

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          Relatórios & Inteligência Editorial
        </h1>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Visões administrativas, gargalos de pipeline (SLA), controle orçamentário consolidado e exportação de relatórios.
        </p>
      </div>

      {/* ── Central de Emissão & Exportação de Relatórios (Excel & PDF) ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
              <FileText className="w-3.5 h-3.5" />
              <span>Exportação Personalizada</span>
            </div>
            <h2 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
              Central de Relatórios em Excel (.xlsx) e PDF (.pdf)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gere relatórios completos de serviços, valores, prestadores e movimentações por obra individual ou geral da editora.
            </p>
          </div>

          {/* Filtro de Projeto (Escopo) */}
          <div className="w-full md:w-80">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Escopo / Filtro de Demanda
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">🌐 Geral (Todos os Projetos da Editora)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  📖 {p.title} {p.isbn ? `(ISBN: ${p.isbn})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grade de Cards de Relatório: Serviços & Custos vs Movimentações & Linha do Tempo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Relatório de Serviços, Custos & Prestadores */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 bg-gradient-to-br from-slate-50/50 to-white dark:from-slate-900/40 dark:to-slate-900 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <DollarSign className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Financeiro & Fornecedores
                </span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Relatório de Serviços & Custos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Grade detalhando serviço, data, descrição, prestador vinculado, chave Pix, unidade/qtd, valor unitário, total orçado, valor realizado e status de pagamento.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <button
                onClick={() => handleExportServices('excel')}
                disabled={exportingServices !== null}
                className="flex-1 min-w-[130px] px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {exportingServices === 'excel' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>{exportingServices === 'excel' ? 'Gerando...' : 'Exportar Excel (.xlsx)'}</span>
              </button>

              <button
                onClick={() => handleExportServices('pdf')}
                disabled={exportingServices !== null}
                className="flex-1 min-w-[130px] px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {exportingServices === 'pdf' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{exportingServices === 'pdf' ? 'Gerando...' : 'Exportar PDF (.pdf)'}</span>
              </button>
            </div>
          </div>

          {/* Card 2: Relatório de Movimentações & Linha do Tempo */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 bg-gradient-to-br from-slate-50/50 to-white dark:from-slate-900/40 dark:to-slate-900 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Clock className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Auditoria & Timeline
                </span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Relatório de Movimentações
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Linha do tempo contendo todas as transições entre etapas, data e hora, usuário responsável pela movimentação, justificativas e observações registradas.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 flex-wrap">
              <button
                onClick={() => handleExportMovements('excel')}
                disabled={exportingMovements !== null}
                className="flex-1 min-w-[130px] px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {exportingMovements === 'excel' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>{exportingMovements === 'excel' ? 'Gerando...' : 'Exportar Excel (.xlsx)'}</span>
              </button>

              <button
                onClick={() => handleExportMovements('pdf')}
                disabled={exportingMovements !== null}
                className="flex-1 min-w-[130px] px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {exportingMovements === 'pdf' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{exportingMovements === 'pdf' ? 'Gerando...' : 'Exportar PDF (.pdf)'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading || !report ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Calculando indicadores e métricas...</span>
        </div>
      ) : (
        <>
          {/* Grid de KPIs Financeiros e Operacionais (Mobile First) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Total Orçado vs. Real</span>
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                R$ {report.kpis.total_realizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                <span>Orçado: R$ {report.kpis.total_orcado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span className={`font-bold ${report.kpis.desvio_orcamentario_percentual > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {report.kpis.desvio_orcamentario_percentual > 0 ? '+' : ''}{report.kpis.desvio_orcamentario_percentual.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Tiragem Consolidada</span>
                <BookOpen className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                {report.kpis.total_tiragem.toLocaleString('pt-BR')} exemplares
              </div>
              <p className="text-[11px] text-slate-400">
                Soma de todos os projetos ativos & finalizados
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Custo Médio Unitário</span>
                <TrendingUp className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                R$ {report.kpis.custo_medio_exemplar.toFixed(2)} / un
              </div>
              <p className="text-[11px] text-slate-400">
                Média industrial ponderada por tiragem
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Demandas Editoriais</span>
                <Layers className="w-4 h-4 text-violet-500" />
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                {report.kpis.active_projects} ativas
              </div>
              <p className="text-[11px] text-slate-400">
                {report.kpis.completed_projects} concluídas de {report.kpis.total_projects} totais
              </p>
            </div>
          </div>

          {/* Seção 2: Análise de Gargalos de Pipeline (SLA) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                Análise de Gargalos & Cumprimento de SLAs
              </h3>
              <p className="text-xs text-slate-400">
                Identifique etapas onde os manuscritos passam mais tempo que o SLA estabelecido para otimizar os fluxos.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3">Fluxo / Pipeline</th>
                    <th className="p-3">Etapa de Produção</th>
                    <th className="p-3 text-center">Obras Ativas</th>
                    <th className="p-3 text-center">SLA Definido</th>
                    <th className="p-3 text-center">Tempo Médio Real</th>
                    <th className="p-3 text-right">Status do Gargalo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.stages_bottlenecks.map((st, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                      <td className="p-3 font-semibold text-slate-600 dark:text-slate-300">
                        {st.pipeline_name}
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.stage_color }} />
                        <span>{st.stage_name}</span>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                        {st.projects_count}
                      </td>
                      <td className="p-3 text-center text-slate-500">
                        {st.sla_days} dias
                      </td>
                      <td className="p-3 text-center font-bold">
                        {st.avg_days_in_stage.toFixed(1)} dias
                      </td>
                      <td className="p-3 text-right">
                        {st.is_bottleneck ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Gargalo Crítico (+{(st.avg_days_in_stage - st.sla_days).toFixed(1)}d)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            No Prazo
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Seção 3: Ranking de Prestadores e Alocação de Recursos */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm space-y-4">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                Ranking de Prestadores & Volume Financeiro
              </h3>
              <p className="text-xs text-slate-400">
                Distribuição de pagamentos e demandas atribuídas por profissional de mercado.
              </p>
            </div>

            {report.professionals_ranking.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Nenhum prestador com custos registrados até o momento.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3">Profissional / Empresa</th>
                      <th className="p-3">Especialidade</th>
                      <th className="p-3 text-center">Nota Técnica</th>
                      <th className="p-3 text-center">Demandas / Serviços</th>
                      <th className="p-3 text-right">Total Liquidado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {report.professionals_ranking.map((prof, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          {prof.name}
                        </td>
                        <td className="p-3 text-slate-600 dark:text-slate-400">
                          {prof.specialty.replace('_', ' ')}
                        </td>
                        <td className="p-3 text-center font-bold text-amber-500">
                          ★ {prof.rating}.0
                        </td>
                        <td className="p-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                          {prof.total_services} tarefas
                        </td>
                        <td className="p-3 text-right font-extrabold text-emerald-600 dark:text-emerald-400">
                          R$ {prof.total_paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

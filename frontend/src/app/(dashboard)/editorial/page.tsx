'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, Plus, Search, Filter, Layers, CheckSquare, 
  Clock, AlertTriangle, User, Calendar, ArrowRight, Settings, 
  ChevronRight, RefreshCw, Sparkles, CheckCircle2, ChevronLeft,
  LayoutGrid, List, FileText, ExternalLink, Hash, X, Users, BarChart3, Download, Calculator
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface Stage {
  id: number;
  name: string;
  color: string;
  order_index: number;
  sla_days: number;
  is_initial: boolean;
  is_final: boolean;
  projects_count: number;
}

interface Pipeline {
  id: number;
  name: string;
  description?: string;
  color: string;
  is_default: boolean;
  stages: Stage[];
  projects_count: number;
}

interface ProjectCard {
  id: number;
  local_id: number;
  pipeline_id: number;
  stage_id: number;
  stage_name: string;
  stage_color: string;
  title: string;
  subtitle?: string;
  format: string;
  isbn?: string;
  cover_url?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  start_date?: string;
  due_date?: string;
  days_in_stage: number;
  is_overdue: boolean;
  responsible_user_name?: string;
  author_name?: string;
  horus_cod_item?: number;
  tasks_total: number;
  tasks_completed: number;
  files_count: number;
  tiragem: number;
  custo_unitario_exemplar: number;
  custo_total_orcado: number;
  custo_total_realizado: number;
  preco_capa_sugerido: number;
}

interface AuthorOption {
  id: number;
  nome: string;
}

interface HorusProductOption {
  cod_item: number;
  nom_item: string;
  barras_isbn?: string;
  preco_capa?: number;
}

const PRIORITY_CONFIG = {
  LOW: { label: 'Baixa', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  MEDIUM: { label: 'Média', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300' },
  HIGH: { label: 'Alta', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300' },
  URGENT: { label: 'Urgente', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 font-semibold' }
};

export default function EditorialDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Filtros
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal Nova Demanda
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newFormat, setNewFormat] = useState('LIVRO_FISICO');
  const [newIsbn, setNewIsbn] = useState('');
  const [newPriority, setNewPriority] = useState('MEDIUM');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAuthorId, setNewAuthorId] = useState<number | ''>('');
  const [newTiragem, setNewTiragem] = useState<number>(1000);
  const [newPages, setNewPages] = useState<number | ''>('');
  const [newVisibleToAuthor, setNewVisibleToAuthor] = useState(false);
  const [newHorusCodItem, setNewHorusCodItem] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  // Busca de produto no Horus dentro do modal
  const [horusSearchTerm, setHorusSearchTerm] = useState('');
  const [horusResults, setHorusResults] = useState<HorusProductOption[]>([]);
  const [searchingHorus, setSearchingHorus] = useState(false);

  // Modal Mover Etapa Rápido (para mobile)
  const [movingProject, setMovingProject] = useState<ProjectCard | null>(null);
  const [targetStageId, setTargetStageId] = useState<number | ''>('');
  const [moveNotes, setMoveNotes] = useState('');
  const [savingMove, setSavingMove] = useState(false);

  const companyId = user?.company_id || 1;

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) {
      loadPipelines(u.company_id || 1);
      loadAuthors(u.company_id || 1);
    }
  }, []);

  const loadPipelines = async (cid: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/pipelines`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data: Pipeline[] = await res.json();
        setPipelines(data);
        if (data.length > 0) {
          const defaultPipe = data.find(p => p.is_default) || data[0];
          setActivePipelineId(defaultPipe.id);
          loadProjects(cid, defaultPipe.id);
        }
      }
    } catch (e) {
      toast.error('Erro ao carregar fluxos editoriais');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (cid: number, pipeId: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/projects?pipeline_id=${pipeId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      toast.error('Erro ao carregar projetos editoriais');
    }
  };

  const loadAuthors = async (cid: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/authors`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuthors(data);
      }
    } catch (e) {
      console.log('Autores indisponíveis ou vazio');
    }
  };

  const handlePipelineChange = (id: number) => {
    setActivePipelineId(id);
    loadProjects(companyId, id);
  };

  const activePipeline = useMemo(() => {
    return pipelines.find(p => p.id === activePipelineId) || pipelines[0];
  }, [pipelines, activePipelineId]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (search) {
        const s = search.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(s);
        const matchAuthor = p.author_name?.toLowerCase().includes(s);
        const matchIsbn = p.isbn?.toLowerCase().includes(s);
        if (!matchTitle && !matchAuthor && !matchIsbn) return false;
      }
      if (priorityFilter && p.priority !== priorityFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [projects, search, priorityFilter, statusFilter]);

  // Busca Horus
  const handleSearchHorus = async () => {
    if (!horusSearchTerm || horusSearchTerm.length < 2) {
      toast.warning('Digite ao menos 2 caracteres para buscar no acervo');
      return;
    }
    setSearchingHorus(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/horus/search-products?term=${encodeURIComponent(horusSearchTerm)}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHorusResults(data.items || []);
        if (!data.items || data.items.length === 0) {
          toast.info('Nenhum item localizado no Hórus com este termo');
        }
      }
    } catch (e) {
      toast.error('Erro na consulta ao Hórus');
    } finally {
      setSearchingHorus(false);
    }
  };

  const handleSelectHorusProduct = (item: HorusProductOption) => {
    setNewHorusCodItem(item.cod_item);
    if (!newTitle) setNewTitle(item.nom_item);
    if (item.barras_isbn && !newIsbn) setNewIsbn(item.barras_isbn);
    toast.success(`Livro #${item.cod_item} vinculado!`);
  };

  // Criação de Demanda
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.warning('O título da obra é obrigatório');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        pipeline_id: activePipelineId,
        title: newTitle.trim(),
        subtitle: newSubtitle.trim() || undefined,
        format: newFormat,
        isbn: newIsbn.trim() || undefined,
        priority: newPriority,
        due_date: newDueDate || undefined,
        author_id: newAuthorId || undefined,
        horus_cod_item: newHorusCodItem || undefined,
        visible_to_author: newVisibleToAuthor,
        tiragem: Number(newTiragem) || 1000,
        estimated_pages: newPages ? Number(newPages) : undefined
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success('Projeto editorial criado com sucesso!');
        setIsModalOpen(false);
        setNewTitle('');
        setNewSubtitle('');
        setNewIsbn('');
        setNewDueDate('');
        setNewAuthorId('');
        setNewHorusCodItem('');
        setHorusResults([]);
        setHorusSearchTerm('');
        if (activePipelineId) loadProjects(companyId, activePipelineId);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao criar projeto editorial');
      }
    } catch (e) {
      toast.error('Erro de conexão ao criar projeto editorial');
    } finally {
      setCreating(false);
    }
  };

  // Movimentação Rápida de Etapa
  const handleMoveStage = async () => {
    if (!movingProject || !targetStageId) return;
    setSavingMove(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects/${movingProject.id}/move-stage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          to_stage_id: targetStageId,
          notes: moveNotes.trim() || undefined
        })
      });

      if (res.ok) {
        toast.success('Etapa atualizada com sucesso!');
        setMovingProject(null);
        setMoveNotes('');
        if (activePipelineId) loadProjects(companyId, activePipelineId);
      } else {
        toast.error('Erro ao mover etapa');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setSavingMove(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6">
      
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Produção Editorial
              </h1>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Gestão ágil de fluxos de produção, etapas e projetos editoriais de publicações.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/editorial/professionals"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-2 shadow-sm"
          >
            <Users className="w-4 h-4 text-indigo-500" />
            <span className="hidden sm:inline">Profissionais</span>
          </Link>

          <Link
            href="/editorial/reports"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-2 shadow-sm"
          >
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span className="hidden sm:inline">Relatórios & Visões</span>
          </Link>

          <Link
            href="/editorial/settings"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-2 shadow-sm"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Configurar Fluxos</span>
          </Link>

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition flex items-center gap-2 shadow-sm shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Projeto Editorial</span>
          </button>
        </div>
      </div>

      {/* Barra de Seleção de Pipelines (Abas com scroll horizontal para Mobile) */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-max">
          {pipelines.map(pipe => {
            const isActive = pipe.id === activePipelineId;
            return (
              <button
                key={pipe.id}
                onClick={() => handlePipelineChange(pipe.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2.5 border ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pipe.color }} />
                <span>{pipe.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-slate-700 text-slate-200 dark:bg-slate-200 dark:text-slate-800' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {pipe.stages.reduce((acc, s) => acc + s.projects_count, 0)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Alternador Kanban / Lista */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
          <button
            onClick={() => setViewMode('kanban')}
            className={`p-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'kanban' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            title="Visão Kanban"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            title="Visão em Lista"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título da obra, autor ou ISBN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition shadow-sm"
          />
        </div>

        <div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
          >
            <option value="">Todas as Prioridades</option>
            <option value="LOW">Prioridade Baixa</option>
            <option value="MEDIUM">Prioridade Média</option>
            <option value="HIGH">Prioridade Alta</option>
            <option value="URGENT">Prioridade Urgente</option>
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
          >
            <option value="">Todos os Status</option>
            <option value="ACTIVE">Em Andamento (Ativo)</option>
            <option value="COMPLETED">Concluído</option>
            <option value="PAUSED">Pausado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>
      </div>

      {/* Conteúdo Principal: Visão Kanban ou Visão em Lista */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-500">Carregando projetos editoriais do pipeline...</p>
        </div>
      ) : !activePipeline || activePipeline.stages.length === 0 ? (
        <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <Layers className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Nenhuma etapa configurada</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Este fluxo de trabalho ainda não possui etapas cadastradas. Configure as etapas para começar.
          </p>
          <Link
            href="/editorial/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition"
          >
            Configurar Etapas Agora
          </Link>
        </div>
      ) : viewMode === 'kanban' ? (
        
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start snap-x snap-mandatory min-h-[600px]">
          {activePipeline.stages.map(stage => {
            const stageProjects = filteredProjects.filter(p => p.stage_id === stage.id);
            return (
              <div
                key={stage.id}
                className="w-[300px] sm:w-[320px] md:w-[340px] shrink-0 bg-slate-50/80 dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800/80 flex flex-col max-h-[85vh] snap-center shadow-sm"
              >
                {/* Header da Coluna */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3 px-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                      {stage.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {stage.sla_days > 0 && (
                      <span className="text-[11px] text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded-md" title={`SLA Previsto: ${stage.sla_days} dias`}>
                        {stage.sla_days}d
                      </span>
                    )}
                    <span className="text-xs font-bold px-2 py-0.5 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                      {stageProjects.length}
                    </span>
                  </div>
                </div>

                {/* Lista de Cards da Etapa */}
                <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-[120px]">
                  {stageProjects.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      Nenhum projeto editorial nesta etapa
                    </div>
                  ) : (
                    stageProjects.map(proj => (
                      <div
                        key={proj.id}
                        className="bg-white dark:bg-slate-800/90 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700/80 hover:shadow-md hover:border-indigo-400/50 dark:hover:border-indigo-500/50 transition-all flex flex-col gap-2.5 group cursor-pointer"
                        onClick={() => window.location.href = `/editorial/${proj.id}`}
                      >
                        {/* Topo do Card: Local ID, Prioridade e Ação Mover */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-slate-400 dark:text-slate-500">
                            #{proj.local_id}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${PRIORITY_CONFIG[proj.priority]?.color}`}>
                              {PRIORITY_CONFIG[proj.priority]?.label}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMovingProject(proj);
                                setTargetStageId(proj.stage_id);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                              title="Mover de etapa"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Título da Obra */}
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                            {proj.title}
                          </h4>
                          {proj.subtitle && (
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                              {proj.subtitle}
                            </p>
                          )}
                        </div>

                        {/* Autor e Formato */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {proj.author_name && (
                            <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                              <User className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[130px]">{proj.author_name}</span>
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700/60 rounded text-[10px] font-medium">
                            {proj.format.replace('_', ' ')}
                          </span>
                          {proj.horus_cod_item && (
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                              Hórus #{proj.horus_cod_item}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 font-mono">
                            📦 {proj.tiragem?.toLocaleString('pt-BR') || 1000} un
                          </span>
                          {proj.custo_unitario_exemplar > 0 && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                              R$ {proj.custo_unitario_exemplar.toFixed(2)}/un
                            </span>
                          )}
                        </div>

                        {/* Rodapé do Card: Checklist e Prazo */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                          <div className="flex items-center gap-3">
                            {proj.tasks_total > 0 && (
                              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                <CheckSquare className="w-3 h-3 text-indigo-500" />
                                {proj.tasks_completed}/{proj.tasks_total}
                              </span>
                            )}
                            {proj.files_count > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                <FileText className="w-3 h-3" />
                                {proj.files_count}
                              </span>
                            )}
                          </div>

                          {proj.due_date && (
                            <span className={`flex items-center gap-1 text-[11px] font-medium ${
                              proj.is_overdue
                                ? 'text-rose-600 dark:text-rose-400 font-bold'
                                : 'text-slate-500'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {new Date(proj.due_date).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

      ) : (

        /* ── VISÃO EM LISTA (TABELA RESPONSIVA MOBILE FIRST) ── */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-4">Projeto Editorial / Obra</th>
                  <th className="p-4">Etapa Atual</th>
                  <th className="p-4">Autor</th>
                  <th className="p-4">Prioridade</th>
                  <th className="p-4">Checklist</th>
                  <th className="p-4">Prazo Limite</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                      Nenhum projeto editorial encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map(proj => (
                    <tr key={proj.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-xs text-slate-400">#{proj.local_id}</span>
                          <div>
                            <Link href={`/editorial/${proj.id}`} className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition">
                              {proj.title}
                            </Link>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              <span>{proj.format.replace('_', ' ')}</span>
                              {proj.isbn && <span>• ISBN: {proj.isbn}</span>}
                              {proj.horus_cod_item && <span className="text-indigo-500 font-mono">• Hórus #{proj.horus_cod_item}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: `${proj.stage_color}18`, color: proj.stage_color }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: proj.stage_color }} />
                          {proj.stage_name}
                        </span>
                      </td>
                      <td className="p-4 font-medium text-slate-800 dark:text-slate-200">
                        {proj.author_name || <span className="text-slate-400 font-normal">Não informado</span>}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${PRIORITY_CONFIG[proj.priority]?.color}`}>
                          {PRIORITY_CONFIG[proj.priority]?.label}
                        </span>
                      </td>
                      <td className="p-4 text-xs">
                        {proj.tasks_total > 0 ? (
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {proj.tasks_completed}/{proj.tasks_total} ({Math.round((proj.tasks_completed / proj.tasks_total) * 100)}%)
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 text-xs">
                        {proj.due_date ? (
                          <span className={proj.is_overdue ? 'text-rose-600 font-bold' : ''}>
                            {new Date(proj.due_date).toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setMovingProject(proj);
                              setTargetStageId(proj.stage_id);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                            title="Mover Etapa"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                          <Link
                            href={`/editorial/${proj.id}`}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                            title="Ver Detalhes"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
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

      {/* ── MODAL: NOVA DEMANDA / OBRA EDITORIAL ── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden shadow-2xl my-8"
            >
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-xl">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base md:text-lg">
                      Novo Projeto Editorial
                    </h3>
                    <p className="text-xs text-slate-500">
                      Fluxo selecionado: <strong className="text-indigo-600">{activePipeline?.name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                
                {/* Vínculo Rápido Hórus (Busca no Acervo) */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      Vincular Item Existente do Acervo Hórus (Opcional)
                    </label>
                    {newHorusCodItem && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Vinculado #{newHorusCodItem}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Buscar livro por nome no Hórus..."
                      value={horusSearchTerm}
                      onChange={(e) => setHorusSearchTerm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchHorus(); } }}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleSearchHorus}
                      disabled={searchingHorus}
                      className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-300 transition flex items-center gap-1.5"
                    >
                      {searchingHorus ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      Buscar
                    </button>
                  </div>

                  {horusResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
                      {horusResults.map(it => (
                        <div
                          key={it.cod_item}
                          onClick={() => handleSelectHorusProduct(it)}
                          className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between hover:border-indigo-500 cursor-pointer transition"
                        >
                          <div className="truncate mr-2">
                            <span className="font-bold text-slate-800 dark:text-white">#{it.cod_item}</span> {it.nom_item}
                            {it.barras_isbn && <span className="text-slate-400 text-[10px] ml-1.5">(ISBN: {it.barras_isbn})</span>}
                          </div>
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">Selecionar</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Título e Subtítulo */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Título da Obra / Projeto Editorial *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: O Segredo das Estrelas"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Subtítulo (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Guia Completo para Iniciantes"
                      value={newSubtitle}
                      onChange={(e) => setNewSubtitle(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Formato, ISBN e Autor */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Formato
                    </label>
                    <select
                      value={newFormat}
                      onChange={(e) => setNewFormat(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
                    >
                      <option value="LIVRO_FISICO">Livro Físico</option>
                      <option value="EBOOK">E-book (Digital)</option>
                      <option value="AUDIOBOOK">Audiolivro</option>
                      <option value="REVISTA">Revista / Periódico</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      ISBN
                    </label>
                    <input
                      type="text"
                      placeholder="978-65-..."
                      value={newIsbn}
                      onChange={(e) => setNewIsbn(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Autor
                    </label>
                    <select
                      value={newAuthorId}
                      onChange={(e) => setNewAuthorId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
                    >
                      <option value="">Selecione um Autor</option>
                      {authors.map(a => (
                        <option key={a.id} value={a.id}>{a.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Prioridade e Prazo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Prioridade
                    </label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Previsão de Conclusão (Prazo)
                    </label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Tiragem e Páginas Estimadas (Engenharia de Custos) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                  <div>
                    <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1 flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      Tiragem Planejada (Exemplares) *
                    </label>
                    <input
                      type="number"
                      min={50}
                      step={50}
                      placeholder="Ex: 1000"
                      value={newTiragem}
                      onChange={(e) => setNewTiragem(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white font-semibold"
                    />
                    <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400 mt-0.5 block">
                      Usado para calcular custo unitário por livro
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                      Páginas Estimadas (Miolo)
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Ex: 240"
                      value={newPages}
                      onChange={(e) => setNewPages(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
                    />
                    <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400 mt-0.5 block">
                      Alimenta o cálculo de diagramação e papel
                    </span>
                  </div>
                </div>

                {/* Switch Visível no Portal do Autor */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-white block">
                      Exibir no Portal do Autor
                    </span>
                    <span className="text-[11px] text-slate-500">
                      O autor vinculado poderá acompanhar a linha do tempo da produção de seu livro.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={newVisibleToAuthor}
                    onChange={(e) => setNewVisibleToAuthor(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm flex items-center gap-2"
                  >
                    {creating && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Criar Projeto Editorial
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: MOVER ETAPA RÁPIDO ── */}
      <AnimatePresence>
        {movingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 shadow-2xl"
            >
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Mover Etapa
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  Obra: <strong>{movingProject.title}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Selecione a Etapa de Destino
                </label>
                <select
                  value={targetStageId}
                  onChange={(e) => setTargetStageId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
                >
                  {activePipeline?.stages.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} {st.is_final ? '(Conclusão)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Comentário / Observação para o Histórico (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Diagramação finalizada e enviada para revisão de prova..."
                  value={moveNotes}
                  onChange={(e) => setMoveNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setMovingProject(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMoveStage}
                  disabled={savingMove}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  {savingMove && <RefreshCw className="w-3 h-3 animate-spin" />}
                  Salvar Movimentação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

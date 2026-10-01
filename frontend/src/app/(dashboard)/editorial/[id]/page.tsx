'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, BookOpen, Clock, User, Calendar, CheckSquare, 
  FileText, Upload, Plus, Trash2, ArrowRight, CheckCircle2, 
  AlertCircle, History, Sparkles, Download, RefreshCw, X,
  ShieldCheck, Eye, Edit3, Save, ExternalLink, DollarSign, Calculator, Percent
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface Task {
  id: number;
  stage_id?: number;
  title: string;
  is_completed: boolean;
  completed_at?: string;
  completed_by_name?: string;
  order_index: number;
}

interface FileDoc {
  id: number;
  stage_id?: number;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type?: string;
  uploaded_by_name?: string;
  created_at?: string;
}

interface HistoryItem {
  id: number;
  from_stage_name?: string;
  to_stage_name?: string;
  user_name?: string;
  action: string;
  notes?: string;
  created_at: string;
}

interface ProjectCost {
  id: number;
  project_id: number;
  stage_id?: number;
  stage_name?: string;
  professional_id?: number;
  professional_name?: string;
  professional_pix?: string;
  service_type: string;
  description: string;
  unit_type: string;
  quantity: number;
  unit_value: number;
  estimated_total: number;
  actual_total: number;
  payment_status: string;
  paid_at?: string;
  invoice_number?: string;
  notes?: string;
  order_index: number;
  created_at?: string;
}

interface ProfessionalOption {
  id: number;
  name: string;
  specialty: string;
  default_rate: number;
  rate_type: string;
  pix_key?: string;
}

interface ProjectDetail {
  id: number;
  local_id: number;
  pipeline_id: number;
  stage_id: number;
  stage_name: string;
  stage_color: string;
  title: string;
  subtitle?: string;
  format: string;
  edition?: string;
  volume?: string;
  isbn?: string;
  barcode?: string;
  synopsis?: string;
  cover_url?: string;
  priority: string;
  status: string;
  start_date?: string;
  due_date?: string;
  stage_entered_at?: string;
  days_in_stage: number;
  is_overdue: boolean;
  responsible_user_name?: string;
  author_id?: number;
  author_name?: string;
  horus_cod_item?: number;
  visible_to_author: boolean;
  estimated_pages?: number;
  estimated_cost: number;
  tiragem: number;
  preco_capa_sugerido: number;
  margem_estimada_percentual: number;
  custo_unitario_exemplar: number;
  custo_total_orcado: number;
  custo_total_realizado: number;
  internal_notes?: string;
  costs: ProjectCost[];
  tasks: Task[];
  files: FileDoc[];
  history: HistoryItem[];
}

interface PipelineInfo {
  id: number;
  name: string;
  stages: {
    id: number;
    name: string;
    color: string;
    order_index: number;
    is_final: boolean;
  }[];
}

export default function EditorialProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [user, setUser] = useState<any>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [pipeline, setPipeline] = useState<PipelineInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Tabs: 'overview' | 'costs' | 'tasks' | 'files' | 'history'
  const [activeTab, setActiveTab] = useState<'overview' | 'costs' | 'tasks' | 'files' | 'history'>('overview');

  // Gestão de Custos & Prestadores
  const [professionalsList, setProfessionalsList] = useState<ProfessionalOption[]>([]);
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<ProjectCost | null>(null);
  const [costServiceType, setCostServiceType] = useState('REVISAO');
  const [costDescription, setCostDescription] = useState('');
  const [costProfessionalId, setCostProfessionalId] = useState<number | ''>('');
  const [costUnitType, setCostUnitType] = useState('FECHADO');
  const [costQuantity, setCostQuantity] = useState<number | ''>(1);
  const [costUnitValue, setCostUnitValue] = useState<number | ''>(0);
  const [costPaymentStatus, setCostPaymentStatus] = useState('ORCADO');
  const [costInvoiceNumber, setCostInvoiceNumber] = useState('');
  const [costNotes, setCostNotes] = useState('');
  const [savingCost, setSavingCost] = useState(false);

  // Simulador de Mercado
  const [simulating, setSimulating] = useState(false);

  // Adicionar Tarefa
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  // Upload Arquivo
  const [uploadingFile, setUploadingFile] = useState(false);

  // Mover Etapa
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetStageId, setTargetStageId] = useState<number | ''>('');
  const [moveNotes, setMoveNotes] = useState('');
  const [savingMove, setSavingMove] = useState(false);

  // Edição Rápida
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editIsbn, setEditIsbn] = useState('');
  const [editPages, setEditPages] = useState<number | ''>('');
  const [editTiragem, setEditTiragem] = useState<number | ''>(1000);
  const [editPrecoCapa, setEditPrecoCapa] = useState<number | ''>(0);
  const [editMargem, setEditMargem] = useState<number | ''>(0);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const companyId = user?.company_id || 1;

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u && projectId) {
      loadProject(u.company_id || 1, Number(projectId));
      loadProfessionals(u.company_id || 1);
    }
  }, [projectId]);

  const loadProfessionals = async (cid: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/professionals`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfessionalsList(data);
      }
    } catch (e) {
      console.log('Erro ao carregar profissionais');
    }
  };

  const loadProject = async (cid: number, pid: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/projects/${pid}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data: ProjectDetail = await res.json();
        setProject(data);
        setEditTitle(data.title);
        setEditSubtitle(data.subtitle || '');
        setEditIsbn(data.isbn || '');
        setEditPages(data.estimated_pages || '');
        setEditTiragem(data.tiragem || 1000);
        setEditPrecoCapa(data.preco_capa_sugerido || 0);
        setEditMargem(data.margem_estimada_percentual || 0);
        setEditNotes(data.internal_notes || '');
        loadPipelineStages(cid, data.pipeline_id);
      } else {
        toast.error('Projeto editorial não encontrado');
        router.push('/editorial');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  const loadPipelineStages = async (cid: number, pipeId: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/pipelines`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const list: PipelineInfo[] = await res.json();
        const cur = list.find(p => p.id === pipeId);
        if (cur) setPipeline(cur);
      }
    } catch (e) {
      console.log('Erro ao carregar stages do pipeline');
    }
  };

  // Funções de Custos
  const openAddCostModal = () => {
    setEditingCost(null);
    setCostServiceType('REVISAO');
    setCostDescription('Revisão Textual Inicial');
    setCostProfessionalId('');
    setCostUnitType('LAUDA');
    setCostQuantity(1);
    setCostUnitValue(12.00);
    setCostPaymentStatus('ORCADO');
    setCostInvoiceNumber('');
    setCostNotes('');
    setIsCostModalOpen(true);
  };

  const openEditCostModal = (cost: ProjectCost) => {
    setEditingCost(cost);
    setCostServiceType(cost.service_type);
    setCostDescription(cost.description);
    setCostProfessionalId(cost.professional_id || '');
    setCostUnitType(cost.unit_type);
    setCostQuantity(cost.quantity);
    setCostUnitValue(cost.unit_value);
    setCostPaymentStatus(cost.payment_status);
    setCostInvoiceNumber(cost.invoice_number || '');
    setCostNotes(cost.notes || '');
    setIsCostModalOpen(true);
  };

  const handleSaveCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !costDescription.trim()) return;
    setSavingCost(true);
    try {
      const payload = {
        stage_id: project.stage_id,
        professional_id: costProfessionalId ? Number(costProfessionalId) : null,
        service_type: costServiceType,
        description: costDescription.trim(),
        unit_type: costUnitType,
        quantity: Number(costQuantity) || 1,
        unit_value: Number(costUnitValue) || 0,
        payment_status: costPaymentStatus,
        invoice_number: costInvoiceNumber.trim() || null,
        notes: costNotes.trim() || null
      };

      const url = editingCost
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/costs/${editingCost.id}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects/${project.id}/costs`;
      
      const method = editingCost ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingCost ? 'Custo atualizado!' : 'Custo adicionado!');
        setIsCostModalOpen(false);
        loadProject(companyId, project.id);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar custo');
      }
    } catch (e) {
      toast.error('Erro de comunicação ao salvar custo');
    } finally {
      setSavingCost(false);
    }
  };

  const handleDeleteCost = async (costId: number) => {
    if (!confirm('Deseja excluir este serviço orçado?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/costs/${costId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        toast.success('Custo excluído!');
        if (project) loadProject(companyId, project.id);
      }
    } catch (e) {
      toast.error('Erro ao excluir custo');
    }
  };

  const [exportingServices, setExportingServices] = useState(false);
  const [exportingMovements, setExportingMovements] = useState(false);

  const handleExportProjectServices = async (format: 'excel' | 'pdf') => {
    if (!project) return;
    try {
      setExportingServices(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/exports/services?project_id=${project.id}&format=${format}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Falha ao exportar relatório');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = project.title.replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `Relatorio_Servicos_${safeTitle}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Relatório de serviços (${format.toUpperCase()}) baixado!`);
    } catch (e) {
      toast.error('Erro ao baixar relatório de serviços');
    } finally {
      setExportingServices(false);
    }
  };

  const handleExportProjectMovements = async (format: 'excel' | 'pdf') => {
    if (!project) return;
    try {
      setExportingMovements(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/exports/movements?project_id=${project.id}&format=${format}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error('Falha ao exportar movimentações');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = project.title.replace(/[^a-zA-Z0-9]/g, '_');
      a.download = `Relatorio_Movimentacoes_${safeTitle}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Relatório de movimentações (${format.toUpperCase()}) baixado!`);
    } catch (e) {
      toast.error('Erro ao baixar relatório de movimentações');
    } finally {
      setExportingMovements(false);
    }
  };

  // Checklist Tarefas
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !project) return;
    setAddingTask(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects/${project.id}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ title: newTaskTitle.trim() })
      });
      if (res.ok) {
        const createdTask = await res.json();
        setProject(prev => prev ? { ...prev, tasks: [...prev.tasks, createdTask] } : prev);
        setNewTaskTitle('');
        toast.success('Tarefa adicionada!');
      }
    } catch (e) {
      toast.error('Erro ao adicionar tarefa');
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (taskId: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/tasks/${taskId}/toggle`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            tasks: prev.tasks.map(t => t.id === taskId ? updated : t)
          };
        });
      }
    } catch (e) {
      toast.error('Erro ao atualizar tarefa');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setProject(prev => prev ? { ...prev, tasks: prev.tasks.filter(t => t.id !== taskId) } : prev);
        toast.success('Tarefa removida');
      }
    } catch (e) {
      toast.error('Erro ao excluir tarefa');
    }
  };

  // Upload Arquivos
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects/${project.id}/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData
      });
      if (res.ok) {
        const newFile = await res.json();
        setProject(prev => prev ? { ...prev, files: [newFile, ...prev.files] } : prev);
        toast.success('Arquivo anexado com sucesso!');
      } else {
        toast.error('Falha no upload');
      }
    } catch (e) {
      toast.error('Erro de conexão ao enviar arquivo');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Deseja realmente excluir este arquivo?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setProject(prev => prev ? { ...prev, files: prev.files.filter(f => f.id !== fileId) } : prev);
        toast.success('Arquivo removido');
      }
    } catch (e) {
      toast.error('Erro ao excluir arquivo');
    }
  };

  // Movimentação de Etapa
  const handleMoveStage = async () => {
    if (!project || !targetStageId) return;
    setSavingMove(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects/${project.id}/move-stage`, {
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
        const updated = await res.json();
        setProject(updated);
        setIsMoveModalOpen(false);
        setMoveNotes('');
        toast.success('Etapa atualizada com sucesso!');
      } else {
        toast.error('Erro ao mover etapa');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setSavingMove(false);
    }
  };

  // Salvar Edição
  const handleSaveEdit = async () => {
    if (!project || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/projects/${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          subtitle: editSubtitle.trim() || undefined,
          isbn: editIsbn.trim() || undefined,
          estimated_pages: editPages ? Number(editPages) : undefined,
          tiragem: editTiragem ? Number(editTiragem) : undefined,
          preco_capa_sugerido: editPrecoCapa ? Number(editPrecoCapa) : undefined,
          margem_estimada_percentual: editMargem ? Number(editMargem) : undefined,
          internal_notes: editNotes.trim() || undefined
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        setIsEditing(false);
        toast.success('Dados salvos com sucesso!');
      }
    } catch (e) {
      toast.error('Erro ao salvar alterações');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading || !project) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500">Carregando detalhes do projeto editorial...</p>
      </div>
    );
  }

  const sortedStages = pipeline ? [...pipeline.stages].sort((a, b) => a.order_index - b.order_index) : [];
  const currentStageIndex = sortedStages.findIndex(s => s.id === project.stage_id);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Topo / Voltar */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/editorial"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Quadro de Produção</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTargetStageId(project.stage_id);
              setIsMoveModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-sm"
          >
            <ArrowRight className="w-4 h-4" />
            <span>Mover de Etapa</span>
          </button>
        </div>
      </div>

      {/* Cartão de Destaque da Demanda */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 md:p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-400">
                #{project.local_id}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${project.stage_color}18`, color: project.stage_color }}>
                {project.stage_name}
              </span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-medium">
                {project.format.replace('_', ' ')}
              </span>
              {project.horus_cod_item && (
                <span className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-md font-mono font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Hórus #{project.horus_cod_item}
                </span>
              )}
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {project.title}
            </h1>
            {project.subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {project.subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Edit3 className="w-4 h-4" />
              <span>{isEditing ? 'Cancelar' : 'Editar Dados'}</span>
            </button>
          </div>
        </div>

        {/* Stepper Visual de Etapas do Pipeline (Mobile First com scroll horizontal) */}
        {sortedStages.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
              {sortedStages.map((st, idx) => {
                const isPassed = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;
                return (
                  <div key={st.id} className="flex items-center shrink-0">
                    <button
                      onClick={() => {
                        setTargetStageId(st.id);
                        setIsMoveModalOpen(true);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition ${
                        isCurrent
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm'
                          : isPassed
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50'
                            : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800/50 dark:text-slate-500 dark:border-slate-800'
                      }`}
                    >
                      {isPassed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                      )}
                      <span>{st.name}</span>
                    </button>
                    {idx < sortedStages.length - 1 && (
                      <div className="w-4 h-[2px] bg-slate-200 dark:bg-slate-800 mx-1 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Formulário de Edição Inline */}
      {isEditing && (
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-indigo-600" />
            Editar Metadados do Projeto
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Título da Obra</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Subtítulo</label>
              <input
                type="text"
                value={editSubtitle}
                onChange={(e) => setEditSubtitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">ISBN</label>
              <input
                type="text"
                value={editIsbn}
                onChange={(e) => setEditIsbn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Páginas Estimadas</label>
              <input
                type="number"
                value={editPages}
                onChange={(e) => setEditPages(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Tiragem Planejada (Exemplares)</label>
              <input
                type="number"
                value={editTiragem}
                onChange={(e) => setEditTiragem(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Preço de Capa Sugerido (R$)</label>
              <input
                type="number"
                step="0.01"
                value={editPrecoCapa}
                onChange={(e) => setEditPrecoCapa(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Margem Líquida Alvo (%)</label>
              <input
                type="number"
                step="0.1"
                value={editMargem}
                onChange={(e) => setEditMargem(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-600 dark:text-slate-300 mb-1">Anotações Internas</label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              {savingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar Alterações
            </button>
          </div>
        </div>
      )}

      {/* Navegação de Abas (Mobile First) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Visão Geral</span>
        </button>

        <button
          onClick={() => setActiveTab('costs')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'costs'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Custos & Prestadores ({project.costs?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'tasks'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Checklist & Tarefas ({project.tasks.filter(t => t.is_completed).length}/{project.tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'files'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Provas & Arquivos ({project.files.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-bold transition border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Histórico ({project.history.length})</span>
        </button>
      </div>

      {/* Conteúdo das Abas */}

      {/* ── ABA 1: VISÃO GERAL ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Ficha Técnica & Metadados
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Autor Vinculado</span>
                  <span className="text-slate-900 dark:text-white font-bold text-sm">
                    {project.author_name || 'Nenhum autor vinculado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Código ISBN</span>
                  <span className="text-slate-900 dark:text-white font-mono text-sm">
                    {project.isbn || 'Não cadastrado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Formato da Obra</span>
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {project.format.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Páginas Estimadas</span>
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {project.estimated_pages ? `${project.estimated_pages} páginas` : 'Não informado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Responsável Interno</span>
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {project.responsible_user_name || 'Não atribuído'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Visibilidade no Portal do Autor</span>
                  <span className={`inline-flex items-center gap-1 font-semibold ${project.visible_to_author ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {project.visible_to_author ? '✓ Visível para o autor' : 'Oculto do autor'}
                  </span>
                </div>
              </div>

              {project.internal_notes && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-400 block mb-1">Anotações Internas</span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                    {project.internal_notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Box de Prazos e SLAs */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                Prazos & Tempo de Produção
              </h4>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Tempo na etapa atual:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{project.days_in_stage} dias</strong>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Prazo limite:</span>
                  <strong className={project.is_overdue ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}>
                    {project.due_date ? new Date(project.due_date).toLocaleDateString('pt-BR') : 'Sem prazo'}
                  </strong>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Status geral:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{project.status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA 2: CUSTOS & PRESTADORES ── */}
      {activeTab === 'costs' && (
        <div className="space-y-6">
          {/* Header de Ações e Resumo Executivo da Demanda */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Custo Total Orçado
              </span>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">
                R$ {(project.custo_total_orcado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">
                Realizado: R$ {(project.custo_total_realizado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Custo por Exemplar
              </span>
              <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                R$ {(project.custo_unitario_exemplar || 0).toFixed(2)} / un
              </div>
              <span className="text-[11px] text-slate-400">
                Tiragem base: {project.tiragem || 1000} exemplares
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Preço de Capa Sugerido
              </span>
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                R$ {(project.preco_capa_sugerido || 0).toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-400">
                Margem Alvo: {project.margem_estimada_percentual || 0}%
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Ponto de Equilíbrio
              </span>
              <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                {project.preco_capa_sugerido > 0 
                  ? `${Math.ceil((project.custo_total_orcado || 0) / (project.preco_capa_sugerido * 0.5))} un`
                  : 'N/D'}
              </div>
              <span className="text-[11px] text-slate-400">
                Cópias para cobrir o projeto (a 50% desc.)
              </span>
            </div>
          </div>

          {/* Tabela de Serviços e Prestadores Vinculados */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-500" />
                  Grade de Serviços & Prestadores Vinculados
                </h3>
                <p className="text-xs text-slate-400">
                  Valores orçados e liquidados para cada etapa da cadeia editorial desta obra.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleExportProjectServices('excel')}
                  disabled={exportingServices}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-400 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800"
                  title="Exportar planilha Excel (.xlsx) com todos os serviços e custos desta obra"
                >
                  {exportingServices ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  <span>Excel Serviços</span>
                </button>

                <button
                  onClick={() => handleExportProjectServices('pdf')}
                  disabled={exportingServices}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-400 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-rose-200 dark:border-rose-800"
                  title="Exportar relatório em PDF com os custos desta obra"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF Serviços</span>
                </button>

                <button
                  onClick={openAddCostModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Serviço</span>
                </button>
              </div>
            </div>

            {/* Listagem em Tabela Mobile First com overflow horizontal */}
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3">Serviço / Descrição</th>
                    <th className="p-3">Prestador / Chave Pix</th>
                    <th className="p-3 text-center">Unidade & Qtd</th>
                    <th className="p-3 text-right">Valor Unitário</th>
                    <th className="p-3 text-right">Total Orçado</th>
                    <th className="p-3 text-right">Total Real</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(!project.costs || project.costs.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs text-slate-400">
                        Nenhum custo ou prestador vinculado a este projeto ainda. Clique em "Adicionar Serviço" para orçar e vincular prestadores.
                      </td>
                    </tr>
                  ) : (
                    project.costs.map(cost => (
                      <tr key={cost.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                        <td className="p-3">
                          <span className="font-extrabold text-slate-900 dark:text-white block">
                            {cost.description}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">
                            {cost.service_type.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="p-3">
                          {cost.professional_name ? (
                            <div>
                              <strong className="text-slate-800 dark:text-slate-200 block">
                                {cost.professional_name}
                              </strong>
                              {cost.professional_pix && (
                                <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 select-all">
                                  Pix: {cost.professional_pix}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Não alocado</span>
                          )}
                        </td>

                        <td className="p-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                          {cost.quantity} {cost.unit_type.toLowerCase()}
                        </td>

                        <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-300">
                          R$ {Number(cost.unit_value).toFixed(2)}
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          R$ {Number(cost.estimated_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {Number(cost.actual_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            cost.payment_status === 'PAGO'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : cost.payment_status === 'APROVADO'
                              ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                          }`}>
                            {cost.payment_status}
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditCostModal(cost)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCost(cost.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* ── ABA 2: CHECKLIST & TAREFAS ── */}
      {activeTab === 'tasks' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-indigo-500" />
              Checklist de Tarefas do Projeto
            </h3>
            <span className="text-xs text-slate-400">
              {project.tasks.filter(t => t.is_completed).length} de {project.tasks.length} concluídas
            </span>
          </div>

          {/* Form Adicionar Tarefa */}
          <form onSubmit={handleAddTask} className="flex gap-2">
            <input
              type="text"
              placeholder="Adicionar nova tarefa... (Ex: Solicitar registro de ISBN)"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={addingTask}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-1.5 shrink-0"
            >
              {addingTask ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </form>

          {/* Lista de Tarefas */}
          <div className="space-y-2 pt-2">
            {project.tasks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhuma tarefa cadastrada neste projeto.
              </p>
            ) : (
              project.tasks.map(task => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm group"
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1 mr-2">
                    <input
                      type="checkbox"
                      checked={task.is_completed}
                      onChange={() => handleToggleTask(task.id)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className={`text-xs md:text-sm font-medium ${
                      task.is_completed
                        ? 'line-through text-slate-400 dark:text-slate-500'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {task.title}
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    {task.completed_by_name && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ {task.completed_by_name}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition rounded-md"
                      title="Excluir tarefa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── ABA 3: PROVAS & ARQUIVOS ── */}
      {activeTab === 'files' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                Provas Digitais & Arquivos Anexados
              </h3>
              <p className="text-xs text-slate-400">
                PDFs de prova, arquivos de miolo, capas e originais desta obra.
              </p>
            </div>

            <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm w-fit">
              {uploadingFile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{uploadingFile ? 'Enviando...' : 'Anexar Arquivo'}</span>
              <input
                type="file"
                className="hidden"
                disabled={uploadingFile}
                onChange={handleFileUpload}
              />
            </label>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 pt-2">
            {project.files.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                Nenhum arquivo anexado a este projeto.
              </p>
            ) : (
              project.files.map(file => (
                <div key={file.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 truncate">
                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                        {file.file_name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {(file.file_size / (1024 * 1024)).toFixed(2)} MB • {file.uploaded_by_name || 'Sistema'} • {file.created_at ? new Date(file.created_at).toLocaleDateString('pt-BR') : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={file.file_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition"
                      title="Download / Visualizar"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleDeleteFile(file.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                      title="Excluir arquivo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── ABA 4: HISTÓRICO & AUDITORIA ── */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              Linha do Tempo de Produção
            </h3>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportProjectMovements('excel')}
                disabled={exportingMovements}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:text-blue-400 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-blue-200 dark:border-blue-800"
                title="Exportar planilha Excel (.xlsx) com a timeline e movimentações"
              >
                {exportingMovements ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                <span>Excel Timeline</span>
              </button>

              <button
                onClick={() => handleExportProjectMovements('pdf')}
                disabled={exportingMovements}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-400 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-rose-200 dark:border-rose-800"
                title="Exportar PDF com a timeline e movimentações"
              >
                <Download className="w-3.5 h-3.5" />
                <span>PDF Timeline</span>
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {project.history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum histórico registrado até o momento.
              </p>
            ) : (
              project.history.map(item => (
                <div key={item.id} className="flex gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {item.user_name || 'Sistema'}
                      </span>
                      <span className="text-slate-400">
                        {new Date(item.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-slate-600 dark:text-slate-300">
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: MOVER ETAPA ── */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Mover Etapa do Projeto
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Altere o estágio de produção e registre observações no histórico.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nova Etapa
              </label>
              <select
                value={targetStageId}
                onChange={(e) => setTargetStageId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white"
              >
                {sortedStages.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name} {st.is_final ? '(Etapa de Conclusão)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Comentário para o Histórico (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Prova aprovada pelo autor, avançando para fechamento..."
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-white text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
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
          </div>
        </div>
      )}

      {/* ── MODAL: ADICIONAR / EDITAR CUSTO ── */}
      {isCostModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                <span>{editingCost ? 'Editar Custo do Projeto' : 'Adicionar Serviço / Custo'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCostModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCost} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição do Serviço *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Copydesk detalhado do miolo"
                  value={costDescription}
                  onChange={(e) => setCostDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Serviço
                  </label>
                  <select
                    value={costServiceType}
                    onChange={(e) => setCostServiceType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-semibold"
                  >
                    <option value="REVISAO">Revisão Textual / Copydesk</option>
                    <option value="DIAGRAMACAO">Diagramação & Miolo</option>
                    <option value="CAPA">Design de Capa</option>
                    <option value="ILUSTRACAO">Ilustração / Artes</option>
                    <option value="LEITURA_CRITICA">Leitura Crítica</option>
                    <option value="TRADUCAO">Tradução</option>
                    <option value="GRAFICA">Impressão Gráfica</option>
                    <option value="OUTRO">Outro Serviço</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Prestador Vinculado
                  </label>
                  <select
                    value={costProfessionalId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setCostProfessionalId(pid ? Number(pid) : '');
                      const found = professionalsList.find(p => p.id === Number(pid));
                      if (found && found.default_rate > 0) {
                        setCostUnitValue(found.default_rate);
                        if (found.rate_type) setCostUnitType(found.rate_type);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-semibold"
                  >
                    <option value="">Nenhum (A definir)</option>
                    {professionalsList.map(prof => (
                      <option key={prof.id} value={prof.id}>
                        {prof.name} ({prof.specialty})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Unidade de Medida
                  </label>
                  <select
                    value={costUnitType}
                    onChange={(e) => setCostUnitType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-semibold"
                  >
                    <option value="LAUDA">Lauda (2.100 car.)</option>
                    <option value="PAGINA">Página</option>
                    <option value="EXEMPLAR">Exemplar</option>
                    <option value="FECHADO">Valor Fechado</option>
                    <option value="HORA">Por Hora</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costQuantity}
                    onChange={(e) => setCostQuantity(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor Unitário (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costUnitValue}
                    onChange={(e) => setCostUnitValue(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Financeiro
                  </label>
                  <select
                    value={costPaymentStatus}
                    onChange={(e) => setCostPaymentStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-semibold"
                  >
                    <option value="ORCADO">Orçado</option>
                    <option value="APROVADO">Aprovado</option>
                    <option value="PAGO">Pago / Liquidado</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nota Fiscal / Recibo
                  </label>
                  <input
                    type="text"
                    placeholder="NF-e nº ou ID Pix"
                    value={costInvoiceNumber}
                    onChange={(e) => setCostInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações do Custo
                </label>
                <textarea
                  rows={2}
                  placeholder="Instruções de pagamento ou escopo acordado..."
                  value={costNotes}
                  onChange={(e) => setCostNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between">
                <span className="font-bold text-indigo-900 dark:text-indigo-200">
                  Subtotal Estimado do Item:
                </span>
                <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400 text-sm">
                  R$ {((Number(costQuantity) || 0) * (Number(costUnitValue) || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCostModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCost}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center gap-1.5 shadow-sm"
                >
                  {savingCost && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingCost ? 'Salvar Alterações' : 'Adicionar ao Orçamento'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

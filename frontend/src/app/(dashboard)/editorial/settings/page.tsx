'use client';

import { useState, useEffect } from 'react';
import { 
  ArrowLeft, Plus, Settings, Layers, ChevronUp, ChevronDown, 
  Trash2, Edit2, CheckCircle2, Clock, RefreshCw, X, Palette, Sparkles, BookOpen
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface PipelineTemplate {
  id: number;
  name: string;
  category: string;
  description?: string;
  color: string;
  stages: {
    name: string;
    sla_days: number;
    color: string;
    is_initial?: boolean;
    is_final?: boolean;
  }[];
  default_services?: {
    service_type: string;
    description: string;
    unit_type: string;
    unit_value: number;
  }[];
}

interface Stage {
  id: number;
  pipeline_id: number;
  name: string;
  description?: string;
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
}

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', 
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b'
];

export default function EditorialSettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeId, setSelectedPipeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal Novo Pipeline
  const [isPipeModalOpen, setIsPipeModalOpen] = useState(false);
  const [newPipeName, setNewPipeName] = useState('');
  const [newPipeDesc, setNewPipeDesc] = useState('');
  const [newPipeColor, setNewPipeColor] = useState('#6366f1');
  const [creatingPipe, setCreatingPipe] = useState(false);

  // Modal Nova Etapa
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3b82f6');
  const [newStageSla, setNewStageSla] = useState(7);
  const [newStageIsFinal, setNewStageIsFinal] = useState(false);
  const [creatingStage, setCreatingStage] = useState(false);

  // Edição de Etapa
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [editStageName, setEditStageName] = useState('');
  const [editStageColor, setEditStageColor] = useState('');
  const [editStageSla, setEditStageSla] = useState(0);
  const [editStageIsFinal, setEditStageIsFinal] = useState(false);
  const [savingStageEdit, setSavingStageEdit] = useState(false);

  // Galeria de Modelos Prontos
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [instantiatingId, setInstantiatingId] = useState<number | null>(null);

  const companyId = user?.company_id || 1;

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) {
      loadPipelines(u.company_id || 1);
      loadTemplates(u.company_id || 1);
    }
  }, []);

  const loadTemplates = async (cid: number) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/templates`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.log('Erro ao carregar templates');
    }
  };

  const handleInstantiateTemplate = async (templateId: number) => {
    setInstantiatingId(templateId);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/templates/${templateId}/instantiate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const created = await res.json();
        toast.success(`Fluxo "${created.name}" criado a partir do modelo!`);
        setIsTemplateModalOpen(false);
        loadPipelines(companyId);
        setSelectedPipeId(created.id);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao instanciar modelo');
      }
    } catch (e) {
      toast.error('Erro de conexão ao criar fluxo');
    } finally {
      setInstantiatingId(null);
    }
  };

  const loadPipelines = async (cid: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/pipelines`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data: Pipeline[] = await res.json();
        setPipelines(data);
        if (data.length > 0 && !selectedPipeId) {
          setSelectedPipeId(data[0].id);
        }
      }
    } catch (e) {
      toast.error('Erro ao carregar fluxos editoriais');
    } finally {
      setLoading(false);
    }
  };

  const selectedPipeline = pipelines.find(p => p.id === selectedPipeId) || pipelines[0];

  // Criar Pipeline
  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipeName.trim()) return;
    setCreatingPipe(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/pipelines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          name: newPipeName.trim(),
          description: newPipeDesc.trim() || undefined,
          color: newPipeColor
        })
      });
      if (res.ok) {
        const created = await res.json();
        toast.success('Novo fluxo editorial criado!');
        setIsPipeModalOpen(false);
        setNewPipeName('');
        setNewPipeDesc('');
        loadPipelines(companyId);
        setSelectedPipeId(created.id);
      } else {
        toast.error('Erro ao criar fluxo');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setCreatingPipe(false);
    }
  };

  // Criar Etapa
  const handleCreateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim() || !selectedPipeId) return;
    setCreatingStage(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/pipelines/${selectedPipeId}/stages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          name: newStageName.trim(),
          color: newStageColor,
          sla_days: Number(newStageSla) || 0,
          is_final: newStageIsFinal
        })
      });
      if (res.ok) {
        toast.success('Etapa adicionada com sucesso!');
        setIsStageModalOpen(false);
        setNewStageName('');
        setNewStageSla(7);
        setNewStageIsFinal(false);
        loadPipelines(companyId);
      } else {
        toast.error('Erro ao adicionar etapa');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setCreatingStage(false);
    }
  };

  // Salvar Edição da Etapa
  const handleSaveStageEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage || !editStageName.trim()) return;
    setSavingStageEdit(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/stages/${editingStage.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          name: editStageName.trim(),
          color: editStageColor,
          sla_days: Number(editStageSla) || 0,
          is_final: editStageIsFinal
        })
      });
      if (res.ok) {
        toast.success('Etapa atualizada com sucesso!');
        setEditingStage(null);
        loadPipelines(companyId);
      } else {
        toast.error('Erro ao atualizar etapa');
      }
    } catch (e) {
      toast.error('Erro de conexão');
    } finally {
      setSavingStageEdit(false);
    }
  };

  // Reordenar Etapas (Subir ou Descer)
  const handleMoveOrder = async (stageId: number, direction: 'up' | 'down') => {
    if (!selectedPipeline) return;
    const stages = [...selectedPipeline.stages].sort((a, b) => a.order_index - b.order_index);
    const idx = stages.findIndex(s => s.id === stageId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === stages.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const temp = stages[idx];
    stages[idx] = stages[targetIdx];
    stages[targetIdx] = temp;

    // Atualiza order_index
    const payload = stages.map((s, i) => ({
      stage_id: s.id,
      order_index: i
    }));

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/stages/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ stages: payload })
      });
      if (res.ok) {
        loadPipelines(companyId);
      }
    } catch (e) {
      toast.error('Erro ao salvar nova ordem');
    }
  };

  // Excluir Etapa
  const handleDeleteStage = async (stageId: number) => {
    if (!confirm('Deseja excluir esta etapa do fluxo?')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/stages/${stageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        toast.success('Etapa removida!');
        loadPipelines(companyId);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Não foi possível excluir a etapa');
      }
    } catch (e) {
      toast.error('Erro ao excluir etapa');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      
      {/* Topo / Voltar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/editorial"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao Quadro de Produção</span>
        </Link>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-sm w-fit"
          >
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>Modelos Prontos de Mercado</span>
          </button>

          <button
            onClick={() => setIsPipeModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-sm w-fit"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Fluxo de Trabalho</span>
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          Configuração de Fluxos & Etapas
        </h1>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Crie fluxos sob medida (Livro Físico, E-book, Reimpressão, Custom) e personalize as etapas e prazos de cada um.
        </p>
      </div>

      {/* Grid com Seleção de Pipeline e Gestão de Etapas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Coluna 1: Lista de Fluxos de Trabalho (Pipelines) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm h-fit">
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            Fluxos de Produção
          </h3>

          <div className="space-y-1.5">
            {pipelines.map(pipe => {
              const isSelected = pipe.id === selectedPipeId;
              return (
                <button
                  key={pipe.id}
                  onClick={() => setSelectedPipeId(pipe.id)}
                  className={`w-full p-3 rounded-xl text-left text-xs font-semibold transition flex items-center justify-between border ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm'
                      : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: pipe.color }} />
                    <span className="truncate">{pipe.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                    isSelected ? 'bg-slate-700 text-slate-200 dark:bg-slate-200 dark:text-slate-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                  }`}>
                    {pipe.stages.length} etapas
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coluna 2: Etapas do Pipeline Selecionado */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedPipeline?.color }} />
                {selectedPipeline?.name}
              </h3>
              {selectedPipeline?.description && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedPipeline.description}
                </p>
              )}
            </div>

            <button
              onClick={() => setIsStageModalOpen(true)}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 w-fit"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-500" />
              <span>Adicionar Etapa</span>
            </button>
          </div>

          {/* Lista Ordenável de Etapas */}
          <div className="space-y-2">
            {!selectedPipeline || selectedPipeline.stages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                Nenhuma etapa cadastrada neste fluxo.
              </p>
            ) : (
              [...selectedPipeline.stages].sort((a, b) => a.order_index - b.order_index).map((stage, idx, arr) => (
                <div
                  key={stage.id}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs gap-3 group"
                >
                  <div className="flex items-center gap-3">
                    {/* Botões de Reordenação */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveOrder(stage.id, 'up')}
                        disabled={idx === 0}
                        className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : ''}`}
                        title="Subir posição"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveOrder(stage.id, 'down')}
                        disabled={idx === arr.length - 1}
                        className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 ${idx === arr.length - 1 ? 'opacity-20 cursor-not-allowed' : ''}`}
                        title="Descer posição"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />

                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-slate-800 dark:text-slate-200">
                          {idx + 1}. {stage.name}
                        </strong>
                        {stage.is_final && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold">
                            Conclusão
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> SLA Previsto: {stage.sla_days} dias
                        </span>
                        <span>• Demandas nesta etapa: {stage.projects_count}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ações da Etapa */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingStage(stage);
                        setEditStageName(stage.name);
                        setEditStageColor(stage.color);
                        setEditStageSla(stage.sla_days);
                        setEditStageIsFinal(stage.is_final);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                      title="Editar etapa"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteStage(stage.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                      title="Excluir etapa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── MODAL: NOVO PIPELINE ── */}
      {isPipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Novo Fluxo de Trabalho
              </h3>
              <button onClick={() => setIsPipeModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePipeline} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nome do Fluxo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Produção de E-book, Reimpressão..."
                  value={newPipeName}
                  onChange={(e) => setNewPipeName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="Breve descrição do fluxo..."
                  value={newPipeDesc}
                  onChange={(e) => setNewPipeDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cor Identificadora</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewPipeColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${newPipeColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPipeModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingPipe}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg flex items-center gap-1.5"
                >
                  {creatingPipe && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Criar Fluxo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: NOVA ETAPA ── */}
      {isStageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Adicionar Etapa ao Fluxo
              </h3>
              <button onClick={() => setIsStageModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStage} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nome da Etapa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 1ª Revisão, Diagramação, Fechamento de Arquivo..."
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Prazo SLA Padrão (Dias)</label>
                <input
                  type="number"
                  min="0"
                  value={newStageSla}
                  onChange={(e) => setNewStageSla(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cor da Coluna</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewStageColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${newStageColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 dark:text-white block">
                    Etapa de Conclusão / Entrega
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Projetos movidos para esta etapa serão marcados como concluídos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newStageIsFinal}
                  onChange={(e) => setNewStageIsFinal(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsStageModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingStage}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg flex items-center gap-1.5"
                >
                  {creatingStage && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Etapa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR ETAPA ── */}
      {editingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Editar Etapa
              </h3>
              <button onClick={() => setEditingStage(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStageEdit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nome da Etapa *</label>
                <input
                  type="text"
                  required
                  value={editStageName}
                  onChange={(e) => setEditStageName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Prazo SLA Padrão (Dias)</label>
                <input
                  type="number"
                  min="0"
                  value={editStageSla}
                  onChange={(e) => setEditStageSla(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Cor da Coluna</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditStageColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition ${editStageColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 dark:text-white block">
                    Etapa de Conclusão / Entrega
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Projetos movidos para esta etapa serão marcados como concluídos.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editStageIsFinal}
                  onChange={(e) => setEditStageIsFinal(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStage(null)}
                  className="px-3.5 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingStageEdit}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg flex items-center gap-1.5"
                >
                  {savingStageEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: MODELOS PRONTOS DE MERCADO ── */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl p-5 md:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base md:text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Modelos Editoriais Profissionais de Mercado
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fluxos prontos com etapas, SLAs calibrados e estrutura orçamentária pré-definida.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              {templates.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  Nenhum modelo de mercado carregado.
                </p>
              ) : (
                templates.map(tmpl => (
                  <div
                    key={tmpl.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tmpl.color }} />
                          <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                            {tmpl.name}
                          </h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {tmpl.category}
                          </span>
                        </div>
                        {tmpl.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {tmpl.description}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handleInstantiateTemplate(tmpl.id)}
                        disabled={instantiatingId === tmpl.id}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 shadow-sm"
                      >
                        {instantiatingId === tmpl.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        <span>Usar Este Modelo</span>
                      </button>
                    </div>

                    {/* Badge das Etapas Incluídas */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] text-slate-400 font-semibold mr-1">Etapas:</span>
                      {tmpl.stages.map((st, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                          {st.name} ({st.sla_days}d)
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

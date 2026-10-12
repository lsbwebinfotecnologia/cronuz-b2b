'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Coffee, 
  Plus, 
  SlidersHorizontal, 
  Trash2, 
  Check, 
  X, 
  Loader2, 
  Sparkles,
  Layers,
  DollarSign
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';

interface ModifierOption {
  id: number;
  name: string;
  additional_price: number;
}

interface ModifierGroup {
  id: number;
  name: string;
  min_selectable: number;
  max_selectable: number;
  options: ModifierOption[];
}

export default function CafeteriaMenuPage() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de Criação de Grupo
  const [showModal, setShowModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [minSelectable, setMinSelectable] = useState(0);
  const [maxSelectable, setMaxSelectable] = useState(1);
  const [optionsList, setOptionsList] = useState<{ name: string; price: number }[]>([
    { name: '', price: 0 }
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const currentUser = getUser();
    if (currentUser?.company_id) {
      setCompanyId(currentUser.company_id);
    }
  }, []);

  const fetchModifiers = useCallback(async () => {
    if (!companyId) return;
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/modifiers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setGroups(await res.json());
      }
    } catch {
      toast.error('Erro ao carregar modificadores');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchModifiers();
    }
  }, [companyId, fetchModifiers]);

  const handleAddOptionField = () => {
    setOptionsList(prev => [...prev, { name: '', price: 0 }]);
  };

  const handleRemoveOptionField = (idx: number) => {
    setOptionsList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleOptionChange = (idx: number, field: 'name' | 'price', val: any) => {
    setOptionsList(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !groupName.trim()) return;

    const validOptions = optionsList
      .filter(o => o.name.trim().length > 0)
      .map(o => ({ name: o.name.trim(), additional_price: Number(o.price || 0) }));

    if (validOptions.length === 0) {
      toast.error('Adicione ao menos uma opção no grupo (ex: Leite de Aveia).');
      return;
    }

    setSubmitting(true);
    try {
      const token = getToken();
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${baseUrl}/companies/${companyId}/cafeteria/modifiers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: groupName.trim(),
          min_selectable: minSelectable,
          max_selectable: maxSelectable,
          options: validOptions
        })
      });

      if (res.ok) {
        toast.success(`Grupo '${groupName}' criado com sucesso!`);
        setShowModal(false);
        setGroupName('');
        setMinSelectable(0);
        setMaxSelectable(1);
        setOptionsList([{ name: '', price: 0 }]);
        fetchModifiers();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao criar grupo');
      }
    } catch {
      toast.error('Erro de conexão ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-600">
            <SlidersHorizontal className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Opcionais & Modificadores da Cafeteria
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Configure grupos de adicionais para bebidas e lanches (ex: tipos de leite, doses extras, caldas)
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Novo Grupo de Opcionais
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mb-3 text-amber-500" />
          <p className="text-sm font-medium">Carregando grupos de modificadores...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
          <SlidersHorizontal className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Nenhum grupo de adicionais configurado
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            Crie opções como "Tipo de Leite" (Leite Integral, Leite de Aveia +R$ 3,50), "Açúcar" ou "Adicionais" para oferecer na hora do pedido.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
          >
            Criar Primeiro Grupo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    {group.name}
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {group.min_selectable > 0 ? 'Obrigatório' : 'Opcional'} • Escolha {group.max_selectable === 1 ? 'única' : `até ${group.max_selectable}`}
                  </span>
                </div>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600">
                  {group.options?.length || 0} opções
                </span>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {group.options?.map((opt) => (
                  <div
                    key={opt.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs font-medium"
                  >
                    <span className="text-slate-700 dark:text-slate-300">{opt.name}</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {opt.additional_price > 0 ? `+ R$ ${Number(opt.additional_price).toFixed(2)}` : 'Grátis'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação de Grupo de Modificadores */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-amber-500" />
                Novo Grupo de Opcionais
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Grupo *
                </label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Ex: Tipo de Leite, Tamanho, Caldas Extras"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Seleção Mínima
                  </label>
                  <select
                    value={minSelectable}
                    onChange={(e) => setMinSelectable(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value={0}>0 (Opcional)</option>
                    <option value={1}>1 (Obrigatório escolher 1)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Seleção Máxima
                  </label>
                  <select
                    value={maxSelectable}
                    onChange={(e) => setMaxSelectable(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value={1}>1 (Escolha única - radio)</option>
                    <option value={2}>2 opções</option>
                    <option value={3}>3 opções</option>
                    <option value={5}>Até 5 opções</option>
                  </select>
                </div>
              </div>

              {/* Opções e Preços */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Opções e Valores Extras
                  </label>
                  <button
                    type="button"
                    onClick={handleAddOptionField}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar Opção
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {optionsList.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nome da opção (ex: Leite de Aveia)"
                        value={opt.name}
                        onChange={(e) => handleOptionChange(idx, 'name', e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                      <div className="w-28">
                        <CurrencyInput
                          prefixStr="R$ "
                          allowEmpty={true}
                          placeholder="0,00"
                          value={opt.price}
                          onChangeValue={(val) => handleOptionChange(idx, 'price', val)}
                          className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                      {optionsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOptionField(idx)}
                          className="p-2 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

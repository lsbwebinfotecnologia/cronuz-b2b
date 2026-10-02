'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GraduationCap, Plus, Search, Building2, Users, Calendar, 
  MapPin, Phone, Mail, ChevronRight, X, Loader2, Sparkles, Trash2
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface SchoolItem {
  id: number;
  name: string;
  corporate_name?: string;
  document: string;
  reference_code?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  classes_count: number;
  active_events_count: number;
  coordinator_name?: string;
}

export default function SchoolsPage() {
  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    corporate_name: '',
    document: '',
    reference_code: '',
    email: '',
    phone: '',
    city: '',
    state: 'SP',
    coordinator_name: '',
    initial_classes: ''
  });

  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const queryParams = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools${queryParams}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSchools(data);
      } else {
        toast.error('Não foi possível carregar as escolas.');
      }
    } catch {
      toast.error('Erro de conexão ao buscar escolas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchools();
  }, [search]);

  const handleDeleteSchool = async (schoolId: number, schoolName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a escola "${schoolName}"?\n\nEsta ação só é permitida se a escola não possuir pedidos ou eventos vinculados.`)) {
      return;
    }

    try {
      setDeletingId(schoolId);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools/${schoolId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        toast.success(`Escola "${schoolName}" removida com sucesso!`);
        fetchSchools();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Não foi possível excluir esta escola.');
      }
    } catch {
      toast.error('Erro de conexão ao tentar excluir a escola.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.document.trim()) {
      toast.error('Preencha o Nome e o CNPJ da escola.');
      return;
    }

    try {
      setSaving(true);
      const token = getToken();
      const classesArray = formData.initial_classes
        ? formData.initial_classes.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            ...formData,
            initial_classes: classesArray
          })
        }
      );

      if (res.ok) {
        toast.success('Escola cadastrada com sucesso!');
        setIsModalOpen(false);
        setFormData({
          name: '',
          corporate_name: '',
          document: '',
          reference_code: '',
          email: '',
          phone: '',
          city: '',
          state: 'SP',
          coordinator_name: '',
          initial_classes: ''
        });
        fetchSchools();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao cadastrar escola.');
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Escolas &amp; Instituições
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Gerencie instituições de ensino, turmas e eventos de passeios ou amigo secreto.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/schools/events"
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Calendar className="h-4 w-4 text-indigo-500" />
            Ver Eventos &amp; Passeios
          </Link>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm shadow-indigo-500/20 transition-all inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Cadastrar Escola
          </button>
        </div>
      </div>

      {/* Barra de Busca */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, CNPJ, código de referência..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
        />
      </div>

      {/* Conteúdo: Tabela em formato Lista */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : schools.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
          <Building2 className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Nenhuma escola cadastrada
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Cadastre sua primeira escola parceira para vincular turmas e organizar eventos literários e passeios pedagógicos.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-all inline-flex items-center gap-2 mt-2"
          >
            <Plus className="h-4 w-4" />
            Cadastrar Agora
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Escola / Instituição</th>
                  <th className="px-5 py-3.5">Código Referência</th>
                  <th className="px-5 py-3.5">Cidade / UF</th>
                  <th className="px-5 py-3.5">Coordenação</th>
                  <th className="px-5 py-3.5 text-center">Turmas</th>
                  <th className="px-5 py-3.5 text-center">Eventos</th>
                  <th className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {schools.map((school) => (
                  <tr
                    key={school.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-850/40 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <Link href={`/schools/${school.id}`} className="block">
                        <div className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {school.name}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>CNPJ: {school.document}</span>
                          {school.corporate_name && school.corporate_name !== school.name && (
                            <span className="truncate max-w-[200px]">({school.corporate_name})</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      {school.reference_code ? (
                        <span className="font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                          {school.reference_code}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                      {school.city ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>{school.city} - {school.state}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Não informada</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                      {school.coordinator_name || <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center font-medium text-slate-700 dark:text-slate-200">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        {school.classes_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-medium text-slate-700 dark:text-slate-200">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                        {school.active_events_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right flex items-center justify-end gap-2">
                      <Link
                        href={`/schools/${school.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 dark:hover:bg-indigo-950/40 dark:hover:border-indigo-800 font-semibold text-slate-600 dark:text-slate-300 transition-all"
                      >
                        Abrir
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDeleteSchool(school.id, school.name)}
                        disabled={deletingId === school.id}
                        title="Excluir Escola (caso não tenha movimentação)"
                        className="p-1.5 rounded-xl border border-red-200/60 dark:border-red-900/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 hover:border-red-300 transition-all"
                      >
                        {deletingId === school.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Cadastro de Escola */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      Cadastrar Nova Escola
                    </h3>
                    <p className="text-xs text-slate-500">
                      Cria automaticamente o registro da instituição no CRM.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSchool} className="p-6 overflow-y-auto space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome Fantasia da Escola *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Colégio Monteiro Lobato"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Código de Referência (Pesquisa)
                    </label>
                    <input
                      type="text"
                      value={formData.reference_code}
                      onChange={(e) => setFormData({ ...formData, reference_code: e.target.value })}
                      placeholder="Ex: ESC-001 ou REF-SP"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      CNPJ *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                      placeholder="00.000.000/0000-00"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Razão Social
                    </label>
                    <input
                      type="text"
                      value={formData.corporate_name}
                      onChange={(e) => setFormData({ ...formData, corporate_name: e.target.value })}
                      placeholder="Nome Empresarial Ltda"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Ex: São Paulo"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Coordenador(a) / Contato
                    </label>
                    <input
                      type="text"
                      value={formData.coordinator_name}
                      onChange={(e) => setFormData({ ...formData, coordinator_name: e.target.value })}
                      placeholder="Ex: Profa. Cristina"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      E-mail Institucional
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="contato@escola.com.br"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Telefone / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Turmas Iniciais (opcional, separadas por vírgula)
                  </label>
                  <input
                    type="text"
                    value={formData.initial_classes}
                    onChange={(e) => setFormData({ ...formData, initial_classes: e.target.value })}
                    placeholder="Ex: 1º Ano A, 2º Ano B, 5º Ano C"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Você poderá adicionar mais turmas a qualquer momento na página da escola.
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition-all inline-flex items-center gap-2"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Salvar Escola
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

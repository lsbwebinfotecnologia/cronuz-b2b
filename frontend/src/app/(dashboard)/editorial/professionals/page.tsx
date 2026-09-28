'use client';

import { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, Filter, Star, Mail, Phone, 
  CreditCard, ExternalLink, Edit2, Trash2, ArrowLeft,
  CheckCircle2, RefreshCw, X
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface Professional {
  id: number;
  company_id: number;
  name: string;
  specialty: string;
  email?: string;
  phone?: string;
  pix_key?: string;
  pix_type?: string;
  rate_type?: string;
  default_rate: number;
  rating: number;
  portfolio_url?: string;
  notes?: string;
  is_active: boolean;
  projects_count: number;
  total_paid: number;
}

const SPECIALTIES = [
  { id: 'TODAS', label: 'Todas Especialidades' },
  { id: 'REVISAO', label: 'Revisão Textual & Copydesk' },
  { id: 'DIAGRAMACAO', label: 'Diagramação & Miolo' },
  { id: 'CAPA', label: 'Design de Capa' },
  { id: 'ILUSTRACAO', label: 'Ilustração' },
  { id: 'LEITURA_CRITICA', label: 'Leitura Crítica' },
  { id: 'TRADUCAO', label: 'Tradução' },
  { id: 'GRAFICA', label: 'Impressão & Gráfica' },
  { id: 'OUTRO', label: 'Outro Serviço' },
];

export default function EditorialProfessionalsPage() {
  const [user, setUser] = useState<any>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('TODAS');

  // Modal Novo / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulário
  const [formName, setFormName] = useState('');
  const [formSpecialty, setFormSpecialty] = useState('REVISAO');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPixKey, setFormPixKey] = useState('');
  const [formPixType, setFormPixType] = useState('ALEATORIA');
  const [formRateType, setFormRateType] = useState('UNITARIO');
  const [formDefaultRate, setFormDefaultRate] = useState<number | ''>(0);
  const [formRating, setFormRating] = useState(5);
  const [formPortfolioUrl, setFormPortfolioUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const companyId = user?.company_id || 1;

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u) {
      loadProfessionals(u.company_id || 1);
    }
  }, []);

  const loadProfessionals = async (cid: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/editorial/professionals`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfessionals(data);
      }
    } catch (e) {
      toast.error('Erro ao carregar profissionais parceiros');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingProf(null);
    setFormName('');
    setFormSpecialty('REVISAO');
    setFormEmail('');
    setFormPhone('');
    setFormPixKey('');
    setFormPixType('ALEATORIA');
    setFormRateType('UNITARIO');
    setFormDefaultRate(0);
    setFormRating(5);
    setFormPortfolioUrl('');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Professional) => {
    setEditingProf(p);
    setFormName(p.name);
    setFormSpecialty(p.specialty);
    setFormEmail(p.email || '');
    setFormPhone(p.phone || '');
    setFormPixKey(p.pix_key || '');
    setFormPixType(p.pix_type || 'ALEATORIA');
    setFormRateType(p.rate_type || 'UNITARIO');
    setFormDefaultRate(p.default_rate);
    setFormRating(p.rating);
    setFormPortfolioUrl(p.portfolio_url || '');
    setFormNotes(p.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Informe o nome do profissional');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        specialty: formSpecialty,
        email: formEmail.trim() || null,
        phone: formPhone.trim() || null,
        pix_key: formPixKey.trim() || null,
        pix_type: formPixType,
        rate_type: formRateType,
        default_rate: Number(formDefaultRate) || 0,
        rating: Number(formRating) || 5,
        portfolio_url: formPortfolioUrl.trim() || null,
        notes: formNotes.trim() || null,
      };

      const url = editingProf
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/professionals/${editingProf.id}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/professionals`;

      const method = editingProf ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingProf ? 'Profissional atualizado!' : 'Profissional cadastrado!');
        setIsModalOpen(false);
        loadProfessionals(companyId);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar profissional');
      }
    } catch (e) {
      toast.error('Erro de conexão ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Professional) => {
    if (!confirm(`Deseja desativar o profissional ${p.name}?`)) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/editorial/professionals/${p.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        toast.success('Profissional removido');
        loadProfessionals(companyId);
      }
    } catch (e) {
      toast.error('Erro ao remover profissional');
    }
  };

  const filteredProfessionals = professionals.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.pix_key && p.pix_key.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesSpecialty = selectedSpecialty === 'TODAS' || p.specialty === selectedSpecialty;
    return matchesSearch && matchesSpecialty;
  });

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

        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2 shadow-sm w-fit"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Profissional</span>
        </button>
      </div>

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
          <Users className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          Profissionais & Prestadores Editoriais
        </h1>
        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Gerencie o banco de talentos (revisores, capistas, diagramadores, gráficas), histórico de demandas e dados de liquidação Pix.
        </p>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou chave Pix..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none"
          >
            {SPECIALTIES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid de Profissionais (Mobile First) */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Carregando profissionais...</span>
        </div>
      ) : filteredProfessionals.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <Users className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200">Nenhum profissional encontrado</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Cadastre os revisores, capistas e diagramadores que atuam nas publicações da sua editora.
          </p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition"
          >
            Cadastrar Primeiro Profissional
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProfessionals.map(prof => (
            <div
              key={prof.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    {prof.specialty.replace('_', ' ')}
                  </span>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {prof.name}
                  </h3>
                </div>

                <div className="flex items-center gap-1 text-amber-500 font-bold text-xs bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{prof.rating}.0</span>
                </div>
              </div>

              {/* Informações de Contato & Pix */}
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 pt-1">
                {prof.email && (
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{prof.email}</span>
                  </div>
                )}
                {prof.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{prof.phone}</span>
                  </div>
                )}
                {prof.pix_key && (
                  <div className="flex items-center gap-2 truncate bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono text-[11px] truncate select-all">{prof.pix_key}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded font-bold uppercase ml-auto">
                      Pix
                    </span>
                  </div>
                )}
              </div>

              {/* Estatísticas de Demandas */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block">Projetos</span>
                  <strong className="text-slate-900 dark:text-white text-xs">{prof.projects_count} demandas</strong>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                  <span className="text-slate-400 block">Total Liquidado</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 text-xs">
                    R$ {Number(prof.total_paid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                {prof.portfolio_url ? (
                  <a
                    href={prof.portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    <span>Portfólio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : <span />}

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(prof)}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(prof)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                    title="Desativar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar / Editar Profissional */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                {editingProf ? 'Editar Profissional' : 'Novo Prestador Editorial'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo / Empresa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ana Clara Revisões"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Especialidade Principal *
                  </label>
                  <select
                    value={formSpecialty}
                    onChange={(e) => setFormSpecialty(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none"
                  >
                    <option value="REVISAO">Revisão Textual & Copydesk</option>
                    <option value="DIAGRAMACAO">Diagramação & Miolo</option>
                    <option value="CAPA">Design de Capa</option>
                    <option value="ILUSTRACAO">Ilustração</option>
                    <option value="LEITURA_CRITICA">Leitura Crítica</option>
                    <option value="TRADUCAO">Tradução</option>
                    <option value="GRAFICA">Impressão & Gráfica</option>
                    <option value="OUTRO">Outro Serviço</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Avaliação Técnica (1 a 5)
                  </label>
                  <select
                    value={formRating}
                    onChange={(e) => setFormRating(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none"
                  >
                    <option value={5}>⭐⭐⭐⭐⭐ (Excelente)</option>
                    <option value={4}>⭐⭐⭐⭐ (Muito Bom)</option>
                    <option value={3}>⭐⭐⭐ (Bom)</option>
                    <option value={2}>⭐⭐ (Regular)</option>
                    <option value={1}>⭐ (Atenção)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="contato@prestador.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp / Telefone
                  </label>
                  <input
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Chave Pix para Pagamento
                  </label>
                  <input
                    type="text"
                    placeholder="CPF, CNPJ, E-mail ou Aleatória"
                    value={formPixKey}
                    onChange={(e) => setFormPixKey(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tipo de Chave Pix
                  </label>
                  <select
                    value={formPixType}
                    onChange={(e) => setFormPixType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none"
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="TELEFONE">Telefone</option>
                    <option value="ALEATORIA">Chave Aleatória (EVP)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cobrança Base
                  </label>
                  <select
                    value={formRateType}
                    onChange={(e) => setFormRateType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none"
                  >
                    <option value="PAGINA">Por Página (Diagramação)</option>
                    <option value="LAUDA">Por Lauda (2.100 carac.)</option>
                    <option value="EXEMPLAR">Por Exemplar (Gráfica)</option>
                    <option value="FECHADO">Valor Fechado / Projeto</option>
                    <option value="HORA">Por Hora</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Valor Padrão (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formDefaultRate}
                    onChange={(e) => setFormDefaultRate(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link de Portfólio / Behance / Lattes
                </label>
                <input
                  type="url"
                  placeholder="https://behance.net/..."
                  value={formPortfolioUrl}
                  onChange={(e) => setFormPortfolioUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Anotações / Termos Negociados
                </label>
                <textarea
                  rows={2}
                  placeholder="Prazo médio de entrega, estilo preferido..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition flex items-center gap-2 shadow-sm"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{editingProf ? 'Salvar Alterações' : 'Cadastrar Prestador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
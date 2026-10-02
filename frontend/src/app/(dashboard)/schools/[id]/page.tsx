'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Building2, GraduationCap, MapPin, Phone, Mail, Users, Plus, 
  ChevronLeft, Calendar, Loader2, Sparkles, X, CheckCircle2, Ticket, Edit3, Save, Trash2,
  CalendarDays, Target, Copy, Check, ExternalLink
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id as string;

  const [school, setSchool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassShift, setNewClassShift] = useState('MANHA');
  const [savingClass, setSavingClass] = useState(false);

  // Agendamento de Eventos para esta Escola
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [templateEvents, setTemplateEvents] = useState<any[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleCopied, setScheduleCopied] = useState(false);
  const [createdEventResult, setCreatedEventResult] = useState<any | null>(null);
  const [scheduleFormData, setScheduleFormData] = useState({
    parent_event_id: '',
    title: '',
    event_type: 'PASSEIO',
    start_date: '',
    end_date: '',
    location_destination: '',
    price: 0,
    showcase_id: '',
    description: ''
  });

  // Modal Única de Edição Completa da Escola
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editFormData, setEditFormData] = useState({
    // Pedagógico
    coordinator_name: '',
    principal_name: '',
    inep_code: '',
    reference_code: '',
    pedagogical_contact_phone: '',
    pedagogical_contact_email: '',
    notes: '',
    // Cadastral
    name: '',
    corporate_name: '',
    phone: '',
    email: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: ''
  });

  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  const fetchSchoolDetail = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools/${schoolId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSchool(data);
      } else {
        toast.error('Escola não encontrada.');
        router.push('/schools');
      }
    } catch {
      toast.error('Erro de conexão ao buscar dados da escola.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const templates = data.filter((e: any) => e.is_template);
        setTemplateEvents(templates);
      }
    } catch {
      // Ignora falha silenciosa de templates
    }
  };

  useEffect(() => {
    fetchSchoolDetail();
    fetchTemplates();
  }, [schoolId]);

  const openScheduleModal = () => {
    setCreatedEventResult(null);
    setScheduleCopied(false);
    setScheduleFormData({
      parent_event_id: '',
      title: '',
      event_type: 'PASSEIO',
      start_date: '',
      end_date: '',
      location_destination: '',
      price: 0,
      showcase_id: '',
      description: ''
    });
    setIsScheduleModalOpen(true);
  };

  const handleSelectTemplateForSchool = (tplId: string) => {
    if (!tplId) {
      setScheduleFormData((prev) => ({ ...prev, parent_event_id: '' }));
      return;
    }
    const t = templateEvents.find((item) => String(item.id) === tplId);
    if (!t) {
      setScheduleFormData((prev) => ({ ...prev, parent_event_id: tplId }));
      return;
    }
    setScheduleFormData((prev) => ({
      ...prev,
      parent_event_id: tplId,
      title: t.title,
      event_type: t.event_type,
      location_destination: t.location_destination || '',
      price: t.price || 0,
      showcase_id: t.showcase_id ? String(t.showcase_id) : '',
      description: t.description || ''
    }));
  };

  const handleScheduleEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleFormData.title.trim()) {
      toast.error('Informe o título do evento.');
      return;
    }

    try {
      setSavingSchedule(true);
      const token = getToken();
      const payload: Record<string, any> = {
        title: scheduleFormData.title.trim(),
        slug: `${scheduleFormData.title.trim()}-${school?.name || 'escola'}`.substring(0, 80),
        event_type: scheduleFormData.event_type,
        school_customer_id: parseInt(schoolId),
        parent_event_id: scheduleFormData.parent_event_id ? parseInt(scheduleFormData.parent_event_id) : null,
        showcase_id: scheduleFormData.showcase_id ? parseInt(scheduleFormData.showcase_id) : null,
        location_destination: scheduleFormData.location_destination || null,
        description: scheduleFormData.description || null,
        start_date: scheduleFormData.start_date ? new Date(scheduleFormData.start_date + 'T00:00:00').toISOString() : null,
        end_date: scheduleFormData.end_date ? new Date(scheduleFormData.end_date + 'T23:59:59').toISOString() : null,
        price: Number(scheduleFormData.price) || 0,
        status: 'OPEN',
        is_template: false,
        rules_config: {
          allow_wishlist: true,
          school_delivery: true
        }
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );

      if (res.ok) {
        const createdEvt = await res.json();
        setCreatedEventResult(createdEvt);
        toast.success(`Evento agendado com sucesso para ${school?.name}!`);
        fetchSchoolDetail();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao agendar evento.');
      }
    } catch {
      toast.error('Erro de conexão ao agendar evento.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const openEditModal = () => {
    if (!school) return;
    setEditFormData({
      coordinator_name: school.detail?.coordinator_name || '',
      principal_name: school.detail?.principal_name || '',
      inep_code: school.detail?.inep_code || '',
      reference_code: school.detail?.reference_code || '',
      pedagogical_contact_phone: school.detail?.pedagogical_contact_phone || '',
      pedagogical_contact_email: school.detail?.pedagogical_contact_email || '',
      notes: school.detail?.notes || '',
      name: school.name || '',
      corporate_name: school.corporate_name || '',
      phone: school.phone || '',
      email: school.email || '',
      street: school.address?.street || '',
      number: school.address?.number || '',
      neighborhood: school.address?.neighborhood || '',
      city: school.address?.city || '',
      state: school.address?.state || 'SP',
      zip_code: school.address?.zip_code || ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingEdit(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools/${schoolId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(editFormData)
        }
      );

      if (res.ok) {
        toast.success('Dados da escola atualizados com sucesso!');
        setIsEditModalOpen(false);
        fetchSchoolDetail();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao atualizar dados.');
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    try {
      setSavingClass(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools/${schoolId}/classes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: newClassName.trim(),
            shift: newClassShift,
            academic_year: new Date().getFullYear()
          })
        }
      );

      if (res.ok) {
        toast.success('Turma adicionada com sucesso!');
        setNewClassName('');
        setIsClassModalOpen(false);
        fetchSchoolDetail();
      } else {
        toast.error('Erro ao adicionar turma.');
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setSavingClass(false);
    }
  };

  const [deletingSchool, setDeletingSchool] = useState(false);

  const handleDeleteSchool = async () => {
    if (!school) return;
    if (!window.confirm(`Tem certeza que deseja excluir a escola "${school.name}"?\n\nEsta ação só é permitida se a escola não possuir pedidos ou eventos vinculados.`)) {
      return;
    }

    try {
      setDeletingSchool(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/schools/${schoolId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        toast.success(`Escola "${school.name}" removida com sucesso!`);
        router.push('/schools');
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Não foi possível excluir esta escola.');
      }
    } catch {
      toast.error('Erro de conexão ao tentar excluir a escola.');
    } finally {
      setDeletingSchool(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!school) return null;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Botão Voltar */}
      <Link
        href="/schools"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para Escolas
      </Link>

      {/* Header com dados principais */}
      <div className="p-6 md:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 shrink-0">
            <Building2 className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">
                {school.name}
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                CNPJ: {school.document}
              </span>
            </div>
            {school.corporate_name && (
              <p className="text-xs text-slate-400">{school.corporate_name}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-2 flex-wrap">
              {school.address?.city && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  <span>{school.address.street ? `${school.address.street}, ` : ''}{school.address.city} - {school.address.state}</span>
                </div>
              )}
              {school.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>{school.phone}</span>
                </div>
              )}
              {school.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>{school.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={openScheduleModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs md:text-sm font-semibold transition-all inline-flex items-center gap-2 shadow-sm shadow-indigo-500/20"
          >
            <CalendarDays className="h-4 w-4" />
            Agendar Evento
          </button>
          <Link
            href={`/schools/events?school_id=${school.id}`}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs md:text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Ticket className="h-4 w-4 text-indigo-500" />
            Ver Eventos ({school.events?.length || 0})
          </Link>
          <button
            onClick={openEditModal}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs md:text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Edit3 className="h-4 w-4 text-indigo-500" />
            Editar Dados
          </button>
          <button
            onClick={() => setIsClassModalOpen(true)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs md:text-sm font-semibold transition-all inline-flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nova Turma
          </button>
          <button
            onClick={handleDeleteSchool}
            disabled={deletingSchool}
            title="Excluir Escola (caso não tenha movimentação)"
            className="px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs md:text-sm font-semibold transition-all inline-flex items-center gap-1.5"
          >
            {deletingSchool ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Excluir Escola
          </button>
        </div>
      </div>

      {/* Grid: Informações Pedagógicas & Turmas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de Detalhes Pedagógicos */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              Contato Pedagógico
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            {school.detail?.reference_code && (
              <div>
                <span className="text-slate-400 block mb-0.5">Código de Referência</span>
                <span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-xs border border-indigo-200/50 dark:border-indigo-800/50">
                  {school.detail.reference_code}
                </span>
              </div>
            )}
            <div>
              <span className="text-slate-400 block mb-0.5">Coordenador(a) Responsável</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {school.detail?.coordinator_name || 'Não informado'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Diretor(a)</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {school.detail?.principal_name || 'Não informado'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Código INEP</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {school.detail?.inep_code || 'Não informado'}
              </span>
            </div>
            {school.detail?.notes && (
              <div>
                <span className="text-slate-400 block mb-0.5">Observações</span>
                <p className="text-slate-600 dark:text-slate-300 whitespace-pre-line bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  {school.detail.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Lista de Turmas */}
        <div className="lg:col-span-2 p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-500" />
              Turmas Cadastradas ({school.classes?.length || 0})
            </h2>
            <button
              onClick={() => setIsClassModalOpen(true)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>

          {school.classes?.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
              <p className="text-xs text-slate-500">Nenhuma turma cadastrada para esta escola.</p>
              <button
                onClick={() => setIsClassModalOpen(true)}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Cadastrar primeira turma
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {school.classes.map((cls: any) => (
                <div
                  key={cls.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between"
                >
                  <div>
                    <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                      {cls.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Turno: {cls.shift === 'MANHA' ? 'Manhã' : cls.shift === 'TARDE' ? 'Tarde' : 'Integral'} • Ano {cls.academic_year}
                    </p>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Nova Turma */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">Adicionar Nova Turma</h3>
              <button onClick={() => setIsClassModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddClass} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nome da Turma / Série *
                </label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="Ex: 5º Ano B"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Turno
                </label>
                <select
                  value={newClassShift}
                  onChange={(e) => setNewClassShift(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="MANHA">Manhã</option>
                  <option value="TARDE">Tarde</option>
                  <option value="INTEGRAL">Integral</option>
                  <option value="NOITE">Noite</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-2"
                >
                  {savingClass ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Salvar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Única de Edição Completa da Escola */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">Editar Escola</h3>
                  <p className="text-xs text-slate-400">Atualize os dados cadastrais, institucionais e pedagógicos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-6 overflow-y-auto pr-1.5 flex-1">
              {/* Seção 1: Dados Cadastrais & Contato Geral */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <Building2 className="h-4 w-4" />
                  <span>Dados Cadastrais & Contato Geral</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nome Fantasia *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      placeholder="Ex: Colégio Futuro"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Razão Social
                    </label>
                    <input
                      type="text"
                      value={editFormData.corporate_name}
                      onChange={(e) => setEditFormData({ ...editFormData, corporate_name: e.target.value })}
                      placeholder="Ex: Colégio Futuro Ltda"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Telefone Geral
                    </label>
                    <input
                      type="text"
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      placeholder="(11) 3333-4444"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      E-mail Geral
                    </label>
                    <input
                      type="email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      placeholder="contato@colegiofuturo.com.br"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                {/* Localização */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Endereço & Localização
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Logradouro / Rua</label>
                      <input
                        type="text"
                        value={editFormData.street}
                        onChange={(e) => setEditFormData({ ...editFormData, street: e.target.value })}
                        placeholder="Ex: Av. Paulista"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Número</label>
                      <input
                        type="text"
                        value={editFormData.number}
                        onChange={(e) => setEditFormData({ ...editFormData, number: e.target.value })}
                        placeholder="Ex: 1000"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Bairro</label>
                      <input
                        type="text"
                        value={editFormData.neighborhood}
                        onChange={(e) => setEditFormData({ ...editFormData, neighborhood: e.target.value })}
                        placeholder="Ex: Bela Vista"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cidade</label>
                      <input
                        type="text"
                        value={editFormData.city}
                        onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                        placeholder="Ex: São Paulo"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">UF</label>
                      <input
                        type="text"
                        maxLength={2}
                        value={editFormData.state}
                        onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value.toUpperCase() })}
                        placeholder="SP"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção 2: Contato & Informações Pedagógicas */}
              <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <Users className="h-4 w-4" />
                  <span>Contato & Informações Pedagógicas</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Código de Referência (Pesquisa)</label>
                    <input
                      type="text"
                      value={editFormData.reference_code}
                      onChange={(e) => setEditFormData({ ...editFormData, reference_code: e.target.value })}
                      placeholder="Ex: ESC-001"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Código INEP</label>
                    <input
                      type="text"
                      value={editFormData.inep_code}
                      onChange={(e) => setEditFormData({ ...editFormData, inep_code: e.target.value })}
                      placeholder="Ex: 35123456"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Coordenador(a) Responsável</label>
                    <input
                      type="text"
                      value={editFormData.coordinator_name}
                      onChange={(e) => setEditFormData({ ...editFormData, coordinator_name: e.target.value })}
                      placeholder="Ex: Profa. Cristina"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Diretor(a)</label>
                    <input
                      type="text"
                      value={editFormData.principal_name}
                      onChange={(e) => setEditFormData({ ...editFormData, principal_name: e.target.value })}
                      placeholder="Ex: Prof. Carlos"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tel / Celular Pedagógico</label>
                    <input
                      type="text"
                      value={editFormData.pedagogical_contact_phone}
                      onChange={(e) => setEditFormData({ ...editFormData, pedagogical_contact_phone: e.target.value })}
                      placeholder="(11) 98888-7777"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">E-mail Pedagógico</label>
                    <input
                      type="email"
                      value={editFormData.pedagogical_contact_email}
                      onChange={(e) => setEditFormData({ ...editFormData, pedagogical_contact_email: e.target.value })}
                      placeholder="pedagogico@escola.com.br"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Observações Pedagógicas</label>
                  <textarea
                    rows={3}
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                    placeholder="Instruções internas, acordos pedagógicos ou datas especiais..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-500 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-sm"
                >
                  {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Agendar Evento para esta Escola */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 md:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Agendar Evento para a Escola
                  </h3>
                  <p className="text-xs text-slate-500">
                    {school?.name} • Gere um link de inscrição exclusivo amarrado à instituição.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {createdEventResult ? (
              /* Sucesso: Exibição do Link Exclusivo Gerado */
              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-center space-y-2">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">
                    Evento Agendado com Sucesso!
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 max-w-sm mx-auto">
                    O link exclusivo de inscrição para <b>{school?.name}</b> já está ativo e pronto para ser enviado aos pais e responsáveis.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Link Exclusivo de Inscrição da Escola:
                  </label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      readOnly
                      value={
                        typeof window !== 'undefined'
                          ? `${window.location.origin}/public/eventos/${createdEventResult.slug}`
                          : `/public/eventos/${createdEventResult.slug}`
                      }
                      className="w-full bg-transparent text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none select-all"
                    />
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/public/eventos/${createdEventResult.slug}`;
                        navigator.clipboard.writeText(url);
                        setScheduleCopied(true);
                        toast.success('Link copiado com sucesso!');
                        setTimeout(() => setScheduleCopied(false), 2500);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5"
                    >
                      {scheduleCopied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                      {scheduleCopied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                  <a
                    href={`/public/eventos/${createdEventResult.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Visualizar Página
                  </a>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCreatedEventResult(null);
                        setIsScheduleModalOpen(false);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-xs font-semibold transition-all"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Formulário de Agendamento */
              <form onSubmit={handleScheduleEvent} className="p-5 md:p-6 overflow-y-auto space-y-4">
                {/* Seletor de Modelo Existente */}
                {templateEvents.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-900/50 space-y-1.5">
                    <label className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-purple-600" />
                      Escolher Modelo de Evento (Template)
                    </label>
                    <select
                      value={scheduleFormData.parent_event_id}
                      onChange={(e) => handleSelectTemplateForSchool(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      <option value="">Selecione um modelo base ou crie avulso...</option>
                      {templateEvents.map((t) => (
                        <option key={t.id} value={t.id}>
                          🎯 {t.title} ({t.event_type})
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-purple-700/80 dark:text-purple-400">
                      Ao selecionar um modelo, a apresentação visual, banners e vitrines serão herdados automaticamente.
                    </p>
                  </div>
                )}

                {/* Título do Evento */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Título do Evento nesta Escola *
                  </label>
                  <input
                    type="text"
                    required
                    value={scheduleFormData.title}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, title: e.target.value })}
                    placeholder="Ex: Passeio Cultural 2026 - Museu Catavento"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Tipo de Ação */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Tipo de Ação
                  </label>
                  <select
                    value={scheduleFormData.event_type}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, event_type: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="PASSEIO">🚌 Passeio Escolar</option>
                    <option value="AMIGO_SECRETO">🎁 Amigo Secreto</option>
                    <option value="FEIRA_LIVRO">📚 Feira do Livro</option>
                    <option value="EVENTO_GERAL">🎪 Outro Evento</option>
                  </select>
                </div>

                {/* Datas: Início e Fim */}
                <div className="p-3.5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    Período para esta Escola (Pode alterar a qualquer momento)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Data de Início
                      </label>
                      <input
                        type="date"
                        value={scheduleFormData.start_date}
                        onChange={(e) => setScheduleFormData({ ...scheduleFormData, start_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Data de Encerramento (Expiração)
                      </label>
                      <input
                        type="date"
                        value={scheduleFormData.end_date}
                        onChange={(e) => setScheduleFormData({ ...scheduleFormData, end_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Destino */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Local / Destino (Opcional)
                  </label>
                  <input
                    type="text"
                    value={scheduleFormData.location_destination}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, location_destination: e.target.value })}
                    placeholder="Ex: Aquário de SP, Planetário..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Observações aos Pais / Instruções
                  </label>
                  <textarea
                    rows={2}
                    value={scheduleFormData.description}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, description: e.target.value })}
                    placeholder="Orientações específicas para os alunos e famílias desta escola..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsScheduleModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-slate-500 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingSchedule}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all inline-flex items-center gap-2 shadow-sm"
                  >
                    {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Agendar Evento &amp; Gerar Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

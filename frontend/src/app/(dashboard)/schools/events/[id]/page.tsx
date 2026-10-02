'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Ticket, Calendar, Users, Building2, Gift, MapPin, ChevronLeft, 
  ExternalLink, Copy, Check, Share2, Shuffle, CheckCircle2, 
  Clock, Package, Tag, Loader2, Sparkles, AlertCircle, ShoppingBag, Trash2, Edit3, X
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [expedition, setExpedition] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'participants' | 'expedition'>('participants');
  const [drawing, setDrawing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isEditDatesModalOpen, setIsEditDatesModalOpen] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [savingDates, setSavingDates] = useState(false);

  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  const fetchEventData = async () => {
    try {
      setLoading(true);
      const token = getToken();
      // 1. Dados do evento
      const resEvt = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resEvt.ok) {
        setEvent(await resEvt.json());
      } else {
        toast.error('Evento não encontrado.');
        router.push('/schools/events');
        return;
      }

      // 2. Participantes
      const resPart = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}/participants`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resPart.ok) {
        setParticipants(await resPart.json());
      }

      // 3. Expedição
      const resExp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}/expedition`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resExp.ok) {
        setExpedition(await resExp.json());
      }
    } catch {
      toast.error('Erro ao carregar dados do evento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventData();
  }, [eventId]);

  const handlePerformDraw = async () => {
    if (participants.length < 2) {
      toast.error('É necessário ao menos 2 participantes para realizar o sorteio.');
      return;
    }

    if (!confirm('Deseja realmente realizar o sorteio do Amigo Secreto? Os pares serão gerados e os pais poderão visualizar quem tiraram.')) {
      return;
    }

    try {
      setDrawing(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}/draw?by_class=true`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Sorteio realizado com sucesso!');
        fetchEventData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao realizar sorteio.');
      }
    } catch {
      toast.error('Erro de conexão ao realizar sorteio.');
    } finally {
      setDrawing(false);
    }
  };

  const handleCopyPublicLink = () => {
    const publicUrl = `${window.location.origin}/public/eventos/${event?.slug}`;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    toast.success('Link de inscrição copiado!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const publicUrl = `${window.location.origin}/public/eventos/${event?.slug}`;
    const text = `Olá! Estão abertas as inscrições para o evento *${event?.title}*! Cadastre seu filho e participe através do link: ${publicUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const [deletingEvent, setDeletingEvent] = useState(false);

  const handleDeleteEvent = async () => {
    if (!event) return;
    if (!window.confirm(`Tem certeza que deseja excluir o evento "${event.title}"?\n\nEsta ação só é permitida se o evento não possuir pedidos ou compras de livros/presentes finalizadas.`)) {
      return;
    }

    try {
      setDeletingEvent(true);
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (res.ok) {
        toast.success(`Evento "${event.title}" excluído com sucesso!`);
        router.push('/schools/events');
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Não foi possível excluir o evento.');
      }
    } catch {
      toast.error('Erro de conexão ao tentar excluir o evento.');
    } finally {
      setDeletingEvent(false);
    }
  };

  const openEditDatesModal = () => {
    if (!event) return;
    setEditStartDate(event.start_date ? event.start_date.split('T')[0] : '');
    setEditEndDate(event.end_date ? event.end_date.split('T')[0] : '');
    setIsEditDatesModalOpen(true);
  };

  const handleSaveDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    try {
      setSavingDates(true);
      const token = getToken();
      const payload = {
        title: event.title,
        slug: event.slug,
        event_type: event.event_type,
        school_customer_id: event.school_customer_id,
        showcase_id: event.showcase_id,
        location_destination: event.location_destination,
        description: event.description,
        start_date: editStartDate ? new Date(editStartDate + 'T00:00:00').toISOString() : null,
        end_date: editEndDate ? new Date(editEndDate + 'T23:59:59').toISOString() : null,
        price: event.price || 0,
        banner_url: event.banner_url || null,
        logo_url: event.logo_url || null,
        content_html: event.content_html || null,
        is_template: event.is_template,
        parent_event_id: event.parent_event_id
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );

      if (res.ok) {
        toast.success('Datas do evento atualizadas com sucesso!');
        setIsEditDatesModalOpen(false);
        fetchEventData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao atualizar datas do evento.');
      }
    } catch {
      toast.error('Erro de conexão com o servidor.');
    } finally {
      setSavingDates(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Botão Voltar */}
      <Link
        href="/schools/events"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para Eventos
      </Link>

      {/* Header do Evento */}
      <div className="p-6 md:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              {event.event_type === 'AMIGO_SECRETO' ? '🎁 Amigo Secreto' : '🚌 Passeio Escolar'}
            </span>
            <span className="text-xs font-medium text-slate-400">
              {event.school_name ? `Escola: ${event.school_name}` : 'Aberto para todas as escolas'}
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            {event.title}
          </h1>

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 py-1 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl font-medium">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <span>
                <strong>Início:</strong> {event.start_date ? new Date(event.start_date).toLocaleDateString('pt-BR') : 'Imediato'}
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span>
                <strong>Encerramento:</strong> {event.end_date ? new Date(event.end_date).toLocaleDateString('pt-BR') : 'Sem término previsto'}
              </span>
              <button
                type="button"
                onClick={openEditDatesModal}
                title="Alterar datas de início ou encerramento"
                className="ml-2 px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold transition-all inline-flex items-center gap-1 border border-indigo-200/60 dark:border-indigo-800"
              >
                <Edit3 className="h-3 w-3" />
                Alterar
              </button>
            </div>
            {event.location_destination && (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>{event.location_destination}</span>
              </div>
            )}
          </div>

          {event.description && (
            <p className="text-xs md:text-sm text-slate-500 max-w-2xl">
              {event.description}
            </p>
          )}

          {/* Links e Compartilhamento */}
          <div className="pt-2 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleCopyPublicLink}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
            >
              {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedLink ? 'Copiado!' : 'Copiar Link de Inscrição'}
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartilhar no WhatsApp
            </button>

            <a
              href={`/public/eventos/${event.slug}`}
              target="_blank"
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver Página Pública
            </a>

            <button
              onClick={handleDeleteEvent}
              disabled={deletingEvent}
              title="Excluir Evento (caso não tenha movimentação/pedidos)"
              className="px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold transition-all inline-flex items-center gap-1.5"
            >
              {deletingEvent ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Excluir Evento
            </button>
          </div>
        </div>

        {/* Ação de Sorteio */}
        {event.event_type === 'AMIGO_SECRETO' && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                {event.draw_performed_at ? '✅ Sorteio Realizado' : '⏳ Sorteio Pendente'}
              </span>
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {event.draw_performed_at 
                  ? 'Os pais já podem abrir o link mágico e comprar.' 
                  : `${participants.length} alunos inscritos até o momento.`}
              </p>
            </div>

            <button
              onClick={handlePerformDraw}
              disabled={drawing}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shadow-amber-500/20 inline-flex items-center gap-2 whitespace-nowrap"
            >
              {drawing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
              {event.draw_performed_at ? 'Sortear Novamente' : 'Realizar Sorteio Agora'}
            </button>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('participants')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all inline-flex items-center gap-2 ${
            activeTab === 'participants'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="h-4 w-4" />
          Participantes Inscritos ({participants.length})
        </button>

        {event.event_type === 'AMIGO_SECRETO' && (
          <button
            onClick={() => setActiveTab('expedition')}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all inline-flex items-center gap-2 ${
              activeTab === 'expedition'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Package className="h-4 w-4" />
            Expedição &amp; Entrega na Escola ({expedition?.total_purchased || 0}/{participants.length})
          </button>
        )}
      </div>

      {/* Conteúdo Aba Participantes */}
      {activeTab === 'participants' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-4">Aluno(a)</th>
                  <th className="p-4">Turma</th>
                  <th className="p-4">Responsável Legal</th>
                  <th className="p-4">Gostos Literários</th>
                  {event.event_type === 'AMIGO_SECRETO' && <th className="p-4">Quem Tirou</th>}
                  {event.event_type === 'AMIGO_SECRETO' && <th className="p-4">Status Compra</th>}
                  <th className="p-4 text-right">Link Mágico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Nenhum participante inscrito ainda. Compartilhe o link de inscrição com a escola e os pais!
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          {p.student_name}
                        </span>
                        {p.character_name && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded-md mt-0.5 border border-purple-200/50 dark:border-purple-800/50">
                            🎭 {p.character_name}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-slate-600 dark:text-slate-300">
                        {p.class_name || 'Geral'}
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-slate-800 dark:text-slate-200 block">{p.parent_name}</span>
                        <span className="text-[11px] text-slate-400">CPF: {p.parent_cpf} • {p.parent_phone}</span>
                      </td>
                      <td className="p-4">
                        {p.wishlist_preferences?.genres?.length ? (
                          <div className="flex gap-1 flex-wrap">
                            {p.wishlist_preferences.genres.map((g: string, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {g}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">Sem preferências</span>
                        )}
                      </td>
                      {event.event_type === 'AMIGO_SECRETO' && (
                        <td className="p-4">
                          {p.assigned_student_name ? (
                            <div>
                              <span className="font-semibold text-indigo-600 dark:text-indigo-400 block">
                                {p.assigned_student_name}
                              </span>
                              {p.assigned_character_name && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200/50 dark:border-purple-800/50">
                                  🎭 {p.assigned_character_name}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Aguardando sorteio</span>
                          )}
                        </td>
                      )}
                      {event.event_type === 'AMIGO_SECRETO' && (
                        <td className="p-4">
                          {p.gift_status === 'PURCHASED' || p.gift_status === 'PACKED_READY' || p.gift_status === 'DELIVERED_TO_SCHOOL' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> Livro Comprado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                              <Clock className="h-3 w-3" /> Pendente
                            </span>
                          )}
                        </td>
                      )}
                      <td className="p-4 text-right">
                        <button
                          onClick={() => {
                            const link = `${window.location.origin}/amigo-secreto/${p.access_token}`;
                            navigator.clipboard.writeText(link);
                            toast.success(`Link mágico copiado para ${p.parent_name}!`);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-semibold transition-colors"
                        >
                          Copiar Link
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conteúdo Aba Expedição */}
      {activeTab === 'expedition' && expedition && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Relação de Presentes para Entrega na Escola
              </h3>
              <p className="text-xs text-slate-500">
                Cada presente embalado deve conter a etiqueta com o nome da criança e turma.
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Imprimir Etiquetas
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expedition.items.map((item: any) => (
              <div
                key={item.participant_id}
                className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    Turma: {item.class_name}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.order_id ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {item.order_id ? `Pedido #${item.order_id}` : 'Não Comprado'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Para o Aluno(a):</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-base text-slate-900 dark:text-white">
                      {item.student_name}
                    </h4>
                    {item.character_name && (
                      <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200/50 dark:border-purple-800/50">
                        🎭 {item.character_name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2 space-y-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Livro Escolhido / Comprado:</span>
                    {item.items?.length ? (
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.items[0].name}
                      </span>
                    ) : (
                      <span className="text-amber-500 italic">Aguardando compra pelo amigo secreto</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Comprado por:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {item.giver_student_name || item.giver_parent_name || '—'}
                    </span>
                    {item.giver_character_name && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200/50 dark:border-purple-800/50 ml-1.5">
                        🎭 {item.giver_character_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Alterar Datas */}
      {isEditDatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Alterar Datas do Evento</h3>
                  <p className="text-[11px] text-slate-400">Ajuste o período de início e encerramento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDatesModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDates} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Data de Início
                </label>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <span className="text-[10px] text-slate-400 block">Deixe em branco para início imediato.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Data de Encerramento (Expiração)
                </label>
                <input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <span className="text-[10px] text-slate-400 block">Data limite para inscrições e participação dos pais.</span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditDatesModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDates}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all inline-flex items-center gap-2 shadow-sm shadow-indigo-500/20 disabled:opacity-50"
                >
                  {savingDates && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Salvar Novas Datas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

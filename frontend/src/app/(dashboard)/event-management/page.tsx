'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  DoorOpen,
  Edit3,
  History,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import EventManagementPinnedNavBar, {
  EventosInternalTab,
} from '@/components/EventManagementPinnedNavBar';
import { CurrencyInput } from '@/components/CurrencyInput';
import { getToken } from '@/lib/auth';
import { formatBrPhoneMask, validateBrPhoneClient } from '@/lib/br_phone';
import { getImageUrl } from '@/lib/image_helper';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function formatDateBr(iso?: string | null) {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  if (clean.includes('-')) return clean.split('-').reverse().join('/');
  return clean;
}

function getEventStatusBadge(st: string) {
  switch (st) {
    case 'OPEN':
      return { label: 'Lista Aberta', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' };
    case 'ONGOING':
      return { label: 'Em Andamento', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' };
    case 'LIST_CLOSED':
      return { label: 'Lista Encerrada', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' };
    case 'FINISHED':
      return { label: 'Finalizado', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' };
    case 'CANCELLED':
      return { label: 'Cancelado', cls: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' };
    default:
      return { label: 'Rascunho', cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' };
  }
}

function EventManagementMainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as EventosInternalTab) || 'EVENTS';
  const [activeMainTab, setActiveMainTab] = useState<EventosInternalTab>(
    ['EVENTS', 'NEW_EVENT', 'VENUES', 'CRM', 'DISPATCH'].includes(initialTab) ? initialTab : 'EVENTS'
  );

  // Dados Principais
  const [overview, setOverview] = useState<any>(null);
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventStatusFilter, setEventStatusFilter] = useState('ACTIVE');
  const [eventSearch, setEventSearch] = useState('');
  const [selectedEventIdx, setSelectedEventIdx] = useState(0);

  // Casas de Show (Inline sem modal)
  const [venues, setVenues] = useState<any[]>([]);
  const [venueSearch, setVenueSearch] = useState('');
  const [selectedVenueIdx, setSelectedVenueIdx] = useState(0);
  const [venueFormOpen, setVenueFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<any>(null);

  // CRM Convidados (Inline sem modal)
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmCategoryFilter, setCrmCategoryFilter] = useState('ALL');
  const [selectedContactIdx, setSelectedContactIdx] = useState(0);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [inlineContactHistory, setInlineContactHistory] = useState<any>(null);

  // Convites, WhatsApp & Fila
  const [dispatchSubTab, setDispatchSubTab] = useState<'WHATSAPP' | 'TEMPLATES' | 'QUEUE' | 'AUDIT'>('WHATSAPP');
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateFormOpen, setTemplateFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [waConfig, setWaConfig] = useState<any>(null);
  const [waQrInfo, setWaQrInfo] = useState<any>(null);
  const [dispatchQueue, setDispatchQueue] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${getToken()}` };
  }

  useEffect(() => {
    const qTab = searchParams.get('tab') as EventosInternalTab;
    if (qTab && ['EVENTS', 'NEW_EVENT', 'VENUES', 'CRM', 'DISPATCH'].includes(qTab)) {
      setActiveMainTab(qTab);
    }
  }, [searchParams]);

  const fetchBaseData = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const [ovRes, evRes, vnRes] = await Promise.all([
        fetch(`${API_URL}/event-management/overview`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/events`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/venues`, { headers: authHeaders() }),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (evRes.ok) setEventsList(await evRes.json());
      if (vnRes.ok) setVenues(await vnRes.json());
    } catch {
      toast.error('Erro ao carregar dados do Gerenciamento de Eventos.');
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchContacts = useCallback(async (q = '', cat = 'ALL') => {
    const params = new URLSearchParams({ limit: '250' });
    if (q.trim()) params.set('search', q.trim());
    if (cat !== 'ALL') params.set('category_tag', cat);
    const res = await fetch(`${API_URL}/event-management/contacts?${params.toString()}`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setContacts(data.items || []);
      setContactsTotal(data.total || 0);
      setSelectedContactIdx(0);
    }
  }, []);

  const fetchDispatchHub = useCallback(async () => {
    const [tplRes, waRes, qRes, logRes] = await Promise.all([
      fetch(`${API_URL}/event-management/templates`, { headers: authHeaders() }),
      fetch(`${API_URL}/event-management/whatsapp/config`, { headers: authHeaders() }),
      fetch(`${API_URL}/event-management/dispatch-queue`, { headers: authHeaders() }),
      fetch(`${API_URL}/event-management/audit-logs`, { headers: authHeaders() }),
    ]);
    if (tplRes.ok) setTemplates(await tplRes.json());
    if (waRes.ok) setWaConfig(await waRes.json());
    if (qRes.ok) setDispatchQueue(await qRes.json());
    if (logRes.ok) setAuditLogs(await logRes.json());
  }, []);

  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  useEffect(() => {
    if (activeMainTab === 'CRM') fetchContacts(crmSearch, crmCategoryFilter);
    if (activeMainTab === 'DISPATCH') fetchDispatchHub();
  }, [activeMainTab, crmCategoryFilter, fetchContacts, fetchDispatchHub]);

  const filteredEvents = useMemo(() => {
    return eventsList.filter((ev) => {
      if (eventStatusFilter === 'ACTIVE' && ['FINISHED', 'CANCELLED'].includes(ev.status)) return false;
      if (eventStatusFilter !== 'ALL' && eventStatusFilter !== 'ACTIVE' && ev.status !== eventStatusFilter) {
        return false;
      }
      if (!eventSearch.trim()) return true;
      const q = eventSearch.toLowerCase();
      return (
        (ev.title || '').toLowerCase().includes(q) ||
        (ev.code || '').toLowerCase().includes(q) ||
        (ev.location_display_name || '').toLowerCase().includes(q) ||
        (ev.city || '').toLowerCase().includes(q)
      );
    });
  }, [eventsList, eventStatusFilter, eventSearch]);

  const filteredVenues = useMemo(() => {
    if (!venueSearch.trim()) return venues;
    const q = venueSearch.toLowerCase();
    return venues.filter(
      (v) =>
        (v.name || '').toLowerCase().includes(q) ||
        (v.city || '').toLowerCase().includes(q) ||
        (v.neighborhood || '').toLowerCase().includes(q)
    );
  }, [venues, venueSearch]);

  // Navegação estilo Access por Teclado (↑ ↓ Enter Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineContactHistory) setInlineContactHistory(null);
        else if (venueFormOpen) setVenueFormOpen(false);
        else if (contactFormOpen) setContactFormOpen(false);
        else if (templateFormOpen) setTemplateFormOpen(false);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if (activeMainTab === 'EVENTS' && filteredEvents.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedEventIdx((p) => Math.min(filteredEvents.length - 1, p + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedEventIdx((p) => Math.max(0, p - 1));
        } else if (e.key === 'Enter' && filteredEvents[selectedEventIdx]) {
          e.preventDefault();
          router.push(`/event-management/${filteredEvents[selectedEventIdx].id}`);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeMainTab, filteredEvents, selectedEventIdx, inlineContactHistory, venueFormOpen, contactFormOpen, templateFormOpen, router]);

  async function uploadImageHelper(file: File, folder: 'banners' | 'templates'): Promise<string | null> {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem excede o limite máximo permitido de 5 MB.');
      return null;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    const res = await fetch(`${API_URL}/event-management/upload-image`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.detail || 'Erro ao enviar imagem.');
      return null;
    }
    return data.url;
  }

  async function openContactHistoryInline(contactId: number) {
    const res = await fetch(`${API_URL}/event-management/contacts/${contactId}/history`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      setInlineContactHistory(await res.json());
    }
  }

  const eventsSummaryTotals = useMemo(() => {
    return filteredEvents.reduce(
      (acc, ev) => {
        acc.people += Number(ev.stats?.total_people || 0);
        acc.confirmed += Number(ev.stats?.confirmed_guests || 0);
        acc.checkedIn += Number(ev.stats?.checked_in || 0);
        return acc;
      },
      { people: 0, confirmed: 0, checkedIn: 0 }
    );
  }, [filteredEvents]);

  return (
    <div className="w-full space-y-2.5 pb-12 font-sans text-xs">
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BARRA SUPERIOR FIXA ESTILO ACCESS MODERNO (IGUAL HORUS COMPRAS)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <EventManagementPinnedNavBar
        activeTab={activeMainTab}
        onSelectTab={(tab) => {
          setActiveMainTab(tab);
          setInlineContactHistory(null);
        }}
        eventsCount={eventsList.length}
        contactsCount={overview?.kpis?.total_contacts ?? contactsTotal}
        pendingQueueCount={overview?.kpis?.queue_pending ?? 0}
      />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 1: EVENTOS — GRADE DATASHEET COMPACTA (ABRE TELA DEDICADA)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'EVENTS' && (
        <div className="space-y-2.5">
          {/* Barra Compacta de Filtros e Ação Única */}
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={eventSearch}
                  onChange={(e) => {
                    setEventSearch(e.target.value);
                    setSelectedEventIdx(0);
                  }}
                  placeholder="Código, nome do evento, casa ou cidade..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {[
                  { id: 'ACTIVE', label: 'Ativos' },
                  { id: 'OPEN', label: 'Lista Aberta' },
                  { id: 'ONGOING', label: 'Em Andamento' },
                  { id: 'LIST_CLOSED', label: 'Lista Encerrada' },
                  { id: 'FINISHED', label: 'Finalizados' },
                  { id: 'ALL', label: 'Todos' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setEventStatusFilter(st.id);
                      setSelectedEventIdx(0);
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition cursor-pointer ${
                      eventStatusFilter === st.id
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-500 font-bold'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={fetchBaseData}
                disabled={loadingEvents}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin text-indigo-600' : ''}`} />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => setActiveMainTab('NEW_EVENT')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Evento
              </button>
            </div>
          </div>

          {/* Grade Datasheet Estilo Access Moderno */}
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <th className="py-1.5 px-2.5 w-28">Código</th>
                    <th className="py-1.5 px-2.5 w-32">Data / Hora</th>
                    <th className="py-1.5 px-2.5">Nome do Evento</th>
                    <th className="py-1.5 px-2.5">Casa de Show / Local</th>
                    <th className="py-1.5 px-2.5 text-right w-24">Lista Total</th>
                    <th className="py-1.5 px-2.5 text-right w-28">Confirmados ✓</th>
                    <th className="py-1.5 px-2.5 text-right w-28">Portaria</th>
                    <th className="py-1.5 px-2.5 text-right w-28">PDF Disp | Env</th>
                    <th className="py-1.5 px-2.5 text-center w-28">Status</th>
                    <th className="py-1.5 px-2.5 text-right w-44">Acessos Rápidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {loadingEvents ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        <RefreshCw className="w-4 h-4 animate-spin inline mr-1.5 text-indigo-600" />
                        Carregando eventos...
                      </td>
                    </tr>
                  ) : filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        Nenhum evento nesta visão. Clique em &ldquo;Novo Evento&rdquo; acima para iniciar.
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((ev, idx) => {
                      const isSel = idx === selectedEventIdx;
                      const badge = getEventStatusBadge(ev.status);
                      return (
                        <tr
                          key={ev.id}
                          onClick={() => setSelectedEventIdx(idx)}
                          onDoubleClick={() => router.push(`/event-management/${ev.id}`)}
                          className={`cursor-pointer transition-colors ${
                            isSel
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                              : idx % 2 === 1
                                ? 'bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100/70'
                                : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="py-1.5 px-2.5 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                            {ev.code}
                          </td>
                          <td className="py-1.5 px-2.5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {formatDateBr(ev.event_date)}
                            {ev.doors_open_time ? ` • ${ev.doors_open_time}` : ''}
                          </td>
                          <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-white max-w-[260px] truncate">
                            {ev.title}
                          </td>
                          <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300 max-w-[220px] truncate">
                            {ev.location_display_name || 'Endereço avulso'}
                            {ev.city ? ` (${ev.city}/${ev.state || ''})` : ''}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {ev.stats?.total_people || 0}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {ev.stats?.confirmed_guests || 0}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-indigo-700 dark:text-indigo-300">
                            {ev.stats?.checked_in || 0}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono">
                            <span className="text-emerald-700 font-bold">{ev.stats?.tickets_available || 0}</span>
                            <span className="text-slate-400 mx-1">|</span>
                            <span className="text-slate-700 dark:text-slate-300">{ev.stats?.tickets_sent || 0}</span>
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <Link
                                href={`/event-management/${ev.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 hover:text-indigo-700 text-[10px] font-bold"
                              >
                                Abrir Ficha
                              </Link>
                              <Link
                                href={`/event-management/${ev.id}?tab=PORTARIA`}
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-[10px] font-bold inline-flex items-center gap-1"
                                title="Abrir controle de Portaria por Celular e CPF"
                              >
                                <DoorOpen className="w-3 h-3" />
                                Portaria
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Rodapé de Navegação Access */}
            <div className="bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={filteredEvents.length === 0}
                  onClick={() => setSelectedEventIdx(0)}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={selectedEventIdx <= 0}
                  onClick={() => setSelectedEventIdx((p) => Math.max(0, p - 1))}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono px-1.5">
                  Registro {filteredEvents.length === 0 ? 0 : selectedEventIdx + 1} de {filteredEvents.length}
                </span>
                <button
                  type="button"
                  disabled={selectedEventIdx >= filteredEvents.length - 1}
                  onClick={() => setSelectedEventIdx((p) => Math.min(filteredEvents.length - 1, p + 1))}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={filteredEvents.length === 0}
                  onClick={() => setSelectedEventIdx(Math.max(0, filteredEvents.length - 1))}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-400 ml-2 hidden sm:inline">
                  Enter ou duplo clique abre a tela dedicada do evento
                </span>
              </div>

              <div className="font-mono flex items-center gap-3">
                <span>
                  Convidados: <strong className="text-slate-900 dark:text-white">{eventsSummaryTotals.people}</strong>
                </span>
                <span>
                  Confirmados: <strong className="text-emerald-700 dark:text-emerald-400">{eventsSummaryTotals.confirmed}</strong>
                </span>
                <span>
                  Portaria: <strong className="text-indigo-700 dark:text-indigo-300">{eventsSummaryTotals.checkedIn}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 2: NOVO EVENTO — FICHA INLINE DIRETA NA TELA (SEM MODAL!)         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'NEW_EVENT' && (
        <InlineNewEventDesk
          venues={venues}
          authHeaders={authHeaders}
          uploadImageHelper={uploadImageHelper}
          onCancel={() => setActiveMainTab('EVENTS')}
          onCreated={(createdEv: any) => {
            fetchBaseData();
            router.push(`/event-management/${createdEv.id}`);
          }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 3: CASAS DE SHOW — DATASHEET + BARRA INLINE (SEM MODAL!)          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'VENUES' && (
        <div className="space-y-2.5">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                placeholder="Pesquisar casa de show, bairro ou cidade..."
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingVenue(null);
                setVenueFormOpen((v) => !v);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {venueFormOpen && !editingVenue ? 'Fechar Cadastro' : 'Nova Casa de Show'}
            </button>
          </div>

          {venueFormOpen && (
            <InlineVenueFormBar
              initial={editingVenue}
              authHeaders={authHeaders}
              onCancel={() => {
                setVenueFormOpen(false);
                setEditingVenue(null);
              }}
              onSaved={() => {
                setVenueFormOpen(false);
                setEditingVenue(null);
                fetchBaseData();
              }}
            />
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <th className="py-1.5 px-2.5">Casa de Show / Espaço</th>
                    <th className="py-1.5 px-2.5">Endereço</th>
                    <th className="py-1.5 px-2.5">Cidade / UF</th>
                    <th className="py-1.5 px-2.5 text-right w-24">Capacidade</th>
                    <th className="py-1.5 px-2.5 text-center w-24">Classif.</th>
                    <th className="py-1.5 px-2.5">Responsável</th>
                    <th className="py-1.5 px-2.5 text-right w-24">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredVenues.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhuma casa de show cadastrada.
                      </td>
                    </tr>
                  ) : (
                    filteredVenues.map((v, idx) => (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedVenueIdx(idx)}
                        onDoubleClick={() => {
                          setEditingVenue(v);
                          setVenueFormOpen(true);
                        }}
                        className={`cursor-pointer ${
                          idx === selectedVenueIdx
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                            : idx % 2 === 1
                              ? 'bg-slate-50/60 dark:bg-slate-900/40'
                              : ''
                        }`}
                      >
                        <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-white">{v.name}</td>
                        <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300">
                          {[v.street, v.number, v.neighborhood].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono">
                          {[v.city, v.state].filter(Boolean).join('/') || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono">{v.total_capacity || '—'}</td>
                        <td className="py-1.5 px-2.5 text-center font-mono">{v.age_rating}</td>
                        <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300">
                          {v.contact_name || '—'} {v.contact_phone ? `(${v.contact_phone})` : ''}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVenue(v);
                              setVenueFormOpen(true);
                            }}
                            className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 text-[10px] font-bold cursor-pointer"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-600">
              <span className="font-mono">
                Registro {filteredVenues.length === 0 ? 0 : selectedVenueIdx + 1} de {filteredVenues.length}
              </span>
              <span className="text-[10px] text-slate-400">Duplo clique edita a casa na própria tela</span>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 4: CRM CONVIDADOS — DATASHEET + FICHA / HISTÓRICO INLINE          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'CRM' && (
        <div className="space-y-2.5">
          {!inlineContactHistory ? (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      fetchContacts(crmSearch, crmCategoryFilter);
                    }}
                    className="relative w-full sm:w-72"
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={crmSearch}
                      onChange={(e) => {
                        setCrmSearch(e.target.value);
                        fetchContacts(e.target.value, crmCategoryFilter);
                      }}
                      placeholder="Nome, DDD + Celular, CPF ou @instagram..."
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px]"
                    />
                  </form>

                  <div className="flex flex-wrap items-center gap-1">
                    {['ALL', 'VIP', 'CONVIDADO', 'IMPRENSA', 'INFLUENCER', 'ARTISTA', 'PATROCINADOR'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCrmCategoryFilter(cat)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border cursor-pointer ${
                          crmCategoryFilter === cat
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-500'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {cat === 'ALL' ? 'Todos' : cat}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingContact(null);
                    setContactFormOpen((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {contactFormOpen && !editingContact ? 'Fechar Ficha' : 'Novo Contato CRM'}
                </button>
              </div>

              {contactFormOpen && (
                <InlineContactFormBar
                  initial={editingContact}
                  authHeaders={authHeaders}
                  onCancel={() => {
                    setContactFormOpen(false);
                    setEditingContact(null);
                  }}
                  onSaved={() => {
                    setContactFormOpen(false);
                    setEditingContact(null);
                    fetchContacts(crmSearch, crmCategoryFilter);
                    fetchBaseData();
                  }}
                />
              )}

              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <th className="py-1.5 px-2.5">Convidado</th>
                        <th className="py-1.5 px-2.5 w-36">DDD + Celular</th>
                        <th className="py-1.5 px-2.5 w-32">CPF</th>
                        <th className="py-1.5 px-2.5 w-28">Perfil</th>
                        <th className="py-1.5 px-2.5">Origem / Promoter</th>
                        <th className="py-1.5 px-2.5 text-right w-20">Eventos</th>
                        <th className="py-1.5 px-2.5 text-right w-20">Confirm.</th>
                        <th className="py-1.5 px-2.5 text-right w-28">Presenças</th>
                        <th className="py-1.5 px-2.5 text-right w-36">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {contacts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-500">
                            Nenhum convidado encontrado na base CRM.
                          </td>
                        </tr>
                      ) : (
                        contacts.map((c, idx) => (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedContactIdx(idx)}
                            onDoubleClick={() => openContactHistoryInline(c.id)}
                            className={`cursor-pointer ${
                              idx === selectedContactIdx
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                                : idx % 2 === 1
                                  ? 'bg-slate-50/60 dark:bg-slate-900/40'
                                  : ''
                            }`}
                          >
                            <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-white">
                              {c.full_name}
                              {c.is_blocked && (
                                <span className="ml-1.5 px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                                  BLOQUEADO
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                              {c.phone_display}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono text-slate-600 dark:text-slate-400">
                              {c.cpf || '—'}
                            </td>
                            <td className="py-1.5 px-2.5">
                              <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                {c.category_tag}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-500 truncate max-w-[180px]">
                              {c.origin_source} {c.origin_promoter_name ? `• ${c.origin_promoter_name}` : ''}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold">{c.total_events_invited}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono text-indigo-700 dark:text-indigo-300">
                              {c.total_events_confirmed}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              {c.total_checkins} {c.attendance_rate !== null ? `(${c.attendance_rate}%)` : ''}
                            </td>
                            <td className="py-1.5 px-2.5 text-right whitespace-nowrap space-x-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openContactHistoryInline(c.id);
                                }}
                                className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-500 text-[10px] font-bold cursor-pointer"
                              >
                                Histórico
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingContact(c);
                                  setContactFormOpen(true);
                                }}
                                className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold cursor-pointer"
                              >
                                Editar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-600">
                  <span className="font-mono">
                    Registro {contacts.length === 0 ? 0 : selectedContactIdx + 1} de {contacts.length} (Base Total: {contactsTotal})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Validador único de DDD + Telefone ativo por Seller
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* Ficha Inline de Histórico 360º do Contato (Sem Modal!) */
            <div className="space-y-2.5">
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInlineContactHistory(null)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-[11px] font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao CRM
                  </button>
                  <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {inlineContactHistory.contact.full_name}
                  </span>
                  <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                    {inlineContactHistory.contact.phone_display}
                  </span>
                  {inlineContactHistory.contact.cpf && (
                    <span className="font-mono text-slate-500">CPF: {inlineContactHistory.contact.cpf}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span>Convites: <strong>{inlineContactHistory.contact.total_events_invited}</strong></span>
                  <span>Confirmados: <strong className="text-indigo-700">{inlineContactHistory.contact.total_events_confirmed}</strong></span>
                  <span>Presenças na Portaria: <strong className="text-emerald-700">{inlineContactHistory.contact.total_checkins}</strong></span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 font-bold text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Histórico de Eventos deste Contato
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-1.5 px-2.5">Data</th>
                        <th className="py-1.5 px-2.5">Evento</th>
                        <th className="py-1.5 px-2.5">Setor</th>
                        <th className="py-1.5 px-2.5">Promoter</th>
                        <th className="py-1.5 px-2.5">Confirmação</th>
                        <th className="py-1.5 px-2.5">Ingresso PDF</th>
                        <th className="py-1.5 px-2.5">Portaria</th>
                        <th className="py-1.5 px-2.5 text-right">Abrir Evento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {(inlineContactHistory.participations || []).map((p: any) => (
                        <tr key={p.guest_id}>
                          <td className="py-1.5 px-2.5 font-mono">{formatDateBr(p.event_date)}</td>
                          <td className="py-1.5 px-2.5 font-semibold">{p.event_title}</td>
                          <td className="py-1.5 px-2.5 font-bold">{p.sector_key}</td>
                          <td className="py-1.5 px-2.5 text-slate-500">{p.promoter_name || '—'}</td>
                          <td className="py-1.5 px-2.5 font-bold">{p.invite_status}</td>
                          <td className="py-1.5 px-2.5 font-mono">{p.ticket_delivery_status}</td>
                          <td className="py-1.5 px-2.5 font-bold text-emerald-700">{p.checkin_status}</td>
                          <td className="py-1.5 px-2.5 text-right">
                            <Link
                              href={`/event-management/${p.event_id}`}
                              className="px-2 py-0.5 rounded border border-slate-300 text-[10px] font-bold"
                            >
                              Ver Evento
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TELA 5: CONVITES, WHATSAPP ANTI-BLOQUEIO, FILA & LOGS                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'DISPATCH' && (
        <div className="space-y-2.5">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'WHATSAPP', label: '1. Conexão WhatsApp, Cadência & Bot vCard' },
                { id: 'TEMPLATES', label: `2. Modelos de Convite (${templates.length})` },
                { id: 'QUEUE', label: `3. Fila de Envio (${dispatchQueue.filter((q) => q.status === 'PENDING').length} pend.)` },
                { id: 'AUDIT', label: '4. Auditoria Geral' },
              ].map((st: any) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setDispatchSubTab(st.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    dispatchSubTab === st.id
                      ? 'bg-slate-900 text-white dark:bg-indigo-600'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {dispatchSubTab === 'TEMPLATES' && (
              <button
                type="button"
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateFormOpen((v) => !v);
                }}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {templateFormOpen ? 'Fechar Editor' : 'Novo Modelo'}
              </button>
            )}
          </div>

          {dispatchSubTab === 'WHATSAPP' && waConfig && (
            <InlineWhatsAppConfigPanel
              waConfig={waConfig}
              setWaConfig={setWaConfig}
              waQrInfo={waQrInfo}
              setWaQrInfo={setWaQrInfo}
              authHeaders={authHeaders}
              onSaved={fetchDispatchHub}
            />
          )}

          {dispatchSubTab === 'TEMPLATES' && (
            <div className="space-y-2.5">
              {templateFormOpen && (
                <InlineTemplateFormBar
                  initial={editingTemplate}
                  authHeaders={authHeaders}
                  uploadImageHelper={uploadImageHelper}
                  onCancel={() => {
                    setTemplateFormOpen(false);
                    setEditingTemplate(null);
                  }}
                  onSaved={() => {
                    setTemplateFormOpen(false);
                    setEditingTemplate(null);
                    fetchDispatchHub();
                  }}
                />
              )}

              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">
                      <th className="py-1.5 px-2.5 w-48">Nome do Modelo</th>
                      <th className="py-1.5 px-2.5 w-40">Finalidade</th>
                      <th className="py-1.5 px-2.5">Texto Base</th>
                      <th className="py-1.5 px-2.5 w-24 text-center">Arte</th>
                      <th className="py-1.5 px-2.5 w-28 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {templates.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Nenhum modelo customizado cadastrado (o sistema já utiliza modelo padrão inteligente).
                        </td>
                      </tr>
                    ) : (
                      templates.map((tpl) => (
                        <tr key={tpl.id}>
                          <td className="py-1.5 px-2.5 font-bold">{tpl.name}</td>
                          <td className="py-1.5 px-2.5 font-mono text-[10px]">{tpl.template_purpose}</td>
                          <td className="py-1.5 px-2.5 text-slate-600 dark:text-slate-300 max-w-md truncate">
                            {tpl.message_body}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {tpl.image_url ? (
                              <a
                                href={getImageUrl(tpl.image_url)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 font-bold underline"
                              >
                                Ver Arte
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTemplate(tpl);
                                setTemplateFormOpen(true);
                              }}
                              className="px-2 py-0.5 rounded border border-slate-300 text-[10px] font-bold cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('Excluir este modelo?')) return;
                                await fetch(`${API_URL}/event-management/templates/${tpl.id}`, {
                                  method: 'DELETE',
                                  headers: authHeaders(),
                                });
                                fetchDispatchHub();
                              }}
                              className="px-2 py-0.5 rounded border border-rose-200 text-rose-600 text-[10px] font-bold cursor-pointer"
                            >
                              Excluir
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

          {dispatchSubTab === 'QUEUE' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  Cadência Anti-Bloqueio: <strong>{waConfig?.min_delay_seconds || 25}s a {waConfig?.max_delay_seconds || 55}s</strong> entre envios.
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={fetchDispatchHub}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white dark:bg-slate-800 text-[11px] font-semibold cursor-pointer"
                  >
                    Atualizar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const nextPaused = !waConfig?.queue_paused;
                      await fetch(`${API_URL}/event-management/dispatch-queue/toggle-pause?paused=${nextPaused}`, {
                        method: 'POST',
                        headers: authHeaders(),
                      });
                      fetchDispatchHub();
                    }}
                    className={`px-3 py-1 rounded-lg text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                      waConfig?.queue_paused ? 'bg-emerald-600' : 'bg-amber-600'
                    }`}
                  >
                    {waConfig?.queue_paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                    {waConfig?.queue_paused ? 'Retomar Fila' : 'Pausar Fila'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase">
                      <th className="py-1.5 px-2.5">Convidado</th>
                      <th className="py-1.5 px-2.5">Telefone</th>
                      <th className="py-1.5 px-2.5">Modo</th>
                      <th className="py-1.5 px-2.5">Programado</th>
                      <th className="py-1.5 px-2.5">Status</th>
                      <th className="py-1.5 px-2.5">Retorno</th>
                      <th className="py-1.5 px-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {dispatchQueue.map((item) => (
                      <tr key={item.id}>
                        <td className="py-1.5 px-2.5 font-semibold">{item.recipient_name}</td>
                        <td className="py-1.5 px-2.5 font-mono">{item.recipient_phone}</td>
                        <td className="py-1.5 px-2.5 font-mono text-[10px]">{item.dispatch_mode}</td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-500">
                          {item.scheduled_for ? new Date(item.scheduled_for).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold">{item.status}</td>
                        <td className="py-1.5 px-2.5 text-slate-500 max-w-xs truncate">
                          {item.error_message || item.provider_message_id || 'Aguardando vez'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          {item.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`${API_URL}/event-management/dispatch-queue/${item.id}/cancel`, {
                                  method: 'POST',
                                  headers: authHeaders(),
                                });
                                fetchDispatchHub();
                              }}
                              className="text-rose-600 font-bold cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {dispatchSubTab === 'AUDIT' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase">
                      <th className="py-1.5 px-2.5 w-40">Data / Hora</th>
                      <th className="py-1.5 px-2.5 w-44">Ação</th>
                      <th className="py-1.5 px-2.5 w-40">Operador</th>
                      <th className="py-1.5 px-2.5">Resumo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {auditLogs.map((l) => (
                      <tr key={l.id}>
                        <td className="py-1.5 px-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                          {l.action}
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold">{l.actor_name}</td>
                        <td className="py-1.5 px-2.5 text-slate-700 dark:text-slate-300">{l.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENTES INLINE SEM MODAL (MESMO PADRÃO ACCESS MODERNO DO HORUS COMPRAS)
// ============================================================================

function InlineNewEventDesk({ venues, authHeaders, uploadImageHelper, onCancel, onCreated }: any) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [doorsOpen, setDoorsOpen] = useState('21:00');
  const [startTime, setStartTime] = useState('23:00');
  const [cutoffTime, setCutoffTime] = useState('00:30');
  const [venueId, setVenueId] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('SP');
  const [bannerUrl, setBannerUrl] = useState('');
  const [ticketMode, setTicketMode] = useState('HYBRID');
  const [autoSendRsvp, setAutoSendRsvp] = useState(false);
  const [sectors, setSectors] = useState<any[]>([
    { key: 'VIP', name: 'Área VIP', courtesy_quota: 100, face_value: 0 },
    { key: 'PISTA', name: 'Pista', courtesy_quota: 200, face_value: 0 },
    { key: 'CAMAROTE', name: 'Camarote', courtesy_quota: 50, face_value: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  function handleSelectVenue(idStr: string) {
    setVenueId(idStr);
    const v = venues.find((x: any) => String(x.id) === idStr);
    if (v) {
      setStreet(v.street || '');
      setNumber(v.number || '');
      setNeighborhood(v.neighborhood || '');
      setCity(v.city || '');
      setStateUf(v.state || 'SP');
      if (v.default_sectors?.length) setSectors(v.default_sectors);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Informe o nome do evento.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subtitle,
          status: 'OPEN',
          event_date: eventDate,
          doors_open_time: doorsOpen,
          start_time: startTime,
          list_cutoff_time: cutoffTime,
          venue_id: venueId ? Number(venueId) : null,
          custom_location_name: customLocation || null,
          street,
          number,
          neighborhood,
          city,
          state: stateUf,
          banner_url: bannerUrl || null,
          ticket_mode: ticketMode,
          auto_send_ticket_on_rsvp: autoSendRsvp,
          sectors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar evento.');
      toast.success(`Evento ${data.code} criado! Abrindo tela do evento...`);
      onCreated(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2.5">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
          <span className="font-bold text-sm text-slate-900 dark:text-white">
            Cadastro de Novo Evento (Abre a ficha completa após gravar)
          </span>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Gravando...' : 'Gravar e Abrir Evento'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-3.5 space-y-3 shadow-2xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
            1. Dados Principais, Data e Local
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="font-bold block mb-1">Nome do Evento *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Show Especial Sábado VIP"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Data do Evento *</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="font-bold block mb-1">Abertura Casa</label>
              <input type="time" value={doorsOpen} onChange={(e) => setDoorsOpen(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
            </div>
            <div>
              <label className="font-bold block mb-1">Início Show</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
            </div>
            <div>
              <label className="font-bold block mb-1">Limite Lista</label>
              <input type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="font-bold block mb-1">Casa de Show Pré-Cadastrada</label>
              <select
                value={venueId}
                onChange={(e) => handleSelectVenue(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-semibold"
              >
                <option value="">-- Endereço Avulso --</option>
                {venues.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.city}/{v.state})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">Nome do Local (se avulso)</label>
              <input
                type="text"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="Ex: Espaço Eventos Centro"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <input type="text" placeholder="Rua / Av." value={street} onChange={(e) => setStreet(e.target.value)} className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
            <input type="text" placeholder="Nº" value={number} onChange={(e) => setNumber(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
            <input type="text" placeholder="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
            <input type="text" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
            <input type="text" placeholder="UF" maxLength={2} value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 uppercase font-mono" />
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-3.5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              2. Setores, Cotas & Arte
            </span>
            <button
              type="button"
              onClick={() => setSectors([...sectors, { key: `SETOR_${sectors.length + 1}`, name: 'Novo Setor', courtesy_quota: 50, face_value: 0 }])}
              className="text-[11px] font-bold text-indigo-600 cursor-pointer"
            >
              + Setor
            </button>
          </div>

          <div className="space-y-1.5">
            {sectors.map((sec, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <input
                  type="text"
                  value={sec.key}
                  onChange={(e) => {
                    const cp = [...sectors];
                    cp[i] = { ...cp[i], key: e.target.value.toUpperCase().replace(/\s+/g, '_') };
                    setSectors(cp);
                  }}
                  className="col-span-3 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 font-mono font-bold text-[11px]"
                />
                <input
                  type="text"
                  value={sec.name}
                  onChange={(e) => {
                    const cp = [...sectors];
                    cp[i] = { ...cp[i], name: e.target.value };
                    setSectors(cp);
                  }}
                  className="col-span-4 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                />
                <input
                  type="number"
                  value={sec.courtesy_quota ?? 100}
                  onChange={(e) => {
                    const cp = [...sectors];
                    cp[i] = { ...cp[i], courtesy_quota: Number(e.target.value) };
                    setSectors(cp);
                  }}
                  className="col-span-2 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 font-mono text-[11px]"
                />
                <div className="col-span-3">
                  <CurrencyInput
                    prefixStr="R$ "
                    value={Number(sec.face_value || 0)}
                    onChangeValue={(v) => {
                      const cp = [...sectors];
                      cp[i] = { ...cp[i], face_value: v };
                      setSectors(cp);
                    }}
                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 font-mono text-right text-[11px]"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div>
              <label className="font-bold block mb-1">Controle de Acesso</label>
              <select value={ticketMode} onChange={(e) => setTicketMode(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700">
                <option value="HYBRID">Híbrido (Lista Celular/CPF + PDF/QR)</option>
                <option value="PDF_VAULT">Cofre de Ingressos PDF</option>
                <option value="NATIVE_QR">Lista Portaria (Celular/CPF/QR)</option>
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">Arte / Flyer (máx 5MB)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const u = await uploadImageHelper(f, 'banners');
                  if (u) {
                    setBannerUrl(u);
                    toast.success('Arte anexada!');
                  }
                }}
                className="text-[10px]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1 font-semibold text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={autoSendRsvp} onChange={(e) => setAutoSendRsvp(e.target.checked)} />
            Liberar PDF automaticamente quando o convidado confirmar presença
          </label>
        </div>
      </div>
    </form>
  );
}

function InlineVenueFormBar({ initial, authHeaders, onCancel, onSaved }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [contactName, setContactName] = useState(initial?.contact_name || '');
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone || '');
  const [street, setStreet] = useState(initial?.street || '');
  const [number, setNumber] = useState(initial?.number || '');
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood || '');
  const [city, setCity] = useState(initial?.city || '');
  const [stateUf, setStateUf] = useState(initial?.state || 'SP');
  const [capacity, setCapacity] = useState(initial?.total_capacity || 1000);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome da casa de show.');
    setSaving(true);
    try {
      const url = initial
        ? `${API_URL}/event-management/venues/${initial.id}`
        : `${API_URL}/event-management/venues`;
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact_name: contactName,
          contact_phone: contactPhone,
          street,
          number,
          neighborhood,
          city,
          state: stateUf,
          total_capacity: Number(capacity) || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar casa.');
      toast.success('Casa de show gravada!');
      onSaved(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-bold text-indigo-900 dark:text-indigo-200">
          {initial ? `Editando Casa: ${initial.name}` : 'Pré-Cadastro Rápido de Casa de Show'}
        </span>
        <button type="button" onClick={onCancel} className="text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <input type="text" placeholder="Nome da Casa *" value={name} onChange={(e) => setName(e.target.value)} className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="text" placeholder="Rua / Av." value={street} onChange={(e) => setStreet(e.target.value)} className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="text" placeholder="Nº" value={number} onChange={(e) => setNumber(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="text" placeholder="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="text" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="text" placeholder="UF" maxLength={2} value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900 font-mono uppercase" />
        <input type="number" placeholder="Capacidade" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900 font-mono" />
        <input type="text" placeholder="Responsável" value={contactName} onChange={(e) => setContactName(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="tel" placeholder="Tel Responsável" value={contactPhone} onChange={(e) => setContactPhone(formatBrPhoneMask(e.target.value))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900 font-mono" />
        <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer">
          {saving ? '...' : 'Salvar Casa'}
        </button>
      </div>
    </form>
  );
}

function InlineContactFormBar({ initial, authHeaders, onCancel, onSaved }: any) {
  const [phone, setPhone] = useState(initial?.phone_display || '');
  const [fullName, setFullName] = useState(initial?.full_name || '');
  const [cpf, setCpf] = useState(initial?.cpf || '');
  const [instagram, setInstagram] = useState(initial?.instagram || '');
  const [categoryTag, setCategoryTag] = useState(initial?.category_tag || 'CONVIDADO');
  const [isBlocked, setIsBlocked] = useState(Boolean(initial?.is_blocked));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateBrPhoneClient(phone);
    if (!check.valid) return toast.error(check.error || 'Telefone inválido.');
    if (!fullName.trim()) return toast.error('Informe o nome completo.');
    setSaving(true);
    try {
      const url = initial
        ? `${API_URL}/event-management/contacts/${initial.id}`
        : `${API_URL}/event-management/contacts`;
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          cpf,
          instagram,
          category_tag: categoryTag,
          is_blocked: isBlocked,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao salvar contato.');
      toast.success('Contato gravado no CRM!');
      onSaved(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-indigo-900 dark:text-indigo-200">
          {initial ? `Editando Contato: ${initial.full_name}` : 'Novo Contato CRM (Validador único DDD + Número)'}
        </span>
        <button type="button" onClick={onCancel} className="text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-center">
        <input type="tel" placeholder="(11) 99888-7766 *" value={phone} onChange={(e) => setPhone(formatBrPhoneMask(e.target.value))} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900 font-mono font-bold" />
        <input type="text" placeholder="Nome Completo *" value={fullName} onChange={(e) => setFullName(e.target.value)} className="lg:col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900" />
        <input type="text" placeholder="CPF (p/ Portaria)" value={cpf} onChange={(e) => setCpf(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900 font-mono" />
        <select value={categoryTag} onChange={(e) => setCategoryTag(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-900 font-bold">
          <option value="CONVIDADO">CONVIDADO</option>
          <option value="VIP">VIP</option>
          <option value="IMPRENSA">IMPRENSA</option>
          <option value="INFLUENCER">INFLUENCER</option>
          <option value="ARTISTA">ARTISTA</option>
          <option value="PATROCINADOR">PATROCINADOR</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 shrink-0">
            <input type="checkbox" checked={isBlocked} onChange={(e) => setIsBlocked(e.target.checked)} />
            Restrito
          </label>
          <button type="submit" disabled={saving} className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer">
            Salvar
          </button>
        </div>
      </div>
    </form>
  );
}

function InlineTemplateFormBar({ initial, authHeaders, uploadImageHelper, onCancel, onSaved }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [purpose, setPurpose] = useState(initial?.template_purpose || 'INVITE_RSVP');
  const [imageUrl, setImageUrl] = useState(initial?.image_url || '');
  const [body, setBody] = useState(
    initial?.message_body ||
      'Você é nosso convidado(a) para *{{evento}}*!\n📅 Data: {{data}} às {{hora}}\n📍 Local: {{casa}}\n👉 Confirme sua presença: {{link_rsvp}}'
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('Informe o nome do modelo.');
    setSaving(true);
    try {
      const url = initial
        ? `${API_URL}/event-management/templates/${initial.id}`
        : `${API_URL}/event-management/templates`;
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template_purpose: purpose, image_url: imageUrl || null, message_body: body }),
      });
      if (!res.ok) throw new Error('Falha ao salvar modelo.');
      toast.success('Modelo salvo!');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 space-y-2.5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input type="text" placeholder="Nome do Modelo *" value={name} onChange={(e) => setName(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold">
          <option value="INVITE_RSVP">Convite com Confirmação RSVP</option>
          <option value="DIRECT_COMBO">Combo Convite + PDF</option>
          <option value="TICKET_DELIVERY">Entrega do Ingresso PDF</option>
          <option value="NATIVE_QR_CARD">Credencial QR Nativa</option>
        </select>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const u = await uploadImageHelper(f, 'templates');
            if (u) setImageUrl(u);
          }}
          className="text-[10px]"
        />
      </div>
      <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1 rounded-lg border border-slate-300 cursor-pointer">Cancelar</button>
        <button type="submit" disabled={saving} className="px-4 py-1 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer">Salvar Modelo</button>
      </div>
    </form>
  );
}

function InlineWhatsAppConfigPanel({ waConfig, setWaConfig, waQrInfo, setWaQrInfo, authHeaders, onSaved }: any) {
  const [authPhonesText, setAuthPhonesText] = useState((waConfig.authorized_sender_phones || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const phones = authPhonesText
        .split(/[\n,;]+/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      const res = await fetch(`${API_URL}/event-management/whatsapp/config`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...waConfig, authorized_sender_phones: phones }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao gravar.');
      toast.success('Configurações salvas!');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectQr() {
    setLoadingQr(true);
    try {
      const res = await fetch(`${API_URL}/event-management/whatsapp/qrcode`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao consultar gateway.');
      setWaQrInfo(data);
      if (data.connected) toast.success('WhatsApp conectado!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-900 dark:text-white">Conexão Gateway (Evolution / Z-API / WAHA)</span>
          <label className="inline-flex items-center gap-1.5 font-bold text-emerald-600">
            <input type="checkbox" checked={waConfig.enabled} onChange={(e) => setWaConfig({ ...waConfig, enabled: e.target.checked })} />
            Ativo
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={waConfig.provider} onChange={(e) => setWaConfig({ ...waConfig, provider: e.target.value })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold">
            <option value="EVOLUTION">Evolution API v2</option>
            <option value="ZAPI">Z-API</option>
            <option value="WAHA">WAHA</option>
          </select>
          <input type="text" placeholder="Instância" value={waConfig.instance_name} onChange={(e) => setWaConfig({ ...waConfig, instance_name: e.target.value })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
        </div>
        <input type="text" placeholder="URL da API" value={waConfig.api_base_url} onChange={(e) => setWaConfig({ ...waConfig, api_base_url: e.target.value })} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
        <div className="grid grid-cols-2 gap-2">
          <input type="password" placeholder="API Key / Token" value={waConfig.api_key_token} onChange={(e) => setWaConfig({ ...waConfig, api_key_token: e.target.value })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
          <input type="password" placeholder="Client-Token (opcional)" value={waConfig.client_token} onChange={(e) => setWaConfig({ ...waConfig, client_token: e.target.value })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
        </div>

        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[10px] font-bold uppercase text-indigo-600">Webhook Receptor de vCard & RSVP</div>
          <div className="flex items-center gap-1.5">
            <input type="text" readOnly value={waConfig.webhook_url} className="flex-1 px-2 py-1 rounded border border-slate-200 bg-white dark:bg-slate-900 font-mono text-[10px]" />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(waConfig.webhook_url);
                toast.success('Webhook copiado!');
              }}
              className="px-2.5 py-1 rounded bg-indigo-600 text-white font-bold cursor-pointer"
            >
              Copiar
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={handleConnectQr} disabled={loadingQr} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold inline-flex items-center gap-1 cursor-pointer">
            <QrCode className="w-3.5 h-3.5" /> {loadingQr ? '...' : 'Status / QR Code'}
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer">
            Salvar
          </button>
        </div>

        {waQrInfo?.qrcode_base64 && (
          <div className="p-3 bg-white rounded-xl border text-center">
            <img
              src={waQrInfo.qrcode_base64.startsWith('data:image') ? waQrInfo.qrcode_base64 : `data:image/png;base64,${waQrInfo.qrcode_base64}`}
              alt="QR"
              className="w-40 h-40 mx-auto"
            />
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
        <span className="font-bold text-slate-900 dark:text-white block">Cadência Anti-Bloqueio & Números Autorizados</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] font-bold block">Delay Mín (s)</label>
            <input type="number" value={waConfig.min_delay_seconds} onChange={(e) => setWaConfig({ ...waConfig, min_delay_seconds: Number(e.target.value) })} className="w-full px-2 py-1 rounded border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold block">Delay Máx (s)</label>
            <input type="number" value={waConfig.max_delay_seconds} onChange={(e) => setWaConfig({ ...waConfig, max_delay_seconds: Number(e.target.value) })} className="w-full px-2 py-1 rounded border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold block">Lote Pausa</label>
            <input type="number" value={waConfig.batch_size_before_pause} onChange={(e) => setWaConfig({ ...waConfig, batch_size_before_pause: Number(e.target.value) })} className="w-full px-2 py-1 rounded border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold block">Pausa (s)</label>
            <input type="number" value={waConfig.batch_pause_seconds} onChange={(e) => setWaConfig({ ...waConfig, batch_pause_seconds: Number(e.target.value) })} className="w-full px-2 py-1 rounded border border-slate-300 font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold block mb-1">Promoters/Admins autorizados a encaminhar contatos vCard (1 por linha):</label>
          <textarea rows={3} value={authPhonesText} onChange={(e) => setAuthPhonesText(e.target.value)} placeholder={'11 99999-8888\n21 98888-7777'} className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
        </div>
      </div>
    </div>
  );
}

export default function EventManagementWorkspacePage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-500">Carregando Gestão de Eventos...</div>}>
      <EventManagementMainContent />
    </Suspense>
  );
}

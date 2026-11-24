'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Building2,
  Users,
  ClipboardList,
  Ticket,
  Send,
  Plus,
  Search,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  QrCode,
  FileText,
  History,
  PauseCircle,
  PlayCircle,
  Copy,
  ExternalLink,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Edit3,
  Trash2,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Sparkles,
  ClipboardPaste,
  Eye,
  X,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';
import { getImageUrl } from '@/lib/image_helper';
import { formatBrPhoneMask, validateBrPhoneClient } from '@/lib/br_phone';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type TabKey = 'EVENTS' | 'VENUES' | 'CRM' | 'GUESTS' | 'VAULT' | 'DISPATCH';

const SUBMODULE_TABS: { key: TabKey; shortcut: string; label: string; icon: any }[] = [
  { key: 'EVENTS', shortcut: 'Alt+1', label: 'Eventos', icon: Calendar },
  { key: 'VENUES', shortcut: 'Alt+2', label: 'Casas de Show', icon: Building2 },
  { key: 'CRM', shortcut: 'Alt+3', label: 'CRM Convidados', icon: Users },
  { key: 'GUESTS', shortcut: 'Alt+4', label: 'Lista & Cortesias', icon: ClipboardList },
  { key: 'VAULT', shortcut: 'Alt+5', label: 'Cofre PDF / ZIP', icon: Ticket },
  { key: 'DISPATCH', shortcut: 'Alt+6', label: 'Convites, Whats & Logs', icon: Send },
];

export default function EventManagementWorkspacePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('EVENTS');
  const [selectedRowIdx, setSelectedRowIdx] = useState(0);

  // Core Data
  const [overview, setOverview] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [activeEventId, setActiveEventId] = useState<number | null>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [guests, setGuests] = useState<any[]>([]);
  const [ticketsData, setTicketsData] = useState<{ counts: any; items: any[] }>({
    counts: { AVAILABLE: 0, RESERVED: 0, QUEUED: 0, SENT: 0, SEND_ERROR: 0, INVALIDATED: 0 },
    items: [],
  });
  const [templates, setTemplates] = useState<any[]>([]);
  const [waConfig, setWaConfig] = useState<any>(null);
  const [waQrInfo, setWaQrInfo] = useState<any>(null);
  const [dispatchQueue, setDispatchQueue] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [inviteFilter, setInviteFilter] = useState('ALL');
  const [ticketFilter, setTicketFilter] = useState('ALL');
  const [dispatchSubTab, setDispatchSubTab] = useState<'TEMPLATES' | 'WHATSAPP' | 'QUEUE' | 'AUDIT'>('TEMPLATES');

  // Guest Multi-selection for WhatsApp Dispatch
  const [selectedGuestIds, setSelectedGuestIds] = useState<number[]>([]);

  // Modals State
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<any>(null);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [contactHistoryModal, setContactHistoryModal] = useState<any>(null);

  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [sheetModalOpen, setSheetModalOpen] = useState(false);
  const [smartPasteModalOpen, setSmartPasteModalOpen] = useState(false);

  const [vaultUploadModalOpen, setVaultUploadModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) || events[0] || null,
    [events, activeEventId]
  );

  const eventSectors: any[] = useMemo(() => {
    if (activeEvent?.sectors?.length) return activeEvent.sectors;
    return [
      { key: 'VIP', name: 'Área VIP', courtesy_quota: 100, face_value: 0 },
      { key: 'PISTA', name: 'Pista', courtesy_quota: 200, face_value: 0 },
      { key: 'CAMAROTE', name: 'Camarote', courtesy_quota: 50, face_value: 0 },
    ];
  }, [activeEvent]);

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${getToken()}` };
  }

  // ==========================================================================
  // FETCHERS
  // ==========================================================================

  const fetchOverviewAndBase = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, evRes, vnRes] = await Promise.all([
        fetch(`${API_URL}/event-management/overview`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/events`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/venues`, { headers: authHeaders() }),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (evRes.ok) {
        const evList = await evRes.json();
        setEvents(evList);
        if (evList.length > 0 && !activeEventId) {
          const preferred = evList.find((x: any) => x.status === 'OPEN' || x.status === 'ONGOING') || evList[0];
          setActiveEventId(preferred.id);
        }
      }
      if (vnRes.ok) setVenues(await vnRes.json());
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar módulo de eventos.');
    } finally {
      setLoading(false);
    }
  }, [activeEventId]);

  const fetchContacts = useCallback(async (qStr = '') => {
    const res = await fetch(
      `${API_URL}/event-management/contacts?search=${encodeURIComponent(qStr)}&limit=300`,
      { headers: authHeaders() }
    );
    if (res.ok) {
      const data = await res.json();
      setContacts(data.items || []);
      setContactsTotal(data.total || 0);
    }
  }, []);

  const fetchGuests = useCallback(async (evId?: number | null) => {
    const targetId = evId ?? activeEvent?.id;
    if (!targetId) return;
    const params = new URLSearchParams();
    if (sectorFilter !== 'ALL') params.set('sector_key', sectorFilter);
    if (inviteFilter !== 'ALL') params.set('invite_status', inviteFilter);
    if (ticketFilter !== 'ALL') params.set('ticket_status', ticketFilter);
    if (searchQuery.trim() && activeTab === 'GUESTS') params.set('search', searchQuery.trim());

    const res = await fetch(
      `${API_URL}/event-management/events/${targetId}/guests?${params.toString()}`,
      { headers: authHeaders() }
    );
    if (res.ok) setGuests(await res.json());
  }, [activeEvent?.id, sectorFilter, inviteFilter, ticketFilter, searchQuery, activeTab]);

  const fetchTickets = useCallback(async (evId?: number | null) => {
    const targetId = evId ?? activeEvent?.id;
    if (!targetId) return;
    const params = new URLSearchParams();
    if (sectorFilter !== 'ALL') params.set('sector_key', sectorFilter);
    if (ticketFilter !== 'ALL') params.set('status_filter', ticketFilter);
    const res = await fetch(
      `${API_URL}/event-management/events/${targetId}/tickets?${params.toString()}`,
      { headers: authHeaders() }
    );
    if (res.ok) setTicketsData(await res.json());
  }, [activeEvent?.id, sectorFilter, ticketFilter]);

  const fetchDispatchAndLogs = useCallback(async () => {
    const [tplRes, waRes, qRes, logRes] = await Promise.all([
      fetch(`${API_URL}/event-management/templates${activeEvent?.id ? `?event_id=${activeEvent.id}` : ''}`, {
        headers: authHeaders(),
      }),
      fetch(`${API_URL}/event-management/whatsapp/config`, { headers: authHeaders() }),
      fetch(`${API_URL}/event-management/dispatch-queue${activeEvent?.id ? `?event_id=${activeEvent.id}` : ''}`, {
        headers: authHeaders(),
      }),
      fetch(`${API_URL}/event-management/audit-logs${activeEvent?.id ? `?event_id=${activeEvent.id}` : ''}`, {
        headers: authHeaders(),
      }),
    ]);
    if (tplRes.ok) setTemplates(await tplRes.json());
    if (waRes.ok) setWaConfig(await waRes.json());
    if (qRes.ok) setDispatchQueue(await qRes.json());
    if (logRes.ok) setAuditLogs(await logRes.json());
  }, [activeEvent?.id]);

  useEffect(() => {
    fetchOverviewAndBase();
  }, []);

  useEffect(() => {
    setSelectedRowIdx(0);
    if (activeTab === 'CRM') fetchContacts(searchQuery);
    if (activeTab === 'GUESTS') fetchGuests();
    if (activeTab === 'VAULT') fetchTickets();
    if (activeTab === 'DISPATCH') fetchDispatchAndLogs();
  }, [activeTab, activeEvent?.id, sectorFilter, inviteFilter, ticketFilter]);

  // ==========================================================================
  // KEYBOARD NAVIGATION (Alt+1..6 + Arrows + Home/End + Enter + Esc)
  // ==========================================================================

  const currentGridRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (activeTab === 'EVENTS') {
      return events.filter((e) => !q || e.title?.toLowerCase().includes(q) || e.code?.toLowerCase().includes(q) || e.location_display_name?.toLowerCase().includes(q));
    }
    if (activeTab === 'VENUES') {
      return venues.filter((v) => !q || v.name?.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q));
    }
    if (activeTab === 'CRM') {
      return contacts.filter((c) => !q || c.full_name?.toLowerCase().includes(q) || c.phone_display?.includes(q) || (c.cpf || '').includes(q));
    }
    if (activeTab === 'GUESTS') {
      return guests.filter((g) => !q || g.contact?.full_name?.toLowerCase().includes(q) || g.contact?.phone_display?.includes(q) || g.promoter_name?.toLowerCase().includes(q));
    }
    if (activeTab === 'VAULT') {
      return ticketsData.items.filter((t) => !q || (t.ticket_number || '').toLowerCase().includes(q) || (t.assigned_guest_name || '').toLowerCase().includes(q) || t.original_filename?.toLowerCase().includes(q));
    }
    return auditLogs;
  }, [activeTab, events, venues, contacts, guests, ticketsData.items, auditLogs, searchQuery]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (SUBMODULE_TABS[idx]) setActiveTab(SUBMODULE_TABS[idx].key);
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      const anyModalOpen =
        eventModalOpen ||
        venueModalOpen ||
        contactModalOpen ||
        !!contactHistoryModal ||
        guestModalOpen ||
        sheetModalOpen ||
        smartPasteModalOpen ||
        vaultUploadModalOpen ||
        templateModalOpen ||
        dispatchModalOpen;

      if (e.key === 'Escape' && anyModalOpen) {
        setEventModalOpen(false);
        setVenueModalOpen(false);
        setContactModalOpen(false);
        setContactHistoryModal(null);
        setGuestModalOpen(false);
        setSheetModalOpen(false);
        setSmartPasteModalOpen(false);
        setVaultUploadModalOpen(false);
        setTemplateModalOpen(false);
        setDispatchModalOpen(false);
        return;
      }

      if (anyModalOpen || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedRowIdx((prev) => Math.min(Math.max(0, currentGridRows.length - 1), prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedRowIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedRowIdx(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSelectedRowIdx(Math.max(0, currentGridRows.length - 1));
      } else if (e.key === 'Enter' && currentGridRows[selectedRowIdx]) {
        e.preventDefault();
        const row = currentGridRows[selectedRowIdx];
        if (activeTab === 'EVENTS') {
          setActiveEventId(row.id);
          setActiveTab('GUESTS');
        } else if (activeTab === 'VENUES') {
          setEditingVenue(row);
          setVenueModalOpen(true);
        } else if (activeTab === 'CRM') {
          openContactHistory(row.id);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentGridRows,
    selectedRowIdx,
    activeTab,
    eventModalOpen,
    venueModalOpen,
    contactModalOpen,
    contactHistoryModal,
    guestModalOpen,
    sheetModalOpen,
    smartPasteModalOpen,
    vaultUploadModalOpen,
    templateModalOpen,
    dispatchModalOpen,
  ]);

  // ==========================================================================
  // HANDLERS AUXILIARES
  // ==========================================================================

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
      toast.error(data.detail || 'Falha ao enviar imagem.');
      return null;
    }
    return data.url;
  }

  async function openContactHistory(contactId: number) {
    const res = await fetch(`${API_URL}/event-management/contacts/${contactId}/history`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      setContactHistoryModal(await res.json());
    }
  }

  async function handleInlineGuestUpdate(guestId: number, patch: Record<string, any>) {
    if (!activeEvent) return;
    const res = await fetch(`${API_URL}/event-management/events/${activeEvent.id}/guests/${guestId}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      toast.success('Registro atualizado na lista.');
      fetchGuests();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || 'Falha ao atualizar convidado.');
    }
  }

  async function handleGuestCheckinToggle(g: any) {
    if (!activeEvent) return;
    const isChecked = g.checkin_status === 'CHECKED_IN';
    const res = await fetch(`${API_URL}/event-management/events/${activeEvent.id}/checkin`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id: g.id, undo: isChecked }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message);
      fetchGuests();
      fetchOverviewAndBase();
    } else {
      toast.error(data.detail || 'Erro no check-in.');
    }
  }

  async function handleResendSamePdf(guestId: number) {
    if (!activeEvent) return;
    if (!window.confirm('Deseja enfileirar a 2ª via do MESMO arquivo PDF já vinculado a este convidado?')) return;
    const res = await fetch(
      `${API_URL}/event-management/events/${activeEvent.id}/guests/${guestId}/resend-ticket`,
      { method: 'POST', headers: authHeaders() }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success('2ª via do mesmo PDF enfileirada com segurança!');
      fetchGuests();
    } else {
      toast.error(data.detail || 'Não foi possível reenviar.');
    }
  }

  async function handleRemoveGuest(guestId: number) {
    if (!activeEvent) return;
    if (!window.confirm('Remover este convidado da lista deste evento? (O contato permanecerá salvo no CRM)')) return;
    const res = await fetch(`${API_URL}/event-management/events/${activeEvent.id}/guests/${guestId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success('Convidado removido da lista do evento.');
      fetchGuests();
      fetchOverviewAndBase();
    } else {
      toast.error(data.detail || 'Não foi possível remover.');
    }
  }

  // ÚNICA AÇÃO PRIMÁRIA NO TOPO POR SUBMÓDULO (Regra Anti-Redundância)
  function renderPrimaryTopAction() {
    if (activeTab === 'EVENTS') {
      return (
        <button
          onClick={() => {
            setEditingEvent(null);
            setEventModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Novo Evento
        </button>
      );
    }
    if (activeTab === 'VENUES') {
      return (
        <button
          onClick={() => {
            setEditingVenue(null);
            setVenueModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Nova Casa de Show
        </button>
      );
    }
    if (activeTab === 'CRM') {
      return (
        <button
          onClick={() => {
            setEditingContact(null);
            setContactModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Novo Contato CRM
        </button>
      );
    }
    if (activeTab === 'GUESTS') {
      return (
        <button
          onClick={() => setGuestModalOpen(true)}
          disabled={!activeEvent}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Incluir Convidado na Lista
        </button>
      );
    }
    if (activeTab === 'VAULT') {
      return (
        <button
          onClick={() => setVaultUploadModalOpen(true)}
          disabled={!activeEvent}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
        >
          <Upload className="w-4 h-4" /> Subir Ingressos PDF / ZIP
        </button>
      );
    }
    return (
      <button
        onClick={() => {
          setEditingTemplate(null);
          setTemplateModalOpen(true);
        }}
        className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
      >
        <Plus className="w-4 h-4" /> Novo Modelo de Convite
      </button>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      {/* BARRA MESTRE DO WORKSPACE (ESTILO ACCESS MODERNO) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                WORKSPACE ACCESS MODERNO
              </span>
              <span className="text-xs text-slate-400 hidden sm:inline">
                Use Alt+1..6 para alternar módulos e ↑ ↓ Enter na grade
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Gerenciamento de Eventos, Convidados & Cofre de Ingressos
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/event-management/mobile"
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100"
            >
              <Smartphone className="w-4 h-4 text-indigo-500" /> Modo Mobile & Portaria
            </Link>
            {renderPrimaryTopAction()}
          </div>
        </div>

        {/* Seletor Global do Evento em Foco + KPIs Rápidos */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 items-center">
          <div className="lg:col-span-5 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0">
              Evento em Foco:
            </span>
            <select
              value={activeEvent?.id || ''}
              onChange={(e) => setActiveEventId(Number(e.target.value))}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
            >
              {events.length === 0 && <option value="">Nenhum evento cadastrado</option>}
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  [{ev.code}] {ev.title} — {ev.event_date?.split('-').reverse().join('/')} ({ev.location_display_name || 'Local avulso'})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800">
              <div className="text-slate-500">Base CRM</div>
              <div className="font-mono font-bold text-base text-slate-900 dark:text-white">
                {overview?.kpis?.total_contacts ?? contactsTotal}
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800">
              <div className="text-slate-500">Convidados Evento</div>
              <div className="font-mono font-bold text-base text-indigo-600 dark:text-indigo-400">
                {activeEvent?.stats?.total_people ?? 0}
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900">
              <div className="text-emerald-700 dark:text-emerald-400">PDFs Disponíveis</div>
              <div className="font-mono font-bold text-base text-emerald-700 dark:text-emerald-300">
                {activeEvent?.stats?.tickets_available ?? ticketsData.counts.AVAILABLE ?? 0}
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/70 dark:border-violet-900">
              <div className="text-violet-700 dark:text-violet-400">PDFs Enviados</div>
              <div className="font-mono font-bold text-base text-violet-700 dark:text-violet-300">
                {activeEvent?.stats?.tickets_sent ?? ticketsData.counts.SENT ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Submódulos Internos Roláveis (Mobile First + Atalhos Alt+1..6) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {SUBMODULE_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition border ${
                  active
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-500 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
                <span className="hidden md:inline text-[10px] font-mono opacity-70 px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10">
                  {t.shortcut}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* BARRA DE BUSCA & FILTROS DA PLANILHA */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (activeTab === 'CRM') fetchContacts(e.target.value);
            }}
            placeholder="Pesquisa rápida na grade ativa (Nome, DDD+Telefone, CPF, Código, Casa de Show)..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
        </div>

        {(activeTab === 'GUESTS' || activeTab === 'VAULT') && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="ALL">Todos os Setores</option>
              {eventSectors.map((s: any) => (
                <option key={s.key} value={s.key}>
                  Setor: {s.name || s.key}
                </option>
              ))}
            </select>

            {activeTab === 'GUESTS' && (
              <>
                <select
                  value={inviteFilter}
                  onChange={(e) => setInviteFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="ALL">Convite: Todos</option>
                  <option value="PENDING">Não Enviado</option>
                  <option value="INVITE_SENT">Aguardando RSVP</option>
                  <option value="CONFIRMED">Confirmado ✓</option>
                  <option value="DECLINED">Recusado</option>
                </select>

                <button
                  onClick={() => setSheetModalOpen(true)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-600" /> Importar Planilha
                </button>
                <button
                  onClick={() => setSmartPasteModalOpen(true)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-indigo-600" /> Colar do Whats
                </button>
                {selectedGuestIds.length > 0 && (
                  <button
                    onClick={() => setDispatchModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" /> Disparar no Whats ({selectedGuestIds.length})
                  </button>
                )}
              </>
            )}

            {activeTab === 'VAULT' && (
              <select
                value={ticketFilter}
                onChange={(e) => setTicketFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="ALL">Status Ingresso: Todos</option>
                <option value="AVAILABLE">Disponíveis</option>
                <option value="RESERVED">Reservados</option>
                <option value="QUEUED">Na Fila Whats</option>
                <option value="SENT">Enviados ✓</option>
                <option value="SEND_ERROR">Erro no Envio</option>
                <option value="INVALIDATED">Invalidados</option>
              </select>
            )}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* ALT+1: GRADE DE EVENTOS                                              */}
      {/* ==================================================================== */}
      {activeTab === 'EVENTS' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Evento</th>
                <th className="py-3 px-4">Data & Horário</th>
                <th className="py-3 px-4">Casa de Show / Local</th>
                <th className="py-3 px-4">Modo Ingressos</th>
                <th className="py-3 px-4 text-right">Convidados</th>
                <th className="py-3 px-4 text-right">PDFs Disp. / Env.</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentGridRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Nenhum evento cadastrado ainda. Use o botão superior para criar o primeiro evento.
                  </td>
                </tr>
              ) : (
                currentGridRows.map((ev: any, idx: number) => (
                  <tr
                    key={ev.id}
                    onClick={() => {
                      setSelectedRowIdx(idx);
                      setActiveEventId(ev.id);
                    }}
                    onDoubleClick={() => {
                      setEditingEvent(ev);
                      setEventModalOpen(true);
                    }}
                    className={`cursor-pointer transition ${
                      idx === selectedRowIdx
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {ev.code}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {ev.title}
                      {ev.subtitle && <div className="text-[11px] font-normal text-slate-400">{ev.subtitle}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                      {ev.event_date?.split('-').reverse().join('/')}
                      {ev.doors_open_time ? ` • ${ev.doors_open_time}` : ''}
                    </td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                      <div className="font-semibold">{ev.location_display_name || 'Endereço avulso'}</div>
                      <div className="text-[11px] text-slate-400">
                        {[ev.neighborhood, ev.city, ev.state].filter(Boolean).join(' • ')}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-semibold">
                        {ev.ticket_mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {ev.stats?.total_people || 0}
                      <span className="text-emerald-600 ml-1">({ev.stats?.confirmed_guests || 0} conf.)</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      <span className="text-emerald-600 font-bold">{ev.stats?.tickets_available || 0}</span>
                      {' / '}
                      <span className="text-indigo-600 font-bold">{ev.stats?.tickets_sent || 0}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          ev.status === 'OPEN'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveEventId(ev.id);
                          setActiveTab('GUESTS');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold"
                      >
                        Abrir Lista
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEvent(ev);
                          setEventModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        title="Editar Evento"
                      >
                        <Edit3 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ALT+2: CASAS DE SHOW PRÉ-CADASTRADAS                                 */}
      {/* ==================================================================== */}
      {activeTab === 'VENUES' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Casa de Show / Espaço</th>
                <th className="py-3 px-4">Endereço Completo</th>
                <th className="py-3 px-4">Cidade / UF</th>
                <th className="py-3 px-4 text-right">Capacidade</th>
                <th className="py-3 px-4">Classificação</th>
                <th className="py-3 px-4">Contato Responsável</th>
                <th className="py-3 px-4 text-right">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentGridRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhuma casa de show pré-cadastrada. Cadastre suas casas recorrentes para agilizar novos eventos.
                  </td>
                </tr>
              ) : (
                currentGridRows.map((v: any, idx: number) => (
                  <tr
                    key={v.id}
                    onClick={() => setSelectedRowIdx(idx)}
                    onDoubleClick={() => {
                      setEditingVenue(v);
                      setVenueModalOpen(true);
                    }}
                    className={`cursor-pointer ${
                      idx === selectedRowIdx
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{v.name}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {[v.street, v.number, v.neighborhood].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4">{[v.city, v.state].filter(Boolean).join('/') || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono">{v.total_capacity || '—'}</td>
                    <td className="py-3 px-4 font-mono">{v.age_rating}</td>
                    <td className="py-3 px-4">
                      {v.contact_name || '—'} {v.contact_phone ? `(${v.contact_phone})` : ''}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setEditingVenue(v);
                          setVenueModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        <Edit3 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ALT+3: BASE CRM DE CONVIDADOS & HISTÓRICO 360º                       */}
      {/* ==================================================================== */}
      {activeTab === 'CRM' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Nome Completo</th>
                <th className="py-3 px-4">DDD + WhatsApp (Único)</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Instagram / Empresa</th>
                <th className="py-3 px-4">Origem / Promoter</th>
                <th className="py-3 px-4 text-right">Eventos</th>
                <th className="py-3 px-4 text-right">PDFs Receb.</th>
                <th className="py-3 px-4 text-right">Check-ins (%)</th>
                <th className="py-3 px-4 text-right">Ficha & Histórico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentGridRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Nenhum convidado na base CRM deste Seller.
                  </td>
                </tr>
              ) : (
                currentGridRows.map((c: any, idx: number) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedRowIdx(idx)}
                    onDoubleClick={() => openContactHistory(c.id)}
                    className={`cursor-pointer ${
                      idx === selectedRowIdx
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {c.full_name}
                      {c.is_blocked && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[10px] font-bold">
                          RESTRITO
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {c.phone_display}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[10px]">
                        {c.category_tag}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {[c.instagram, c.company_org].filter(Boolean).join(' • ') || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {c.origin_source} {c.origin_promoter_name ? `(${c.origin_promoter_name})` : ''}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">{c.total_events_invited}</td>
                    <td className="py-3 px-4 text-right font-mono">{c.total_tickets_sent}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                      {c.total_checkins} {c.attendance_rate !== null ? `(${c.attendance_rate}%)` : ''}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openContactHistory(c.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200"
                      >
                        <History className="w-3.5 h-3.5 inline mr-1" /> Histórico
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingContact(c);
                          setContactModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        <Edit3 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ALT+4: LISTA DE CONVIDADOS DO EVENTO & CORTESIAS                     */}
      {/* ==================================================================== */}
      {activeTab === 'GUESTS' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                <th className="py-3 px-3 w-9">
                  <input
                    type="checkbox"
                    checked={currentGridRows.length > 0 && selectedGuestIds.length === currentGridRows.length}
                    onChange={(e) =>
                      setSelectedGuestIds(e.target.checked ? currentGridRows.map((g: any) => g.id) : [])
                    }
                  />
                </th>
                <th className="py-3 px-3">Convidado & Histórico</th>
                <th className="py-3 px-3">DDD + WhatsApp</th>
                <th className="py-3 px-3">Setor</th>
                <th className="py-3 px-3">Promoter / Origem</th>
                <th className="py-3 px-3">Status Convite (RSVP)</th>
                <th className="py-3 px-3">Ingresso PDF / QR</th>
                <th className="py-3 px-3">Portaria</th>
                <th className="py-3 px-3 text-right">Operações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentGridRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Lista vazia para este filtro. Inclua convidados, cole do WhatsApp ou importe planilha Excel/CSV.
                  </td>
                </tr>
              ) : (
                currentGridRows.map((g: any, idx: number) => {
                  const checked = selectedGuestIds.includes(g.id);
                  return (
                    <tr
                      key={g.id}
                      onClick={() => setSelectedRowIdx(idx)}
                      className={`${
                        idx === selectedRowIdx
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedGuestIds((prev) =>
                              e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                            )
                          }
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => openContactHistory(g.contact_id)}
                          className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 text-left"
                        >
                          {g.contact?.full_name}
                          {g.companions_count > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px]">
                              +{g.companions_count}
                            </span>
                          )}
                        </button>
                        <div className="text-[11px] text-slate-400">
                          {g.contact?.category_tag} • {g.contact?.total_events_invited || 1} evento(s) no CRM
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold">{g.contact?.phone_display}</td>
                      <td className="py-2.5 px-3">
                        <select
                          value={g.sector_key}
                          onChange={(e) => handleInlineGuestUpdate(g.id, { sector_key: e.target.value })}
                          className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-[11px]"
                        >
                          {eventSectors.map((s: any) => (
                            <option key={s.key} value={s.key}>
                              {s.key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        <div>{g.promoter_name || '—'}</div>
                        <div className="text-[10px] opacity-75">{g.added_via}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={g.invite_status}
                          onChange={(e) => handleInlineGuestUpdate(g.id, { invite_status: e.target.value })}
                          className={`px-2 py-1 rounded-lg border font-bold text-[11px] ${
                            g.invite_status === 'CONFIRMED'
                              ? 'bg-emerald-500/15 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                              : g.invite_status === 'DECLINED'
                              ? 'bg-rose-500/15 border-rose-300 text-rose-700'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <option value="PENDING">PENDENTE</option>
                          <option value="QUEUED_INVITE">NA FILA</option>
                          <option value="INVITE_SENT">ENVIADO</option>
                          <option value="CONFIRMED">CONFIRMADO ✓</option>
                          <option value="DECLINED">RECUSADO</option>
                          <option value="CANCELLED">CANCELADO</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        {g.ticket_delivery_status === 'SENT' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> ENVIADO ({g.ticket?.ticket_number || 'PDF'})
                          </span>
                        ) : g.ticket ? (
                          <span className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
                            {g.ticket.status}: {g.ticket.ticket_number}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sem PDF alocado</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => handleGuestCheckinToggle(g)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                            g.checkin_status === 'CHECKED_IN'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50'
                          }`}
                        >
                          {g.checkin_status === 'CHECKED_IN' ? 'Entrou ✓' : 'Check-in'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/convite/${g.rsvp_token}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link pessoal de confirmação (RSVP / QR) copiado!');
                          }}
                          title="Copiar link do convite"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <Copy className="w-3.5 h-3.5 inline" />
                        </button>
                        {g.ticket_delivery_status === 'SENT' ? (
                          <button
                            onClick={() => handleResendSamePdf(g.id)}
                            title="Reenviar 2ª via do MESMO PDF vinculado"
                            className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-[11px]"
                          >
                            2ª Via PDF
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedGuestIds([g.id]);
                              setDispatchModalOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-semibold text-[11px]"
                          >
                            Enviar Whats
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveGuest(g.id)}
                          title="Remover da lista"
                          className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ALT+5: COFRE DE INGRESSOS PDF / ZIP BLINDADO                         */}
      {/* ==================================================================== */}
      {activeTab === 'VAULT' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
            {[
              { label: 'Disponíveis no Cofre', val: ticketsData.counts.AVAILABLE || 0, cls: 'text-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900' },
              { label: 'Reservados (1:1)', val: ticketsData.counts.RESERVED || 0, cls: 'text-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900' },
              { label: 'Na Fila de Envio', val: ticketsData.counts.QUEUED || 0, cls: 'text-amber-600 bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900' },
              { label: 'Enviados c/ Sucesso', val: ticketsData.counts.SENT || 0, cls: 'text-violet-600 bg-violet-50/70 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900' },
              { label: 'Falha no Envio', val: ticketsData.counts.SEND_ERROR || 0, cls: 'text-rose-600 bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900' },
              { label: 'Invalidados', val: ticketsData.counts.INVALIDATED || 0, cls: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' },
            ].map((c, i) => (
              <div key={i} className={`p-3 rounded-2xl border ${c.cls}`}>
                <div className="font-medium opacity-80">{c.label}</div>
                <div className="text-xl font-mono font-bold mt-0.5">{c.val}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">ID / Código Extraído</th>
                  <th className="py-3 px-4">Setor</th>
                  <th className="py-3 px-4">Arquivo Origem / Pág.</th>
                  <th className="py-3 px-4">Trecho Validado do PDF</th>
                  <th className="py-3 px-4">Status Cofre</th>
                  <th className="py-3 px-4">Convidado Titular Exclusivo</th>
                  <th className="py-3 px-4 text-right">Controles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {currentGridRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Nenhum ingresso PDF no cofre deste evento. Clique no botão superior para importar um PDF multipágina ou arquivo ZIP.
                    </td>
                  </tr>
                ) : (
                  currentGridRows.map((tk: any, idx: number) => (
                    <tr
                      key={tk.id}
                      onClick={() => setSelectedRowIdx(idx)}
                      className={idx === selectedRowIdx ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''}
                    >
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        #{tk.id} • {tk.ticket_number}
                      </td>
                      <td className="py-2.5 px-4 font-bold">{tk.sector_key}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {tk.original_filename} (Pág. {tk.page_number})
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate" title={tk.extracted_text_snippet}>
                        {tk.extracted_text_snippet || 'PDF gráfico validado (SHA-256 único)'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            tk.status === 'AVAILABLE'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : tk.status === 'SENT'
                              ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                              : tk.status === 'INVALIDATED'
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {tk.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {tk.assigned_guest_name ? (
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{tk.assigned_guest_name}</div>
                            <div className="font-mono text-[11px] text-slate-500">{tk.assigned_guest_phone}</div>
                          </div>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Livre p/ Alocação</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={async () => {
                            const res = await fetch(`${API_URL}/event-management/tickets/${tk.id}/download`, {
                              headers: authHeaders(),
                            });
                            if (!res.ok) {
                              toast.error('Não foi possível abrir o PDF.');
                              return;
                            }
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            window.open(url, '_blank');
                          }}
                          className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold"
                        >
                          <Eye className="w-3.5 h-3.5 inline mr-1" /> Ver PDF
                        </button>
                        {tk.status === 'RESERVED' && (
                          <button
                            onClick={async () => {
                              const res = await fetch(`${API_URL}/event-management/tickets/${tk.id}/unassign`, {
                                method: 'POST',
                                headers: authHeaders(),
                              });
                              if (res.ok) {
                                toast.success('Reserva liberada — ingresso voltou para DISPONÍVEL.');
                                fetchTickets();
                              }
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 font-semibold"
                          >
                            Liberar
                          </button>
                        )}
                        {tk.status === 'AVAILABLE' && (
                          <button
                            onClick={async () => {
                              const reason = window.prompt('Motivo para inutilizar este ingresso PDF:');
                              if (!reason) return;
                              const res = await fetch(`${API_URL}/event-management/tickets/${tk.id}/invalidate`, {
                                method: 'POST',
                                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ reason }),
                              });
                              if (res.ok) {
                                toast.success('Ingresso marcado como invalidado.');
                                fetchTickets();
                              }
                            }}
                            className="px-2 py-1 rounded-lg hover:bg-rose-50 text-rose-600 font-semibold"
                          >
                            Invalidar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ALT+6: CONVITES, CONEXÃO WHATSAPP ANTI-BAN, FILA & AUDITORIA         */}
      {/* ==================================================================== */}
      {activeTab === 'DISPATCH' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'TEMPLATES', label: `Modelos de Convite (${templates.length})` },
              { id: 'WHATSAPP', label: 'Conexão WhatsApp, Anti-Bloqueio & Bot vCard' },
              { id: 'QUEUE', label: `Fila de Disparo (${dispatchQueue.filter((q) => q.status === 'PENDING').length} pendentes)` },
              { id: 'AUDIT', label: 'Histórico Geral de Alterações' },
            ].map((st: any) => (
              <button
                key={st.id}
                onClick={() => setDispatchSubTab(st.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border ${
                  dispatchSubTab === st.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {dispatchSubTab === 'TEMPLATES' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.length === 0 ? (
                <div className="col-span-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
                  Nenhum modelo personalizado cadastrado ainda. O sistema já possui textos inteligentes padrão, ou você pode criar modelos com a imagem do evento usando o botão superior.
                </div>
              ) : (
                templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      {tpl.image_url && (
                        <img
                          src={getImageUrl(tpl.image_url)}
                          alt={tpl.name}
                          className="h-40 w-full object-cover bg-slate-100"
                        />
                      )}
                      <div className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-[10px] font-bold">
                            {tpl.template_purpose}
                          </span>
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{tpl.name}</h3>
                        <p className="text-xs text-slate-500 whitespace-pre-line line-clamp-4">{tpl.message_body}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingTemplate(tpl);
                          setTemplateModalOpen(true);
                        }}
                        className="text-xs font-semibold text-indigo-600"
                      >
                        Editar
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Excluir este modelo de convite?')) return;
                          await fetch(`${API_URL}/event-management/templates/${tpl.id}`, {
                            method: 'DELETE',
                            headers: authHeaders(),
                          });
                          fetchDispatchAndLogs();
                        }}
                        className="text-xs font-semibold text-rose-500"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {dispatchSubTab === 'WHATSAPP' && waConfig && (
            <WhatsAppConfigPanel
              waConfig={waConfig}
              setWaConfig={setWaConfig}
              waQrInfo={waQrInfo}
              setWaQrInfo={setWaQrInfo}
              events={events}
              authHeaders={authHeaders}
              onSaved={fetchDispatchAndLogs}
            />
          )}

          {dispatchSubTab === 'QUEUE' && (
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <strong>Proteção Anti-Bloqueio Ativa:</strong> O worker processa os envios em background com intervalo aleatório ({waConfig?.min_delay_seconds || 25}s a {waConfig?.max_delay_seconds || 55}s) + pausa de descanso a cada lote.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchDispatchAndLogs}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                  </button>
                  <button
                    onClick={async () => {
                      const nextPaused = !waConfig?.queue_paused;
                      const res = await fetch(
                        `${API_URL}/event-management/dispatch-queue/toggle-pause?paused=${nextPaused}`,
                        { method: 'POST', headers: authHeaders() }
                      );
                      if (res.ok) {
                        toast.success(nextPaused ? 'Fila pausada!' : 'Fila retomada!');
                        fetchDispatchAndLogs();
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 ${
                      waConfig?.queue_paused ? 'bg-emerald-600' : 'bg-amber-600'
                    }`}
                  >
                    {waConfig?.queue_paused ? (
                      <>
                        <PlayCircle className="w-4 h-4" /> Retomar Fila
                      </>
                    ) : (
                      <>
                        <PauseCircle className="w-4 h-4" /> Pausar Fila
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 font-bold uppercase">
                      <th className="py-3 px-4">Convidado</th>
                      <th className="py-3 px-4">Telefone</th>
                      <th className="py-3 px-4">Modo</th>
                      <th className="py-3 px-4">Agendado (Cadência)</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Retorno / Protocolo</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {dispatchQueue.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-4 font-bold">{item.recipient_name}</td>
                        <td className="py-2.5 px-4 font-mono">{item.recipient_phone}</td>
                        <td className="py-2.5 px-4">{item.dispatch_mode}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {item.scheduled_for ? new Date(item.scheduled_for).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-bold">{item.status}</td>
                        <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate">
                          {item.error_message || item.provider_message_id || 'Aguardando vez na fila'}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {item.status === 'PENDING' && (
                            <button
                              onClick={async () => {
                                await fetch(`${API_URL}/event-management/dispatch-queue/${item.id}/cancel`, {
                                  method: 'POST',
                                  headers: authHeaders(),
                                });
                                fetchDispatchAndLogs();
                              }}
                              className="text-rose-500 font-semibold"
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
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 font-bold uppercase">
                    <th className="py-3 px-4">Data / Hora (BRT)</th>
                    <th className="py-3 px-4">Entidade / Ação</th>
                    <th className="py-3 px-4">Operador / Canal</th>
                    <th className="py-3 px-4">Descrição Detalhada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {l.entity_type} • {l.action}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold">{l.actor_name}</div>
                        <div className="text-[10px] text-slate-400">{l.source_channel}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">{l.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* BARRA INFERIOR DE NAVEGAÇÃO DE REGISTROS (PADRÃO MICROSOFT ACCESS MODERNO) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 shadow-sm">
        <div className="flex items-center gap-1.5 font-mono">
          <button
            onClick={() => setSelectedRowIdx(0)}
            disabled={currentGridRows.length === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Primeiro Registro (Home)"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedRowIdx((p) => Math.max(0, p - 1))}
            disabled={currentGridRows.length === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Anterior (↑)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold">
            Registro {currentGridRows.length === 0 ? 0 : Math.min(selectedRowIdx + 1, currentGridRows.length)} de{' '}
            {currentGridRows.length}
          </span>
          <button
            onClick={() => setSelectedRowIdx((p) => Math.min(Math.max(0, currentGridRows.length - 1), p + 1))}
            disabled={currentGridRows.length === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Próximo (↓)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedRowIdx(Math.max(0, currentGridRows.length - 1))}
            disabled={currentGridRows.length === 0}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Último Registro (End)"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Anti-Duplicidade DDD + SHA-256 PDF Ativo
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAIS DE CADASTRO & OPERAÇÃO                                        */}
      {/* ==================================================================== */}

      {eventModalOpen && (
        <EventFormModal
          initial={editingEvent}
          venues={venues}
          authHeaders={authHeaders}
          uploadImageHelper={uploadImageHelper}
          onClose={() => setEventModalOpen(false)}
          onSaved={(savedEv: any) => {
            setEventModalOpen(false);
            setActiveEventId(savedEv.id);
            fetchOverviewAndBase();
          }}
        />
      )}

      {venueModalOpen && (
        <VenueFormModal
          initial={editingVenue}
          authHeaders={authHeaders}
          onClose={() => setVenueModalOpen(false)}
          onSaved={() => {
            setVenueModalOpen(false);
            fetchOverviewAndBase();
          }}
        />
      )}

      {contactModalOpen && (
        <ContactFormModal
          initial={editingContact}
          authHeaders={authHeaders}
          onClose={() => setContactModalOpen(false)}
          onSaved={() => {
            setContactModalOpen(false);
            fetchContacts(searchQuery);
            fetchOverviewAndBase();
          }}
        />
      )}

      {contactHistoryModal && (
        <ContactHistoryDrawer
          data={contactHistoryModal}
          onClose={() => setContactHistoryModal(null)}
        />
      )}

      {guestModalOpen && activeEvent && (
        <AddGuestModal
          event={activeEvent}
          sectors={eventSectors}
          authHeaders={authHeaders}
          onClose={() => setGuestModalOpen(false)}
          onSaved={() => {
            setGuestModalOpen(false);
            fetchGuests();
            fetchOverviewAndBase();
          }}
        />
      )}

      {sheetModalOpen && activeEvent && (
        <ImportSpreadsheetModal
          event={activeEvent}
          sectors={eventSectors}
          authHeaders={authHeaders}
          onClose={() => setSheetModalOpen(false)}
          onImported={() => {
            setSheetModalOpen(false);
            fetchGuests();
            fetchOverviewAndBase();
          }}
        />
      )}

      {smartPasteModalOpen && activeEvent && (
        <SmartPasteDesktopModal
          event={activeEvent}
          sectors={eventSectors}
          authHeaders={authHeaders}
          onClose={() => setSmartPasteModalOpen(false)}
          onImported={() => {
            setSmartPasteModalOpen(false);
            fetchGuests();
            fetchOverviewAndBase();
          }}
        />
      )}

      {vaultUploadModalOpen && activeEvent && (
        <VaultUploadModal
          event={activeEvent}
          sectors={eventSectors}
          authHeaders={authHeaders}
          onClose={() => setVaultUploadModalOpen(false)}
          onUploaded={() => {
            setVaultUploadModalOpen(false);
            fetchTickets();
            fetchOverviewAndBase();
          }}
        />
      )}

      {templateModalOpen && (
        <InviteTemplateModal
          initial={editingTemplate}
          activeEventId={activeEvent?.id || null}
          authHeaders={authHeaders}
          uploadImageHelper={uploadImageHelper}
          onClose={() => setTemplateModalOpen(false)}
          onSaved={() => {
            setTemplateModalOpen(false);
            fetchDispatchAndLogs();
          }}
        />
      )}

      {dispatchModalOpen && activeEvent && (
        <DispatchWhatsAppModal
          event={activeEvent}
          guestIds={selectedGuestIds}
          templates={templates}
          authHeaders={authHeaders}
          onClose={() => setDispatchModalOpen(false)}
          onDispatched={() => {
            setDispatchModalOpen(false);
            setSelectedGuestIds([]);
            fetchGuests();
            fetchTickets();
            fetchOverviewAndBase();
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTES MODULARES DE FORMULÁRIOS E MODAIS
// ============================================================================

function EventFormModal({ initial, venues, authHeaders, uploadImageHelper, onClose, onSaved }: any) {
  const [title, setTitle] = useState(initial?.title || '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle || '');
  const [eventDate, setEventDate] = useState(initial?.event_date || new Date().toISOString().slice(0, 10));
  const [doorsOpen, setDoorsOpen] = useState(initial?.doors_open_time || '21:00');
  const [startTime, setStartTime] = useState(initial?.start_time || '23:00');
  const [cutoffTime, setCutoffTime] = useState(initial?.list_cutoff_time || '00:30');
  const [status, setStatus] = useState(initial?.status || 'OPEN');
  const [venueId, setVenueId] = useState<string>(initial?.venue_id ? String(initial.venue_id) : '');
  const [customLocation, setCustomLocation] = useState(initial?.custom_location_name || '');
  const [street, setStreet] = useState(initial?.street || '');
  const [number, setNumber] = useState(initial?.number || '');
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood || '');
  const [city, setCity] = useState(initial?.city || '');
  const [stateUf, setStateUf] = useState(initial?.state || 'SP');
  const [bannerUrl, setBannerUrl] = useState(initial?.banner_url || '');
  const [ticketMode, setTicketMode] = useState(initial?.ticket_mode || 'HYBRID');
  const [dispatchFlowMode, setDispatchFlowMode] = useState(initial?.dispatch_flow_mode || 'BOTH_ALLOWED');
  const [autoSendRsvp, setAutoSendRsvp] = useState(Boolean(initial?.auto_send_ticket_on_rsvp));
  const [sectors, setSectors] = useState<any[]>(
    initial?.sectors || [
      { key: 'VIP', name: 'Área VIP', courtesy_quota: 100, face_value: 0 },
      { key: 'PISTA', name: 'Pista', courtesy_quota: 200, face_value: 0 },
      { key: 'CAMAROTE', name: 'Camarote', courtesy_quota: 50, face_value: 0 },
    ]
  );
  const [saving, setSaving] = useState(false);

  function onVenueSelect(vId: string) {
    setVenueId(vId);
    const v = venues.find((x: any) => String(x.id) === vId);
    if (v) {
      setStreet(v.street || '');
      setNumber(v.number || '');
      setNeighborhood(v.neighborhood || '');
      setCity(v.city || '');
      setStateUf(v.state || 'SP');
      if (v.default_sectors?.length) setSectors(v.default_sectors);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Informe o título do evento.');
      return;
    }
    setSaving(true);
    try {
      const url = initial
        ? `${API_URL}/event-management/events/${initial.id}`
        : `${API_URL}/event-management/events`;
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          subtitle,
          status,
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
          dispatch_flow_mode: dispatchFlowMode,
          auto_send_ticket_on_rsvp: autoSendRsvp,
          sectors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar evento.');
      toast.success(initial ? 'Evento atualizado!' : 'Evento criado com sucesso!');
      onSaved(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {initial ? `Editar Evento • ${initial.code}` : 'Cadastrar Novo Evento'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="font-bold block mb-1">Nome do Evento *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Noite Sertaneja VIP • Edição Especial"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              >
                <option value="OPEN">Lista Aberta (OPEN)</option>
                <option value="DRAFT">Rascunho (DRAFT)</option>
                <option value="LIST_CLOSED">Lista Encerrada</option>
                <option value="ONGOING">Em Andamento</option>
                <option value="FINISHED">Finalizado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="font-bold block mb-1">Data do Evento *</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Abertura da Casa</label>
              <input
                type="time"
                value={doorsOpen}
                onChange={(e) => setDoorsOpen(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Início do Show</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Limite da Lista</label>
              <input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>

          {/* Casa de Show Pré-cadastrada OU Endereço Avulso */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Casa de Show Pré-Cadastrada</label>
                <select
                  value={venueId}
                  onChange={(e) => onVenueSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">-- Endereço Avulso / Espaço Específico --</option>
                  {venues.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.city}/{v.state})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Nome Alternativo do Local (se avulso)</label>
                <input
                  type="text"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  placeholder="Ex: Rooftop Jardins"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <input
                type="text"
                placeholder="Rua / Av."
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Nº"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <input
                type="text"
                placeholder="Cidade"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
          </div>

          {/* Controle Híbrido de Ingressos & Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="font-bold block mb-1">Modo de Ingressos</label>
              <select
                value={ticketMode}
                onChange={(e) => setTicketMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="HYBRID">Híbrido (Cofre PDF/ZIP + QR Nativo)</option>
                <option value="PDF_VAULT">Apenas PDFs Validados no Cofre</option>
                <option value="NATIVE_QR">Apenas Lista / QR Code Nativo</option>
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">Rotina de Envio</label>
              <select
                value={dispatchFlowMode}
                onChange={(e) => setDispatchFlowMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="BOTH_ALLOWED">Suportar Ambos (RSVP + Envio Direto)</option>
                <option value="RSVP_THEN_TICKET">Confirmar RSVP antes de gastar PDF</option>
                <option value="DIRECT_TICKET">Envio Direto do PDF</option>
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">Arte / Banner do Evento (máx 5MB)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await uploadImageHelper(f, 'banners');
                  if (url) {
                    setBannerUrl(url);
                    toast.success('Imagem do evento carregada!');
                  }
                }}
                className="w-full text-[11px]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={autoSendRsvp}
              onChange={(e) => setAutoSendRsvp(e.target.checked)}
            />
            Enviar automaticamente o PDF oficial disponível assim que o convidado confirmar presença (RSVP)
          </label>

          {/* Setores e Valores de Referência com CurrencyInput */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold">Setores, Cotas de Cortesia & Valor Facial</span>
              <button
                type="button"
                onClick={() =>
                  setSectors([...sectors, { key: `SETOR_${sectors.length + 1}`, name: 'Novo Setor', courtesy_quota: 50, face_value: 0 }])
                }
                className="text-indigo-600 font-bold"
              >
                + Adicionar Setor
              </button>
            </div>
            {sectors.map((sec, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  placeholder="SIGLA"
                  value={sec.key}
                  onChange={(e) => {
                    const cp = [...sectors];
                    cp[idx] = { ...cp[idx], key: e.target.value.toUpperCase().replace(/\s+/g, '_') };
                    setSectors(cp);
                  }}
                  className="col-span-3 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
                <input
                  type="text"
                  placeholder="Nome do Setor"
                  value={sec.name}
                  onChange={(e) => {
                    const cp = [...sectors];
                    cp[idx] = { ...cp[idx], name: e.target.value };
                    setSectors(cp);
                  }}
                  className="col-span-4 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700"
                />
                <input
                  type="number"
                  placeholder="Cota"
                  value={sec.courtesy_quota ?? 100}
                  onChange={(e) => {
                    const cp = [...sectors];
                    cp[idx] = { ...cp[idx], courtesy_quota: Number(e.target.value) };
                    setSectors(cp);
                  }}
                  className="col-span-2 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
                />
                <div className="col-span-3">
                  <CurrencyInput
                    prefixStr="R$ "
                    value={Number(sec.face_value || 0)}
                    onChangeValue={(val) => {
                      const cp = [...sectors];
                      cp[idx] = { ...cp[idx], face_value: val };
                      setSectors(cp);
                    }}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-right"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold"
            >
              {saving ? 'Salvando...' : 'Salvar Evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VenueFormModal({ initial, authHeaders, onClose, onSaved }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [cnpj, setCnpj] = useState(initial?.cnpj || '');
  const [contactName, setContactName] = useState(initial?.contact_name || '');
  const [contactPhone, setContactPhone] = useState(initial?.contact_phone || '');
  const [street, setStreet] = useState(initial?.street || '');
  const [number, setNumber] = useState(initial?.number || '');
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood || '');
  const [city, setCity] = useState(initial?.city || '');
  const [stateUf, setStateUf] = useState(initial?.state || 'SP');
  const [capacity, setCapacity] = useState(initial?.total_capacity || 1000);
  const [ageRating, setAgeRating] = useState(initial?.age_rating || '18+');
  const [notes, setNotes] = useState(initial?.access_notes || '');
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
          cnpj,
          contact_name: contactName,
          contact_phone: contactPhone,
          street,
          number,
          neighborhood,
          city,
          state: stateUf,
          total_capacity: Number(capacity) || null,
          age_rating: ageRating,
          access_notes: notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao salvar casa de show.');
      toast.success('Casa de show salva!');
      onSaved(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{initial ? 'Editar Casa de Show' : 'Pré-Cadastrar Casa de Show'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="font-bold block mb-1">Nome da Casa de Show / Espaço *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm" />
            </div>
            <input type="text" placeholder="Responsável na Casa" value={contactName} onChange={(e) => setContactName(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <input type="text" placeholder="Telefone do Responsável" value={contactPhone} onChange={(e) => setContactPhone(formatBrPhoneMask(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono" />
            <input type="text" placeholder="Logradouro / Rua" value={street} onChange={(e) => setStreet(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <input type="text" placeholder="Número" value={number} onChange={(e) => setNumber(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <input type="text" placeholder="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <div className="grid grid-cols-3 gap-2">
              <input type="text" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} className="col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="UF" maxLength={2} value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase())} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 uppercase" />
            </div>
            <input type="number" placeholder="Capacidade" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <select value={ageRating} onChange={(e) => setAgeRating(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <option value="18+">18+</option>
              <option value="16+">16+</option>
              <option value="LIVRE">Livre</option>
            </select>
          </div>
          <textarea rows={2} placeholder="Observações de portaria, estacionamento e acesso VIP..." value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">
              {saving ? 'Salvando...' : 'Salvar Casa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactFormModal({ initial, authHeaders, onClose, onSaved }: any) {
  const [fullName, setFullName] = useState(initial?.full_name || '');
  const [nickname, setNickname] = useState(initial?.nickname || '');
  const [phone, setPhone] = useState(initial?.phone_display || '');
  const [cpf, setCpf] = useState(initial?.cpf || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [instagram, setInstagram] = useState(initial?.instagram || '');
  const [org, setOrg] = useState(initial?.company_org || '');
  const [categoryTag, setCategoryTag] = useState(initial?.category_tag || 'CONVIDADO');
  const [isBlocked, setIsBlocked] = useState(Boolean(initial?.is_blocked));
  const [blockReason, setBlockReason] = useState(initial?.block_reason || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateBrPhoneClient(phone);
    if (!check.valid) return toast.error(check.error || 'Telefone inválido.');
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
          nickname,
          phone,
          cpf,
          email,
          instagram,
          company_org: org,
          category_tag: categoryTag,
          is_blocked: isBlocked,
          block_reason: blockReason,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar contato.');
      toast.success('Contato salvo no CRM!');
      onSaved(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{initial ? 'Ficha do Convidado CRM' : 'Novo Contato CRM (Validador DDD)'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold block mb-1">Telefone WhatsApp com DDD * (Não permite duplicar no Seller)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatBrPhoneMask(e.target.value))}
              placeholder="(11) 99888-7766"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-mono font-bold text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="text" placeholder="Nome Completo *" value={fullName} onChange={(e) => setFullName(e.target.value)} className="col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <input type="text" placeholder="Apelido Whats" value={nickname} onChange={(e) => setNickname(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryTag} onChange={(e) => setCategoryTag(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold">
              <option value="CONVIDADO">CONVIDADO</option>
              <option value="VIP">VIP</option>
              <option value="IMPRENSA">IMPRENSA</option>
              <option value="INFLUENCER">INFLUENCER</option>
              <option value="ARTISTA">ARTISTA</option>
              <option value="PATROCINADOR">PATROCINADOR</option>
            </select>
            <input type="text" placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono" />
            <input type="text" placeholder="@instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
          </div>
          <input type="text" placeholder="Empresa / Assessoria / Veículo" value={org} onChange={(e) => setOrg(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
          <textarea rows={2} placeholder="Observações e histórico relevante..." value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700" />
          <label className="flex items-center gap-2 font-semibold text-rose-600">
            <input type="checkbox" checked={isBlocked} onChange={(e) => setIsBlocked(e.target.checked)} />
            Bloquear / Restringir este contato em futuras listas
          </label>
          {isBlocked && (
            <input type="text" placeholder="Motivo da restrição" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-rose-300" />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">
              {saving ? 'Salvando...' : 'Salvar Ficha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContactHistoryDrawer({ data, onClose }: any) {
  const c = data.contact;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl h-full p-6 overflow-y-auto space-y-5 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-[10px] font-bold">
              HISTÓRICO 360º DO CONVIDADO
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{c.full_name}</h2>
            <p className="text-xs font-mono text-slate-500">{c.phone_display} {c.instagram ? `• ${c.instagram}` : ''}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
            <div className="font-mono font-bold text-lg">{c.total_events_invited}</div>
            <div className="text-slate-500">Convites</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
            <div className="font-mono font-bold text-lg text-indigo-600">{c.total_events_confirmed}</div>
            <div className="text-slate-500">Confirmados</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
            <div className="font-mono font-bold text-lg text-violet-600">{c.total_tickets_sent}</div>
            <div className="text-slate-500">PDFs Env.</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
            <div className="font-mono font-bold text-lg text-emerald-600">{c.total_checkins}</div>
            <div className="text-emerald-700">Presenças</div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Eventos Vinculados ({data.participations?.length || 0})
          </h3>
          <div className="space-y-2">
            {(data.participations || []).map((p: any) => (
              <div key={p.guest_id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>{p.event_title}</span>
                  <span className="font-mono text-indigo-600">{p.event_date?.split('-').reverse().join('/')}</span>
                </div>
                <div className="text-slate-500 flex flex-wrap gap-2">
                  <span>Setor: <strong>{p.sector_key}</strong></span>
                  <span>RSVP: <strong>{p.invite_status}</strong></span>
                  <span>PDF: <strong>{p.ticket_delivery_status}</strong></span>
                  <span>Portaria: <strong>{p.checkin_status}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Trilha de Alterações & Envios
          </h3>
          <div className="space-y-1.5 text-xs">
            {(data.audit_logs || []).map((l: any) => (
              <div key={l.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div className="text-[10px] font-mono text-slate-400">
                  {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : ''} • {l.actor_name}
                </div>
                <div className="text-slate-700 dark:text-slate-200">{l.summary}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddGuestModal({ event, sectors, authHeaders, onClose, onSaved }: any) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [sectorKey, setSectorKey] = useState(sectors[0]?.key || 'VIP');
  const [companionsCount, setCompanionsCount] = useState(0);
  const [courtesyValue, setCourtesyValue] = useState<number>(Number(sectors[0]?.face_value || 0));
  const [promoterName, setPromoterName] = useState('');
  const [lookup, setLookup] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const check = validateBrPhoneClient(phone);
    if (!check.valid) {
      setLookup(null);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(
        `${API_URL}/event-management/contacts/lookup-phone?phone=${encodeURIComponent(phone)}`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        const d = await res.json();
        setLookup(d);
        if (d.exists && d.contact && !fullName) {
          setFullName(d.contact.full_name);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [phone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateBrPhoneClient(phone);
    if (!check.valid) return toast.error(check.error || 'Informe DDD + número válido.');
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events/${event.id}/guests`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: lookup?.contact?.id || undefined,
          full_name: fullName,
          phone,
          sector_key: sectorKey,
          companions_count: companionsCount,
          courtesy_value: courtesyValue,
          promoter_name: promoterName || undefined,
          added_via: 'DESKTOP_GRID',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao incluir convidado.');
      toast.success('Convidado incluído na lista!');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Incluir Convidado • {event.title}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold block mb-1">DDD + WhatsApp *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatBrPhoneMask(e.target.value))}
              placeholder="(11) 99888-7766"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-mono font-bold text-sm"
            />
            {lookup?.exists && lookup.contact && (
              <div className="mt-1.5 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                ✓ Já no CRM: <strong>{lookup.contact.full_name}</strong> ({lookup.contact.total_events_invited} evento(s) anteriores)
              </div>
            )}
          </div>
          <div>
            <label className="font-bold block mb-1">Nome Completo *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold block mb-1">Setor</label>
              <select
                value={sectorKey}
                onChange={(e) => setSectorKey(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
              >
                {sectors.map((s: any) => (
                  <option key={s.key} value={s.key}>{s.name || s.key}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">Acompanhantes (+N)</label>
              <input
                type="number"
                min={0}
                max={10}
                value={companionsCount}
                onChange={(e) => setCompanionsCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold block mb-1">Valor Cortesia (Ref.)</label>
              <CurrencyInput
                prefixStr="R$ "
                value={courtesyValue}
                onChangeValue={setCourtesyValue}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Promoter / Indicação</label>
              <input
                type="text"
                value={promoterName}
                onChange={(e) => setPromoterName(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">
              {saving ? 'Incluindo...' : 'Incluir na Lista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportSpreadsheetModal({ event, sectors, authHeaders, onClose, onImported }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [sector, setSector] = useState(sectors[0]?.key || 'VIP');
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function runUpload(dryRun: boolean) {
    if (!file) return toast.error('Selecione uma planilha .XLSX ou .CSV.');
    if (file.size > 10 * 1024 * 1024) {
      return toast.error('A planilha excede o limite máximo de 10 MB.');
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('default_sector', sector);
      fd.append('dry_run', String(dryRun));
      const res = await fetch(`${API_URL}/event-management/events/${event.id}/guests/import-sheet`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao processar planilha.');
      if (dryRun) {
        setPreviewData(data);
      } else {
        toast.success(`${data.summary.linked_count} convidados vinculados com sucesso!`);
        onImported();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Importar Convidados por Planilha (.XLSX / .CSV — máx. 10 MB)</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <p className="text-slate-500">
          Colunas reconhecidas automaticamente: <strong>Nome</strong>, <strong>Telefone / WhatsApp</strong> (com DDD), <strong>Setor</strong>, <strong>Promoter</strong>, <strong>CPF</strong>, <strong>Email</strong>, <strong>Instagram</strong>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreviewData(null);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700"
          />
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold">
            {sectors.map((s: any) => (
              <option key={s.key} value={s.key}>Setor Padrão: {s.name || s.key}</option>
            ))}
          </select>
        </div>

        {previewData && (
          <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><div className="font-bold text-base text-emerald-600">{previewData.summary.new_in_crm}</div>Novos no CRM</div>
              <div><div className="font-bold text-base text-indigo-600">{previewData.summary.existing_in_crm}</div>Já no CRM</div>
              <div><div className="font-bold text-base">{previewData.summary.linked_count}</div>A Vincular</div>
              <div><div className="font-bold text-base text-rose-600">{previewData.summary.invalid_count}</div>Sem DDD/Inválidos</div>
            </div>
            {previewData.invalid_rows?.length > 0 && (
              <div className="max-h-28 overflow-y-auto text-rose-600 space-y-1">
                {previewData.invalid_rows.map((ir: any, idx: number) => (
                  <div key={idx}>Linha {ir.row} ({ir.name}): {ir.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
          <button
            onClick={() => runUpload(true)}
            disabled={!file || loading}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold"
          >
            {loading ? 'Analisando...' : '1. Validar Planilha'}
          </button>
          {previewData && (
            <button
              onClick={() => runUpload(false)}
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold"
            >
              2. Confirmar Importação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SmartPasteDesktopModal({ event, sectors, authHeaders, onClose, onImported }: any) {
  const [rawText, setRawText] = useState('');
  const [sector, setSector] = useState(sectors[0]?.key || 'VIP');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/event-management/contacts/parse-smart-paste`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
      });
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const valid = items.filter((x) => x.valid);
    if (!valid.length) return toast.error('Nenhum número válido com DDD.');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/event-management/contacts/bulk-import-parsed`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: event.id,
          sector_key: sector,
          source_channel: 'DESKTOP_SMART_PASTE',
          contacts: valid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro na importação.');
      toast.success(`${data.linked_to_event} convidados vinculados!`);
      onImported();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Colar Conversa / Contatos do WhatsApp</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={'Cole aqui mensagens ou vCards recebidos:\nJoão Silva (11) 99888-7766\n21 97777-6666 Ana Paula @anapaula'}
          className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
        />
        <select value={sector} onChange={(e) => setSector(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold">
          {sectors.map((s: any) => (
            <option key={s.key} value={s.key}>Setor: {s.name || s.key}</option>
          ))}
        </select>
        {items.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1">
            {items.map((it, idx) => (
              <div key={idx} className={`p-2 rounded-lg ${it.valid ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 text-rose-700'}`}>
                <strong>{it.full_name}</strong> — {it.phone_display || it.raw_phone} {it.error ? `(${it.error})` : it.already_in_crm ? '(Já no CRM ✓)' : '(Novo)'}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={handleAnalyze} disabled={loading || !rawText.trim()} className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold">
            Validar DDDs
          </button>
          {items.some((i) => i.valid) && (
            <button onClick={handleSave} disabled={loading} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">
              Vincular Válidos ({items.filter((i) => i.valid).length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function VaultUploadModal({ event, sectors, authHeaders, onClose, onUploaded }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [sectorKey, setSectorKey] = useState(sectors[0]?.key || 'VIP');
  const [splitPages, setSplitPages] = useState(true);
  const [faceValue, setFaceValue] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error('Selecione um arquivo .PDF ou .ZIP.');
    const isZip = file.name.toLowerCase().endsWith('.zip');
    const maxMb = isZip ? 15 : 10;
    if (file.size > maxMb * 1024 * 1024) {
      return toast.error(`O arquivo ultrapassa o limite máximo permitido de ${maxMb} MB.`);
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sector_key', sectorKey);
      fd.append('split_pdf_pages', String(splitPages));
      fd.append('face_value', String(faceValue));
      const res = await fetch(`${API_URL}/event-management/events/${event.id}/tickets/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao processar ingressos.');
      toast.success(
        `${data.imported_count} ingresso(s) validado(s) no cofre! (${data.skipped_duplicates} duplicado(s) ignorado(s))`
      );
      onUploaded();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Abastecer Cofre de Ingressos (PDF / ZIP)</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleUpload} className="space-y-3.5">
          <div className="p-4 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 text-center space-y-2">
            <Ticket className="w-7 h-7 text-indigo-600 mx-auto" />
            <div className="font-semibold">Selecione um arquivo .PDF (até 10 MB) ou .ZIP com PDFs (até 15 MB)</div>
            <input
              type="file"
              accept=".pdf,.zip"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mx-auto block text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold block mb-1">Setor Destino dos Ingressos</label>
              <select
                value={sectorKey}
                onChange={(e) => setSectorKey(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
              >
                {sectors.map((s: any) => (
                  <option key={s.key} value={s.key}>{s.name || s.key}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">Valor Facial Unitário</label>
              <CurrencyInput
                prefixStr="R$ "
                value={faceValue}
                onChangeValue={setFaceValue}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
            <input
              type="checkbox"
              checked={splitPages}
              onChange={(e) => setSplitPages(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Fatiar PDF multipágina automaticamente (1 página = 1 ingresso individual):</strong> ideal quando a tiqueteira envia 50 ingressos dentro de um único PDF. Cada página recebe Hash SHA-256 exclusivo contra envio duplicado.
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={uploading} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold">
              {uploading ? 'Validando & Fatiando...' : 'Importar para o Cofre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteTemplateModal({ initial, activeEventId, authHeaders, uploadImageHelper, onClose, onSaved }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [purpose, setPurpose] = useState(initial?.template_purpose || 'INVITE_RSVP');
  const [imageUrl, setImageUrl] = useState(initial?.image_url || '');
  const [body, setBody] = useState(
    initial?.message_body ||
      'Você é nosso convidado(a) VIP para *{{evento}}*!\n\n📅 *Data:* {{data}} às {{hora}}\n📍 *Local:* {{casa}} — {{endereco}}\n🎟️ *Setor:* {{setor}}\n\n👉 *Confirme sua presença em 1 toque:*\n{{link_rsvp}}'
  );
  const [saving, setSaving] = useState(false);

  const vars = ['{{apelido}}', '{{nome}}', '{{evento}}', '{{data}}', '{{hora}}', '{{casa}}', '{{endereco}}', '{{maps}}', '{{setor}}', '{{link_rsvp}}'];

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
        body: JSON.stringify({
          event_id: activeEventId,
          name,
          template_purpose: purpose,
          image_url: imageUrl || null,
          message_body: body,
        }),
      });
      if (!res.ok) throw new Error('Falha ao salvar modelo.');
      toast.success('Modelo de convite salvo!');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Modelo de Convite com Imagem do Evento</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Nome do Modelo *" value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700" />
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold">
              <option value="INVITE_RSVP">Convite c/ Confirmação RSVP</option>
              <option value="DIRECT_COMBO">Combo Convite + Entrega PDF</option>
              <option value="TICKET_DELIVERY">Apenas Entrega do PDF</option>
              <option value="NATIVE_QR_CARD">Credencial QR Code Nativa</option>
              <option value="REMINDER">Lembrete no Dia do Evento</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">Imagem / Flyer do Convite (máx. 5 MB)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const u = await uploadImageHelper(f, 'templates');
                if (u) setImageUrl(u);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {vars.map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setBody((prev: string) => `${prev} ${v}`)}
                className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 font-mono text-[11px]"
              >
                {v}
              </button>
            ))}
          </div>
          <textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">
              Salvar Modelo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DispatchWhatsAppModal({ event, guestIds, templates, authHeaders, onClose, onDispatched }: any) {
  const [mode, setMode] = useState('INVITE_ONLY');
  const [templateId, setTemplateId] = useState<string>('');
  const [sending, setSending] = useState(false);

  async function handleEnqueue() {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events/${event.id}/dispatch`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_ids: guestIds,
          dispatch_mode: mode,
          template_id: templateId ? Number(templateId) : null,
          auto_assign_available_pdf: true,
          frontend_origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enfileirar envios.');
      toast.success(
        `${data.enqueued} disparo(s) enfileirado(s) com cadência anti-bloqueio! (${data.skipped?.length || 0} ignorados por trava anti-duplicidade)`
      );
      onDispatched();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Disparo Seguro WhatsApp ({guestIds.length} selecionado(s))</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="space-y-2">
          <label className="font-bold block">Escolha a Estratégia de Envio:</label>
          {[
            { id: 'INVITE_ONLY', title: '1. Convite com Link RSVP (Sem gastar PDF agora)', desc: 'Envia a arte do evento + link 1-clique para o convidado confirmar presença primeiro.' },
            { id: 'COMBO_INVITE_AND_PDF', title: '2. Combo Completo (Arte + Convite + Ingresso PDF)', desc: 'Aloca 1 PDF disponível do setor com trava exclusiva e entrega a arte + arquivo PDF renomeado.' },
            { id: 'TICKET_PDF_ONLY', title: '3. Somente Entrega do Ingresso PDF', desc: 'Ideal para quem já confirmou presença: aloca e envia o arquivo PDF oficial.' },
            { id: 'NATIVE_QR_CARD', title: '4. Cortesia Nativa com QR Code Próprio', desc: 'Gera um Card VIP com a imagem do evento + QR Code exclusivo para leitura na portaria.' },
          ].map((opt) => (
            <label
              key={opt.id}
              className={`block p-3 rounded-2xl border cursor-pointer ${
                mode === opt.id ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <input type="radio" checked={mode === opt.id} onChange={() => setMode(opt.id)} />
                {opt.title}
              </div>
              <p className="text-slate-500 ml-5 mt-0.5">{opt.desc}</p>
            </label>
          ))}
        </div>

        <div>
          <label className="font-bold block mb-1">Modelo de Mensagem / Arte</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <option value="">Usar texto padrão inteligente + arte do evento</option>
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">Cancelar</button>
          <button onClick={handleEnqueue} disabled={sending} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold">
            {sending ? 'Enfileirando...' : 'Enfileirar Disparo Seguro'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppConfigPanel({ waConfig, setWaConfig, waQrInfo, setWaQrInfo, events, authHeaders, onSaved }: any) {
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
        body: JSON.stringify({
          ...waConfig,
          authorized_sender_phones: phones,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar configuração WhatsApp.');
      toast.success('Configuração WhatsApp e parâmetros Anti-Bloqueio salvos!');
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
      if (!res.ok) throw new Error(data.detail || 'Falha ao consultar instância WhatsApp.');
      setWaQrInfo(data);
      if (data.connected) toast.success('WhatsApp CONECTADO e pronto para disparos!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">1. Gateway WhatsApp (Evolution API / Z-API / WAHA)</h3>
          <label className="flex items-center gap-1.5 font-bold text-emerald-600">
            <input
              type="checkbox"
              checked={waConfig.enabled}
              onChange={(e) => setWaConfig({ ...waConfig, enabled: e.target.checked })}
            />
            Motor Ativo
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="font-bold block mb-1">Provedor</label>
            <select
              value={waConfig.provider}
              onChange={(e) => setWaConfig({ ...waConfig, provider: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value="EVOLUTION">Evolution API v2</option>
              <option value="ZAPI">Z-API</option>
              <option value="WAHA">WAHA (WhatsApp HTTP API)</option>
            </select>
          </div>
          <div>
            <label className="font-bold block mb-1">Nome da Instância / ID</label>
            <input
              type="text"
              value={waConfig.instance_name}
              onChange={(e) => setWaConfig({ ...waConfig, instance_name: e.target.value })}
              placeholder="Ex: eventos_vip"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="font-bold block mb-1">URL Base do Servidor</label>
          <input
            type="text"
            value={waConfig.api_base_url}
            onChange={(e) => setWaConfig({ ...waConfig, api_base_url: e.target.value })}
            placeholder="https://sua-evolution-api.dominio.com.br"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <input
            type="password"
            placeholder="API Key / Token"
            value={waConfig.api_key_token}
            onChange={(e) => setWaConfig({ ...waConfig, api_key_token: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
          />
          <input
            type="password"
            placeholder="Client-Token (Z-API opcional)"
            value={waConfig.client_token}
            onChange={(e) => setWaConfig({ ...waConfig, client_token: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
          />
        </div>

        <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-1.5">
          <div className="font-bold text-indigo-900 dark:text-indigo-200">
            Webhook p/ Receber Contatos Encaminhados (vCard) & Respostas SIM:
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={waConfig.webhook_url}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(waConfig.webhook_url);
                toast.success('URL do Webhook copiada!');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold"
            >
              Copiar
            </button>
          </div>
          <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
            Basta encaminhar qualquer Cartão de Contato no WhatsApp para o número conectado: o sistema cadastra no CRM e responde oferecendo vincular ao evento!
          </p>
        </div>

        <div>
          <label className="font-bold block mb-1">
            Números de Promoters/Admins Autorizados a Encaminhar Contatos (1 por linha com DDD):
          </label>
          <textarea
            rows={2}
            value={authPhonesText}
            onChange={(e) => setAuthPhonesText(e.target.value)}
            placeholder={'11 99999-8888\n21 98888-7777'}
            className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConnectQr}
            disabled={loadingQr}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" /> {loadingQr ? 'Consultando...' : 'Testar Status / Ler QR Code'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>

        {waQrInfo?.qrcode_base64 && (
          <div className="p-4 bg-white rounded-2xl border text-center">
            <img
              src={
                waQrInfo.qrcode_base64.startsWith('data:image')
                  ? waQrInfo.qrcode_base64
                  : `data:image/png;base64,${waQrInfo.qrcode_base64}`
              }
              alt="QR Code WhatsApp"
              className="w-48 h-48 mx-auto"
            />
            <p className="text-slate-600 mt-2 font-semibold">Escaneie no seu WhatsApp em Aparelhos Conectados</p>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5">
        <h3 className="font-bold text-sm">2. Blindagem Anti-Bloqueio (Cadência Humana)</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold block mb-1">Delay Mínimo (segundos)</label>
            <input
              type="number"
              min={10}
              value={waConfig.min_delay_seconds}
              onChange={(e) => setWaConfig({ ...waConfig, min_delay_seconds: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="font-bold block mb-1">Delay Máximo (segundos)</label>
            <input
              type="number"
              min={20}
              value={waConfig.max_delay_seconds}
              onChange={(e) => setWaConfig({ ...waConfig, max_delay_seconds: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="font-bold block mb-1">Pausa a cada N mensagens</label>
            <input
              type="number"
              min={5}
              value={waConfig.batch_size_before_pause}
              onChange={(e) => setWaConfig({ ...waConfig, batch_size_before_pause: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="font-bold block mb-1">Tempo de Respiro (segundos)</label>
            <input
              type="number"
              min={60}
              value={waConfig.batch_pause_seconds}
              onChange={(e) => setWaConfig({ ...waConfig, batch_pause_seconds: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="font-bold block mb-1">Horário Inicial Permitido</label>
            <input
              type="time"
              value={waConfig.allowed_start_hour}
              onChange={(e) => setWaConfig({ ...waConfig, allowed_start_hour: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="font-bold block mb-1">Horário Limite Noturno</label>
            <input
              type="time"
              value={waConfig.allowed_end_hour}
              onChange={(e) => setWaConfig({ ...waConfig, allowed_end_hour: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={waConfig.simulate_typing}
            onChange={(e) => setWaConfig({ ...waConfig, simulate_typing: e.target.checked })}
          />
          Simular presença &ldquo;digitando...&rdquo; antes do convite e antes de entregar o PDF
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={waConfig.verify_whatsapp_before_send}
            onChange={(e) => setWaConfig({ ...waConfig, verify_whatsapp_before_send: e.target.checked })}
          />
          Validar silenciosamente se o DDD+Número tem WhatsApp ativo antes do envio
        </label>
      </div>
    </div>
  );
}

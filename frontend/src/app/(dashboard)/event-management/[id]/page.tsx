'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  ClipboardPaste,
  Copy,
  DoorOpen,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import EventManagementPinnedNavBar from '@/components/EventManagementPinnedNavBar';
import { CurrencyInput } from '@/components/CurrencyInput';
import { getToken } from '@/lib/auth';
import { formatBrPhoneMask, validateBrPhoneClient } from '@/lib/br_phone';
import { getImageUrl } from '@/lib/image_helper';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type EventSubTab = 'GUESTS' | 'PORTARIA' | 'VAULT' | 'DETAILS' | 'LOGS';

function formatDateBr(iso?: string | null) {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  if (clean.includes('-')) return clean.split('-').reverse().join('/');
  return clean;
}

function formatCpfMask(raw: string) {
  const d = (raw || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function EventDetailWorkspaceContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = Number(params?.id || 0);

  const initialSubTab = (searchParams.get('tab') as EventSubTab) || 'GUESTS';
  const [subTab, setSubTab] = useState<EventSubTab>(
    ['GUESTS', 'PORTARIA', 'VAULT', 'DETAILS', 'LOGS'].includes(initialSubTab) ? initialSubTab : 'GUESTS'
  );

  // Dados Mestre do Evento
  const [event, setEvent] = useState<any>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [ticketsData, setTicketsData] = useState<{ counts: any; items: any[] }>({
    counts: { AVAILABLE: 0, RESERVED: 0, QUEUED: 0, SENT: 0, SEND_ERROR: 0, INVALIDATED: 0 },
    items: [],
  });
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Aba 1: Lista de Convidados & Barras Inline (Sem Modal!)
  const [guestQuickView, setGuestQuickView] = useState<'ALL' | 'CONFIRMED' | 'PENDING_RSVP' | 'CHECKED_IN' | 'NOT_ENTERED'>('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuestIdx, setSelectedGuestIdx] = useState(0);
  const [selectedGuestIds, setSelectedGuestIds] = useState<number[]>([]);

  // Inclusão rápida inline na Lista
  const [quickPhone, setQuickPhone] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickCpf, setQuickCpf] = useState('');
  const [quickSector, setQuickSector] = useState('VIP');
  const [quickCompanions, setQuickCompanions] = useState(0);
  const [quickConfirmedNow, setQuickConfirmedNow] = useState(false);
  const [addingQuickGuest, setAddingQuickGuest] = useState(false);
  const [phoneLookupHint, setPhoneLookupHint] = useState<any>(null);

  // Anexar Planilha / Colar WhatsApp / Disparo Inline
  const [inlineActionPanel, setInlineActionPanel] = useState<'NONE' | 'SHEET' | 'PASTE' | 'DISPATCH'>('NONE');
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [sheetSector, setSheetSector] = useState('VIP');
  const [sheetPreview, setSheetPreview] = useState<any>(null);
  const [importingSheet, setImportingSheet] = useState(false);

  const [pasteRaw, setPasteRaw] = useState('');
  const [pasteItems, setPasteItems] = useState<any[]>([]);
  const [parsingPaste, setParsingPaste] = useState(false);

  const [dispatchMode, setDispatchMode] = useState('INVITE_ONLY');
  const [dispatchTemplateId, setDispatchTemplateId] = useState('');
  const [dispatching, setDispatching] = useState(false);

  // Aba 2: Portaria (Validação por Celular, CPF ou QR Code)
  const [portariaQuery, setPortariaQuery] = useState('');
  const [portariaLoading, setPortariaLoading] = useState(false);
  const [portariaResult, setPortariaResult] = useState<any>(null);
  const [cpfAtDoorDrafts, setCpfAtDoorDrafts] = useState<Record<number, string>>({});
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  const [scanningQr, setScanningQr] = useState(false);
  const qrScannerRef = useRef<any>(null);
  const portariaInputRef = useRef<HTMLInputElement | null>(null);

  // Aba 3: Cofre PDF / ZIP Inline
  const [showVaultUploadBar, setShowVaultUploadBar] = useState(false);
  const [vaultFile, setVaultFile] = useState<File | null>(null);
  const [vaultSector, setVaultSector] = useState('VIP');
  const [vaultSplitPages, setVaultSplitPages] = useState(true);
  const [vaultFaceValue, setVaultFaceValue] = useState(0);
  const [uploadingVault, setUploadingVault] = useState(false);
  const [vaultStatusFilter, setVaultStatusFilter] = useState('ALL');

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${getToken()}` };
  }

  const eventSectors: any[] = useMemo(() => {
    if (event?.sectors?.length) return event.sectors;
    return [
      { key: 'VIP', name: 'Área VIP', courtesy_quota: 100, face_value: 0 },
      { key: 'PISTA', name: 'Pista', courtesy_quota: 200, face_value: 0 },
      { key: 'CAMAROTE', name: 'Camarote', courtesy_quota: 50, face_value: 0 },
    ];
  }, [event]);

  const loadEventDetail = useCallback(async (silent = false) => {
    if (!eventId) return;
    if (!silent) setLoading(true);
    try {
      const [evRes, gRes, vnRes, tplRes] = await Promise.all([
        fetch(`${API_URL}/event-management/events/${eventId}`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/events/${eventId}/guests`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/venues`, { headers: authHeaders() }),
        fetch(`${API_URL}/event-management/templates?event_id=${eventId}`, { headers: authHeaders() }),
      ]);
      if (!evRes.ok) {
        toast.error('Evento não encontrado.');
        router.push('/event-management');
        return;
      }
      const evData = await evRes.json();
      setEvent(evData);
      if (evData.sectors?.[0]?.key && !silent) {
        setQuickSector(evData.sectors[0].key);
        setSheetSector(evData.sectors[0].key);
        setVaultSector(evData.sectors[0].key);
      }
      if (gRes.ok) setGuests(await gRes.json());
      if (vnRes.ok) setVenues(await vnRes.json());
      if (tplRes.ok) setTemplates(await tplRes.json());
    } catch {
      if (!silent) toast.error('Falha ao carregar detalhes do evento.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [eventId, router]);

  const loadTickets = useCallback(async () => {
    if (!eventId) return;
    const res = await fetch(`${API_URL}/event-management/events/${eventId}/tickets`, {
      headers: authHeaders(),
    });
    if (res.ok) setTicketsData(await res.json());
  }, [eventId]);

  const loadLogs = useCallback(async () => {
    if (!eventId) return;
    const res = await fetch(`${API_URL}/event-management/audit-logs?event_id=${eventId}&limit=150`, {
      headers: authHeaders(),
    });
    if (res.ok) setLogs(await res.json());
  }, [eventId]);

  useEffect(() => {
    loadEventDetail(false);
  }, [loadEventDetail]);

  useEffect(() => {
    if (subTab === 'VAULT') loadTickets();
    if (subTab === 'LOGS') loadLogs();
    if (subTab === 'PORTARIA') {
      setTimeout(() => portariaInputRef.current?.focus(), 100);
    }
  }, [subTab, loadTickets, loadLogs]);

  // Para scanner de câmera ao sair da aba ou desmontar
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
      }
    };
  }, []);

  // Auto-preenchimento pelo CRM ao digitar DDD + Celular na barra rápida
  useEffect(() => {
    const chk = validateBrPhoneClient(quickPhone);
    if (!chk.valid) {
      setPhoneLookupHint(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/event-management/contacts/lookup-phone?phone=${encodeURIComponent(quickPhone)}`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const d = await res.json();
          setPhoneLookupHint(d);
          if (d.exists && d.contact) {
            if (!quickName) setQuickName(d.contact.full_name || '');
            if (!quickCpf && d.contact.cpf) setQuickCpf(formatCpfMask(d.contact.cpf));
          }
        }
      } catch {}
    }, 220);
    return () => clearTimeout(timer);
  }, [quickPhone]);

  // Busca em tempo real na Portaria por Celular / CPF / Nome
  const executePortariaSearch = useCallback(
    async (rawVal: string) => {
      const trimmed = rawVal.trim();
      if (trimmed.length < 2) {
        setPortariaResult(null);
        return;
      }
      setPortariaLoading(true);
      try {
        const res = await fetch(
          `${API_URL}/event-management/events/${eventId}/portaria/lookup?q=${encodeURIComponent(trimmed)}`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setPortariaResult(data);
        }
      } finally {
        setPortariaLoading(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    if (subTab !== 'PORTARIA') return;
    if (portariaQuery.trim().length < 3) {
      if (!portariaQuery.trim()) setPortariaResult(null);
      return;
    }
    const timer = setTimeout(() => {
      executePortariaSearch(portariaQuery);
    }, 220);
    return () => clearTimeout(timer);
  }, [portariaQuery, subTab, executePortariaSearch]);

  // Esc volta para listagem quando sem painel inline aberto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inlineActionPanel !== 'NONE') {
          setInlineActionPanel('NONE');
        } else if (showVaultUploadBar) {
          setShowVaultUploadBar(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inlineActionPanel, showVaultUploadBar]);

  // Filtros e contadores vivos da Lista do Evento
  const guestCounters = useMemo(() => {
    const active = guests.filter((g) => g.invite_status !== 'CANCELLED');
    return {
      all: active.length,
      totalPeople: active.reduce((s, g) => s + 1 + Number(g.companions_count || 0), 0),
      confirmed: active.filter((g) => g.invite_status === 'CONFIRMED').length,
      pendingRsvp: active.filter((g) => ['PENDING', 'QUEUED_INVITE', 'INVITE_SENT'].includes(g.invite_status)).length,
      checkedIn: active.filter((g) => g.checkin_status === 'CHECKED_IN').length,
      notEntered: active.filter((g) => g.checkin_status !== 'CHECKED_IN').length,
    };
  }, [guests]);

  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      if (sectorFilter !== 'ALL' && g.sector_key !== sectorFilter) return false;
      if (guestQuickView === 'CONFIRMED' && g.invite_status !== 'CONFIRMED') return false;
      if (guestQuickView === 'PENDING_RSVP' && !['PENDING', 'QUEUED_INVITE', 'INVITE_SENT'].includes(g.invite_status)) {
        return false;
      }
      if (guestQuickView === 'CHECKED_IN' && g.checkin_status !== 'CHECKED_IN') return false;
      if (guestQuickView === 'NOT_ENTERED' && (g.checkin_status === 'CHECKED_IN' || g.invite_status === 'CANCELLED')) {
        return false;
      }

      if (!guestSearch.trim()) return true;
      const q = guestSearch.toLowerCase();
      const digits = q.replace(/\D/g, '');
      const c = g.contact || {};
      return (
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.phone_display || '').toLowerCase().includes(q) ||
        (digits && (c.phone_canonical || '').includes(digits)) ||
        (digits && (c.cpf || '').includes(digits)) ||
        (g.promoter_name || '').toLowerCase().includes(q)
      );
    });
  }, [guests, sectorFilter, guestQuickView, guestSearch]);

  const recentCheckins = useMemo(() => {
    return guests
      .filter((g) => g.checkin_status === 'CHECKED_IN')
      .sort((a, b) => String(b.checked_in_at || '').localeCompare(String(a.checked_in_at || '')));
  }, [guests]);

  // ==========================================================================
  // AÇÕES OPERACIONAIS DO EVENTO
  // ==========================================================================

  async function handleQuickChangeEventStatus(newStatus: string) {
    if (!event) return;
    const res = await fetch(`${API_URL}/event-management/events/${event.id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...event,
        sectors: event.sectors,
        status: newStatus,
      }),
    });
    if (res.ok) {
      toast.success(`Status do evento alterado para ${newStatus}.`);
      loadEventDetail(true);
    }
  }

  async function handleDownloadExcel(mode: 'ALL' | 'CONFIRMED' | 'CHECKED_IN') {
    const res = await fetch(
      `${API_URL}/event-management/events/${eventId}/guests/export-excel?filter_mode=${mode}`,
      { headers: authHeaders() }
    );
    if (!res.ok) {
      toast.error('Falha ao exportar planilha Excel.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lista_${event?.code || eventId}_${mode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleQuickAddGuest(e: React.FormEvent) {
    e.preventDefault();
    const chk = validateBrPhoneClient(quickPhone);
    if (!chk.valid) {
      toast.error(chk.error || 'Informe DDD + Celular válido.');
      return;
    }
    if (!quickName.trim() && !phoneLookupHint?.contact?.id) {
      toast.error('Informe o nome do convidado.');
      return;
    }
    setAddingQuickGuest(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events/${eventId}/guests`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: phoneLookupHint?.contact?.id || undefined,
          full_name: quickName.trim(),
          phone: quickPhone,
          cpf: quickCpf.replace(/\D/g, '') || undefined,
          sector_key: quickSector,
          companions_count: quickCompanions,
          invite_status: quickConfirmedNow ? 'CONFIRMED' : 'PENDING',
          added_via: 'DESKTOP_GRID',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Erro ao adicionar convidado.');
      toast.success(`${data.guest?.contact?.full_name || quickName} adicionado à lista!`);
      setQuickPhone('');
      setQuickName('');
      setQuickCpf('');
      setQuickCompanions(0);
      setPhoneLookupHint(null);
      loadEventDetail(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingQuickGuest(false);
    }
  }

  async function handleInlineGuestPatch(guestId: number, patch: Record<string, any>) {
    const res = await fetch(`${API_URL}/event-management/events/${eventId}/guests/${guestId}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      loadEventDetail(true);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.detail || 'Erro ao atualizar convidado.');
    }
  }

  async function handleRunSheetImport(dryRun: boolean) {
    if (!sheetFile) return toast.error('Selecione o arquivo .XLSX ou .CSV.');
    if (sheetFile.size > 10 * 1024 * 1024) {
      return toast.error('A planilha excede o limite de 10 MB.');
    }
    setImportingSheet(true);
    try {
      const fd = new FormData();
      fd.append('file', sheetFile);
      fd.append('default_sector', sheetSector);
      fd.append('dry_run', String(dryRun));
      const res = await fetch(`${API_URL}/event-management/events/${eventId}/guests/import-sheet`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao processar planilha.');
      if (dryRun) {
        setSheetPreview(data);
      } else {
        toast.success(`${data.summary.linked_count} convidado(s) anexado(s) na lista do evento!`);
        setSheetFile(null);
        setSheetPreview(null);
        setInlineActionPanel('NONE');
        loadEventDetail(true);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImportingSheet(false);
    }
  }

  async function handleAnalyzePaste() {
    if (!pasteRaw.trim()) return;
    setParsingPaste(true);
    try {
      const res = await fetch(`${API_URL}/event-management/contacts/parse-smart-paste`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: pasteRaw }),
      });
      const d = await res.json();
      setPasteItems(d.items || []);
    } finally {
      setParsingPaste(false);
    }
  }

  async function handleConfirmPasteImport() {
    const valid = pasteItems.filter((x) => x.valid);
    if (!valid.length) return toast.error('Nenhum telefone válido com DDD identificado.');
    setParsingPaste(true);
    try {
      const res = await fetch(`${API_URL}/event-management/contacts/bulk-import-parsed`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          sector_key: sheetSector,
          source_channel: 'EVENT_INLINE_PASTE',
          contacts: valid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro na importação.');
      toast.success(`${data.linked_to_event} convidado(s) incluído(s) na lista!`);
      setPasteRaw('');
      setPasteItems([]);
      setInlineActionPanel('NONE');
      loadEventDetail(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setParsingPaste(false);
    }
  }

  async function handleDispatchSelected() {
    if (!selectedGuestIds.length) return;
    setDispatching(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events/${eventId}/dispatch`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_ids: selectedGuestIds,
          dispatch_mode: dispatchMode,
          template_id: dispatchTemplateId ? Number(dispatchTemplateId) : null,
          auto_assign_available_pdf: true,
          frontend_origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enfileirar disparos.');
      toast.success(
        `${data.enqueued} envio(s) colocado(s) na fila segura! (${data.skipped?.length || 0} ignorados por proteção)`
      );
      setSelectedGuestIds([]);
      setInlineActionPanel('NONE');
      loadEventDetail(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDispatching(false);
    }
  }

  // Confirmação de Entrada na Portaria pelo Sistema (Celular / CPF / QR)
  async function handleConfirmPortariaCheckin(
    guestObj: any,
    undo = false,
    methodOverride?: string
  ) {
    setCheckingInId(guestObj.id);
    try {
      const cpfDraft = cpfAtDoorDrafts[guestObj.id];
      const digitsQuery = portariaQuery.replace(/\D/g, '');
      const inferredMethod =
        methodOverride ||
        (digitsQuery.length === 11 && digitsQuery[2] !== '9'
          ? 'CPF'
          : digitsQuery.length >= 8
            ? 'PHONE'
            : 'LIST');

      const res = await fetch(`${API_URL}/event-management/events/${eventId}/checkin`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_id: guestObj.id,
          cpf_confirmed: cpfDraft ? cpfDraft.replace(/\D/g, '') : undefined,
          verification_method: inferredMethod,
          undo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Não foi possível validar a entrada.');

      if (data.already_checked_in) {
        toast.warning(data.message);
      } else {
        toast.success(data.message);
      }
      await loadEventDetail(true);
      if (portariaQuery.trim().length >= 2) {
        await executePortariaSearch(portariaQuery);
      }
      portariaInputRef.current?.focus();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCheckingInId(null);
    }
  }

  async function handleAddCrmContactOnSpotAndCheckin(crmContact: any) {
    try {
      const addRes = await fetch(`${API_URL}/event-management/events/${eventId}/guests`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: crmContact.id,
          sector_key: quickSector || 'VIP',
          invite_status: 'CONFIRMED',
          added_via: 'PORTARIA_EXTRA',
        }),
      });
      const addData = await addRes.json();
      if (!addRes.ok) throw new Error(addData.detail || 'Erro ao incluir na lista.');
      await handleConfirmPortariaCheckin(addData.guest, false, 'PHONE');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function toggleQrScanner() {
    if (scanningQr) {
      if (qrScannerRef.current) {
        await qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
      }
      setScanningQr(false);
      return;
    }
    setScanningQr(true);
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('evm-detail-portaria-qr');
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decoded: string) => {
            await scanner.stop().catch(() => {});
            qrScannerRef.current = null;
            setScanningQr(false);
            setPortariaQuery(decoded);
            await executePortariaSearch(decoded);
          },
          () => {}
        );
      } catch {
        setScanningQr(false);
        toast.error('Câmera indisponível neste navegador. Use a validação rápida por Celular ou CPF.');
      }
    }, 150);
  }

  async function handleVaultUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!vaultFile) return toast.error('Selecione o arquivo .PDF ou .ZIP.');
    const isZip = vaultFile.name.toLowerCase().endsWith('.zip');
    const maxMb = isZip ? 15 : 10;
    if (vaultFile.size > maxMb * 1024 * 1024) {
      return toast.error(`Arquivo excede o limite de ${maxMb} MB.`);
    }
    setUploadingVault(true);
    try {
      const fd = new FormData();
      fd.append('file', vaultFile);
      fd.append('sector_key', vaultSector);
      fd.append('split_pdf_pages', String(vaultSplitPages));
      fd.append('face_value', String(vaultFaceValue));
      const res = await fetch(`${API_URL}/event-management/events/${eventId}/tickets/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao importar ingressos.');
      toast.success(`${data.imported_count} ingresso(s) adicionado(s) ao cofre!`);
      setVaultFile(null);
      setShowVaultUploadBar(false);
      loadTickets();
      loadEventDetail(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingVault(false);
    }
  }

  if (loading || !event) {
    return (
      <div className="w-full space-y-2.5 pb-12 font-sans text-xs">
        <EventManagementPinnedNavBar activeTab="EVENT_DETAIL" />
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-indigo-600" />
          Carregando ficha completa do evento...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2.5 pb-14 font-sans text-xs">
      {/* MENU FIXO NO TOPO */}
      <EventManagementPinnedNavBar activeTab="EVENT_DETAIL" />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CABEÇALHO COMPACTO DO EVENTO (IGUAL FICHA DE PEDIDO EM COMPRAS)       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Link
            href="/event-management"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Eventos
          </Link>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />

          <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
            {event.code}
          </span>

          <h1 className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-md">
            {event.title}
          </h1>

          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300">
            {formatDateBr(event.event_date)}
            {event.doors_open_time ? ` • ${event.doors_open_time}` : ''}
          </span>

          {event.location_display_name && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-[220px]">
              <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
              {event.location_display_name}
            </span>
          )}
        </div>

        {/* Status Rápido + Exportação Excel */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5 gap-0.5">
            {[
              { code: 'OPEN', label: 'Lista Aberta' },
              { code: 'ONGOING', label: 'Portaria Ativa' },
              { code: 'LIST_CLOSED', label: 'Encerrada' },
              { code: 'FINISHED', label: 'Finalizado' },
            ].map((st) => {
              const isCur = event.status === st.code;
              return (
                <button
                  key={st.code}
                  type="button"
                  onClick={() => !isCur && handleQuickChangeEventStatus(st.code)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                    isCur
                      ? 'bg-slate-900 text-white dark:bg-indigo-600'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => handleDownloadExcel('ALL')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-[11px] font-bold cursor-pointer"
            title="Exportar planilha Excel completa do evento"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUB-ABAS DEDICADAS DO EVENTO (MOBILE FIRST ROLÁVEL + DESKTOP DENSO)    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-2.5 py-1.5 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSubTab('GUESTS')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
              subTab === 'GUESTS'
                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Lista & Anexos ({guestCounters.all})
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PORTARIA')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
              subTab === 'PORTARIA'
                ? 'bg-emerald-600 text-white shadow-2xs border border-emerald-700'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            Portaria Celular / CPF ({guestCounters.checkedIn}/{guestCounters.all})
          </button>

          <button
            type="button"
            onClick={() => setSubTab('VAULT')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
              subTab === 'VAULT'
                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            Cofre PDF / ZIP ({event.stats?.tickets_available || 0} disp.)
          </button>

          <button
            type="button"
            onClick={() => setSubTab('DETAILS')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
              subTab === 'DETAILS'
                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Dados do Evento
          </button>

          <button
            type="button"
            onClick={() => setSubTab('LOGS')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer ${
              subTab === 'LOGS'
                ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-2xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Histórico
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
          <span>
            Pessoas c/ Acomp.: <strong>{guestCounters.totalPeople}</strong>
          </span>
          <span>
            Confirmaram Presença:{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">{guestCounters.confirmed}</strong>
          </span>
          <span>
            Entraram: <strong className="text-indigo-700 dark:text-indigo-300">{guestCounters.checkedIn}</strong>
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUB-ABA 1: LISTA DE CONVIDADOS, ANEXO DE PLANILHA & QUEM CONFIRMOU     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'GUESTS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
          {/* Barra Superior de Inclusão Rápida + Anexo de Lista (Sem Modal!) */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2">
              <form onSubmit={handleQuickAddGuest} className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 flex-1">
                <input
                  type="tel"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(formatBrPhoneMask(e.target.value))}
                  placeholder="DDD + Celular *"
                  className="w-full sm:w-36 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-[11px]"
                />
                <input
                  type="text"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="Nome Completo do Convidado *"
                  className="col-span-2 sm:w-52 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                />
                <input
                  type="text"
                  value={quickCpf}
                  onChange={(e) => setQuickCpf(formatCpfMask(e.target.value))}
                  placeholder="CPF (opcional)"
                  className="w-full sm:w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                />
                <select
                  value={quickSector}
                  onChange={(e) => setQuickSector(e.target.value)}
                  className="w-full sm:w-28 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-[11px]"
                >
                  {eventSectors.map((s: any) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={quickCompanions}
                  onChange={(e) => setQuickCompanions(Math.max(0, Number(e.target.value) || 0))}
                  title="Quantidade de acompanhantes (+N)"
                  placeholder="+Acomp"
                  className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-center text-[11px]"
                />
                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 px-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickConfirmedNow}
                    onChange={(e) => setQuickConfirmedNow(e.target.checked)}
                  />
                  Já Confirmado
                </label>
                <button
                  type="submit"
                  disabled={addingQuickGuest}
                  className="col-span-2 sm:col-span-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {addingQuickGuest ? '...' : 'Inserir'}
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setInlineActionPanel((p) => (p === 'SHEET' ? 'NONE' : 'SHEET'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    inlineActionPanel === 'SHEET'
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Anexar Planilha
                </button>

                <button
                  type="button"
                  onClick={() => setInlineActionPanel((p) => (p === 'PASTE' ? 'NONE' : 'PASTE'))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    inlineActionPanel === 'PASTE'
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Colar Lista Whats
                </button>

                {selectedGuestIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setInlineActionPanel((p) => (p === 'DISPATCH' ? 'NONE' : 'DISPATCH'))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar Whats ({selectedGuestIds.length})
                  </button>
                )}
              </div>
            </div>

            {phoneLookupHint?.exists && phoneLookupHint.contact && (
              <div className="px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-800 dark:text-indigo-200 flex items-center justify-between">
                <span>
                  ✓ Contato já conhecido no CRM: <strong>{phoneLookupHint.contact.full_name}</strong> ({phoneLookupHint.contact.total_events_invited} evento(s) no histórico) — basta clicar em Inserir para vincular!
                </span>
              </div>
            )}

            {/* Painel Inline 1: Anexar Planilha .XLSX / .CSV */}
            {inlineActionPanel === 'SHEET' && (
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-indigo-900 dark:text-indigo-200">
                    Anexar Lista de Convidados (.XLSX ou .CSV — máx. 10 MB • Colunas: Nome, Celular/WhatsApp com DDD, CPF, Setor):
                  </span>
                  <button type="button" onClick={() => setInlineActionPanel('NONE')} className="text-slate-400 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => {
                      setSheetFile(e.target.files?.[0] || null);
                      setSheetPreview(null);
                    }}
                    className="text-[11px]"
                  />
                  <select
                    value={sheetSector}
                    onChange={(e) => setSheetSector(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-bold"
                  >
                    {eventSectors.map((s: any) => (
                      <option key={s.key} value={s.key}>
                        Setor Padrão: {s.key}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!sheetFile || importingSheet}
                    onClick={() => handleRunSheetImport(true)}
                    className="px-3 py-1 rounded-lg bg-slate-800 text-white font-bold disabled:opacity-40 cursor-pointer"
                  >
                    {importingSheet ? 'Validando...' : '1. Conferir Lista'}
                  </button>
                  {sheetPreview && (
                    <button
                      type="button"
                      disabled={importingSheet}
                      onClick={() => handleRunSheetImport(false)}
                      className="px-3.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                    >
                      2. Confirmar Anexo ({sheetPreview.summary.linked_count} convidados)
                    </button>
                  )}
                </div>

                {sheetPreview && (
                  <div className="text-[11px] flex flex-wrap gap-4 pt-1 font-mono">
                    <span>Lidos: <strong>{sheetPreview.summary.total_rows_read}</strong></span>
                    <span className="text-emerald-700">Novos no CRM: <strong>{sheetPreview.summary.new_in_crm}</strong></span>
                    <span className="text-indigo-700">Reaproveitados CRM: <strong>{sheetPreview.summary.existing_in_crm}</strong></span>
                    <span className="text-rose-600">Inválidos/Sem DDD: <strong>{sheetPreview.summary.invalid_count}</strong></span>
                  </div>
                )}
              </div>
            )}

            {/* Painel Inline 2: Colar Lista do WhatsApp */}
            {inlineActionPanel === 'PASTE' && (
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-900 dark:text-indigo-200">
                    Colar Convidados / Mensagens do WhatsApp (1 por linha com Nome e DDD+Celular):
                  </span>
                  <button type="button" onClick={() => setInlineActionPanel('NONE')} className="text-slate-400 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={pasteRaw}
                  onChange={(e) => setPasteRaw(e.target.value)}
                  placeholder={'João Silva 11 99888-7766\nMaria Souza (21) 98765-4321'}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnalyzePaste}
                    disabled={parsingPaste || !pasteRaw.trim()}
                    className="px-3 py-1 rounded-lg bg-slate-800 text-white font-bold cursor-pointer"
                  >
                    Validar Números
                  </button>
                  {pasteItems.some((x) => x.valid) && (
                    <button
                      type="button"
                      onClick={handleConfirmPasteImport}
                      disabled={parsingPaste}
                      className="px-3.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                    >
                      Anexar {pasteItems.filter((x) => x.valid).length} Válido(s)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Painel Inline 3: Disparo Seguro WhatsApp */}
            {inlineActionPanel === 'DISPATCH' && (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-emerald-900 dark:text-emerald-200">
                    Disparar p/ {selectedGuestIds.length} selecionado(s):
                  </span>
                  <select
                    value={dispatchMode}
                    onChange={(e) => setDispatchMode(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-white dark:bg-slate-900 font-bold"
                  >
                    <option value="INVITE_ONLY">1. Convite p/ Confirmar Presença (RSVP)</option>
                    <option value="COMBO_INVITE_AND_PDF">2. Convite + Ingresso PDF Oficial</option>
                    <option value="TICKET_PDF_ONLY">3. Somente Ingresso PDF</option>
                    <option value="NATIVE_QR_CARD">4. Card VIP c/ QR Code Nativo</option>
                  </select>
                  <select
                    value={dispatchTemplateId}
                    onChange={(e) => setDispatchTemplateId(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-white dark:bg-slate-900"
                  >
                    <option value="">Modelo Padrão + Arte do Evento</option>
                    {templates.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={dispatching}
                    onClick={handleDispatchSelected}
                    className="px-3.5 py-1 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                  >
                    {dispatching ? 'Enfileirando...' : 'Confirmar Fila Segura'}
                  </button>
                  <button type="button" onClick={() => setInlineActionPanel('NONE')} className="px-2 py-1 text-slate-500 cursor-pointer">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Pílulas de Filtro Rápido (Quem Confirmou Presença / Portaria / Setor / Pesquisa) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-1 border-t border-slate-200/80 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-1">
                {[
                  { id: 'ALL', label: `Todos (${guestCounters.all})` },
                  { id: 'CONFIRMED', label: `Confirmaram Presença ✓ (${guestCounters.confirmed})` },
                  { id: 'PENDING_RSVP', label: `Aguard. Confirmação (${guestCounters.pendingRsvp})` },
                  { id: 'CHECKED_IN', label: `Já Entraram (${guestCounters.checkedIn})` },
                  { id: 'NOT_ENTERED', label: `Faltam Entrar (${guestCounters.notEntered})` },
                ].map((f: any) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setGuestQuickView(f.id);
                      setSelectedGuestIdx(0);
                    }}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                      guestQuickView === f.id
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-500'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-[11px]"
                >
                  <option value="ALL">Todos Setores</option>
                  {eventSectors.map((s: any) => (
                    <option key={s.key} value={s.key}>
                      Setor: {s.key}
                    </option>
                  ))}
                </select>

                <div className="relative w-52 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Filtrar nome, celular ou CPF..."
                    className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Grade Datasheet da Lista de Convidados */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <th className="py-1.5 px-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={filteredGuests.length > 0 && selectedGuestIds.length === filteredGuests.length}
                      onChange={(e) =>
                        setSelectedGuestIds(e.target.checked ? filteredGuests.map((x) => x.id) : [])
                      }
                    />
                  </th>
                  <th className="py-1.5 px-2.5">Convidado</th>
                  <th className="py-1.5 px-2.5 w-36">Celular (Whats)</th>
                  <th className="py-1.5 px-2.5 w-32">CPF</th>
                  <th className="py-1.5 px-2.5 w-28">Setor</th>
                  <th className="py-1.5 px-2.5 text-center w-16">Acomp.</th>
                  <th className="py-1.5 px-2.5 text-center w-36">Confirmou Presença</th>
                  <th className="py-1.5 px-2.5 w-36">Ingresso PDF</th>
                  <th className="py-1.5 px-2.5 text-center w-32">Portaria</th>
                  <th className="py-1.5 px-2.5 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredGuests.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      Nenhum convidado neste filtro. Utilize a barra acima para inserir ou anexar uma planilha.
                    </td>
                  </tr>
                ) : (
                  filteredGuests.map((g, idx) => {
                    const isChecked = selectedGuestIds.includes(g.id);
                    const isEntered = g.checkin_status === 'CHECKED_IN';
                    return (
                      <tr
                        key={g.id}
                        onClick={() => setSelectedGuestIdx(idx)}
                        className={
                          idx === selectedGuestIdx
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/35'
                            : idx % 2 === 1
                              ? 'bg-slate-50/55 dark:bg-slate-900/40'
                              : ''
                        }
                      >
                        <td className="py-1.5 px-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setSelectedGuestIds((prev) =>
                                e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                              )
                            }
                          />
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-white">
                          {g.contact?.full_name}
                          {g.promoter_name && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              Ind.: {g.promoter_name}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {g.contact?.phone_display}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-600 dark:text-slate-400">
                          {g.contact?.cpf ? formatCpfMask(g.contact.cpf) : '—'}
                        </td>
                        <td className="py-1.5 px-2.5">
                          <select
                            value={g.sector_key}
                            onChange={(e) => handleInlineGuestPatch(g.id, { sector_key: e.target.value })}
                            className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-[10px]"
                          >
                            {eventSectors.map((s: any) => (
                              <option key={s.key} value={s.key}>
                                {s.key}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1.5 px-2.5 text-center font-mono">
                          {g.companions_count > 0 ? `+${g.companions_count}` : '0'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          <select
                            value={g.invite_status}
                            onChange={(e) => handleInlineGuestPatch(g.id, { invite_status: e.target.value })}
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                              g.invite_status === 'CONFIRMED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : g.invite_status === 'DECLINED'
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <option value="PENDING">Pendente</option>
                            <option value="INVITE_SENT">Convite Env.</option>
                            <option value="CONFIRMED">CONFIRMADO ✓</option>
                            <option value="DECLINED">Não Vai</option>
                            <option value="CANCELLED">Cancelado</option>
                          </select>
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-[10px]">
                          {g.ticket_delivery_status === 'SENT' ? (
                            <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-800 border border-violet-200 font-bold">
                              ENVIADO ({g.ticket?.ticket_number || 'PDF'})
                            </span>
                          ) : g.ticket ? (
                            <span className="text-indigo-600 font-bold">
                              {g.ticket.status}: {g.ticket.ticket_number}
                            </span>
                          ) : (
                            <span className="text-slate-400">Lista / Sem PDF</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleConfirmPortariaCheckin(g, isEntered, 'LIST')}
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer ${
                              isEntered
                                ? 'bg-emerald-600 text-white border-emerald-700'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {isEntered ? 'Entrou ✓' : 'Liberar'}
                          </button>
                        </td>
                        <td className="py-1.5 px-2.5 text-right whitespace-nowrap space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/convite/${g.rsvp_token}`);
                              toast.success('Link de confirmação do convidado copiado!');
                            }}
                            title="Copiar link pessoal de confirmação"
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5 inline text-slate-600 dark:text-slate-300" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm('Remover este convidado da lista deste evento?')) return;
                              const res = await fetch(
                                `${API_URL}/event-management/events/${eventId}/guests/${g.id}`,
                                { method: 'DELETE', headers: authHeaders() }
                              );
                              const d = await res.json().catch(() => ({}));
                              if (res.ok) {
                                toast.success('Removido da lista.');
                                loadEventDetail(true);
                              } else {
                                toast.error(d.detail || 'Não foi possível remover.');
                              }
                            }}
                            title="Remover da lista"
                            className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
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

          <div className="bg-slate-100 dark:bg-slate-950 border-t border-slate-300 dark:border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1 font-mono">
              <ChevronsLeft className="w-3.5 h-3.5 cursor-pointer" onClick={() => setSelectedGuestIdx(0)} />
              <ChevronLeft className="w-3.5 h-3.5 cursor-pointer" onClick={() => setSelectedGuestIdx((p) => Math.max(0, p - 1))} />
              <span className="px-1.5">
                Registro {filteredGuests.length === 0 ? 0 : selectedGuestIdx + 1} de {filteredGuests.length}
              </span>
              <ChevronRight className="w-3.5 h-3.5 cursor-pointer" onClick={() => setSelectedGuestIdx((p) => Math.min(Math.max(0, filteredGuests.length - 1), p + 1))} />
              <ChevronsRight className="w-3.5 h-3.5 cursor-pointer" onClick={() => setSelectedGuestIdx(Math.max(0, filteredGuests.length - 1))} />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadExcel('CONFIRMED')}
                className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 underline cursor-pointer"
              >
                Baixar Excel Só Confirmados ({guestCounters.confirmed})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUB-ABA 2: CONTROLE DE PORTARIA POR CELULAR / CPF (NOSSO SISTEMA)      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'PORTARIA' && (
        <div className="space-y-2.5">
          {/* Faixa de Ocupação por Setor + Contadores da Portaria */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5">
              <div className="text-[10px] uppercase font-bold text-slate-500">Total na Lista</div>
              <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">{guestCounters.all}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5">
              <div className="text-[10px] uppercase font-bold text-indigo-600">Confirmaram RSVP</div>
              <div className="text-lg font-mono font-bold text-indigo-700 dark:text-indigo-300">{guestCounters.confirmed}</div>
            </div>
            <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl p-2.5">
              <div className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">Já Entraram</div>
              <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300">{guestCounters.checkedIn}</div>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5">
              <div className="text-[10px] uppercase font-bold text-amber-600">Faltam Entrar</div>
              <div className="text-lg font-mono font-bold text-amber-700 dark:text-amber-400">{guestCounters.notEntered}</div>
            </div>
            {Object.entries(event.sector_stats || {}).slice(0, 2).map(([sKey, st]: any) => (
              <div key={sKey} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] uppercase font-bold text-slate-500">Setor {sKey}</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {st.checked_in} / {st.guests} entraram
                </div>
              </div>
            ))}
          </div>

          {/* Validador Rápido de Portaria (Celular, CPF, Nome ou Câmera QR) */}
          <div className="bg-white dark:bg-slate-900 border-2 border-indigo-500/70 dark:border-indigo-500/60 rounded-xl p-3.5 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Validador de Portaria em Tempo Real — Celular ou CPF
                </div>
                <p className="text-[11px] text-slate-500">
                  Digite o <strong>Celular (DDD + Número)</strong>, o <strong>CPF</strong> ou o <strong>Nome</strong> para conferir se a pessoa está na lista deste evento e liberar a entrada.
                </p>
              </div>
              <button
                type="button"
                onClick={toggleQrScanner}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-bold shrink-0 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                {scanningQr ? 'Fechar Câmera' : 'Ler QR Code'}
              </button>
            </div>

            {scanningQr && (
              <div className="max-w-sm mx-auto rounded-xl overflow-hidden border border-slate-700 bg-black">
                <div id="evm-detail-portaria-qr" />
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                executePortariaSearch(portariaQuery);
              }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={portariaInputRef}
                  type="text"
                  value={portariaQuery}
                  onChange={(e) => setPortariaQuery(e.target.value)}
                  placeholder="Digite aqui o Celular (ex: 11998887766), CPF (ex: 12345678900) ou Nome..."
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
                />
                {portariaQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setPortariaQuery('');
                      setPortariaResult(null);
                      portariaInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={portariaLoading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
              >
                {portariaLoading ? 'Conferindo...' : 'Conferir na Lista'}
              </button>
            </form>

            {/* Resultado da Validação na Portaria */}
            {portariaResult && (
              <div className="space-y-2 pt-1">
                {!portariaResult.in_event_list ? (
                  <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                        <Ban className="w-4 h-4" />
                        NÃO CONSTA NA LISTA DESTE EVENTO
                      </div>
                      <p className="text-xs text-rose-700 dark:text-rose-200">
                        Nenhum convidado cadastrado na lista de <strong>{event.title}</strong> com &ldquo;{portariaResult.query}&rdquo;.
                      </p>
                      {portariaResult.not_in_list_crm_contact && (
                        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 pt-1">
                          Obs.: Encontrado no cadastro geral de outros eventos: <strong>{portariaResult.not_in_list_crm_contact.full_name}</strong> ({portariaResult.not_in_list_crm_contact.phone_display}).
                        </p>
                      )}
                    </div>

                    {portariaResult.not_in_list_crm_contact && (
                      <button
                        type="button"
                        onClick={() => handleAddCrmContactOnSpotAndCheckin(portariaResult.not_in_list_crm_contact)}
                        className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                      >
                        Incluir Extra ({quickSector}) & Liberar
                      </button>
                    )}
                  </div>
                ) : (
                  portariaResult.matches.map((m: any) => {
                    const verdict = m.portaria_verdict;
                    const c = m.contact || {};
                    const isAlready = verdict === 'ALREADY_ENTERED';
                    const isBlocked = verdict === 'BLOCKED';
                    const currentCpfVal =
                      cpfAtDoorDrafts[m.id] !== undefined
                        ? cpfAtDoorDrafts[m.id]
                        : c.cpf
                          ? formatCpfMask(c.cpf)
                          : '';

                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-xl border-2 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                          isBlocked
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400'
                            : isAlready
                              ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-400'
                              : 'bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-500'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                              SETOR {m.sector_key}
                            </span>
                            {m.companions_count > 0 && (
                              <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px]">
                                +{m.companions_count} ACOMPANHANTE(S)
                              </span>
                            )}
                            {m.invite_status === 'CONFIRMED' ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px]">
                                CONFIRMOU PRESENÇA ✓
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                                NA LISTA (RSVP: {m.invite_status})
                              </span>
                            )}
                          </div>

                          <div className="text-base font-bold text-slate-900 dark:text-white">
                            {c.full_name}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                            <span>Celular: <strong>{c.phone_display}</strong></span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1.5">
                              CPF:
                              <input
                                type="text"
                                value={currentCpfVal}
                                onChange={(e) =>
                                  setCpfAtDoorDrafts((prev) => ({
                                    ...prev,
                                    [m.id]: formatCpfMask(e.target.value),
                                  }))
                                }
                                placeholder="Confirmar/digitar CPF"
                                className="w-36 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-xs"
                              />
                            </span>
                          </div>

                          {isAlready && (
                            <div className="text-xs font-bold text-amber-900 dark:text-amber-300 pt-1 flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              ATENÇÃO: JÁ ENTROU ÀS{' '}
                              {m.checked_in_at ? new Date(m.checked_in_at).toLocaleTimeString('pt-BR') : ''}
                              {m.checked_in_by_name ? ` (Liberado por ${m.checked_in_by_name})` : ''}
                            </div>
                          )}

                          {isBlocked && (
                            <div className="text-xs font-bold text-rose-700 pt-1">
                              ENTRADA BLOQUEADA: {c.block_reason || 'Convite cancelado ou restrição ativa.'}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isBlocked ? (
                            <span className="px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold text-xs">
                              BLOQUEADO
                            </span>
                          ) : isAlready ? (
                            <button
                              type="button"
                              disabled={checkingInId === m.id}
                              onClick={() => handleConfirmPortariaCheckin(m, true)}
                              className="px-3 py-2 rounded-xl border border-amber-400 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 text-[11px] font-bold cursor-pointer"
                            >
                              Estornar Entrada
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={checkingInId === m.id}
                              onClick={() => handleConfirmPortariaCheckin(m, false)}
                              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm inline-flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <UserCheck className="w-4 h-4" />
                              {checkingInId === m.id ? 'Confirmando...' : 'CONFIRMAR ENTRADA'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Grade Ao Vivo dos Convidados que Já Entraram na Portaria */}
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Últimas Entradas Confirmadas na Portaria ({recentCheckins.length})
              </span>
              <button
                type="button"
                onClick={() => handleDownloadExcel('CHECKED_IN')}
                className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" /> Exportar Presentes
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-1.5 px-2.5 w-28">Horário</th>
                    <th className="py-1.5 px-2.5">Convidado</th>
                    <th className="py-1.5 px-2.5 w-36">Celular</th>
                    <th className="py-1.5 px-2.5 w-32">CPF</th>
                    <th className="py-1.5 px-2.5 w-28">Setor</th>
                    <th className="py-1.5 px-2.5 w-40">Operador Portaria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {recentCheckins.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Nenhuma entrada registrada ainda neste evento.
                      </td>
                    </tr>
                  ) : (
                    recentCheckins.slice(0, 80).map((g) => (
                      <tr key={g.id}>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {g.checked_in_at ? new Date(g.checked_in_at).toLocaleTimeString('pt-BR') : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-900 dark:text-white">
                          {g.contact?.full_name}
                          {g.companions_count > 0 ? ` (+${g.companions_count})` : ''}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono">{g.contact?.phone_display}</td>
                        <td className="py-1.5 px-2.5 font-mono text-slate-500">
                          {g.contact?.cpf ? formatCpfMask(g.contact.cpf) : '—'}
                        </td>
                        <td className="py-1.5 px-2.5 font-bold">{g.sector_key}</td>
                        <td className="py-1.5 px-2.5 text-slate-500">{g.checked_in_by_name || 'Portaria'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUB-ABA 3: COFRE DE INGRESSOS PDF / ZIP (INLINE SEM MODAL!)            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'VAULT' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'ALL', label: 'Todos' },
                  { id: 'AVAILABLE', label: `Disponíveis (${ticketsData.counts.AVAILABLE || 0})` },
                  { id: 'RESERVED', label: `Reservados (${ticketsData.counts.RESERVED || 0})` },
                  { id: 'SENT', label: `Enviados (${ticketsData.counts.SENT || 0})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setVaultStatusFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold border cursor-pointer ${
                      vaultStatusFilter === f.id
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowVaultUploadBar((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {showVaultUploadBar ? 'Fechar Anexo PDF/ZIP' : 'Anexar Ingressos PDF / ZIP'}
              </button>
            </div>

            {showVaultUploadBar && (
              <form onSubmit={handleVaultUpload} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <input
                  type="file"
                  accept=".pdf,.zip"
                  onChange={(e) => setVaultFile(e.target.files?.[0] || null)}
                  className="md:col-span-4 text-[11px]"
                />
                <select
                  value={vaultSector}
                  onChange={(e) => setVaultSector(e.target.value)}
                  className="md:col-span-2 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold"
                >
                  {eventSectors.map((s: any) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
                <div className="md:col-span-2">
                  <CurrencyInput
                    prefixStr="R$ "
                    value={vaultFaceValue}
                    onChangeValue={setVaultFaceValue}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono text-right"
                  />
                </div>
                <label className="md:col-span-2 inline-flex items-center gap-1 text-[10px] font-semibold">
                  <input
                    type="checkbox"
                    checked={vaultSplitPages}
                    onChange={(e) => setVaultSplitPages(e.target.checked)}
                  />
                  Fatiar 1 pág = 1 PDF
                </label>
                <button
                  type="submit"
                  disabled={uploadingVault || !vaultFile}
                  className="md:col-span-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  {uploadingVault ? 'Processando...' : 'Importar Lote'}
                </button>
              </form>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">
                  <th className="py-1.5 px-2.5">Ingresso #</th>
                  <th className="py-1.5 px-2.5">Setor</th>
                  <th className="py-1.5 px-2.5">Arquivo / Página</th>
                  <th className="py-1.5 px-2.5">Status</th>
                  <th className="py-1.5 px-2.5">Convidado Vinculado (1:1)</th>
                  <th className="py-1.5 px-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ticketsData.items
                  .filter((t) => vaultStatusFilter === 'ALL' || t.status === vaultStatusFilter)
                  .map((tk) => (
                    <tr key={tk.id}>
                      <td className="py-1.5 px-2.5 font-mono font-bold">#{tk.id} • {tk.ticket_number}</td>
                      <td className="py-1.5 px-2.5 font-bold">{tk.sector_key}</td>
                      <td className="py-1.5 px-2.5 font-mono text-slate-500">
                        {tk.original_filename} (p.{tk.page_number})
                      </td>
                      <td className="py-1.5 px-2.5 font-bold">{tk.status}</td>
                      <td className="py-1.5 px-2.5">
                        {tk.assigned_guest_name ? (
                          <span>
                            <strong>{tk.assigned_guest_name}</strong> ({tk.assigned_guest_phone})
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Disponível</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await fetch(`${API_URL}/event-management/tickets/${tk.id}/download`, {
                              headers: authHeaders(),
                            });
                            if (res.ok) {
                              const blob = await res.blob();
                              window.open(URL.createObjectURL(blob), '_blank');
                            }
                          }}
                          className="px-2 py-0.5 rounded border border-slate-300 text-[10px] font-bold cursor-pointer"
                        >
                          Abrir PDF
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUB-ABA 4: DADOS & EDIÇÃO INLINE DO EVENTO (SEM MODAL!)                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'DETAILS' && (
        <InlineEventDetailsEditor
          event={event}
          venues={venues}
          authHeaders={authHeaders}
          onSaved={() => loadEventDetail(true)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* SUB-ABA 5: HISTÓRICO AUDITADO DO EVENTO                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {subTab === 'LOGS' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700 text-[10px] font-bold uppercase">
                  <th className="py-1.5 px-2.5 w-40">Data / Hora</th>
                  <th className="py-1.5 px-2.5 w-44">Ação</th>
                  <th className="py-1.5 px-2.5 w-40">Operador</th>
                  <th className="py-1.5 px-2.5">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 px-2.5 font-mono text-slate-500">
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
  );
}

function InlineEventDetailsEditor({ event, venues, authHeaders, onSaved }: any) {
  const [title, setTitle] = useState(event.title || '');
  const [eventDate, setEventDate] = useState(event.event_date || '');
  const [doorsOpen, setDoorsOpen] = useState(event.doors_open_time || '');
  const [startTime, setStartTime] = useState(event.start_time || '');
  const [cutoffTime, setCutoffTime] = useState(event.list_cutoff_time || '');
  const [venueId, setVenueId] = useState<string>(event.venue_id ? String(event.venue_id) : '');
  const [customLocation, setCustomLocation] = useState(event.custom_location_name || '');
  const [street, setStreet] = useState(event.street || '');
  const [number, setNumber] = useState(event.number || '');
  const [neighborhood, setNeighborhood] = useState(event.neighborhood || '');
  const [city, setCity] = useState(event.city || '');
  const [stateUf, setStateUf] = useState(event.state || '');
  const [sectors, setSectors] = useState<any[]>(event.sectors || []);
  const [autoSendRsvp, setAutoSendRsvp] = useState(Boolean(event.auto_send_ticket_on_rsvp));
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events/${event.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...event,
          title,
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
          sectors,
          auto_send_ticket_on_rsvp: autoSendRsvp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar evento.');
      toast.success('Dados do evento salvos!');
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-2xs">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <span className="font-bold text-slate-900 dark:text-white">Ficha Cadastral Completa do Evento</span>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1 px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Salvando...' : 'Salvar Dados do Evento'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
        <div className="md:col-span-2">
          <label className="font-bold block mb-1">Nome do Evento</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
        </div>
        <div>
          <label className="font-bold block mb-1">Data</label>
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-mono" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <label className="font-bold block mb-1">Abertura</label>
            <input type="time" value={doorsOpen} onChange={(e) => setDoorsOpen(e.target.value)} className="w-full px-1.5 py-1.5 rounded-lg border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="font-bold block mb-1">Início</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-1.5 py-1.5 rounded-lg border border-slate-300 font-mono" />
          </div>
          <div>
            <label className="font-bold block mb-1">Corte</label>
            <input type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} className="w-full px-1.5 py-1.5 rounded-lg border border-slate-300 font-mono" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <div>
          <label className="font-bold block mb-1">Casa de Show Pré-Cadastrada</label>
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold">
            <option value="">-- Local Avulso --</option>
            {venues.map((v: any) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-bold block mb-1">Nome do Local Avulso</label>
          <input type="text" value={customLocation} onChange={(e) => setCustomLocation(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <input type="text" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} className="col-span-2 px-2.5 py-1.5 rounded-lg border border-slate-300 mt-5" />
          <input type="text" placeholder="UF" maxLength={2} value={stateUf} onChange={(e) => setStateUf(e.target.value.toUpperCase())} className="px-2.5 py-1.5 rounded-lg border border-slate-300 mt-5 font-mono uppercase" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input type="text" placeholder="Rua / Av." value={street} onChange={(e) => setStreet(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300" />
        <input type="text" placeholder="Número" value={number} onChange={(e) => setNumber(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300" />
        <input type="text" placeholder="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-300" />
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <span className="font-bold">Setores & Cotas do Evento</span>
          <button
            type="button"
            onClick={() => setSectors([...sectors, { key: `SETOR_${sectors.length + 1}`, name: 'Novo Setor', courtesy_quota: 50, face_value: 0 }])}
            className="text-indigo-600 font-bold cursor-pointer"
          >
            + Adicionar Setor
          </button>
        </div>
        {sectors.map((sec, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            <input
              type="text"
              value={sec.key}
              onChange={(e) => {
                const cp = [...sectors];
                cp[idx] = { ...cp[idx], key: e.target.value.toUpperCase().replace(/\s+/g, '_') };
                setSectors(cp);
              }}
              className="col-span-3 px-2 py-1 rounded border border-slate-300 font-mono font-bold"
            />
            <input
              type="text"
              value={sec.name}
              onChange={(e) => {
                const cp = [...sectors];
                cp[idx] = { ...cp[idx], name: e.target.value };
                setSectors(cp);
              }}
              className="col-span-4 px-2 py-1 rounded border border-slate-300"
            />
            <input
              type="number"
              value={sec.courtesy_quota ?? 100}
              onChange={(e) => {
                const cp = [...sectors];
                cp[idx] = { ...cp[idx], courtesy_quota: Number(e.target.value) };
                setSectors(cp);
              }}
              className="col-span-2 px-2 py-1 rounded border border-slate-300 font-mono"
            />
            <div className="col-span-3">
              <CurrencyInput
                prefixStr="R$ "
                value={Number(sec.face_value || 0)}
                onChangeValue={(v) => {
                  const cp = [...sectors];
                  cp[idx] = { ...cp[idx], face_value: v };
                  setSectors(cp);
                }}
                className="w-full px-2 py-1 rounded border border-slate-300 font-mono text-right"
              />
            </div>
          </div>
        ))}
      </div>

      <label className="inline-flex items-center gap-2 font-semibold pt-1">
        <input type="checkbox" checked={autoSendRsvp} onChange={(e) => setAutoSendRsvp(e.target.checked)} />
        Liberar ingresso PDF automaticamente quando o convidado confirmar presença
      </label>
    </form>
  );
}

export default function EventDetailDedicatedPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-500">Abrindo evento...</div>}>
      <EventDetailWorkspaceContent />
    </Suspense>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  ClipboardPaste,
  Users,
  QrCode,
  Search,
  CheckCircle2,
  Send,
  Ticket,
  Camera,
  X,
  ArrowLeft,
  Loader2,
  Upload,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { formatBrPhoneMask, validateBrPhoneClient } from '@/lib/br_phone';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function EventManagementMobilePage() {
  const [activeTab, setActiveTab] = useState<'CAPTURE' | 'LIST' | 'CHECKIN'>('CAPTURE');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [guests, setGuests] = useState<any[]>([]);
  const [loadingGuests, setLoadingGuests] = useState(false);

  // Quick Capture Form
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [nickname, setNickname] = useState('');
  const [sectorKey, setSectorKey] = useState('VIP');
  const [categoryTag, setCategoryTag] = useState('CONVIDADO');
  const [instagram, setInstagram] = useState('');
  const [cpf, setCpf] = useState('');
  const [companionsCount, setCompanionsCount] = useState(0);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [savingGuest, setSavingGuest] = useState(false);

  // Smart Paste Mode
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);

  // List & Checkin Search
  const [searchTerm, setSearchTerm] = useState('');
  const [scanningQr, setScanningQr] = useState(false);
  const qrScannerRef = useRef<any>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;
  const sectors: any[] = selectedEvent?.sectors?.length
    ? selectedEvent.sectors
    : [
        { key: 'VIP', name: 'Área VIP' },
        { key: 'PISTA', name: 'Pista' },
        { key: 'CAMAROTE', name: 'Camarote' },
      ];

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${getToken()}` };
  }

  async function loadEvents() {
    try {
      const res = await fetch(`${API_URL}/event-management/events`, { headers: authHeaders() });
      if (!res.ok) return;
      const list = await res.json();
      setEvents(list);
      if (list.length > 0 && !selectedEventId) {
        const openEv = list.find((e: any) => e.status === 'OPEN' || e.status === 'ONGOING') || list[0];
        setSelectedEventId(openEv.id);
      }
    } catch {}
  }

  async function loadGuests(evId?: number | null) {
    const target = evId ?? selectedEventId;
    if (!target) return;
    setLoadingGuests(true);
    try {
      const res = await fetch(`${API_URL}/event-management/events/${target}/guests`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        setGuests(await res.json());
      }
    } finally {
      setLoadingGuests(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadGuests(selectedEventId);
    }
  }, [selectedEventId]);

  // Lookup instantâneo ao digitar DDD + Telefone
  useEffect(() => {
    const check = validateBrPhoneClient(phone);
    if (!check.valid) {
      setLookupResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/event-management/contacts/lookup-phone?phone=${encodeURIComponent(phone)}`,
          { headers: authHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setLookupResult(data);
          if (data.exists && data.contact && !fullName) {
            setFullName(data.contact.full_name);
            setNickname(data.contact.nickname || '');
            setInstagram(data.contact.instagram || '');
          }
        }
      } catch {}
    }, 260);
    return () => clearTimeout(timer);
  }, [phone]);

  // Para câmera QR ao desmontar ou fechar modal
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(() => {});
        qrScannerRef.current = null;
      }
    };
  }, []);

  async function handlePickNativeContact() {
    const navAny = navigator as any;
    if (navAny?.contacts?.select) {
      try {
        const picked = await navAny.contacts.select(['name', 'tel'], { multiple: false });
        if (picked && picked[0]) {
          const c = picked[0];
          if (c.name?.[0]) setFullName(c.name[0]);
          if (c.tel?.[0]) setPhone(formatBrPhoneMask(c.tel[0]));
          toast.success('Contato importado da agenda!');
        }
      } catch {}
    } else {
      toast.info('Use o botão ao lado para abrir um cartão .vcf ou cole a mensagem do WhatsApp.');
    }
  }

  async function handleVcfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo .vcf excede o limite de 2 MB.');
      return;
    }
    const text = await file.text();
    setPasteText(text);
    setShowSmartPaste(true);
    await handleParseSmartPaste(text);
    e.target.value = '';
  }

  async function handleQuickSave(e: React.FormEvent) {
    e.preventDefault();
    const phoneCheck = validateBrPhoneClient(phone);
    if (!phoneCheck.valid) {
      toast.error(phoneCheck.error || 'Informe um telefone válido com DDD.');
      return;
    }
    if (!fullName.trim() && !lookupResult?.contact?.id) {
      toast.error('Informe o nome completo do convidado.');
      return;
    }

    setSavingGuest(true);
    try {
      if (selectedEventId) {
        const res = await fetch(`${API_URL}/event-management/events/${selectedEventId}/guests`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: lookupResult?.contact?.id || undefined,
            full_name: fullName.trim(),
            nickname: nickname.trim() || undefined,
            phone,
            cpf: cpf.trim() || undefined,
            instagram: instagram.trim() || undefined,
            category_tag: categoryTag,
            sector_key: sectorKey,
            companions_count: companionsCount,
            added_via: 'MOBILE_QUICK',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Falha ao incluir convidado.');
        toast.success(
          data.contact_was_reused
            ? `${fullName} já estava no CRM e foi vinculado ao evento!`
            : `${fullName} cadastrado e vinculado com sucesso!`
        );
        loadGuests(selectedEventId);
      } else {
        const res = await fetch(`${API_URL}/event-management/contacts`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: fullName.trim(),
            nickname: nickname.trim() || undefined,
            phone,
            cpf: cpf.trim() || undefined,
            instagram: instagram.trim() || undefined,
            category_tag: categoryTag,
            origin_source: 'MOBILE_QUICK',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Falha ao salvar contato.');
        toast.success('Contato salvo na base CRM!');
      }

      setPhone('');
      setFullName('');
      setNickname('');
      setInstagram('');
      setCpf('');
      setCompanionsCount(0);
      setLookupResult(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingGuest(false);
    }
  }

  async function handleParseSmartPaste(overrideText?: string) {
    const raw = overrideText ?? pasteText;
    if (!raw.trim()) return;
    setParsing(true);
    try {
      const res = await fetch(`${API_URL}/event-management/contacts/parse-smart-paste`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao analisar contatos.');
      setParsedPreview(data.items || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmBulkPaste() {
    const validContacts = parsedPreview.filter((i) => i.valid);
    if (validContacts.length === 0) {
      toast.error('Nenhum contato válido com DDD para importar.');
      return;
    }
    setParsing(true);
    try {
      const res = await fetch(`${API_URL}/event-management/contacts/bulk-import-parsed`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEventId || undefined,
          sector_key: sectorKey,
          source_channel: 'MOBILE_QUICK',
          contacts: validContacts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao importar contatos.');
      toast.success(
        `Concluído! ${data.created_contacts} novos no CRM, ${data.reused_contacts} reaproveitados e ${data.linked_to_event} na lista do evento.`
      );
      setPasteText('');
      setParsedPreview([]);
      setShowSmartPaste(false);
      if (selectedEventId) loadGuests(selectedEventId);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleQuickDispatch(guestId: number, mode: string) {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`${API_URL}/event-management/events/${selectedEventId}/dispatch`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_ids: [guestId],
          dispatch_mode: mode,
          frontend_origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao enfileirar disparo.');
      if (data.enqueued > 0) {
        toast.success('Enfileirado no disparo seguro do WhatsApp!');
        loadGuests(selectedEventId);
      } else {
        toast.warning(data.skipped?.[0]?.reason || 'Disparo ignorado por proteção.');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleCheckin(guestId?: number, qrToken?: string, undo = false) {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`${API_URL}/event-management/events/${selectedEventId}/checkin`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: guestId, qr_code: qrToken, undo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro no check-in.');
      if (data.already_checked_in) {
        toast.warning(data.message);
      } else {
        toast.success(data.message);
      }
      loadGuests(selectedEventId);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function startQrCamera() {
    setScanningQr(true);
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('evm-mobile-qr-reader');
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText: string) => {
            await scanner.stop().catch(() => {});
            qrScannerRef.current = null;
            setScanningQr(false);
            await handleCheckin(undefined, decodedText, false);
          },
          () => {}
        );
      } catch (err: any) {
        setScanningQr(false);
        toast.error('Não foi possível acessar a câmera neste dispositivo. Utilize a busca rápida por nome ou telefone.');
      }
    }, 150);
  }

  async function stopQrCamera() {
    if (qrScannerRef.current) {
      await qrScannerRef.current.stop().catch(() => {});
      qrScannerRef.current = null;
    }
    setScanningQr(false);
  }

  const filteredGuests = guests.filter((g) => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    const c = g.contact || {};
    return (
      (c.full_name || '').toLowerCase().includes(s) ||
      (c.phone_display || '').toLowerCase().includes(s) ||
      (c.phone_canonical || '').includes(s.replace(/\D/g, '')) ||
      (c.cpf || '').includes(s.replace(/\D/g, '')) ||
      (g.sector_key || '').toLowerCase().includes(s)
    );
  });

  const checkedInCount = guests.filter((g) => g.checkin_status === 'CHECKED_IN').length;

  return (
    <div className="max-w-lg mx-auto pb-24 space-y-4">
      {/* Barra Superior Compacta */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h1 className="font-bold text-slate-900 dark:text-white text-base">
              Eventos • Modo Rápido Mobile
            </h1>
          </div>
          <Link
            href="/event-management"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1.5 rounded-xl"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Painel Completo
          </Link>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Evento Ativo Selecionado
          </label>
          <select
            value={selectedEventId || ''}
            onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
          >
            <option value="">Salvar apenas no CRM Geral (Sem Evento)</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.event_date?.split('-').reverse().join('/')}) — {ev.stats?.total_guests || 0} conv.
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Abas de Operação Mobile */}
      <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('CAPTURE')}
          className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'CAPTURE'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <UserPlus className="w-4 h-4" /> + Contato
        </button>
        <button
          onClick={() => setActiveTab('LIST')}
          className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'LIST'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Users className="w-4 h-4" /> Lista ({guests.length})
        </button>
        <button
          onClick={() => setActiveTab('CHECKIN')}
          className={`py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'CHECKIN'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <QrCode className="w-4 h-4" /> Portaria ({checkedInCount})
        </button>
      </div>

      {/* ABA 1: CAPTAÇÃO ULTRA PRÁTICA */}
      {activeTab === 'CAPTURE' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowSmartPaste(!showSmartPaste)}
              className="py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <ClipboardPaste className="w-4 h-4" /> Colar do WhatsApp
            </button>
            <label className="py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
              <Upload className="w-4 h-4 text-indigo-500" /> Abrir Contato .VCF
              <input type="file" accept=".vcf,text/vcard" onChange={handleVcfUpload} className="hidden" />
            </label>
          </div>

          {showSmartPaste && (
            <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Colagem Inteligente (Mensagens do WhatsApp)
                </h2>
                <button onClick={() => setShowSmartPaste(false)} className="text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Cole aqui 1 ou vários contatos copiados do WhatsApp:\nJoão Silva 11 99888-7766\nMaria (21) 97777-6666 @maria'}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleParseSmartPaste()}
                  disabled={parsing}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                >
                  {parsing ? 'Validando DDDs...' : 'Validar Números'}
                </button>
                {parsedPreview.some((i) => i.valid) && (
                  <button
                    type="button"
                    onClick={handleConfirmBulkPaste}
                    disabled={parsing}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                  >
                    Salvar {parsedPreview.filter((i) => i.valid).length} Válido(s)
                  </button>
                )}
              </div>

              {parsedPreview.length > 0 && (
                <div className="max-h-52 overflow-y-auto space-y-1.5 pt-1">
                  {parsedPreview.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs border ${
                        item.valid
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <div className="font-bold text-slate-900 dark:text-white flex justify-between">
                        <span>{item.full_name}</span>
                        <span className="font-mono">{item.phone_display || item.raw_phone}</span>
                      </div>
                      {item.already_in_crm && (
                        <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                          Já no CRM ({item.past_events_count} evento(s)) — será apenas vinculado
                        </span>
                      )}
                      {!item.valid && <span className="text-[11px] text-rose-600">{item.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={handleQuickSave}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3.5 shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  WhatsApp com DDD *
                </label>
                <button
                  type="button"
                  onClick={handlePickNativeContact}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400"
                >
                  Buscar na Agenda
                </button>
              </div>
              <input
                type="tel"
                inputMode="tel"
                placeholder="(11) 99888-7766"
                value={phone}
                onChange={(e) => setPhone(formatBrPhoneMask(e.target.value))}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-mono font-semibold text-slate-900 dark:text-white"
              />
              {phone.length >= 4 && !validateBrPhoneClient(phone).valid && (
                <p className="text-[11px] text-amber-600 mt-1">{validateBrPhoneClient(phone).error}</p>
              )}
              {lookupResult?.exists && lookupResult.contact && (
                <div className="mt-2 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1">
                  <div className="font-bold text-indigo-900 dark:text-indigo-200">
                    ✓ Contato já cadastrado no CRM: {lookupResult.contact.full_name}
                  </div>
                  <div className="text-indigo-700 dark:text-indigo-300">
                    Histórico: <strong>{lookupResult.contact.total_events_invited}</strong> convite(s) •{' '}
                    <strong>{lookupResult.contact.total_checkins}</strong> presença(s)
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                Nome Completo *
              </label>
              <input
                type="text"
                placeholder="Ex: Mariana Costa"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Setor / Lista
                </label>
                <select
                  value={sectorKey}
                  onChange={(e) => setSectorKey(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold"
                >
                  {sectors.map((s: any) => (
                    <option key={s.key} value={s.key}>
                      {s.name || s.key}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Perfil / Tag
                </label>
                <select
                  value={categoryTag}
                  onChange={(e) => setCategoryTag(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                >
                  <option value="CONVIDADO">Convidado</option>
                  <option value="VIP">VIP</option>
                  <option value="IMPRENSA">Imprensa</option>
                  <option value="INFLUENCER">Influencer</option>
                  <option value="ARTISTA">Artista</option>
                  <option value="PATROCINADOR">Patrocinador</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Apelido"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <input
                type="text"
                placeholder="@instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
              <input
                type="text"
                placeholder="CPF (opcional)"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={savingGuest}
              className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
            >
              {savingGuest ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {lookupResult?.exists
                ? 'Vincular Contato Existente ao Evento'
                : selectedEventId
                ? 'Salvar no CRM & Incluir na Lista'
                : 'Salvar Contato no CRM'}
            </button>
          </form>
        </div>
      )}

      {/* ABA 2: LISTA MOBILE & DISPARO 1-TOQUE */}
      {activeTab === 'LIST' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Buscar convidado por nome, telefone ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
            />
          </div>

          {loadingGuests ? (
            <div className="py-12 text-center text-slate-400 text-sm">Carregando lista...</div>
          ) : filteredGuests.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              Nenhum convidado encontrado neste evento.
            </div>
          ) : (
            filteredGuests.map((g) => (
              <div
                key={g.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">
                      {g.contact?.full_name}
                    </div>
                    <div className="text-xs font-mono text-slate-500">{g.contact?.phone_display}</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {g.sector_key}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Convite: <strong>{g.invite_status}</strong>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-lg font-semibold ${
                      g.ticket_delivery_status === 'SENT'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Ingresso: {g.ticket_delivery_status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleQuickDispatch(g.id, 'INVITE_ONLY')}
                    className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-500" /> Enviar Convite
                  </button>
                  <button
                    onClick={() => handleQuickDispatch(g.id, 'COMBO_INVITE_AND_PDF')}
                    disabled={g.ticket_delivery_status === 'SENT'}
                    className="py-2 px-3 rounded-xl bg-indigo-600 disabled:bg-emerald-600/30 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    {g.ticket_delivery_status === 'SENT' ? 'PDF Enviado ✓' : 'Enviar PDF'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ABA 3: PORTARIA CHECK-IN & CÂMERA QR */}
      {activeTab === 'CHECKIN' && (
        <div className="space-y-3">
          {!scanningQr ? (
            <button
              onClick={startQrCamera}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2"
            >
              <Camera className="w-5 h-5" /> Ler QR Code da Credencial pela Câmera
            </button>
          ) : (
            <div className="bg-slate-900 rounded-2xl p-4 space-y-3 text-white">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Aponte para o QR Code do Convidado
                </span>
                <button onClick={stopQrCamera} className="text-xs text-slate-300 flex items-center gap-1">
                  <X className="w-4 h-4" /> Fechar
                </button>
              </div>
              <div id="evm-mobile-qr-reader" className="rounded-xl overflow-hidden" />
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Portaria: buscar nome, telefone ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
            />
          </div>

          {filteredGuests.map((g) => {
            const isChecked = g.checkin_status === 'CHECKED_IN';
            return (
              <div
                key={g.id}
                className={`border rounded-2xl p-4 flex items-center justify-between gap-3 ${
                  isChecked
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {g.contact?.full_name}
                  </div>
                  <div className="text-xs font-mono text-slate-500">
                    {g.contact?.phone_display} • <strong>{g.sector_key}</strong>
                    {g.companions_count > 0 ? ` (+${g.companions_count})` : ''}
                  </div>
                  {g.contact?.is_blocked && (
                    <div className="text-[11px] text-rose-600 font-bold flex items-center gap-1 mt-0.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> RESTRIÇÃO NO CRM
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleCheckin(g.id, undefined, isChecked)}
                  className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
                    isChecked
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 dark:bg-indigo-600 text-white'
                  }`}
                >
                  {isChecked ? 'Entrou ✓' : 'Check-in'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

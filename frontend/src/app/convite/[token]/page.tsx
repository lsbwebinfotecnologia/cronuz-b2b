'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Sparkles,
  Ticket,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { getImageUrl } from '@/lib/image_helper';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function PublicInviteRsvpPage() {
  const params = useParams();
  const token = String(params?.token || '');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/event-management/public/rsvp/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || 'Este convite não foi encontrado ou já foi encerrado.');
        }
        return res.json();
      })
      .then((data) => {
        setInviteData(data);
        if (data.qr_payload) {
          QRCode.toDataURL(data.qr_payload, { width: 320, margin: 2 }).then(setQrDataUrl).catch(() => {});
        }
      })
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleDecision(decision: 'CONFIRM' | 'DECLINE') {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/event-management/public/rsvp/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          cpf: cpf.trim() || undefined,
          email: email.trim() || undefined,
          instagram: instagram.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Não foi possível registrar sua confirmação agora.');
      }
      toast.success(data.message || 'Resposta registrada com sucesso!');
      setInviteData((prev: any) => ({
        ...prev,
        invite_status: data.invite_status,
        qr_payload: data.qr_payload,
      }));
      if (data.qr_payload) {
        const url = await QRCode.toDataURL(data.qr_payload, { width: 320, margin: 2 });
        setQrDataUrl(url);
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao confirmar presença.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-200">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <span className="text-sm font-medium">Carregando seu convite...</span>
        </div>
      </div>
    );
  }

  if (errorMsg || !inviteData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-4">
          <XCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-xl font-bold text-white">Convite Indisponível</h1>
          <p className="text-sm text-slate-400">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const ev = inviteData.event || {};
  const formattedDate = ev.event_date
    ? ev.event_date.split('-').reverse().join('/')
    : '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-6 px-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        {ev.banner_url ? (
          <div className="relative h-56 w-full bg-slate-800">
            <img
              src={getImageUrl(ev.banner_url)}
              alt={ev.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
            <span className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold bg-indigo-600/95 text-white shadow-lg">
              SETOR {inviteData.sector_key}
            </span>
          </div>
        ) : (
          <div className="h-32 bg-gradient-to-r from-indigo-700 to-violet-700 flex items-end p-6 justify-between">
            <Sparkles className="w-8 h-8 text-white/80" />
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white">
              SETOR {inviteData.sector_key}
            </span>
          </div>
        )}

        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
              Convite Especial Individual
            </p>
            <h1 className="text-2xl font-bold text-white mt-1">{ev.title}</h1>
            {ev.subtitle && <p className="text-sm text-slate-400 mt-0.5">{ev.subtitle}</p>}
          </div>

          <div className="bg-slate-800/60 border border-slate-700/70 rounded-2xl p-4 space-y-2.5 text-sm">
            <div className="flex items-center gap-2.5 text-slate-200">
              <Ticket className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                Convidado(a): <strong className="text-white">{inviteData.guest_name}</strong>
                {inviteData.companions_count > 0 ? ` (+${inviteData.companions_count} acomp.)` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-300">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Data: <strong>{formattedDate}</strong></span>
              {(ev.doors_open_time || ev.start_time) && (
                <>
                  <Clock className="w-4 h-4 text-indigo-400 ml-2 shrink-0" />
                  <span>{ev.doors_open_time || ev.start_time}</span>
                </>
              )}
            </div>
            {ev.location_name && (
              <div className="flex items-start gap-2.5 text-slate-300">
                <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-white">{ev.location_name}</div>
                  {ev.street && (
                    <div className="text-xs text-slate-400">
                      {ev.street}{ev.number ? `, ${ev.number}` : ''}{ev.neighborhood ? ` — ${ev.neighborhood}` : ''}{ev.city ? ` (${ev.city}/${ev.state || ''})` : ''}
                    </div>
                  )}
                  {ev.maps_url && (
                    <a
                      href={ev.maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 mt-1"
                    >
                      Abrir localização no Mapa <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {inviteData.invite_status === 'CONFIRMED' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-center space-y-4">
              <div className="inline-flex items-center gap-2 text-emerald-400 font-bold text-base">
                <CheckCircle2 className="w-5 h-5" /> Presença Confirmada!
              </div>
              {qrDataUrl && (
                <div className="bg-white p-4 rounded-2xl inline-block mx-auto shadow-md">
                  <img src={qrDataUrl} alt="Credencial QR Code" className="w-52 h-52 mx-auto" />
                  <p className="text-[11px] font-semibold text-slate-600 mt-2">
                    Apresente este QR Code na recepção
                  </p>
                </div>
              )}
              <p className="text-xs text-slate-300 leading-relaxed">
                {inviteData.ticket_delivery_status === 'SENT'
                  ? 'Seu ingresso oficial em PDF já foi enviado para o seu WhatsApp.'
                  : 'Caso este setor utilize ingresso em PDF, você o receberá diretamente em seu WhatsApp.'}
              </p>
            </div>
          ) : inviteData.invite_status === 'DECLINED' ? (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center space-y-3">
              <p className="text-sm text-slate-300">Você informou que não poderá comparecer a este evento.</p>
              <button
                onClick={() => handleDecision('CONFIRM')}
                disabled={submitting}
                className="text-xs font-semibold text-indigo-400 underline"
              >
                Mudei de ideia — quero confirmar minha presença
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {(inviteData.needs_cpf || inviteData.needs_instagram || inviteData.needs_email) && (
                <div className="space-y-2.5 bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
                  <p className="text-xs font-medium text-slate-300">
                    Complete seus dados para agilizar sua identificação na entrada (opcional):
                  </p>
                  {inviteData.needs_cpf && (
                    <input
                      type="text"
                      placeholder="Seu CPF (somente números)"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                    />
                  )}
                  {inviteData.needs_instagram && (
                    <input
                      type="text"
                      placeholder="Seu @instagram"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                    />
                  )}
                  {inviteData.needs_email && (
                    <input
                      type="email"
                      placeholder="Seu melhor e-mail"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => handleDecision('CONFIRM')}
                  disabled={submitting}
                  className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Minha Presença
                </button>
                <button
                  onClick={() => handleDecision('DECLINE')}
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
                >
                  Não poderei comparecer
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Convite pessoal e intransferível • Classificação {ev.age_rating || '18+'}
          </div>
        </div>
      </div>
    </div>
  );
}

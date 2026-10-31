'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Copy, FileDown, RefreshCw, XCircle, CalendarClock, History, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getUser } from '@/lib/auth';
import {
  Charge, ORIGIN_LABEL, StatusBadge, EnvBadge, OriginContextTags, brl, copyText, fmtDate, fmtDateTime, maskDoc, paymentsApi,
} from '@/components/payments/chargeUi';

interface ChargeEvent {
  id: number; source: string; event_type: string; status_before: string | null; status_after: string | null;
  message: string | null; created_at: string | null;
}
interface Detail { charge: Charge; replaced_by_charge_id: number | null; events: ChargeEvent[] }

const EVENT_LABEL: Record<string, string> = {
  created: 'Emitido', paid: 'Pago', cancelled: 'Cancelado', late: 'Vencido', open: 'Em aberto', in_payment: 'Em pagamento',
  error: 'Erro', reissued: 'Reemitido', notified: 'Notificação recebida',
};
const SOURCE_LABEL: Record<string, string> = { API: 'Sistema', USER: 'Usuário', WEBHOOK: 'Cora (webhook)', SYNC: 'Sincronização', JOB: 'Rotina automática' };

const btnCls = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40';

export default function CoraBoletoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const companyId = getUser()?.company_id;
  const [data, setData] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showReissue, setShowReissue] = useState(false);
  const [newDue, setNewDue] = useState('');

  const load = useCallback(async () => {
    if (!companyId || !id) return;
    try {
      setData(await paymentsApi<Detail>(companyId, `/charges/${id}`));
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [companyId, id]);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  if (!data || !companyId) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-pink-600" /></div>;
  }

  const c = data.charge;
  const active = !['PAID', 'CANCELLED', 'ERROR'].includes(c.status);
  const copy = async (text: string | null, label: string) => { if (await copyText(text)) toast.success(`${label} copiado(a).`); };

  const actions = {
    pdf: () => run('pdf', async () => {
      const r = await paymentsApi<{ url: string }>(companyId, `/charges/${c.id}/pdf`);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    }),
    sync: () => run('sync', async () => {
      const r = await paymentsApi<{ changed: boolean }>(companyId, `/charges/${c.id}/sync`, { method: 'POST' });
      toast.success(r.changed ? 'Status atualizado.' : 'Sem alterações no Cora.');
      await load();
    }),
    cancel: () => {
      if (!confirm('Cancelar este boleto no Banco Cora? A linha digitável e o Pix deixam de valer.')) return;
      run('cancel', async () => {
        await paymentsApi(companyId, `/charges/${c.id}/cancel`, { method: 'POST' });
        toast.success('Boleto cancelado.');
        await load();
      });
    },
    reissue: () => {
      if (!newDue) { toast.error('Informe o novo vencimento.'); return; }
      run('reissue', async () => {
        const r = await paymentsApi<{ charge: Charge }>(companyId, `/charges/${c.id}/reissue`, { method: 'POST', body: JSON.stringify({ due_date: newDue }) });
        toast.success('Boleto reemitido com o novo vencimento.');
        router.push(`/financial/cora/boletos/${r.charge.id}`);
      });
    },
    simulate: () => run('simulate', async () => {
      await paymentsApi(companyId, `/charges/${c.id}/simulate-payment`, { method: 'POST' });
      toast.success('Pagamento simulado no Stage.');
      await load();
    }),
  };

  const payer = c.payer || {};

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-5xl mx-auto">
      <Link href="/financial/cora/boletos" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Boletos Cora</Link>

      {/* Cabeçalho */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><StatusBadge charge={c} /><EnvBadge env={c.environment} /><span className="text-xs font-mono text-slate-400">#{c.id}</span></div>
            <h1 className="mt-2 text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{brl(c.amount)}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">{c.description}</p>
            <OriginContextTags charge={c} />
          </div>
          <div className="text-left sm:text-right text-xs text-slate-500 space-y-0.5">
            <p>Emissão <b className="text-slate-800 dark:text-slate-100">{fmtDate(c.issue_date || c.created_at)}</b></p>
            <p>Vencimento <b className="text-slate-800 dark:text-slate-100">{fmtDate(c.due_date)}</b></p>
            {c.paid_at && <p className="text-emerald-600">Pago em {fmtDateTime(c.paid_at)} · {brl(c.total_paid ?? c.amount)}</p>}
            {c.cancelled_at && <p>Cancelado em {fmtDateTime(c.cancelled_at)}</p>}
            {c.code && <p className="font-mono text-[11px]">Cód. Cora: {c.code}</p>}
          </div>
        </div>
        {c.replaces_charge_id && <p className="text-xs text-slate-500">Reemissão do boleto <Link className="text-pink-600 underline" href={`/financial/cora/boletos/${c.replaces_charge_id}`}>#{c.replaces_charge_id}</Link>.</p>}
        {data.replaced_by_charge_id && <p className="text-xs text-amber-700">Este boleto foi substituído pelo <Link className="underline" href={`/financial/cora/boletos/${data.replaced_by_charge_id}`}>#{data.replaced_by_charge_id}</Link>.</p>}
        {c.last_error && <p className="flex items-start gap-1.5 text-xs text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" /> {c.last_error}</p>}
      </div>

      {/* Pagamento */}
      {c.digitable_line && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5 space-y-3">
          <h2 className="text-sm font-bold">Dados para pagamento</h2>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Linha digitável</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs break-all">{c.digitable_line}</code>
              <button type="button" onClick={() => copy(c.digitable_line, 'Linha digitável')} className={`${btnCls} border border-slate-200 dark:border-slate-700`}><Copy className="h-4 w-4" /> Copiar</button>
            </div>
          </div>
          {c.pix_emv && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Pix copia e cola</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <code className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs break-all line-clamp-3">{c.pix_emv}</code>
                <button type="button" onClick={() => copy(c.pix_emv, 'Pix copia e cola')} className={`${btnCls} border border-slate-200 dark:border-slate-700`}><Copy className="h-4 w-4" /> Copiar</button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-500">Nosso número: {c.our_number || '-'} · ID Cora: {c.provider_charge_id || '-'} · Registro bancário: {c.registered ? 'confirmado' : 'pendente'}</p>
        </div>
      )}

      {/* Ações */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <button type="button" onClick={actions.pdf} disabled={!c.has_pdf || busy !== null} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}>{busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} 2ª via (PDF)</button>
        <button type="button" onClick={actions.sync} disabled={!c.provider_charge_id || busy !== null} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>{busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar</button>
        <button type="button" onClick={() => setShowReissue(v => !v)} disabled={!active || busy !== null} className={`${btnCls} border border-slate-200 dark:border-slate-700`}><CalendarClock className="h-4 w-4" /> Novo vencimento</button>
        <button type="button" onClick={actions.cancel} disabled={!active || busy !== null} className={`${btnCls} border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900`}>{busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Cancelar</button>
        {c.environment === 'STAGE' && active && (
          <button type="button" onClick={actions.simulate} disabled={busy !== null} className={`${btnCls} border border-amber-300 text-amber-700`}>{busy === 'simulate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Simular pagamento (Stage)</button>
        )}
      </div>

      {showReissue && active && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 space-y-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">O Banco Cora não permite alterar o vencimento. O boleto atual será <b>cancelado</b> e um novo será emitido com os mesmos dados e uma nova linha digitável.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="date" value={newDue} min={new Date().toISOString().slice(0, 10)} onChange={e => setNewDue(e.target.value)} className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" />
            <button type="button" onClick={actions.reissue} disabled={busy !== null} className={`${btnCls} bg-amber-600 hover:bg-amber-700 text-white`}>{busy === 'reissue' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Cancelar e reemitir</button>
          </div>
        </div>
      )}

      {/* Pagador */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5 text-sm space-y-1">
        <h2 className="text-sm font-bold mb-2">Pagador</h2>
        <p className="font-semibold">{c.payer_name}</p>
        <p className="text-slate-500 text-xs">{maskDoc(c.payer_document)}{c.payer_email ? ` · ${c.payer_email}` : ''}</p>
        <p className="text-slate-500 text-xs">{[payer.street, payer.number, payer.complement, payer.district].filter(Boolean).join(', ')} · {payer.city}/{payer.state} · {payer.zip_code}</p>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5">
        <h2 className="text-sm font-bold mb-3 flex items-center gap-2"><History className="h-4 w-4" /> Histórico</h2>
        <ol className="space-y-2">
          {data.events.map(e => (
            <li key={e.id} className="flex items-start gap-3 text-xs">
              <span className="mt-1 h-2 w-2 rounded-full bg-pink-500 shrink-0" />
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{EVENT_LABEL[e.event_type] || e.event_type} <span className="font-normal text-slate-500">· {SOURCE_LABEL[e.source] || e.source}</span></p>
                <p className="text-slate-500">{fmtDateTime(e.created_at)}{e.message ? ` · ${e.message}` : ''}</p>
              </div>
            </li>
          ))}
          {data.events.length === 0 && <li className="text-xs text-slate-400">Sem eventos.</li>}
        </ol>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Loader2, CalendarClock, AlertTriangle, CheckCircle2, XCircle, ListChecks, Plus, Settings2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getUser } from '@/lib/auth';
import { brl, paymentsApi } from '@/components/payments/chargeUi';
import ChargesComparisonChart, { SeriesPoint } from '@/components/payments/ChargesComparisonChart';

interface Dashboard {
  kpis: {
    due: { qty: number; amount: number };
    overdue: { qty: number; amount: number };
    paid_month: { qty: number; amount: number };
    cancelled: { qty: number };
    error: { qty: number };
  };
  series: SeriesPoint[];
}

export default function FinanceiroCoraPainel() {
  const companyId = getUser()?.company_id;
  const [data, setData] = useState<Dashboard | null>(null);
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setData(await paymentsApi<Dashboard>(companyId, `/dashboard?provider=CORA&months=${months}`));
    } catch (e: any) {
      if (String(e.message).includes('não habilitado')) setForbidden(true); else toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, months]);

  useEffect(() => { load(); }, [load]);

  if (forbidden) {
    return <div className="p-4 md:p-6"><div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">O Banco Cora não está habilitado para esta empresa.</div></div>;
  }

  const cards = data ? [
    { key: 'due', label: 'A vencer', qty: data.kpis.due.qty, amount: data.kpis.due.amount, icon: CalendarClock, cls: 'text-sky-600 bg-sky-500/10', href: '/financial/cora/boletos?tab=due' },
    { key: 'overdue', label: 'Vencidos', qty: data.kpis.overdue.qty, amount: data.kpis.overdue.amount, icon: AlertTriangle, cls: 'text-amber-600 bg-amber-500/10', href: '/financial/cora/boletos?tab=overdue' },
    { key: 'paid', label: 'Pagos no mês', qty: data.kpis.paid_month.qty, amount: data.kpis.paid_month.amount, icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-500/10', href: '/financial/cora/boletos?tab=paid' },
    { key: 'cancelled', label: 'Cancelados', qty: data.kpis.cancelled.qty, amount: null, icon: XCircle, cls: 'text-slate-500 bg-slate-500/10', href: '/financial/cora/boletos?tab=cancelled' },
  ] : [];

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-600"><Landmark className="h-6 w-6" /></div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Financeiro Cora</h1>
            <p className="text-xs md:text-sm text-slate-500">Boletos e Pix emitidos pelo Banco Cora.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Link href="/financial/cora/boletos" className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700"><ListChecks className="h-4 w-4" /> Boletos</Link>
          <Link href="/financial/cora/boletos?novo=1" className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold bg-pink-600 hover:bg-pink-700 text-white"><Plus className="h-4 w-4" /> Novo boleto</Link>
          <Link href="/settings?tab=pagamentos" className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700"><Settings2 className="h-4 w-4" /> Configurações</Link>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-pink-600" /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map(c => (
              <Link key={c.key} href={c.href} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-pink-300 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{c.label}</span>
                  <span className={`p-1.5 rounded-lg ${c.cls}`}><c.icon className="h-4 w-4" /></span>
                </div>
                <p className="mt-2 text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{c.qty}</p>
                {c.amount !== null && <p className="text-xs text-slate-500">{brl(c.amount)}</p>}
              </Link>
            ))}
          </div>

          {data.kpis.error.qty > 0 && (
            <Link href="/financial/cora/boletos?tab=error" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/20 dark:border-rose-900">
              <XCircle className="h-4 w-4" /> {data.kpis.error.qty} emissão(ões) com erro. Clique para revisar.
            </Link>
          )}

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Comparativo de boletos: gerados × pagos</h2>
              <div className="flex items-center gap-2">
                <select value={months} onChange={e => setMonths(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs">
                  <option value={6}>Últimos 6 meses</option>
                  <option value={12}>Últimos 12 meses</option>
                  <option value={24}>Últimos 24 meses</option>
                </select>
                <button type="button" onClick={load} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Atualizar">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <ChargesComparisonChart series={data.series} />
          </div>
        </>
      )}
    </div>
  );
}
